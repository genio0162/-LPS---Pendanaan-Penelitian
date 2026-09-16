/**
 * Acuan KAK-1/GRIS/2026 & PKS-1006/UN2.F6.D/PPM.00.00/2026 — poin 7 s.d. 8.3.
 *
 * Daftar komponen di bawah mengikuti lembar "Kriteria Screening" (19 baris),
 * bukan lembar cross-check manual (17 baris). Dua baris cross-check memang
 * menggabungkan dua kriteria screening yang terpisah:
 *   - "Susunan Keanggotaan Tim"        = ketua+anggota (8.1) DAN maksimal 4 orang (8.2)
 *   - "Pernyataan Etika & Non-Double"  = etika penelitian (8.2) DAN non-double funding (8.3)
 * Memisahkannya membuat keluaran Excel langsung sebangun dengan lembar screening
 * yang benar-benar diisi peninjau.
 *
 * Teks acuan dikutip dari lampiran KAK sehingga model menilai terhadap bunyi
 * ketentuan yang sebenarnya, bukan terhadap parafrase.
 */

export type StatusValidasi = "Memenuhi" | "Memenuhi Sebagian" | "Tidak Memenuhi";

export const STATUS_LIST: StatusValidasi[] = [
  "Memenuhi",
  "Memenuhi Sebagian",
  "Tidak Memenuhi",
];

/** Kunci status yang dipakai di basis data & UI (M / S / T). */
export type KodeStatus = "M" | "S" | "T";

export const STATUS_DARI_KODE: Record<KodeStatus, StatusValidasi> = {
  M: "Memenuhi",
  S: "Memenuhi Sebagian",
  T: "Tidak Memenuhi",
};

/**
 * Segmen analisis — satu panggilan Claude per segmen.
 *
 * Seluruh 19 kriteria dinilai dalam SATU panggilan. Memecahnya menjadi dua
 * panggilan pernah dicoba, tetapi tidak menghemat: skema keluaran terstruktur
 * yang berbeda membatalkan prompt caching, sehingga teks dokumen dibayar penuh
 * pada setiap panggilan. Satu panggilan berarti teks dokumen dibayar sekali.
 */
export type Segmen = "kriteria" | "ruang_lingkup";

export interface KomponenKAK {
  /** Kunci stabil untuk basis data. */
  id: string;
  /** Nama ringkas komponen, dipakai sebagai judul kolom di Excel dan UI. */
  nama: string;
  /** Bunyi kriteria persis seperti pada lembar "Kriteria Screening". */
  kriteria: string;
  /** "Poin 7" | "Poin 8.1" | "Poin 8.2" | "Poin 8.3" */
  poin: string;
  /**
   * Status yang tersedia pada lembar screening untuk komponen ini.
   * Sebagian kriteria bersifat biner (Memenuhi / Tidak Memenuhi) karena tidak
   * ada kondisi antara yang masuk akal — misalnya jumlah anggota tim.
   */
  statusLazim: KodeStatus[];
}

export interface PoinKAK {
  kode: string;
  nama: string;
  acuan: string;
}

