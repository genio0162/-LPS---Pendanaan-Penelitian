-- =====================================================================
--  LPS — Pendanaan Penelitian
--  Skema basis data untuk Neon (PostgreSQL)
--  Jalankan seluruh isi berkas ini di Neon Console → SQL Editor.
--
--  Catatan: aplikasi juga membuat tabel ini secara otomatis saat pertama
--  kali dipanggil (lihat src/lib/db.ts → pastikanSkema). Menjalankan
--  berkas ini lebih dahulu membuat permintaan pertama jadi lebih cepat.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Pengetahuan Admin Fine-Tuner
--    Satu baris = satu ciri kondisi untuk satu komponen KAK pada satu status.
--    status: 'M' = Memenuhi, 'S' = Memenuhi Sebagian, 'T' = Tidak Memenuhi
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS heuristik (
  id          SERIAL PRIMARY KEY,
  komponen_id TEXT    NOT NULL,
  status      CHAR(1) NOT NULL CHECK (status IN ('M', 'S', 'T')),
  teks        TEXT    NOT NULL,
  urutan      INTEGER NOT NULL DEFAULT 0,
  dibuat      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS heuristik_komponen_idx
  ON heuristik (komponen_id, status, urutan);

-- ---------------------------------------------------------------------
-- 2. Dokumen proposal yang diunggah
--    blob_url menunjuk ke berkas PDF di Vercel Blob.
--    teks menyimpan hasil ekstraksi unpdf, sudah diberi penanda halaman.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dokumen (
  id             TEXT PRIMARY KEY,
  batch_id       TEXT,
  nama_berkas    TEXT   NOT NULL,
  blob_url       TEXT,
  ukuran_bytes   BIGINT,
  jumlah_halaman INTEGER NOT NULL DEFAULT 0,
  teks           TEXT    NOT NULL DEFAULT '',
  nama_tim       TEXT,
  judul          TEXT,
  -- file_id: berkas PDF di Anthropic Files API, hanya diisi bila dokumen
  -- memuat halaman pindaian sehingga model perlu membacanya sebagai gambar.
  file_id        TEXT,
  halaman_kosong INTEGER[] NOT NULL DEFAULT '{}',
  dibuat         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dokumen_batch_idx ON dokumen (batch_id);

-- ---------------------------------------------------------------------
-- 3. Hasil evaluasi 17 komponen KAK (poin 7 - 8.3)
-- ---------------------------------------------------------------------
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
);

-- ---------------------------------------------------------------------
-- 4. Tujuan dan ruang lingkup (lembar kedua berkas Excel)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hasil_ruang_lingkup (
  id         SERIAL PRIMARY KEY,
  doc_id     TEXT NOT NULL REFERENCES dokumen(id) ON DELETE CASCADE,
  field_id   TEXT NOT NULL,
  field_nama TEXT NOT NULL,
  nilai      JSONB NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (doc_id, field_id)
);

-- ---------------------------------------------------------------------
-- 5. Riwayat batch analisis
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS batch (
  id            TEXT PRIMARY KEY,
  institusi     TEXT    NOT NULL DEFAULT 'Tidak disebutkan',
  jumlah_berkas INTEGER NOT NULL DEFAULT 0,
  skor          INTEGER NOT NULL DEFAULT 0,
  status        TEXT    NOT NULL DEFAULT 'Selesai',
  dibuat        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
--  Pemeriksaan cepat setelah dijalankan
-- =====================================================================
-- SELECT komponen_id, status, COUNT(*) FROM heuristik GROUP BY 1, 2 ORDER BY 1, 2;
-- SELECT id, nama_berkas, jumlah_halaman, dibuat FROM dokumen ORDER BY dibuat DESC LIMIT 20;
