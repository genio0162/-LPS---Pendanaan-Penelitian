import { NextResponse } from "next/server";
import { toFile } from "@anthropic-ai/sdk";
import { head, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { anthropic } from "@/lib/claude";
import { ekstrakPdf, pdfHalamanTerpilih, tebakNamaTim } from "@/lib/pdf";
import { pastikanSkema, sql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAKS_BYTES = 25 * 1024 * 1024;

class GalatMasukan extends Error {
  constructor(
    pesan: string,
    public status: number,
  ) {
    super(pesan);
  }
}

interface BerkasMasuk {
  nama: string;
  ukuran: number;
  buffer: ArrayBuffer;
  batchId: string;
  /** Terisi bila PDF sudah diunggah browser langsung ke Vercel Blob. */
  blobUrl: string | null;
}

/**
 * Jalur utama: browser sudah mengunggah PDF ke Vercel Blob (lihat /api/unggah)
 * dan hanya mengirim URL-nya. Fungsi Vercel membatasi body permintaan 4,5 MB,
 * jadi proposal belasan MB tidak mungkin dikirim sebagai FormData.
 *
 * head() memakai token Blob milik portal, sehingga URL dari store lain — atau
 * alamat sembarang yang disisipkan pemanggil — ditolak sebelum diunduh.
 */
async function dariBlob(req: Request): Promise<BerkasMasuk> {
  const { blobUrl, namaBerkas, batchId } = (await req.json()) as {
    blobUrl?: string;
    namaBerkas?: string;
    batchId?: string;
  };
  if (!blobUrl || !namaBerkas) {
    throw new GalatMasukan("blobUrl dan namaBerkas wajib diisi.", 400);
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new GalatMasukan("Vercel Blob belum tersambung pada deployment ini.", 503);
  }

  let info: Awaited<ReturnType<typeof head>>;
  try {
    info = await head(blobUrl);
  } catch {
    throw new GalatMasukan("Berkas unggahan tidak ditemukan di Vercel Blob portal ini.", 400);
  }
  if (!info.pathname.startsWith("proposal/")) {
    throw new GalatMasukan("Lokasi berkas unggahan tidak sah.", 400);
  }
  if (info.size > MAKS_BYTES) {
    throw new GalatMasukan(`Ukuran ${namaBerkas} melebihi batas 25 MB.`, 413);
  }

  const unduh = await fetch(info.url, { cache: "no-store" });
  if (!unduh.ok) {
    throw new GalatMasukan(`Gagal mengambil ${namaBerkas} dari Vercel Blob (${unduh.status}).`, 502);
  }

  return {
    nama: namaBerkas,
    ukuran: info.size,
    buffer: await unduh.arrayBuffer(),
    batchId: batchId || randomUUID().slice(0, 8),
    blobUrl: info.url,
  };
}

/** Jalur cadangan untuk server lokal tanpa Blob: PDF dikirim langsung sebagai FormData. */
async function dariForm(req: Request): Promise<BerkasMasuk> {
  const form = await req.formData();
  const berkas = form.get("file");

  if (!(berkas instanceof File)) {
    throw new GalatMasukan("Berkas tidak ditemukan pada permintaan.", 400);
  }
  if (berkas.size > MAKS_BYTES) {
    throw new GalatMasukan(`Ukuran ${berkas.name} melebihi batas 25 MB.`, 413);
  }
  if (!/\.pdf$/i.test(berkas.name) && berkas.type !== "application/pdf") {
    throw new GalatMasukan("Hanya berkas PDF yang diterima.", 415);
  }

  return {
    nama: berkas.name,
    ukuran: berkas.size,
    buffer: await berkas.arrayBuffer(),
    batchId: String(form.get("batchId") ?? "") || randomUUID().slice(0, 8),
    blobUrl: null,
  };
}

/**
 * Tahap 1 — terima satu PDF, simpan ke Vercel Blob, ekstrak teksnya,
 * lalu catat ke Neon. Mengembalikan docId yang dipakai tahap analisis.
 */
export async function POST(req: Request) {
  try {
    await pastikanSkema();

    const jenis = req.headers.get("content-type") ?? "";
    const masuk = jenis.includes("application/json") ? await dariBlob(req) : await dariForm(req);
    const { buffer, batchId } = masuk;
    const berkas = { name: masuk.nama, size: masuk.ukuran };

    // Tanda tangan berkas PDF selalu diawali "%PDF-"; nama berkas saja bisa menipu.
    const kepala = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(1024, buffer.byteLength)));
    if (!kepala.includes("%PDF-")) {
      return NextResponse.json({ error: `${berkas.name} bukan berkas PDF yang sah.` }, { status: 415 });
    }

    const { teks, jumlahHalaman, judul, halamanKosong, perluPdfAsli } = await ekstrakPdf(buffer);

    if (teks.replace(/\[\[(?:HALAMAN \d+|TANPA LAPISAN TEKS[^\]]*)\]\]/g, "").trim().length < 400) {
      return NextResponse.json(
        {
          error: `${berkas.name} tampaknya hasil pindaian tanpa lapisan teks. Gunakan PDF yang teksnya dapat disalin.`,
        },
        { status: 422 },
      );
    }

    // Arsip ke Blob: sudah terjadi bila browser mengunggah langsung. Pada jalur
    // FormData, Blob bersifat opsional — portal tetap berjalan tanpa arsip.
    let blobUrl: string | null = masuk.blobUrl;
    if (!blobUrl && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const hasil = await put(`proposal/${batchId}/${berkas.name}`, buffer, {
          access: "public",
          contentType: "application/pdf",
          addRandomSuffix: true,
        });
        blobUrl = hasil.url;
      } catch (e) {
        console.error("Unggah blob gagal, lanjut tanpa arsip:", e);
      }
    }

    // Halaman pindaian tidak punya lapisan teks — surat pernyataan bertanda tangan
    // dan lanjutan tabel RAB kerap berada di sana. Hanya halaman itu yang disaring
    // ke dalam PDF kecil lalu diunggah ke Files API, bukan seluruh dokumen: satu
    // halaman PDF berharga ~2.000 token karena diproses sebagai gambar, jadi
    // menyaring lebih dulu memangkas biaya jalur ini lebih dari sepuluh kali lipat.
    // file_id dipakai ulang oleh ketiga segmen analisis, cukup sekali unggah.
    let fileId: string | null = null;
    if (perluPdfAsli) {
      try {
        const potongan = await pdfHalamanTerpilih(buffer, halamanKosong);
        if (potongan) {
          const unggah = await anthropic().files.upload({
            file: await toFile(
              new Blob([potongan as BlobPart], { type: "application/pdf" }),
              `pindaian-${berkas.name}`,
              { type: "application/pdf" },
            ),
            expires_in_seconds: 86_400, // cukup untuk satu batch; berkas hilang sendiri
          });
          fileId = unggah.id;
        }
      } catch (e) {
        // Tanpa file_id analisis tetap berjalan dari teks; halaman pindaian
        // sudah ditandai eksplisit agar model tidak salah menyimpulkan.
        console.error("Unggah halaman pindaian ke Files API gagal:", e);
      }
    }

    const docId = randomUUID();
    const namaTim = tebakNamaTim(berkas.name);
    const q = sql();

    await q`
      INSERT INTO dokumen (id, batch_id, nama_berkas, blob_url, ukuran_bytes,
                           jumlah_halaman, teks, nama_tim, judul, file_id, halaman_kosong)
      VALUES (${docId}, ${batchId}, ${berkas.name}, ${blobUrl}, ${berkas.size},
              ${jumlahHalaman}, ${teks}, ${namaTim}, ${judul}, ${fileId},
              ${halamanKosong}::int[])`;

    await q`
      INSERT INTO batch (id, jumlah_berkas, status)
      VALUES (${batchId}, 1, 'Diproses')
      ON CONFLICT (id) DO UPDATE SET jumlah_berkas = batch.jumlah_berkas + 1`;

    return NextResponse.json({
      docId,
      batchId,
      namaBerkas: berkas.name,
      namaTim,
      judul,
      jumlahHalaman,
      diarsipkan: Boolean(blobUrl),
      halamanPindaian: halamanKosong,
      pdfDilampirkan: Boolean(fileId),
    });
  } catch (e) {
    if (e instanceof GalatMasukan) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const pesan = e instanceof Error ? e.message : "Kesalahan tidak dikenal.";
    console.error("[extract]", e);
    return NextResponse.json({ error: pesan }, { status: 500 });
  }
}