export const POIN_KAK: PoinKAK[] = [
  {
    kode: "Poin 7",
    nama: "Tema Penelitian",
    acuan:
      'Tema khusus: "Pengembangan Model Financial Programming and Policies (FPP) Indonesia". ' +
      "Tema umum mencakup isu strategis di bidang penjaminan simpanan, perbankan, dan stabilitas " +
      "sistem keuangan dengan pilihan: (a) penjaminan simpanan; (b) penjaminan polis asuransi; " +
      "(c) resolusi bank; (d) resolusi perusahaan asuransi dan/atau perusahaan asuransi syariah; " +
      "(e) program restrukturisasi perbankan; (f) perilaku nasabah penyimpan; (g) manajemen krisis; " +
      "(h) perbankan digital; (i) literasi dan inklusi keuangan; dan/atau (j) isu stabilitas sistem " +
      "keuangan lainnya yang relevan dengan tugas dan fungsi LPS.",
  },
  {
    kode: "Poin 8.1",
    nama: "Susunan Keanggotaan Tim Peneliti",
    acuan:
      "a. Setiap tim peneliti terdiri dari 1 (satu) orang ketua dan sekurang-kurangnya 1 (satu) " +
      "anggota tim peneliti; b. jumlah maksimal tim peneliti paling banyak 4 (empat) orang peneliti; " +
      "c. tim peneliti sebagaimana butir (b) tidak termasuk tim peneliti yang ditugaskan dari LPS " +
      "yang akan ditetapkan kemudian setelah pemenang hibah diumumkan.",
  },
  {
    kode: "Poin 8.2",
    nama: "Persyaratan Peserta dan Tim",
    acuan:
      "a. tim peneliti bersifat kolaboratif, terdiri dari peneliti perguruan tinggi terkait dan/atau " +
      "pihak LPS dalam hal ditugaskan; b. ketua tim peneliti berasal dari perguruan tinggi terkait " +
      "dengan persyaratan: dosen tetap (PNS atau non-PNS) dengan jabatan fungsional minimal Lektor; " +
      "telah memiliki gelar Doktor (S3) atau sedang menempuh pendidikan Doktoral; dan memiliki rekam " +
      "jejak publikasi di jurnal nasional terakreditasi minimal Sinta 2 atau jurnal internasional " +
      "minimal Q3 Scopus, dan berkomitmen melakukan aktivitas penelitian sesuai kegiatan; c. anggota " +
      "tim peneliti wajib berasal dari civitas akademika perguruan tinggi terkait; d. setiap anggota " +
      "tim wajib mematuhi etika penelitian, integritas akademik, dan kerahasiaan data/informasi " +
      "sebagaimana diatur dalam PKS; dan e. proposal belum atau tidak sedang didanai oleh pihak lain " +
      "untuk ruang lingkup yang sama (non-double funding).",
  },
  {
    kode: "Poin 8.3",
    nama: "Struktur Proposal",
    acuan:
      "Struktur proposal ditetapkan sebagai acuan bagi penyusunan proposal penelitian, dengan " +
      "unsur-unsur yang harus dipenuhi minimal sebagai berikut: a. ringkasan eksekutif (maksimal 1 " +
      "halaman); b. latar belakang dan rumusan masalah; c. tujuan dan pertanyaan penelitian; " +
      "d. tinjauan pustaka singkat dan kebaruan penelitian; e. metodologi (data, variabel, teknik " +
      "analisis, rencana robustness/validasi); f. rencana kerja dan jadwal; g. rencana luaran " +
      "(artikel dan bahan paparan hasil penelitian (slide)) dan target jurnal; h. rencana anggaran " +
      "biaya (RAB) sesuai pagu paket pendanaan penelitian yang ditetapkan; dan i. profil singkat tim.",
  },
];

/** Pagu pendanaan per proposal sesuai poin 11.1 KAK. */
export const PAGU_PENDANAAN = 100_000_000;

const MST: KodeStatus[] = ["M", "S", "T"];
const MT: KodeStatus[] = ["M", "T"];

