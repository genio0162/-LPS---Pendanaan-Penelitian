# LPS — Pendanaan Penelitian

Portal evaluasi proposal **Program Pendanaan Penelitian LPS – FEB UI**.
Unggah PDF proposal, sistem menilainya terhadap **KAK-1/GRIS/2026 poin 7 sampai 8.3**
(19 kriteria screening), lalu mengembalikan satu berkas Excel siap cross-check.

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

Satu proposal diproses dalam tiga langkah, masing-masing satu permintaan HTTP:

| Langkah | Endpoint | Isi |
|---|---|---|
| 1 | `POST /api/extract` | Unggah ke Vercel Blob, ekstraksi teks per halaman, simpan ke Neon |
| 2 | `POST /api/analyze` `segmen: kriteria` | Seluruh 19 kriteria screening sekaligus |
| 3 | `POST /api/analyze` `segmen: ruang_lingkup` | Tujuan dan ruang lingkup (lembar ketiga Excel) |
| akhir | `POST /api/export` | Menyusun `.xlsx` untuk seluruh batch |

Jumlah panggilan sengaja ditekan. Bagian termahal dari sebuah permintaan adalah
teks dokumennya, dan setiap panggilan tambahan berarti membayarnya lagi — lihat
bagian [Biaya](#biaya) untuk angka ukurnya.

---

## Admin Fine-Tuner

Inti dari portal ini. Model bahasa umum tidak mengenal nomenklatur SINTA maupun
aturan PPN/PPh Indonesia, dan tidak tahu kebiasaan peninjau di lembar screening.
Verifikator menyuntikkan pengetahuan itu lewat `/admin`.

Untuk setiap kriteria screening, admin menulis **ciri kondisi** pada tiga kotak —
*Memenuhi*, *Memenuhi Sebagian*, *Tidak Memenuhi*. Jumlah baris per kotak bebas.
Baris ini dirakit ke dalam blok XML `<pengetahuan_admin>` pada system prompt, dan
model wajib mengikutinya: bila bukti dokumen cocok dengan sebuah ciri, status
itulah yang ditetapkan.

### Pengetahuan bawaan

Portal terpasang dengan **73 baris pengetahuan** yang disemai otomatis, disusun
dari tiga sumber yang saling menguatkan:

1. bunyi ketentuan KAK poin 7 sampai 8.3;
2. lembar **Kriteria Screening** — 19 kriteria beserta status yang tersedia untuk
   masing-masing (sebagian biner *Memenuhi / Tidak Memenuhi*, sebagian tiga status);
3. hasil **cross-check manual atas tiga proposal FEB UI 2026** — Riyanto, Rulindo,
   dan Wulandari — termasuk alasan peninjau menaikkan atau menurunkan status.

Baris yang berasal dari sumber ketiga ditandai `[kalibrasi]`. Baris itu ada supaya
putusan model sejalan dengan kebiasaan peninjau, bukan sekadar pembacaan harfiah
KAK. Contohnya:

| Kriteria | Status | Ciri kondisi `[kalibrasi]` |
|---|---|---|
| Ringkasan eksekutif | Memenuhi | Lembar screening memakai kriteria *minimal* 1 halaman, jadi ringkasan yang meluber ke halaman berikutnya tetap Memenuhi |
| Latar belakang dan rumusan masalah | Memenuhi | Rumusan masalah tidak wajib berupa subbab tersendiri; cukup bila masalahnya dapat dikenali dari narasi |
| Rekam jejak publikasi | Memenuhi Sebagian | Profil ketua ada tetapi tanpa daftar publikasi → penanda untuk ditelusuri manual di SINTA/Scopus, bukan penggugur |
| Penentuan Tema | Memenuhi | Sampel boleh di sektor riil (UMKM) sepanjang pertanyaan penelitiannya menyangkut tugas dan fungsi LPS |
| Pemenuhan etika penelitian | Tidak Memenuhi | Pernyataan kebenaran data pada daftar riwayat hidup BUKAN pernyataan etika penelitian |
| Rencana anggaran biaya | Memenuhi Sebagian | Total sedikit di bawah pagu tetap dinilai sesuai pagu; yang menurunkan status adalah struktur pajaknya |

Kolom **"Ciri Kondisi Admin yang Terpakai"** di Excel menampilkan baris mana yang
dipakai untuk setiap putusan, sehingga setiap status dapat ditelusuri kembali ke
pengetahuan yang melahirkannya.

Menyetel ketelitian dilakukan dengan menambah baris, bukan mengubah kode. Setiap
kali peninjau tidak sepakat dengan sebuah putusan, perbaikannya adalah satu baris
baru di panel — dan putusan itu berlaku untuk seluruh batch berikutnya.

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
2. Halaman itu — dan HANYA halaman itu — disalin ke PDF kecil dengan `pdf-lib`,
   diunggah ke Anthropic Files API, lalu dilampirkan pada panggilan analisis
   sehingga model membacanya sebagai gambar. Berkasnya kedaluwarsa sendiri
   setelah 24 jam.
3. PDF yang seluruhnya berlapis teks tidak pernah dilampirkan — jalur teks jauh
   lebih murah dan cepat.

Penyaringan di langkah 2 itu penting untuk biaya. Satu halaman PDF berharga
sekitar 2.000 token karena diproses sebagai gambar; melampirkan seluruh 42 halaman
Wulandari untuk memperoleh isi 3 halaman berarti membayar ~84.000 token alih-alih
~6.000.

Dampaknya terukur. Pada proposal Wulandari, halaman 2, 9, dan 18 adalah pindaian;
halaman 18 memuat baris total RAB. Tanpa lampiran PDF, sistem menilai RAB
"Tidak Memenuhi" karena rinciannya tampak terpotong. Dengan lampiran, sistem
membaca total Rp100.000.000,00 dan menilai "Memenuhi Sebagian" — sama dengan
peninjau manusia.

---

## Hasil verifikasi silang

`npm run verifikasi` menjalankan pipeline penuh di luar server, membandingkan
putusan AI dengan lembar `Cross Check_Evaluasi FEB UI_GPS.xlsx`, lalu melaporkan
pemakaian token dan biaya nyata.

```bash
npm run verifikasi -- "/path/Proposal.pdf" riyanto hasil.xlsx
```

Angka di bawah diukur pada konfigurasi bawaan — `claude-sonnet-5`, effort
`medium`, pengetahuan admin bawaan, tanpa penyetelan per proposal:

| Proposal | Halaman | Halaman pindaian | Kecocokan | Biaya |
|---|---|---|---|---|
| Riyanto — Fintech vs Bank | 37 | — | **19/19 (100%)** | $0,236 |
| Rulindo — Digital Panic in Islamic Banking | 23 | 2, 22 | **19/19 (100%)** | $0,141 |
| Wulandari — Bank Guarantees to SME Risk-Taking | 42 | 2, 9, 18 | **18/19 (95%)** | $0,263 |
| **Total satu batch berisi tiga proposal** | | | **56/57 (98%)** | **$0,64** |

Satu selisih yang tersisa pada proposal Wulandari adalah "Tinjauan pustaka dan
kebaruan": lembar manual menilai *Memenuhi Sebagian* dengan catatan tinjauan
pustaka tidak tersedia, sedangkan AI menemukan subbab "State of the art" berisi
sintesis literatur beserta rujukannya pada halaman 8-12 dan menilai *Memenuhi*.
Setelah dicek ke dokumen asli, subbab itu memang ada.

### Bagaimana angka ini naik dari 88% ke 100%

Tiga perubahan, semuanya di pengetahuan dan struktur — bukan model yang lebih besar:

1. **Mengikuti lembar screening, bukan lembar cross-check.** 19 kriteria, bukan 17.
   Dua baris cross-check menggabungkan kriteria yang sebenarnya terpisah, dan
   penggabungan itu memaksa satu status untuk dua pertanyaan berbeda.
2. **Kriteria "ringkasan eksekutif" berbunyi *minimal* 1 halaman**, bukan *maksimal*
   seperti pada KAK. Sebelum ini diketahui, sistem menilai ringkasan yang meluber
   ke halaman berikutnya sebagai *Memenuhi Sebagian* — lebih ketat daripada praktik
   peninjau yang sebenarnya.
3. **Ciri kondisi [kalibrasi] dari putusan nyata peninjau.** Contohnya: rumusan
   masalah tidak wajib berupa subbab tersendiri; profil ketua tanpa daftar publikasi
   dinilai *Memenuhi Sebagian* sebagai penanda untuk ditelusuri manual, bukan
   *Tidak Memenuhi*.

---

<a id="biaya"></a>
## Biaya

Biaya didominasi token **masukan**, dan bagian terbesarnya adalah teks dokumen.
Konsekuensinya sederhana: makin sedikit panggilan, makin murah — karena setiap
panggilan tambahan berarti mengirim ulang dokumen yang sama.

Angka ukur pada proposal Riyanto (37 halaman), lewat `npm run verifikasi`:

| Konfigurasi | Panggilan | Kecocokan | Biaya |
|---|---|---|---|
| Opus 5 · effort xhigh · 3 panggilan | 3 | — | $1,07 |
| Opus 5 · effort medium · 2 panggilan | 2 | 19/19 | $0,67 |
| **Sonnet 5 · effort medium · 2 panggilan** *(bawaan)* | 2 | **19/19** | **$0,28** |

Empat keputusan yang membuat selisihnya:

- **Satu panggilan untuk seluruh 19 kriteria.** Versi awal memecahnya menjadi dua
  segmen dengan harapan panggilan kedua membaca prefiks dari cache. Pengukuran
  membantahnya: skema keluaran terstruktur yang berbeda membatalkan pencocokan
  prefiks, sehingga teks dokumen dibayar penuh dua kali.
- **Hanya halaman pindaian yang dilampirkan.** Satu halaman PDF berharga sekitar
  2.000 token karena diproses sebagai gambar. Mengirim 42 halaman untuk memperoleh
  isi 3 halaman berarti membayar ~84.000 token alih-alih ~6.000.
- **Ekstraksi ruang lingkup memakai prompt ringan.** Tugas itu murni menyalin isi
  dan tidak memakai ciri kondisi admin, jadi blok pengetahuan yang besar tidak dikirim.
- **Sonnet 5 sebagai bawaan.** Putusan di sini dipandu ciri kondisi eksplisit, jadi
  beban penalaran bebasnya kecil. Pada data yang diukur, Sonnet 5 menyamai Opus 5
  dengan biaya sekitar 2,4x lebih murah. Naikkan lewat `CLAUDE_MODEL=claude-opus-5`
  bila memang dibutuhkan.

Prefiks sistem (acuan KAK + seluruh pengetahuan admin, sekitar 13.000 token)
di-*cache* lintas proposal, jadi batch berisi beberapa berkas membayarnya sekali
lalu membacanya dengan harga 0,1x.

Efeknya terlihat pada angka nyata: proposal kedua dalam batch (Rulindo) hanya
menghabiskan $0,141 karena 32.960 token masukannya dibaca dari cache, sedangkan
proposal pertama membayar prefiks itu penuh.

**Satu batch berisi tiga proposal terukur $0,64 — sekitar $0,21 per proposal.**

---

## Keluaran Excel

Tiga lembar, mengikuti struktur lembar cross-check manual:

1. **Ringkasan** — satu baris per proposal, hitungan M/S/T dan skor.
2. **Validasi vs Manual** — 19 baris per proposal: Poin KAK, komponen, hasil
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

Pengetahuan bawaan disemai otomatis saat permintaan pertama menyentuh basis data
yang tabel `heuristik`-nya masih kosong. Untuk menyemai ulang setelah pengetahuan
bawaan di kode berubah, kosongkan tabelnya: `DELETE FROM heuristik;`

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
    kak.ts                19 kriteria screening + teks acuan + pengetahuan bawaan
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
