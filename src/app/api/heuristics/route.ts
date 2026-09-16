import { NextResponse } from "next/server";
import { ambilHeuristik, pastikanSkema, sql } from "@/lib/db";
import { KOMPONEN_BY_ID } from "@/lib/kak";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Gerbang admin sederhana. Bila ADMIN_PASSWORD diset, setiap operasi tulis
 * wajib menyertakan header x-admin-key. Bila tidak diset, portal berjalan
 * terbuka — cocok untuk pengembangan lokal, tidak untuk produksi.
 */
function izinTulis(req: Request): boolean {
  const kunci = process.env.ADMIN_PASSWORD;
  if (!kunci) return true;
  return req.headers.get("x-admin-key") === kunci;
}

function tolak() {
  return NextResponse.json({ error: "Kunci admin tidak sah." }, { status: 401 });
}

/** Daftar seluruh baris pengetahuan, dikelompokkan per komponen dan status. */
export async function GET() {
  try {
    await pastikanSkema();
    const baris = await ambilHeuristik();
    return NextResponse.json({
      baris,
      total: baris.length,
      perluKunci: Boolean(process.env.ADMIN_PASSWORD),
    });
  } catch (e) {
    const pesan = e instanceof Error ? e.message : "Kesalahan tidak dikenal.";
    console.error("[heuristics:GET]", e);
    return NextResponse.json({ error: pesan }, { status: 500 });
  }
}

/** Menambahkan satu baris pengetahuan pada satu komponen + status. */
export async function POST(req: Request) {
  if (!izinTulis(req)) return tolak();
  try {
    await pastikanSkema();
    const { komponenId, status, teks } = (await req.json()) as {
      komponenId?: string;
      status?: string;
      teks?: string;
    };

    const isi = (teks ?? "").trim();
    if (!komponenId || !KOMPONEN_BY_ID.has(komponenId)) {
      return NextResponse.json({ error: "Komponen KAK tidak dikenal." }, { status: 400 });
    }
    if (status !== "M" && status !== "S" && status !== "T") {
      return NextResponse.json({ error: "Status harus M, S, atau T." }, { status: 400 });
    }
    if (isi.length < 8) {
      return NextResponse.json(
        { error: "Ciri kondisi terlalu pendek untuk menjadi pedoman yang berguna." },
        { status: 400 },
      );
    }
    if (isi.length > 1200) {
      return NextResponse.json({ error: "Ciri kondisi maksimal 1200 karakter." }, { status: 400 });
    }

    const q = sql();
    const [{ urutan }] = (await q`
      SELECT COALESCE(MAX(urutan) + 1, 0) AS urutan
      FROM heuristik WHERE komponen_id = ${komponenId} AND status = ${status}`) as {
      urutan: number;
    }[];

    const [baris] = (await q`
      INSERT INTO heuristik (komponen_id, status, teks, urutan)
      VALUES (${komponenId}, ${status}, ${isi}, ${urutan})
      RETURNING id, komponen_id, status, teks, urutan`) as {
      id: number;
      komponen_id: string;
      status: string;
      teks: string;
      urutan: number;
    }[];

    return NextResponse.json({ baris });
  } catch (e) {
    const pesan = e instanceof Error ? e.message : "Kesalahan tidak dikenal.";
    console.error("[heuristics:POST]", e);
    return NextResponse.json({ error: pesan }, { status: 500 });
  }
}

/** Menghapus satu baris pengetahuan berdasarkan id. */
export async function DELETE(req: Request) {
  if (!izinTulis(req)) return tolak();
  try {
    await pastikanSkema();
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Parameter id tidak sah." }, { status: 400 });
    }

    const q = sql();
    const dihapus = (await q`DELETE FROM heuristik WHERE id = ${id} RETURNING id`) as {
      id: number;
    }[];

    if (!dihapus.length) {
      return NextResponse.json({ error: "Baris tidak ditemukan." }, { status: 404 });
    }
    return NextResponse.json({ id });
  } catch (e) {
    const pesan = e instanceof Error ? e.message : "Kesalahan tidak dikenal.";
    console.error("[heuristics:DELETE]", e);
    return NextResponse.json({ error: pesan }, { status: 500 });
  }
}
