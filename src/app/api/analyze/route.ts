import { NextResponse } from "next/server";
import { analisisKomponen, analisisRuangLingkup, type LampiranPindaian } from "@/lib/claude";
import { ambilPetaHeuristik, pastikanSkema, sql } from "@/lib/db";

export const runtime = "nodejs";
// Analisis satu segmen pada proposal 40 halaman bisa berjalan beberapa menit.
export const maxDuration = 300;

type Segmen = "kriteria" | "ruang_lingkup";
const SEGMEN_SAH: Segmen[] = ["kriteria", "ruang_lingkup"];

/**
 * Tahap 2 — satu permintaan menangani satu segmen analisis untuk satu dokumen.
 *
 * Dua segmen saja: "kriteria" menilai seluruh 19 kriteria screening sekaligus,
 * "ruang_lingkup" menyalin tujuan dan ruang lingkup penelitian. Teks dokumen
 * adalah bagian termahal dari permintaan, jadi ia dikirim sesedikit mungkin —
 * memecah penilaian menjadi lebih banyak panggilan justru membayarnya berulang.
 */
export async function POST(req: Request) {
  try {
    await pastikanSkema();
    const { docId, segmen } = (await req.json()) as { docId?: string; segmen?: Segmen };

    if (!docId) {
      return NextResponse.json({ error: "docId wajib diisi." }, { status: 400 });
    }
    if (!segmen || !SEGMEN_SAH.includes(segmen)) {
      return NextResponse.json(
        { error: `segmen harus salah satu dari: ${SEGMEN_SAH.join(", ")}.` },
        { status: 400 },
      );
    }

    const q = sql();
    const baris = (await q`
      SELECT id, teks, nama_berkas, nama_tim, judul, file_id, halaman_kosong
      FROM dokumen WHERE id = ${docId}`) as {
      id: string;
      teks: string;
      nama_berkas: string;
      nama_tim: string | null;
      judul: string | null;
      file_id: string | null;
      halaman_kosong: number[] | null;
    }[];

    const dok = baris[0];
    if (!dok) {
      return NextResponse.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });
    }

    const peta = await ambilPetaHeuristik();

    // Lampiran hanya berisi halaman pindaian; nomor halaman asli ikut dikirim
    // supaya model bisa memetakan kembali rujukan halamannya.
    const lampiran: LampiranPindaian | null = dok.file_id
      ? { fileId: dok.file_id, halaman: dok.halaman_kosong ?? [] }
      : null;

    if (segmen === "ruang_lingkup") {
      const hasil = await analisisRuangLingkup(dok.teks, lampiran);

      const fieldIds = hasil.ruang_lingkup.map((r) => r.field_id);
      const fieldNama = hasil.ruang_lingkup.map((r) => r.field_nama);
      const nilai = hasil.ruang_lingkup.map((r) => JSON.stringify(r.nilai));

      await q`
        INSERT INTO hasil_ruang_lingkup (doc_id, field_id, field_nama, nilai)
        SELECT ${docId}::text, f, n, v::jsonb
        FROM UNNEST(${fieldIds}::text[], ${fieldNama}::text[], ${nilai}::text[]) AS t(f, n, v)
        ON CONFLICT (doc_id, field_id) DO UPDATE
          SET field_nama = EXCLUDED.field_nama, nilai = EXCLUDED.nilai`;

      // Nama tim dari pola nama berkas bersifat deterministik dan sudah benar,
      // jadi ia menang; nilai dari model hanya mengisi bila kolomnya masih kosong.
      // Judul sebaliknya: model membacanya dari isi dokumen, lebih tepercaya
      // daripada tebakan baris terpanjang di halaman sampul.
      await q`
        UPDATE dokumen
        SET nama_tim = COALESCE(NULLIF(nama_tim, ''), NULLIF(${hasil.nama_tim}, '')),
            judul    = COALESCE(NULLIF(${hasil.judul}, ''), judul)
        WHERE id = ${docId}`;

      return NextResponse.json({
        segmen,
        namaTim: dok.nama_tim || hasil.nama_tim,
        judul: hasil.judul || dok.judul,
        jumlah: hasil.ruang_lingkup.length,
        pemakaian: hasil.pemakaian,
      });
    }

    const { evaluasi, pemakaian } = await analisisKomponen(dok.teks, peta, lampiran);

    await q`
      INSERT INTO hasil_evaluasi
        (doc_id, komponen_id, poin_kak, komponen_nama, ringkasan, halaman, kutipan, analisis, heuristik, status)
      SELECT ${docId}::text, k, p, n, r, h, u, a, hr::jsonb, s
      FROM UNNEST(
        ${evaluasi.map((e) => e.komponen_id)}::text[],
        ${evaluasi.map((e) => e.poin_kak)}::text[],
        ${evaluasi.map((e) => e.komponen_nama)}::text[],
        ${evaluasi.map((e) => e.ringkasan_temuan)}::text[],
        ${evaluasi.map((e) => e.halaman)}::text[],
        ${evaluasi.map((e) => e.kutipan)}::text[],
        ${evaluasi.map((e) => e.analisis)}::text[],
        ${evaluasi.map((e) => JSON.stringify(e.heuristik_terpakai))}::text[],
        ${evaluasi.map((e) => e.status)}::text[]
      ) AS t(k, p, n, r, h, u, a, hr, s)
      ON CONFLICT (doc_id, komponen_id) DO UPDATE SET
        poin_kak = EXCLUDED.poin_kak, komponen_nama = EXCLUDED.komponen_nama,
        ringkasan = EXCLUDED.ringkasan, halaman = EXCLUDED.halaman,
        kutipan   = EXCLUDED.kutipan,   analisis = EXCLUDED.analisis,
        heuristik = EXCLUDED.heuristik, status   = EXCLUDED.status`;

    return NextResponse.json({ segmen, jumlah: evaluasi.length, evaluasi, pemakaian });
  } catch (e) {
    const pesan = e instanceof Error ? e.message : "Kesalahan tidak dikenal.";
    console.error("[analyze]", e);
    return NextResponse.json({ error: pesan }, { status: 500 });
  }
}