/** 19 komponen, urut persis seperti lembar "Kriteria Screening". */
export const KOMPONEN_KAK: KomponenKAK[] = [
  {
    id: "penentuan_tema",
    nama: "Penentuan Tema",
    kriteria: "Kesesuaian proposal dengan Tema Khusus atau Tema Umum yang ditetapkan.",
    poin: "Poin 7",
    statusLazim: ["M", "S"],
  },
  {
    id: "ketua_dan_anggota",
    nama: "Ketua dan sekurang-kurangnya 1 anggota",
    kriteria: "Terdapat ketua dan sekurang-kurangnya 1 (satu) anggota tim peneliti.",
    poin: "Poin 8.1",
    statusLazim: MT,
  },
  {
    id: "jumlah_tim_maks4",
    nama: "Jumlah tim maksimal 4 orang",
    kriteria:
      "Jumlah tim peneliti paling banyak 4 (empat) orang, di luar tim yang ditugaskan dari LPS.",
    poin: "Poin 8.2",
    statusLazim: MT,
  },
  {
    id: "tim_kolaboratif",
    nama: "Tim Kolaboratif Universitas",
    kriteria:
      "Tim bersifat kolaboratif, terdiri dari peneliti perguruan tinggi terkait dan/atau pihak LPS dalam hal ditugaskan.",
    poin: "Poin 8.2",
    statusLazim: MT,
  },
  {
    id: "jabatan_lektor",
    nama: "Jabatan fungsional min. Lektor",
    kriteria:
      "Ketua berasal dari perguruan tinggi terkait dan memiliki jabatan fungsional minimal Lektor.",
    poin: "Poin 8.2",
    statusLazim: MT,
  },
  {
    id: "gelar_doktor",
    nama: "Gelar Doktor atau sedang menempuh",
    kriteria: "Ketua bergelar Doktor (S3) atau sedang menempuh pendidikan doktoral.",
    poin: "Poin 8.2",
    statusLazim: MT,
  },
  {
    id: "rekam_jejak_publikasi",
    nama: "Rekam jejak publikasi",
    kriteria:
      "Ketua memiliki rekam jejak publikasi di jurnal nasional terakreditasi minimal SINTA 2 atau jurnal internasional minimal Q3 Scopus.",
    poin: "Poin 8.2",
    // Lembar screening menulis biner, tetapi lembar cross-check manual memakai
    // "Memenuhi Sebagian" ketika publikasi ada tanpa keterangan indeksasi.
    // Ketiga status dibiarkan terbuka agar nuansa itu tidak hilang.
    statusLazim: MST,
  },
  {
    id: "anggota_civitas",
    nama: "Anggota civitas akademika",
    kriteria: "Anggota tim berasal dari civitas akademika perguruan tinggi terkait.",
    poin: "Poin 8.2",
    statusLazim: MT,
  },
  {
    id: "etika_penelitian",
    nama: "Pemenuhan etika penelitian",
    kriteria:
      "Pemenuhan etika penelitian, integritas akademik, dan kerahasiaan data/informasi sebagaimana diatur dalam PKS.",
    poin: "Poin 8.2",
    statusLazim: MT,
  },
  {
    id: "non_double_funding",
    nama: "Ketentuan non-double funding",
    kriteria:
      "Proposal belum atau tidak sedang didanai oleh pihak lain untuk ruang lingkup yang sama (non-double funding).",
    poin: "Poin 8.3",
    statusLazim: MST,
  },
  {
    id: "ringkasan_eksekutif",
    nama: "Ringkasan eksekutif",
    kriteria: "Ringkasan eksekutif minimal 1 halaman.",
    poin: "Poin 8.3",
    statusLazim: MST,
  },
  {
    id: "latar_belakang",
    nama: "Latar belakang dan rumusan masalah",
    kriteria: "Terdapat latar belakang dan rumusan masalah.",
    poin: "Poin 8.3",
    statusLazim: MST,
  },
  {
    id: "tujuan_pertanyaan",
    nama: "Tujuan dan pertanyaan penelitian",
    kriteria: "Terdapat tujuan dan pertanyaan penelitian.",
    poin: "Poin 8.3",
    statusLazim: MST,
  },
  {
    id: "tinjauan_pustaka",
    nama: "Tinjauan pustaka dan kebaruan",
    kriteria: "Terdapat tinjauan pustaka dan kebaruan penelitian.",
    poin: "Poin 8.3",
    statusLazim: MST,
  },
  {
    id: "metodologi",
    nama: "Metodologi",
    kriteria:
      "Metodologi yang terdiri dari data, variabel, teknik analisis, dan rencana robustness/validasi.",
    poin: "Poin 8.3",
    statusLazim: MST,
  },
  {
    id: "rencana_kerja",
    nama: "Rencana kerja dan jadwal",
    kriteria: "Terdapat rencana kerja awal dan jadwal pelaksanaan.",
    poin: "Poin 8.3",
    statusLazim: MST,
  },
  {
    id: "rencana_luaran",
    nama: "Rencana luaran dan target jurnal",
    kriteria: "Terdapat rencana luaran dan target jurnal.",
    poin: "Poin 8.3",
    statusLazim: MST,
  },
  {
    id: "rab",
    nama: "Rencana anggaran biaya (RAB)",
    kriteria:
      "Rencana Anggaran Biaya (RAB) sesuai total pembiayaan Program Pendanaan Penelitian sebesar Rp100.000.000,00.",
    poin: "Poin 8.3",
    statusLazim: MST,
  },
  {
    id: "profil_tim",
    nama: "Profil singkat tim",
    kriteria: "Terdapat profil singkat tim peneliti.",
    poin: "Poin 8.3",
    statusLazim: MT,
  },
];

