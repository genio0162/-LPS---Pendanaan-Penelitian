import { NextResponse } from "next/server";
import { toFile } from "@anthropic-ai/sdk";
import { put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { anthropic } from "@/lib/claude";
import { ekstrakPdf, pdfHalamanTerpilih, tebakNamaTim } from "@/lib/pdf";
import { pastikanSkema, sql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAKS_BYTES = 25 * 1024 * 1024;

/**
 * Tahap 1 — terima satu PDF, simpan ke Vercel Blob, ekstrak teksnya,
 * lalu catat ke Neon. Mengembalikan docId yang dipakai tahap analisis.
 */
export async function POST(req: Request) {
  try {
    await pastikanSkema();

    const form = await req.formData();
    const berkas = form.get("file");
    const batchId = String(form.get("batchId") ?? "") || randomUUID().slice(0, 8);

    if (!(berkas instanceof File)) {
      return NextResponse.json({ error: "Berkas tidak ditemukan pada permintaan." }, { status: 400 });
    }
    if (berkas.size > MAKS_BYTES) {
      return NextResponse.json(
        { error: `Ukuran ${berkas.name} melebihi batas 25 MB.` },
        { status: 413 },
      );
    }
    if (!/\.pdf$/i.test(berkas.name) && berkas.type !== "application/pdf") {
      return NextResponse.json({ error: "Hanya berkas PDF yang diterima." }, { status: 415 });
    }

    const buffer = await berkas.arrayBuffer();
    const { teks, jumlahHalaman, judul, halamanKosong, perluPdfAsli } = await ekstrakPdf(buffer);

    if (teks.replace(/\[\[(?:HALAMAN \d+|TANPA LAPISAN TEKS[^\]]*)\]\]/g, "").trim().length < 400) {
      return NextResponse.json(
        {
          error: `${berkas.name} tampaknya hasil pindaian tanpa lapisan teks. Gunakan PDF yang teksnya dapat disalin.`,
        },
        { status: 422 },
      );
    }

    // Blob bersifat opsional: portal tetap berfungsi sebelum integrasi disambungkan.
    let blobUrl: string | null = null;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
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
    const pesan = e instanceof Error ? e.message : "Kesalahan tidak dikenal.";
    console.error("[extract]", e);
    return NextResponse.json({ error: pesan }, { status: 500 });
  }
}
