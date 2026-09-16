# LPS — Pendanaan Penelitian

Portal evaluasi proposal **Program Pendanaan Penelitian LPS – FEB UI**.
Unggah PDF proposal, sistem menilainya terhadap **KAK-1/GRIS/2026 poin 7 sampai 8.3**
(17 komponen), lalu mengembalikan satu berkas Excel siap cross-check.

> Kerangka Acuan Kerja Nomor: KAK-1/GRIS/2026
> Perjanjian Kerja Sama Nomor: PKS-1006/UN2.F6.D/PPM.00.00/2026

---

## Cara kerja

```
PDF  →  unpdf          →  Claude API              →  ExcelJS  →  .xlsx
        ekstraksi teks    3 segmen analisis           3 lembar
        + penanda         + pengetahuan admin
          halaman           (Fine-Tuner)
```

Satu proposal diproses dalam empat langkah, masing-masing satu permintaan HTTP:

| Langkah | Endpoint | Isi |
|---|---|---|
| 1 | `POST /api/extract` | Unggah ke Vercel Blob, ekstraksi teks per halaman, simpan ke Neon |
| 2 | `POST /api/analyze` `segmen: tema_tim` | Poin 7, 8.1, dan 8.2 — 8 komponen |
| 3 | `POST /api/analyze` `segmen: struktur` | Poin 8.3 — 9 komponen |
| 4 | `POST /api/analyze` `segmen: ruang_lingkup` | Tujuan dan ruang lingkup (lembar kedua Excel) |
| akhir | `POST /api/export` | Menyusun `.xlsx` untuk seluruh batch |

Pemecahan per segmen dilakukan dengan sengaja: setiap permintaan tetap di bawah
batas durasi fungsi Vercel, progres yang ditampilkan jujur, dan ketelitian naik
karena perhatian model tidak terbagi ke 17 komponen sekaligus. Teks dokumen
di-*cache* di sisi Anthropic, sehingga segmen kedua dan ketiga hanya membayar
sekitar 0,1× biaya token masukan.

---

## Admin Fine-Tuner

Inti dari portal ini. Model bahasa umum tidak mengenal nomenklatur SINTA maupun
aturan PPN/PPh Indonesia, sehingga verifikator menyuntikkan pengetahuan lokal
lewat `/admin`.

Untuk setiap komponen KAK, admin menulis **ciri kondisi** pada tiga kotak —
*Memenuhi*, *Memenuhi Sebagian*, *Tidak Memenuhi*. Jumlah baris per kotak bebas.
Baris ini dirakit ke dalam blok XML `<pengetahuan_admin>` pada system prompt,
dan model wajib mengikutinya: bila bukti dokumen cocok dengan sebuah ciri,
status itulah yang ditetapkan.

Contoh baris yang sudah disemai:

- **Rekam jejak publikasi → Memenuhi Sebagian**
  “Daftar publikasi tersedia namun tidak satu pun mencantumkan status indeksasi Sinta atau Scopus.”
- **Pernyataan Etika & Non-Double Funding → Tidak Memenuhi**
  “Tidak ditemukan surat pernyataan maupun pernyataan tertulis pada seluruh dokumen.”
- **Rencana anggaran biaya (RAB) → Memenuhi Sebagian**
  “Total pagu tepat namun tidak memisahkan Dasar Pengenaan Pajak atau tidak memuat kewajiban PPN dan PPh atas honorarium.”

Kolom **“Ciri Kondisi Admin yang Terpakai”** di Excel menampilkan baris mana yang
dipakai untuk setiap putusan, sehingga setiap status dapat ditelusuri kembali.

Menyetel ketelitian dilakukan dengan menambah baris, bukan mengubah kode.
Kalau peninjau menganggap ringkasan eksekutif yang meluber beberapa baris ke
halaman berikutnya masih wajar, cukup tambahkan ciri itu pada kotak *Memenuhi*.

---

## Halaman pindaian

Banyak proposal memuat halaman hasil pindaian — lembar pengesahan bertanda tangan,
surat pernyataan, lanjutan tabel RAB. Halaman semacam itu tidak punya lapisan teks,
sehingga ekstraksi biasa mengembalikannya sebagai halaman kosong. Bila model
diberi kekosongan itu apa adanya, ia akan menyimpulkan unsurnya memang tidak ada —
tepat pada komponen yang paling sering berupa pindaian.