export const KOMPONEN_BY_ID = new Map(KOMPONEN_KAK.map((k) => [k.id, k]));

/** Baris "Tujuan dan Ruang Lingkup" — lembar ketiga pada berkas Excel. */
export const RUANG_LINGKUP_FIELDS = [
  { id: "tujuan_penelitian", nama: "Tujuan Penelitian", daftar: true },
  { id: "objek_penelitian", nama: "Objek Penelitian", daftar: false },
  { id: "periode_pengamatan", nama: "Periode Pengamatan", daftar: false },
  { id: "variabel_fokus", nama: "Variabel Fokus", daftar: true },
  { id: "batasan_wilayah", nama: "Batasan Wilayah", daftar: false },
  { id: "metode_analisis", nama: "Metode Analisis", daftar: false },
] as const;

/* ==================================================================== *
 * Pengetahuan bawaan Admin Fine-Tuner
 *
 * Disusun dari tiga sumber yang saling menguatkan:
 *   1. bunyi ketentuan KAK poin 7 - 8.3;
 *   2. lembar "Kriteria Screening" (19 kriteria beserta status yang tersedia);
 *   3. hasil cross-check manual atas tiga proposal FEB UI 2026 — Riyanto
 *      (Fintech vs Bank), Rulindo (Digital Panic in Islamic Banking), dan
 *      Wulandari (Bank Guarantees to SME Risk-Taking) — termasuk alasan
 *      peninjau menaikkan atau menurunkan status.
 *
 * Baris bertanda [kalibrasi] berasal dari kasus nyata pada ketiga proposal itu
 * dan ada supaya putusan model sejalan dengan kebiasaan peninjau, bukan sekadar
 * pembacaan harfiah KAK. Admin bebas menambah, mengubah, atau menghapusnya.
 * ==================================================================== */

