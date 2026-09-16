import { NextResponse } from "next/server";
import { pastikanSkema, sql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Riwayat batch analisis untuk panel admin. */
export async function GET() {
  try {
    await pastikanSkema();
    const q = sql();

    const baris = (await q`
      SELECT b.id,
             b.institusi,
             b.jumlah_berkas,
             b.skor,
             b.status,
             b.dibuat,
             COALESCE(
               (SELECT string_agg(DISTINCT d.nama_tim, ', ')
                FROM dokumen d WHERE d.batch_id = b.id),
               '-'
             ) AS tim
      FROM batch b
      ORDER BY b.dibuat DESC
      LIMIT 30`) as {
      id: string;
      institusi: string;
      jumlah_berkas: number;
      skor: number;
      status: string;
      dibuat: string;
      tim: string;
    }[];

    return NextResponse.json({
      baris: baris.map((b) => ({
        ...b,
        tanggal: new Date(b.dibuat).toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
      })),
    });
  } catch (e) {
    const pesan = e instanceof Error ? e.message : "Kesalahan tidak dikenal.";
    console.error("[batches]", e);
    return NextResponse.json({ error: pesan }, { status: 500 });
  }
}
