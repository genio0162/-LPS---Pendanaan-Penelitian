import { NextResponse } from "next/server";
import { bangunExcel, namaBerkasExcel } from "@/lib/excel";
import { pastikanSkema, sql } from "@/lib/db";
import { KOMPONEN_KAK, RUANG_LINGKUP_FIELDS } from "@/lib/kak";
import type { EvaluasiKomponen, HasilProposal, RuangLingkupItem } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Tahap 3 — rakit seluruh hasil satu batch menjadi berkas .xlsx. */
export async function POST(req: Request) {
  try {
    await pastikanSkema();
    const { batchId } = (await req.json()) as { batchId?: string };
    if (!batchId) {
      return NextResponse.json({ error: "batchId wajib diisi." }, { status: 400 });
    }

    const q = sql();
    const dokumen = (await q`
      SELECT id, nama_berkas, nama_tim, judul, jumlah_halaman
      FROM dokumen WHERE batch_id = ${batchId} ORDER BY dibuat`) as {
      id: string;
      nama_berkas: string;
      nama_tim: string | null;
      judul: string | null;
      jumlah_halaman: number;
    }[];

    if (!dokumen.length) {
      return NextResponse.json({ error: "Tidak ada dokumen pada batch ini." }, { status: 404 });
    }

    const ids = dokumen.map((d) => d.id);

    const evaluasi = (await q`
      SELECT doc_id, komponen_id, poin_kak, komponen_nama, ringkasan, halaman, kutipan, analisis, heuristik, status
      FROM hasil_evaluasi WHERE doc_id = ANY(${ids}::text[])`) as {
      doc_id: string;
      komponen_id: string;
      poin_kak: string;
      komponen_nama: string;
      ringkasan: string;
      halaman: string;
      kutipan: string;
      analisis: string;
      heuristik: string[];
      status: EvaluasiKomponen["status"];
    }[];

    const lingkup = (await q`
      SELECT doc_id, field_id, field_nama, nilai
      FROM hasil_ruang_lingkup WHERE doc_id = ANY(${ids}::text[])`) as {
      doc_id: string;
      field_id: string;
      field_nama: string;
      nilai: string[];
    }[];

    const proposal: HasilProposal[] = dokumen.map((d) => {
      const evalDoc = new Map(evaluasi.filter((e) => e.doc_id === d.id).map((e) => [e.komponen_id, e]));
      const lingkupDoc = new Map(
        lingkup.filter((l) => l.doc_id === d.id).map((l) => [l.field_id, l]),
      );

      // Urutkan mengikuti urutan KAK, bukan urutan baris basis data.
      const evaluasiUrut: EvaluasiKomponen[] = KOMPONEN_KAK.map((k) => {
        const e = evalDoc.get(k.id);
        return {
          komponen_id: k.id,
          komponen_nama: k.nama,
          poin_kak: k.poin,
          ringkasan_temuan: e?.ringkasan ?? "Belum dievaluasi",
          halaman: e?.halaman ?? "-",
          kutipan: e?.kutipan ?? "-",
          analisis: e?.analisis ?? "Komponen ini belum dianalisis. Perlu reviu manual.",
          heuristik_terpakai: Array.isArray(e?.heuristik) ? e.heuristik : [],
          status: e?.status ?? "Memenuhi Sebagian",
        };
      });

      const ruangLingkup: RuangLingkupItem[] = RUANG_LINGKUP_FIELDS.map((f) => {
        const l = lingkupDoc.get(f.id);
        return {
          field_id: f.id,
          field_nama: f.nama,
          nilai: Array.isArray(l?.nilai) && l.nilai.length ? l.nilai : ["Tidak disebutkan dalam proposal"],
        };
      });

      return {
        doc_id: d.id,
        nama_berkas: d.nama_berkas,
        nama_tim: d.nama_tim || d.nama_berkas.replace(/\.pdf$/i, ""),
        judul: d.judul || "-",
        jumlah_halaman: d.jumlah_halaman,
        evaluasi: evaluasiUrut,
        ruang_lingkup: ruangLingkup,
      };
    });

    const totalKomponen = proposal.reduce((n, p) => n + p.evaluasi.length, 0) || 1;
    const bobot = proposal.reduce(
      (n, p) =>
        n +
        p.evaluasi.filter((e) => e.status === "Memenuhi").length +
        p.evaluasi.filter((e) => e.status === "Memenuhi Sebagian").length * 0.5,
      0,
    );
    const skor = Math.round((bobot / totalKomponen) * 100);

    await q`
      UPDATE batch
      SET skor = ${skor}, status = 'Selesai', jumlah_berkas = ${dokumen.length}
      WHERE id = ${batchId}`;

    const buffer = await bangunExcel({ proposal, batchId });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${namaBerkasExcel(batchId)}"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "no-store",
        "X-Skor-Batch": String(skor),
      },
    });
  } catch (e) {
    const pesan = e instanceof Error ? e.message : "Kesalahan tidak dikenal.";
    console.error("[export]", e);
    return NextResponse.json({ error: pesan }, { status: 500 });
  }
}