export const SEED_HEURISTIK: Record<string, Partial<Record<KodeStatus, string[]>>> = {
  penentuan_tema: {
    M: [
      "Judul, kata kunci, atau ringkasan memuat salah satu tema umum poin 7.2 seperti penjaminan simpanan, resolusi bank, perbankan digital, perilaku nasabah penyimpan, atau literasi dan inklusi keuangan.",
      "Tema dinyatakan eksplisit pada halaman judul atau lembar pengesahan, misalnya tertulis \"Tema Umum: perilaku nasabah penyimpan\".",
      "[kalibrasi] Populasi atau sampel penelitian boleh berada di sektor riil — misalnya UMKM, rumah tangga, atau nasabah kredit — sepanjang pertanyaan penelitiannya menyangkut penjaminan simpanan, moral hazard perbankan, resolusi bank, atau stabilitas sistem keuangan. Pilihan sampel bukan alasan menurunkan status.",
      "[kalibrasi] Penelitian tentang uang elektronik atau fintech terhadap Dana Pihak Ketiga perbankan masuk tema perbankan digital sekaligus stabilitas sistem keuangan.",
    ],
    S: [
      "Tema poin 7.2 hanya muncul sebagai latar atau motivasi, sedangkan pertanyaan penelitian utamanya tidak menyangkut tugas dan fungsi LPS.",
    ],
    T: ["Tidak ada irisan sama sekali dengan sepuluh tema umum maupun tema khusus FPP Indonesia."],
  },

  ketua_dan_anggota: {
    M: [
      "Tercantum satu ketua dan sekurang-kurangnya satu anggota tim peneliti, baik pada lembar pengesahan, RAB, maupun lampiran profil tim.",
      "[kalibrasi] Posisi anggota boleh tersirat dari lampiran profil atau daftar riwayat hidup; tidak wajib ada tabel susunan tim tersendiri.",
    ],
    T: ["Peneliti tunggal, atau tidak ada satu pun anggota selain ketua."],
  },

  jumlah_tim_maks4: {
    M: [
      "Total peneliti tidak lebih dari empat orang, di luar tim yang ditugaskan LPS.",
      "[kalibrasi] Tim beranggotakan dua orang (satu ketua, satu anggota) jelas memenuhi batas ini.",
    ],
    T: [
      "Total peneliti lebih dari empat orang di luar tim yang ditugaskan LPS.",
      "Asisten peneliti atau pembantu lapangan yang dibayar dari RAB tidak dihitung sebagai peneliti; jangan menolak proposal hanya karena mereka disebut.",
    ],
  },

  tim_kolaboratif: {
    M: [
      "Seluruh peneliti berafiliasi pada fakultas atau perguruan tinggi terkait, atau kolaborasi antara perguruan tinggi tersebut dengan pihak LPS yang ditugaskan.",
      "Afiliasi terbukti dari penulisan departemen, unit riset, atau domain surel resmi perguruan tinggi seperti ui.ac.id.",
    ],
    T: ["Seluruh atau sebagian besar tim berasal dari institusi di luar perguruan tinggi terkait."],
  },

  jabatan_lektor: {
    M: [
      "Jabatan fungsional ketua tertulis eksplisit minimal Lektor pada lembar pengesahan, profil tim, atau daftar riwayat hidup.",
      "Jabatan di atas Lektor — Lektor Kepala atau Guru Besar — tentu memenuhi.",
    ],
    T: [
      "Jabatan fungsional ketua berada di bawah Lektor, misalnya Asisten Ahli, atau tidak ditemukan sama sekali pada seluruh dokumen.",
    ],
  },

  gelar_doktor: {
    M: [
      "Ketua bergelar Doktor, Dr., atau Ph.D. sebagaimana tertulis pada nama, lembar pengesahan, atau riwayat pendidikan.",
      "Ketua dinyatakan sedang menempuh pendidikan doktoral disertai keterangan program studi dan universitas.",
    ],
    T: ["Ketua tidak bergelar Doktor dan tidak ada keterangan sedang menempuh pendidikan doktoral."],
  },

  rekam_jejak_publikasi: {
    M: [
      "Daftar publikasi mencantumkan status indeksasi eksplisit minimal Sinta 2 atau Scopus Q3, lengkap dengan nama jurnal dan tahun terbit.",
      "[kalibrasi] Penulisan peringkat seperti \"Q1\", \"Q2\", \"jurnal internasional bereputasi Q2\", atau tautan profil Scopus dan SINTA milik ketua dihitung sebagai keterangan indeksasi yang eksplisit.",
    ],
    S: [
      "[kalibrasi] Daftar publikasi panjang tersedia, namun tidak satu pun entri mencantumkan status indeksasi Sinta atau Scopus sehingga pemenuhan syarat tidak dapat diverifikasi dari teks proposal.",
      "[kalibrasi] Publikasi terindeks ada, namun mayoritas berada di luar bidang keuangan, perbankan, atau stabilitas sistem keuangan.",
      "[kalibrasi] Publikasi yang relevan hanya muncul sebagai profil naratif, bukan sebagai daftar publikasi yang dapat diperiksa.",
      "[kalibrasi] Profil ketua tersedia namun sama sekali tidak memuat daftar publikasi. Nilai Memenuhi Sebagian, BUKAN Tidak Memenuhi: ketiadaan daftar di dalam proposal adalah kekurangan dokumentasi, sedangkan rekam jejak yang sebenarnya masih perlu ditelusuri manual di SINTA atau Scopus. Peninjau memakai status ini sebagai penanda untuk menelusuri, bukan sebagai penggugur.",
    ],
    T: [
      "Tidak ditemukan daftar maupun narasi publikasi, DAN profil ketua juga tidak dilampirkan, sehingga tidak ada apa pun yang dapat ditelusuri.",
    ],
  },

  anggota_civitas: {
    M: [
      "Anggota tim terbukti civitas akademika melalui afiliasi tertulis, jabatan pengajar, atau domain surel resmi perguruan tinggi seperti ui.ac.id.",
      "[kalibrasi] Bila lembar pengesahan hanya memuat surel pribadi, afiliasi pada lampiran daftar riwayat hidup sudah cukup menjadi bukti.",
    ],
    T: ["Anggota berasal dari luar civitas akademika perguruan tinggi terkait."],
  },

  etika_penelitian: {
    M: [
      "Terdapat pernyataan tertulis atau surat pernyataan bertanda tangan mengenai kepatuhan etika penelitian, integritas akademik, dan kerahasiaan data/informasi.",
    ],
    T: [
      "Tidak ditemukan pernyataan etika penelitian, integritas akademik, maupun kerahasiaan data pada seluruh dokumen termasuk lampiran.",
      "[kalibrasi] Pernyataan kebenaran data pada daftar riwayat hidup BUKAN pernyataan etika penelitian. Jangan menghitungnya sebagai pemenuhan.",
      "[kalibrasi] Ketiadaan dokumen yang bersifat mutlak seperti ini dinilai Tidak Memenuhi, bukan Memenuhi Sebagian.",
    ],
  },

  non_double_funding: {
    M: [
      "Terdapat pernyataan tertulis bahwa proposal belum atau tidak sedang didanai pihak lain untuk ruang lingkup yang sama.",
    ],
    S: [
      "Pernyataan non-double funding disebut dalam narasi proposal, namun dokumen bertanda tangan tidak dilampirkan.",
    ],
    T: [
      "[kalibrasi] Tidak ditemukan pernyataan non-double funding pada seluruh dokumen. Ini temuan yang berulang pada ketiga proposal contoh FEB UI 2026.",
    ],
  },

  ringkasan_eksekutif: {
    M: [
      "[kalibrasi] Terdapat bagian ringkasan eksekutif atau executive summary di awal dokumen dengan panjang sekurang-kurangnya satu halaman. Lembar screening memakai kriteria \"minimal 1 halaman\", jadi ringkasan yang meluber beberapa baris ke halaman berikutnya TETAP Memenuhi.",
    ],
    S: [
      "Ringkasan eksekutif ada namun sangat pendek, hanya beberapa paragraf jauh di bawah satu halaman, atau melebur dengan abstrak tanpa judul bagian tersendiri.",
    ],
    T: ["Tidak ada bagian ringkasan eksekutif sama sekali."],
  },

  latar_belakang: {
    M: [
      "[kalibrasi] Bab latar belakang tersedia dan memuat uraian masalah penelitian. Rumusan masalah TIDAK wajib berupa subbab atau daftar tersendiri — cukup bila masalah penelitian dapat dikenali dari narasi, bagan, atau pernyataan kesenjangan literatur.",
      "Judul bab memuat \"Latar Belakang dan Rumusan Masalah\" dan isinya memang menguraikan keduanya.",
    ],
    S: [
      "Latar belakang sangat singkat atau melompat langsung ke metodologi sehingga masalah penelitian tidak dapat dikenali sama sekali.",
    ],
    T: ["Tidak ada bagian latar belakang."],
  },

  tujuan_pertanyaan: {
    M: [
      "Tujuan penelitian dan pertanyaan penelitian keduanya tersedia, baik sebagai subbab terpisah maupun sebagai daftar bernomor yang dapat dibedakan.",
    ],
    S: [
      "[kalibrasi] Hanya memuat tujuan penelitian; pertanyaan penelitian tidak dirumuskan sama sekali.",
      "Hanya memuat pertanyaan penelitian tanpa pernyataan tujuan.",
    ],
    T: ["Tujuan maupun pertanyaan penelitian tidak ditemukan."],
  },

  tinjauan_pustaka: {
    M: [
      "Terdapat tinjauan pustaka yang mensintesis literatur terdahulu berikut rujukannya, DAN pernyataan kebaruan penelitian, keduanya dapat dibedakan.",
      "[kalibrasi] Subbab bernama \"State of the art\", \"Literature Review\", atau sejenisnya dihitung sebagai tinjauan pustaka sepanjang benar-benar membahas studi terdahulu beserta kesenjangannya, bukan sekadar daftar rujukan.",
    ],
    S: [
      "[kalibrasi] Hanya memuat pernyataan kebaruan tanpa tinjauan pustaka yang mensintesis studi terdahulu.",
      "[kalibrasi] Tinjauan pustaka melebur di dalam latar belakang tanpa subbab tersendiri, dan penomoran bab melompat sehingga strukturnya tidak dapat ditelusuri.",
    ],
    T: ["Tinjauan pustaka maupun kebaruan tidak ditemukan."],
  },

  metodologi: {
    M: [
      "Metodologi memuat sumber data, definisi variabel, teknik analisis, serta rencana robustness atau validasi.",
      "[kalibrasi] Pada penelitian kualitatif, rencana validasi dapat berupa triangulasi, member checking, atau validasi model — semuanya dihitung sebagai robustness.",
    ],
    S: ["Metodologi ada namun rencana robustness atau validasi tidak dijelaskan sama sekali."],
    T: ["Tidak ada bab metodologi."],
  },

  rencana_kerja: {
    M: [
      "Terdapat tabel jadwal per bulan atau per tahap, DISERTAI pembagian peran dan penanggung jawab tiap tahap.",
    ],
    S: [
      "[kalibrasi] Jadwal pelaksanaan tersedia dan rinci, namun tanpa pembagian kerja tim atau penanggung jawab tahapan. Ini temuan yang berulang pada ketiga proposal contoh FEB UI 2026.",
    ],
    T: ["Tidak ada jadwal pelaksanaan penelitian."],
  },

  rencana_luaran: {
    M: [
      "Luaran berupa artikel dan bahan paparan (slide) disebutkan, DAN nama jurnal target disebut spesifik beserta status indeksasinya.",
    ],
    S: [
      "[kalibrasi] Luaran sesuai ketentuan, namun target jurnal hanya disebut secara umum seperti \"jurnal terindeks Scopus\" tanpa menyebut nama jurnalnya.",
    ],
    T: ["Rencana luaran tidak dicantumkan."],
  },

  rab: {
    M: [
      "Total RAB sama dengan pagu Rp100.000.000,00, memisahkan Dasar Pengenaan Pajak (DPP), serta memuat PPN 11% atas pengadaan barang/jasa dan PPh 21/23 atas honorarium.",
    ],
    S: [
      "[kalibrasi] Total anggaran sesuai atau di bawah pagu Rp100.000.000,00, namun RAB tidak memisahkan Dasar Pengenaan Pajak, tidak memuat PPN 11%, dan tidak memuat PPh 21 atas honorarium peneliti, asisten, narasumber, atau proofreader. Ini temuan yang berulang pada ketiga proposal contoh FEB UI 2026.",
      "[kalibrasi] Total sedikit di bawah pagu — misalnya Rp99.413.000,00 — tetap dinilai sesuai pagu; yang menurunkan status adalah struktur pajaknya, bukan selisih nominalnya.",
      "Honorarium pihak ketiga berbadan hukum seperti jasa proofreading dikenakan PPh 23; honorarium orang pribadi dikenakan PPh 21. Ketiadaan keduanya menurunkan status.",
    ],
    T: [
      "Total RAB melebihi pagu Rp100.000.000,00, atau rincian anggaran tidak dilampirkan sama sekali.",
    ],
  },

  profil_tim: {
    M: [
      "Profil singkat seluruh anggota tim tersedia, baik sebagai tabel daftar riwayat hidup maupun uraian naratif.",
      "[kalibrasi] Profil dalam bentuk naratif satu paragraf per peneliti sudah cukup; tidak wajib berupa CV lengkap.",
    ],
    T: ["Profil tim tidak dilampirkan untuk satu pun peneliti."],
  },
};