Portal ini menanganinya secara otomatis:

1. Ekstraksi mencatat halaman mana yang tidak punya lapisan teks, lalu menyisipkan
   penanda `[[TANPA LAPISAN TEKS]]` alih-alih membiarkannya kosong.
2. Bila ada halaman semacam itu, PDF asli diunggah ke Anthropic Files API dan
   dilampirkan pada ketiga panggilan analisis, sehingga model membaca halaman
   tersebut sebagai gambar. Berkasnya kedaluwarsa sendiri setelah 24 jam.
3. PDF yang seluruhnya berlapis teks tidak pernah dilampirkan — jalur teks jauh
   lebih murah dan cepat.

Dampaknya terukur. Pada proposal Wulandari, halaman 2, 9, dan 18 adalah pindaian;
halaman 18 memuat baris total RAB. Tanpa lampiran PDF, sistem menilai RAB
"Tidak Memenuhi" karena rinciannya tampak terpotong. Dengan lampiran, sistem
membaca total Rp100.000.000,00 dan menilai "Memenuhi Sebagian" — sama dengan
peninjau manusia.

---

## Hasil verifikasi silang

`npm run verifikasi` menjalankan pipeline penuh di luar server dan membandingkan
putusan AI dengan lembar `Cross Check_Evaluasi FEB UI_GPS.xlsx`.

Model `claude-opus-5`, pengetahuan admin bawaan, tanpa penyetelan per proposal:

| Proposal | Halaman | Halaman pindaian | Kecocokan |
|---|---|---|---|
| Riyanto — Fintech vs Bank | 37 | — | 15/17 (88%) |
| Wulandari — Bank Guarantees to SME Risk-Taking | 42 | 2, 9, 18 | 15/17 (88%) |
| Rulindo — Digital Panic in Islamic Banking | 23 | 2, 22 | belum diukur |

Catatan kejujuran angka: skor Riyanto diukur sebelum ciri kondisi "Penentuan Tema"
diperhalus, dan skor Rulindo belum sempat diukur karena saldo API habis. Perubahan
ciri tersebut mempersempit kondisi "Memenuhi Sebagian" dan memperluas "Memenuhi",
jadi seharusnya tidak menurunkan skor Riyanto — tetapi itu belum diverifikasi ulang.
Jalankan `npm run verifikasi` untuk keduanya begitu saldo tersedia.

Selisih yang tersisa bukan kesalahan baca. Semuanya adalah AI menilai **lebih
ketat atau lebih teliti**, dan setiap kali dicek ulang ke dokumen asli, posisi AI
dapat dipertahankan:

| Komponen | Manual | AI | Fakta dokumen |
|---|---|---|---|
| Ringkasan eksekutif (Riyanto) | Memenuhi | Memenuhi Sebagian | Ringkasan berlanjut dari hal 3 ke hal 4; KAK mensyaratkan maksimal 1 halaman |
| Latar belakang dan rumusan masalah | Memenuhi | Memenuhi Sebagian | KAK poin 8.3 huruf (b) meminta latar belakang **dan** rumusan masalah; yang ada hanya latar belakang. Lembar manual memang hanya mengecek "Latar belakang" |
| Tinjauan pustaka (Wulandari) | Memenuhi Sebagian | Memenuhi | Terdapat subbab "State of the art" berisi sintesis literatur, terpisah dari subbab "Novelty" |

Kalau peninjau memang menginginkan penilaian yang lebih longgar, caranya bukan
mengubah kode melainkan menambah satu baris di Panel Fine-Tuner. Itulah alasan
panel tersebut ada.

Menjalankannya sendiri:

```bash
npm run verifikasi -- "/path/Proposal.pdf" riyanto hasil.xlsx
```

---

## Keluaran Excel

Tiga lembar, mengikuti struktur lembar cross-check manual:

1. **Ringkasan** — satu baris per proposal, hitungan M/S/T dan skor.
2. **Validasi vs Manual** — 17 baris per proposal: Poin KAK, komponen, hasil
   evaluasi, rujukan halaman, temuan dan analisis, ciri kondisi admin yang
   terpakai, rekomendasi perbaikan, dan status akhir. Kolom status diberi latar
   bersyarat: hijau (Memenuhi), kuning (Memenuhi Sebagian), merah muda (Tidak Memenuhi).
