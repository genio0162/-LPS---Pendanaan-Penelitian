import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export const runtime = "nodejs";
export const maxDuration = 60;

// Route file hanya boleh mengekspor handler dan konfigurasi rute.
const MAKS_BYTES = 25 * 1024 * 1024;

/**
 * Fungsi Vercel menolak body permintaan di atas 4,5 MB dengan balasan teks
 * "Request Entity Too Large" — sebelum kode kita sempat berjalan. Karena itu
 * PDF tidak dikirim lewat fungsi, melainkan diunggah browser LANGSUNG ke
 * Vercel Blob (client upload). Endpoint ini hanya menerbitkan token unggahnya.
 */

/**
 * Memberi tahu browser jalur unggah mana yang tersedia.
 * batasLangsungBytes hanya diisi saat berjalan di Vercel: server lokal
 * (`next dev`) tidak punya batas body, jadi jalur FormData tetap aman di sana.
 */
export async function GET() {
  return NextResponse.json({
    blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    batasLangsungBytes: process.env.VERCEL ? 4 * 1024 * 1024 : null,
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as HandleUploadBody;

    const hasil = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("proposal/") || !/\.pdf$/i.test(pathname)) {
          throw new Error("Hanya berkas PDF proposal yang boleh diunggah.");
        }
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: MAKS_BYTES,
          addRandomSuffix: true,
          // Cukup untuk berkas besar di koneksi lambat, tanpa membiarkan token hidup lama.
          validUntil: Date.now() + 30 * 60 * 1000,
        };
      },
      // Tanpa onUploadCompleted: browser memanggil /api/extract sendiri begitu
      // unggahan selesai, jadi tidak perlu webhook (yang juga tak bisa
      // menjangkau localhost saat pengembangan).
    });

    return NextResponse.json(hasil);
  } catch (e) {
    const pesan = e instanceof Error ? e.message : "Kesalahan tidak dikenal.";
    console.error("[unggah]", e);
    return NextResponse.json({ error: pesan }, { status: 400 });
  }
}