/** Rekomendasi perbaikan bawaan, dipakai pada kolom Excel bila status bukan "Memenuhi". */
export const REKOMENDASI: Record<string, string> = {
  penentuan_tema:
    "Nyatakan tema yang dipilih secara eksplisit pada halaman judul, dan tautkan pertanyaan penelitian dengan tugas dan fungsi LPS.",
  ketua_dan_anggota: "Cantumkan susunan tim yang menyebut tegas posisi ketua dan anggota.",
  jumlah_tim_maks4: "Batasi jumlah peneliti maksimal empat orang di luar tim yang ditugaskan LPS.",
  tim_kolaboratif: "Cantumkan afiliasi resmi setiap peneliti beserta surel institusi.",
  jabatan_lektor: "Tuliskan jabatan fungsional ketua secara eksplisit pada lembar pengesahan.",
  gelar_doktor:
    "Cantumkan gelar Doktor ketua, atau keterangan program doktoral yang sedang ditempuh beserta universitasnya.",
  rekam_jejak_publikasi:
    "Cantumkan daftar publikasi dengan nama jurnal, tahun, dan status indeksasi Sinta/Scopus secara eksplisit, utamakan yang sebidang.",
  anggota_civitas: "Cantumkan afiliasi dan surel institusi setiap anggota tim.",
  etika_penelitian:
    "Lampirkan surat pernyataan bertanda tangan mengenai kepatuhan etika penelitian, integritas akademik, dan kerahasiaan data.",
  non_double_funding:
    "Lampirkan surat pernyataan bertanda tangan bahwa proposal tidak sedang didanai pihak lain untuk ruang lingkup yang sama.",
  ringkasan_eksekutif: "Susun ringkasan eksekutif tersendiri sepanjang sekitar satu halaman.",
  latar_belakang: "Tambahkan rumusan masalah yang dinyatakan tegas setelah uraian latar belakang.",
  tujuan_pertanyaan: "Rumuskan pertanyaan penelitian secara terpisah dari pernyataan tujuan.",
  tinjauan_pustaka:
    "Tambahkan subbab tinjauan pustaka yang mensintesis studi terdahulu, terpisah dari pernyataan kebaruan.",
  metodologi: "Tambahkan rencana robustness atau validasi pada bab metodologi.",
  rencana_kerja: "Tambahkan pembagian peran dan penanggung jawab tiap tahap pada tabel jadwal.",
  rencana_luaran: "Sebutkan nama jurnal sasaran beserta status indeksasinya.",
  rab: "Pisahkan Dasar Pengenaan Pajak serta masukkan PPN 11% dan PPh 21/23 atas honorarium.",
  profil_tim: "Lampirkan profil singkat untuk seluruh anggota tim.",
};

/** Tahapan yang dijalankan untuk setiap berkas, ditampilkan pada modal progres. */
export const TAHAP_BERKAS = [
  "Mengunggah dan mengekstraksi teks",
  "Menilai 19 kriteria screening",
  "Mengekstraksi tujuan dan ruang lingkup",
];

/** Tahap terakhir, dijalankan sekali untuk seluruh batch. */
export const TAHAP_AKHIR = "Menyusun berkas Excel";