3. **Tujuan dan Ruang Lingkup** — tujuan penelitian, objek, periode pengamatan,
   variabel fokus, batasan wilayah, dan metode analisis.

---

## Menjalankan secara lokal

```bash
npm install
cp .env.example .env.local   # lalu isi ANTHROPIC_API_KEY dan DATABASE_URL
npm run dev
```

Buka <http://localhost:3000>. Panel admin ada di `/admin`.

---

## Penerapan di Vercel

1. **Import repositori** ini di Vercel.
2. **Sambungkan Neon** — Storage → Create Database → Neon. Vercel otomatis
   mengisi `DATABASE_URL` dan kerabatnya.
3. **Sambungkan Blob** — Storage → Create → Blob. Vercel otomatis mengisi
   `BLOB_READ_WRITE_TOKEN`. Bersifat opsional; tanpa ini portal tetap jalan,
   hanya PDF-nya tidak diarsipkan.
4. **Isi environment variable** yang tidak otomatis:

   | Nama | Nilai |
   |---|---|
   | `ANTHROPIC_API_KEY` | kunci Claude API Anda |
   | `ADMIN_PASSWORD` | kata sandi panjang dan acak untuk mengunci `/admin` |
   | `CLAUDE_MODEL` | opsional, bawaannya `claude-opus-5` |

5. **Jalankan `db/schema.sql`** di Neon Console → SQL Editor. Aplikasi juga
   membuat tabelnya sendiri saat permintaan pertama, tetapi menjalankan skema
   lebih dulu membuat permintaan pertama jauh lebih cepat.

### Catatan durasi fungsi

`/api/analyze` diset `maxDuration = 300`. Paket Hobby membatasi fungsi pada 60
detik kecuali **Fluid Compute** aktif. Bila analisis terputus dengan galat
timeout, aktifkan Fluid Compute (Settings → Functions) atau gunakan paket Pro.

### Catatan keamanan

- `ADMIN_PASSWORD` sebaiknya selalu diisi di produksi. Bila kosong, siapa pun
  yang membuka `/admin` dapat menyunting pengetahuan yang mengarahkan penilaian.
- Jangan pernah mengirim kunci API ke repositori. `.env.local` sudah masuk
  `.gitignore`; yang tersimpan di repo hanya `.env.example` berisi placeholder.

---

## Struktur berkas

```
src/
  app/
    page.tsx              halaman unggah
    admin/page.tsx        Panel Fine-Tuner + riwayat
    template.tsx          transisi rute Framer Motion
    api/
      extract/route.ts    Blob + unpdf + Neon
      analyze/route.ts    Claude, satu segmen per permintaan
      export/route.ts     ExcelJS
      heuristics/route.ts CRUD pengetahuan admin
      batches/route.ts    riwayat batch
  components/
    ParticleStage.tsx     logo partikel (idle → "otak" saat analisis)
    tema.tsx              tema gelap/terang
  lib/
    kak.ts                17 komponen KAK + teks acuan + pengetahuan bawaan
    claude.ts             perakitan prompt + keluaran terstruktur Zod
    pdf.ts                ekstraksi unpdf dengan penanda halaman
    excel.ts              perenderan ExcelJS
    db.ts                 Neon + pembuatan skema otomatis
db/schema.sql             skema untuk dijalankan di Neon SQL Editor
scripts/verifikasi.ts     uji silang AI vs cross-check manual
```

---

## Teknologi

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Framer Motion ·
Claude API (`claude-opus-5`, structured outputs + Zod, adaptive thinking,
prompt caching) · unpdf · ExcelJS · Neon Postgres · Vercel Blob.

---

## Batasan

- PDF hasil pindaian tanpa lapisan teks ditolak; gunakan PDF yang teksnya dapat disalin.
- Maksimal 5 berkas per batch, 25 MB per berkas.
- Dokumen yang sangat panjang dipotong pada sekitar 420.000 karakter, dan
  pemotongan itu ditandai di dalam teks yang dikirim ke model.
- Hasil portal ini adalah **bantuan penyaringan administratif**, bukan pengganti
  putusan peninjau. Setiap baris menyertakan rujukan halaman dan alasan agar
  dapat diperiksa ulang.
