import { NextResponse } from "next/server";
import { analisisKomponen, analisisRuangLingkup } from "@/lib/claude";
import { ambilPetaHeuristik, pastikanSkema, sql } from "@/lib/db";

export const runtime = "nodejs";
// Analisis satu segmen pada proposal 40 halaman bisa berjalan beberapa menit.
export const maxDuration = 300;

type Segmen = "tema_tim" | "struktur" | "ruang_lingkup";
const SEGMEN_SAH: Segmen[] = ["tema_tim", "struktur", "ruang_lingkup"];

/**
 * Tahap 2 — satu permintaan menangani satu segmen analisis untuk satu dokumen.
 *
 * Pembagian per segmen membuat tiap panggilan tetap di bawah batas durasi fungsi,
 * memberi progres yang jujur kepada pengguna, dan menaikkan ketelitian karena
 * perhatian model tidak terbagi ke 17 komponen sekaligus. Teks dokumen di-cache
 * di sisi Anthropic sehingga segmen kedua dan ketiga jauh lebih murah.
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
      SELECT id, teks, nama_berkas, nama_tim, judul, file_id
      FROM dokumen WHERE id = ${docId}`) as {
      id: string;
      teks: string;
      nama_berkas: string;
      nama_tim: string | null;
      judul: string | null;
      file_id: string | null;
    }[];

    const dok = baris[0];
    if (!dok) {
      return NextResponse.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });
    }

    const peta = await ambilPetaHeuristik();

    if (segmen === "ruang_lingkup") {
      const hasil = await analisisRuangLingkup(dok.teks, peta, dok.file_id);

      const fieldIds = hasil.ruang_lingkup.map((r) => r.field_id);
      const fieldNama = hasil.ruang_lingkup.map((r) => r.field_nama);
      const nilai = hasil.ruang_lingkup.map((r) => JSON.stringify(r.nilai));

      await q`
        INSERT INTO hasil_ruang_lingkup (doc_id, field_id, field_nama, nilai)
        SELECT ${docId}::text, f, n, v::jsonb
        FROM UNNEST(${fieldIds}::text[], ${fieldNama}::text[], ${nilai}::text[]) AS t(f, n, v)
        ON CONFLICT (doc_id, field_id) DO UPDATE
          SET field_nama = EXCLUDED.field_nama, nilai = EXCLUDED.nilai`;

      await q`
        UPDATE dokumen
        SET nama_tim = COALESCE(NULLIF(${hasil.nama_tim}, ''), nama_tim),
            judul    = COALESCE(NULLIF(${hasil.judul}, ''), judul)
        WHERE id = ${docId}`;

      return NextResponse.json({
        segmen,
        namaTim: hasil.nama_tim || dok.nama_tim,
        judul: hasil.judul || dok.judul,
        jumlah: hasil.ruang_lingkup.length,
      });
    }

    const evaluasi = await analisisKomponen(segmen, dok.teks, peta, dok.file_id);

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

    return NextResponse.json({ segmen, jumlah: evaluasi.length, evaluasi });
  } catch (e) {
    const pesan = e instanceof Error ? e.message : "Kesalahan tidak dikenal.";
    console.error("[analyze]", e);
    return NextResponse.json({ error: pesan }, { status: 500 });
  }
}
