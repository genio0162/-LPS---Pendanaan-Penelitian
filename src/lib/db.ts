import { neon } from "@neondatabase/serverless";
import { SEED_HEURISTIK } from "./kak";
import type { BarisHeuristik, PetaHeuristik } from "./types";

function connectionString(): string {
  const url =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.POSTGRES_URL_NON_POOLING;
  if (!url) {
    throw new Error(
      "DATABASE_URL belum diset. Hubungkan integrasi Neon di Vercel, atau isi DATABASE_URL pada .env.local.",
    );
  }
  return url;
}

export function sql() {
  return neon(connectionString());
}

/**
 * Membuat tabel bila belum ada, lalu menyemai pengetahuan bawaan sekali saja.
 * Aman dipanggil berulang kali.
 *
 * Hasilnya di-memo per instans fungsi: tanpa ini setiap permintaan membayar
 * delapan perjalanan bolak-balik ke Neon hanya untuk memastikan tabel ada.
 */
let skemaSiap: Promise<void> | null = null;

export function pastikanSkema(): Promise<void> {
  if (!skemaSiap) {
    skemaSiap = bangunSkema().catch((e) => {
      skemaSiap = null; // biarkan permintaan berikutnya mencoba lagi
      throw e;
    });
  }
  return skemaSiap;
}

async function bangunSkema(): Promise<void> {
  const q = sql();
  await q`
    CREATE TABLE IF NOT EXISTS heuristik (
      id          SERIAL PRIMARY KEY,
      komponen_id TEXT NOT NULL,
      status      CHAR(1) NOT NULL CHECK (status IN ('M', 'S', 'T')),
      teks        TEXT NOT NULL,
      urutan      INTEGER NOT NULL DEFAULT 0,
      dibuat      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  await q`CREATE INDEX IF NOT EXISTS heuristik_komponen_idx ON heuristik (komponen_id, status, urutan)`;

  await q`
    CREATE TABLE IF NOT EXISTS dokumen (
      id             TEXT PRIMARY KEY,
      batch_id       TEXT,
      nama_berkas    TEXT NOT NULL,
      blob_url       TEXT,
      ukuran_bytes   BIGINT,
      jumlah_halaman INTEGER NOT NULL DEFAULT 0,
      teks           TEXT NOT NULL DEFAULT '',
      nama_tim       TEXT,
      judul          TEXT,
      file_id        TEXT,
      halaman_kosong INTEGER[] NOT NULL DEFAULT '{}',
      dibuat         TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  // Kolom menyusul untuk basis data yang sudah terlanjur dibuat versi awal.
  await q`ALTER TABLE dokumen ADD COLUMN IF NOT EXISTS file_id TEXT`;
  await q`ALTER TABLE dokumen ADD COLUMN IF NOT EXISTS halaman_kosong INTEGER[] NOT NULL DEFAULT '{}'`;
  await q`CREATE INDEX IF NOT EXISTS dokumen_batch_idx ON dokumen (batch_id)`;

  await q`
    CREATE TABLE IF NOT EXISTS hasil_evaluasi (
      id            SERIAL PRIMARY KEY,
      doc_id        TEXT NOT NULL REFERENCES dokumen(id) ON DELETE CASCADE,
      komponen_id   TEXT NOT NULL,
      poin_kak      TEXT NOT NULL,
      komponen_nama TEXT NOT NULL,
      ringkasan     TEXT NOT NULL DEFAULT '',
      halaman       TEXT NOT NULL DEFAULT '',
      kutipan       TEXT NOT NULL DEFAULT '',
      analisis      TEXT NOT NULL DEFAULT '',
      heuristik     JSONB NOT NULL DEFAULT '[]'::jsonb,
      status        TEXT NOT NULL,
      dibuat        TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (doc_id, komponen_id)
    )`;

  await q`
    CREATE TABLE IF NOT EXISTS hasil_ruang_lingkup (
      id         SERIAL PRIMARY KEY,
      doc_id     TEXT NOT NULL REFERENCES dokumen(id) ON DELETE CASCADE,
      field_id   TEXT NOT NULL,
      field_nama TEXT NOT NULL,
      nilai      JSONB NOT NULL DEFAULT '[]'::jsonb,
      UNIQUE (doc_id, field_id)
    )`;

  await q`
    CREATE TABLE IF NOT EXISTS batch (
      id           TEXT PRIMARY KEY,
      institusi    TEXT NOT NULL DEFAULT 'Tidak disebutkan',
      jumlah_berkas INTEGER NOT NULL DEFAULT 0,
      skor         INTEGER NOT NULL DEFAULT 0,
      status       TEXT NOT NULL DEFAULT 'Selesai',
      dibuat       TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;

  const [{ jumlah }] = (await q`SELECT COUNT(*)::int AS jumlah FROM heuristik`) as {
    jumlah: number;
  }[];
  if (jumlah === 0) await semaiHeuristik();
}

async function semaiHeuristik(): Promise<void> {
  const q = sql();
  const komponenIds: string[] = [];
  const statuses: string[] = [];
  const teksList: string[] = [];
  const urutanList: number[] = [];

  for (const [komponenId, perStatus] of Object.entries(SEED_HEURISTIK)) {
    for (const [status, baris] of Object.entries(perStatus)) {
      (baris ?? []).forEach((teks, i) => {
        komponenIds.push(komponenId);
        statuses.push(status);
        teksList.push(teks);
        urutanList.push(i);
      });
    }
  }
  if (!komponenIds.length) return;

  // Satu INSERT massal lewat UNNEST — jauh lebih hemat round-trip daripada per baris.
  await q`
    INSERT INTO heuristik (komponen_id, status, teks, urutan)
    SELECT * FROM UNNEST(
      ${komponenIds}::text[],
      ${statuses}::char(1)[],
      ${teksList}::text[],
      ${urutanList}::int[]
    )`;
}

export async function ambilHeuristik(): Promise<BarisHeuristik[]> {
  const q = sql();
  return (await q`
    SELECT id, komponen_id, status, teks, urutan
    FROM heuristik
    ORDER BY komponen_id, status, urutan, id`) as BarisHeuristik[];
}

/** Bentuk peta komponen -> status -> teks[], siap dirakit ke dalam prompt. */
export async function ambilPetaHeuristik(): Promise<PetaHeuristik> {
  const baris = await ambilHeuristik();
  const peta: PetaHeuristik = {};
  for (const b of baris) {
    (peta[b.komponen_id] ??= {});
    (peta[b.komponen_id][b.status] ??= []).push(b.teks);
  }
  return peta;
}
