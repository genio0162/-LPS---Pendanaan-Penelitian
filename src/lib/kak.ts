/**
 * Acuan KAK-1/GRIS/2026 & PKS-1006/UN2.F6.D/PPM.00.00/2026 — poin 7 s.d. 8.3.
 *
 * Teks acuan di bawah ini dikutip langsung dari lampiran KAK sehingga model
 * menilai terhadap bunyi ketentuan yang sebenarnya, bukan terhadap parafrase.
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

export const KODE_DARI_STATUS: Record<StatusValidasi, KodeStatus> = {
  Memenuhi: "M",
  "Memenuhi Sebagian": "S",
  "Tidak Memenuhi": "T",
};

/** Segmen analisis — satu panggilan Claude per segmen, agar tiap panggilan fokus dan cepat. */
export type Segmen = "tema_tim" | "struktur" | "ruang_lingkup";

export interface KomponenKAK {
  /** Kunci stabil untuk basis data. */
  id: string;
  /** Nama komponen sebagaimana dipakai pada lembar cross-check manual. */
  nama: string;
  /** "Poin 7" | "Poin 8.1" | "Poin 8.2" | "Poin 8.3" */
  poin: string;
  segmen: Exclude<Segmen, "ruang_lingkup">;
  /** Bunyi ketentuan KAK yang mendasari komponen ini. */
  acuan: string;
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
      "a. tim peneliti bersifat kolaboratif, terdiri dari peneliti FEB UI dan/atau pihak LPS dalam " +
      "hal ditugaskan; b. ketua tim peneliti berasal dari FEB UI dengan persyaratan: dosen tetap FEB UI " +
      "(PNS atau non-PNS) dengan jabatan fungsional minimal Lektor; telah memiliki gelar Doktor (S3) " +
      "atau sedang menempuh pendidikan Doktoral; dan memiliki rekam jejak publikasi di jurnal nasional " +
      "terakreditasi minimal Sinta 2 atau jurnal internasional minimal Q3 Scopus, dan berkomitmen " +
      "melakukan aktivitas penelitian sesuai kegiatan; c. anggota tim peneliti wajib berasal dari " +
      "civitas akademika FEB UI; d. setiap anggota tim wajib mematuhi etika penelitian, integritas " +
      "akademik, dan kerahasiaan data/informasi sebagaimana diatur dalam PKS; dan e. proposal belum " +
      "atau tidak sedang didanai oleh pihak lain untuk ruang lingkup yang sama (non-double funding).",
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

/** 17 komponen yang dinilai, urut persis seperti lembar cross-check manual. */
export const KOMPONEN_KAK: KomponenKAK[] = [
  {
    id: "penentuan_tema",
    nama: "Penentuan Tema",
    poin: "Poin 7",
    segmen: "tema_tim",
    acuan:
      "Judul dan substansi penelitian harus masuk ke tema khusus FPP Indonesia atau salah satu dari " +
      "sepuluh tema umum poin 7.2.",
  },
  {
    id: "susunan_tim",
    nama: "Susunan Keanggotaan Tim Peneliti",
    poin: "Poin 8.1",
    segmen: "tema_tim",
    acuan:
      "1 (satu) ketua dan sekurang-kurangnya 1 (satu) anggota, dengan total peneliti paling banyak " +
      "4 (empat) orang, di luar tim yang ditugaskan LPS.",
  },
  {
    id: "tim_kolaboratif",
    nama: "Tim Kolaboratif Universitas",
    poin: "Poin 8.2",
    segmen: "tema_tim",
    acuan:
      "Tim peneliti bersifat kolaboratif, terdiri dari peneliti perguruan tinggi terkait (FEB UI) " +
      "dan/atau pihak LPS dalam hal ditugaskan.",
  },
  {
    id: "gelar_doktor",
    nama: "Gelar Doktor atau sedang menempuh",
    poin: "Poin 8.2",
    segmen: "tema_tim",
    acuan: "Ketua tim telah memiliki gelar Doktor (S3) atau sedang menempuh pendidikan Doktoral.",
  },
  {
    id: "jabatan_lektor",
    nama: "Jabatan fungsional min. Lektor",
    poin: "Poin 8.2",
    segmen: "tema_tim",
    acuan:
      "Ketua tim adalah dosen tetap (PNS atau non-PNS) dengan jabatan fungsional minimal Lektor.",
  },
  {
    id: "rekam_jejak_publikasi",
    nama: "Rekam jejak publikasi",
    poin: "Poin 8.2",
    segmen: "tema_tim",
    acuan:
      "Ketua tim memiliki rekam jejak publikasi di jurnal nasional terakreditasi minimal Sinta 2 " +
      "atau jurnal internasional minimal Q3 Scopus.",
  },
  {
    id: "anggota_civitas",
    nama: "Anggota civitas akademika",
    poin: "Poin 8.2",
    segmen: "tema_tim",
    acuan: "Anggota tim peneliti wajib berasal dari civitas akademika perguruan tinggi terkait.",
  },
  {
    id: "etika_non_double_funding",
    nama: "Pernyataan Etika & Non-Double Funding",
    poin: "Poin 8.2",
    segmen: "tema_tim",
    acuan:
      "Setiap anggota tim wajib mematuhi etika penelitian, integritas akademik, dan kerahasiaan " +
      "data/informasi; serta proposal belum atau tidak sedang didanai pihak lain untuk ruang " +
      "lingkup yang sama (non-double funding).",
  },
  {
    id: "ringkasan_eksekutif",
    nama: "Ringkasan eksekutif",
    poin: "Poin 8.3",
    segmen: "struktur",
    acuan: "Ringkasan eksekutif, maksimal 1 (satu) halaman.",
  },
  {
    id: "latar_belakang",
    nama: "Latar belakang dan rumusan masalah",
    poin: "Poin 8.3",
    segmen: "struktur",
    acuan: "Latar belakang dan rumusan masalah.",
  },
  {
    id: "tujuan_pertanyaan",
    nama: "Tujuan dan pertanyaan penelitian",
    poin: "Poin 8.3",
    segmen: "struktur",
    acuan: "Tujuan dan pertanyaan penelitian (keduanya harus ada dan dirumuskan terpisah).",
  },
  {
    id: "tinjauan_pustaka",
    nama: "Tinjauan pustaka dan kebaruan",
    poin: "Poin 8.3",
    segmen: "struktur",
    acuan: "Tinjauan pustaka singkat dan kebaruan penelitian (keduanya harus ada).",
  },
  {
    id: "metodologi",
    nama: "Metodologi",
    poin: "Poin 8.3",
    segmen: "struktur",
    acuan: "Metodologi yang memuat data, variabel, teknik analisis, dan rencana robustness/validasi.",
  },
  {
    id: "rencana_kerja",
    nama: "Rencana kerja dan jadwal",
    poin: "Poin 8.3",
    segmen: "struktur",
    acuan: "Rencana kerja dan jadwal pelaksanaan penelitian.",
  },
  {
    id: "rencana_luaran",
    nama: "Rencana luaran dan target jurnal",
    poin: "Poin 8.3",
    segmen: "struktur",
    acuan:
      "Rencana luaran berupa artikel dan bahan paparan hasil penelitian (slide) beserta target jurnal.",
  },
  {
    id: "rab",
    nama: "Rencana anggaran biaya (RAB)",
    poin: "Poin 8.3",
    segmen: "struktur",
    acuan:
      "Rencana anggaran biaya (RAB) sesuai pagu paket pendanaan penelitian yang ditetapkan, yaitu " +
      "total pembiayaan sebesar Rp100.000.000,00 (seratus juta rupiah) per proposal.",
  },
  {
    id: "profil_tim",
    nama: "Profil singkat tim",
    poin: "Poin 8.3",
    segmen: "struktur",
    acuan: "Profil singkat tim peneliti.",
  },
];

export const KOMPONEN_BY_ID = new Map(KOMPONEN_KAK.map((k) => [k.id, k]));

export function komponenSegmen(segmen: Exclude<Segmen, "ruang_lingkup">): KomponenKAK[] {
  return KOMPONEN_KAK.filter((k) => k.segmen === segmen);
}

/** Baris "Tujuan dan Ruang Lingkup" — lembar kedua pada berkas Excel cross-check. */
export const RUANG_LINGKUP_FIELDS = [
  { id: "tujuan_penelitian", nama: "Tujuan Penelitian", daftar: true },
  { id: "objek_penelitian", nama: "Objek Penelitian", daftar: false },
  { id: "periode_pengamatan", nama: "Periode Pengamatan", daftar: false },
  { id: "variabel_fokus", nama: "Variabel Fokus", daftar: true },
  { id: "batasan_wilayah", nama: "Batasan Wilayah", daftar: false },
  { id: "metode_analisis", nama: "Metode Analisis", daftar: false },
] as const;

export type RuangLingkupFieldId = (typeof RUANG_LINGKUP_FIELDS)[number]["id"];

/**
 * Pengetahuan bawaan (seed) untuk Admin Fine-Tuner.
 * Disemai ke basis data saat pertama kali dijalankan; admin bebas menambah/menghapus.
 */
export const SEED_HEURISTIK: Record<string, Partial<Record<KodeStatus, string[]>>> = {
  penentuan_tema: {
    M: [
      "Judul, kata kunci, atau ringkasan memuat salah satu tema umum poin 7.2 seperti penjaminan simpanan, resolusi bank, perbankan digital, atau literasi dan inklusi keuangan.",
      "Tema dinyatakan eksplisit di halaman judul atau lembar pengesahan.",
      "Populasi atau sampel penelitian boleh berada di sektor riil, misalnya UMKM atau rumah tangga, sepanjang pertanyaan penelitiannya menyangkut penjaminan simpanan, perilaku nasabah penyimpan, moral hazard perbankan, resolusi bank, atau stabilitas sistem keuangan. Pilihan sampel bukan alasan untuk menurunkan status.",
    ],
    S: [
      "Tema poin 7.2 hanya muncul sebagai latar atau motivasi, sedangkan pertanyaan penelitian utamanya tidak menyangkut tugas dan fungsi LPS.",
    ],
    T: ["Tidak ada irisan dengan sepuluh tema umum maupun tema khusus FPP Indonesia."],
  },
  susunan_tim: {
    M: [
      "Tercantum satu ketua dan sekurang-kurangnya satu anggota, dengan total tidak lebih dari empat peneliti.",
    ],
    S: [
      "Jumlah peneliti memenuhi, namun posisi ketua dan anggota tidak dinyatakan tegas pada dokumen.",
    ],
    T: [
      "Peneliti tunggal, atau total peneliti lebih dari empat orang di luar tim yang ditugaskan LPS.",
    ],
  },
  tim_kolaboratif: {
    M: [
      "Seluruh peneliti berafiliasi pada fakultas/perguruan tinggi terkait, atau kolaborasi dengan pihak LPS yang ditugaskan.",
    ],
    S: ["Afiliasi sebagian anggota tidak disebutkan sehingga sifat kolaboratif tidak terverifikasi."],
    T: ["Tim berasal dari institusi di luar perguruan tinggi terkait."],
  },
  gelar_doktor: {
    M: [
      "Ketua bergelar Doktor/Ph.D., atau dinyatakan sedang menempuh pendidikan doktoral disertai keterangan program dan universitas.",
    ],
    S: ["Gelar akademik ketua tidak dicantumkan secara eksplisit meskipun profil tim tersedia."],
    T: ["Ketua tim tidak bergelar Doktor dan tidak sedang menempuh pendidikan doktoral."],
  },
  jabatan_lektor: {
    M: [
      "Jabatan fungsional ketua tertulis eksplisit minimal Lektor pada lembar pengesahan atau profil tim.",
    ],
    S: ["Status dosen tetap tercantum namun jabatan fungsional tidak disebutkan."],
    T: ["Jabatan fungsional ketua di bawah Lektor, misalnya Asisten Ahli."],
  },
  rekam_jejak_publikasi: {
    M: [
      "Daftar publikasi mencantumkan status indeksasi eksplisit minimal Sinta 2 atau Scopus Q3, lengkap dengan nama jurnal dan tahun terbit.",
    ],
    S: [
      "Daftar publikasi tersedia namun tidak satu pun mencantumkan status indeksasi Sinta atau Scopus.",
      "Publikasi terindeks ada, namun mayoritas berada di luar bidang keuangan, perbankan, atau stabilitas sistem keuangan.",
      "Publikasi relevan hanya muncul sebagai profil naratif, bukan sebagai daftar publikasi.",
    ],
    T: ["Tidak ditemukan daftar maupun narasi publikasi pada seluruh dokumen."],
  },
  anggota_civitas: {
    M: [
      "Anggota tim terbukti civitas akademika melalui afiliasi tertulis atau domain surel resmi perguruan tinggi, misalnya ui.ac.id.",
    ],
    S: ["Anggota disebutkan namun tanpa afiliasi atau surel yang dapat diverifikasi."],
    T: ["Anggota berasal dari luar civitas akademika perguruan tinggi terkait."],
  },
  etika_non_double_funding: {
    M: [
      "Terdapat surat pernyataan bertanda tangan yang memuat kepatuhan etika penelitian, integritas akademik, kerahasiaan data, dan non-double funding.",
    ],
    S: [
      "Pernyataan disebut dalam narasi proposal, namun dokumen bertanda tangan tidak dilampirkan.",
    ],
    T: ["Tidak ditemukan surat pernyataan maupun pernyataan tertulis pada seluruh dokumen."],
  },
  ringkasan_eksekutif: {
    M: ["Terdapat bagian ringkasan eksekutif di awal dokumen dengan panjang maksimal satu halaman."],
    S: ["Ringkasan ada namun melebihi satu halaman atau melebur dengan abstrak."],
    T: ["Tidak ada ringkasan eksekutif."],
  },
  latar_belakang: {
    M: ["Latar belakang dan rumusan masalah keduanya tersedia dan dapat dibedakan."],
    S: ["Latar belakang ada namun rumusan masalah tidak dinyatakan tegas."],
    T: ["Tidak ada bagian latar belakang."],
  },
  tujuan_pertanyaan: {
    M: ["Tujuan penelitian dan pertanyaan penelitian dirumuskan terpisah dan keduanya eksplisit."],
    S: ["Hanya memuat tujuan; pertanyaan penelitian tidak dirumuskan."],
    T: ["Tujuan maupun pertanyaan penelitian tidak ditemukan."],
  },
  tinjauan_pustaka: {
    M: ["Terdapat tinjauan pustaka dan pernyataan kebaruan penelitian secara terpisah dan jelas."],
    S: [
      "Hanya memuat kebaruan; tinjauan pustaka tidak tersedia sebagai bagian tersendiri.",
      "Tinjauan pustaka melebur di latar belakang tanpa subbab tersendiri.",
    ],
    T: ["Tinjauan pustaka maupun kebaruan tidak ditemukan."],
  },
  metodologi: {
    M: [
      "Metodologi memuat sumber data, definisi variabel, teknik analisis, serta rencana robustness atau validasi.",
    ],
    S: ["Metodologi ada namun rencana robustness atau validasi tidak dijelaskan."],
    T: ["Tidak ada bab metodologi."],
  },
  rencana_kerja: {
    M: [
      "Terdapat tabel jadwal per bulan beserta pembagian peran dan penanggung jawab tiap tahap.",
    ],
    S: ["Jadwal tersedia namun tanpa pembagian kerja tim atau penanggung jawab tahapan."],
    T: ["Tidak ada jadwal pelaksanaan penelitian."],
  },
  rencana_luaran: {
    M: [
      "Luaran artikel dan bahan paparan disebutkan, serta nama jurnal target dinyatakan spesifik beserta status indeksasinya.",
    ],
    S: ["Luaran sesuai ketentuan, namun target jurnal belum disebut secara spesifik."],
    T: ["Rencana luaran tidak dicantumkan."],
  },
  rab: {
    M: [
      "Total RAB sama dengan pagu yang ditetapkan, memisahkan Dasar Pengenaan Pajak, serta memuat PPN 11% dan PPh 21/23 atas honorarium.",
    ],
    S: [
      "Total pagu tepat namun tidak memisahkan Dasar Pengenaan Pajak atau tidak memuat kewajiban PPN dan PPh atas honorarium.",
    ],
    T: ["Total RAB melebihi pagu, atau rincian anggaran tidak dilampirkan."],
  },
  profil_tim: {
    M: ["Profil singkat seluruh anggota tim tersedia, baik dalam bentuk tabel CV maupun naratif."],
    S: ["Profil hanya tersedia untuk sebagian anggota tim."],
    T: ["Profil tim tidak dilampirkan."],
  },
};

/** Rekomendasi perbaikan bawaan, dipakai pada kolom catatan Excel bila status bukan "Memenuhi". */
export const REKOMENDASI: Record<string, string> = {
  rekam_jejak_publikasi:
    "Cantumkan daftar publikasi dengan nama jurnal, tahun, dan status indeksasi Sinta/Scopus secara eksplisit, utamakan yang sebidang.",
  etika_non_double_funding:
    "Lampirkan surat pernyataan bertanda tangan mengenai kepatuhan etika penelitian dan non-double funding.",
  rencana_kerja:
    "Tambahkan pembagian peran dan penanggung jawab tiap tahap pada tabel jadwal.",
  rab: "Pisahkan Dasar Pengenaan Pajak serta masukkan PPN 11% dan PPh 21/23 atas honorarium.",
  tujuan_pertanyaan: "Rumuskan pertanyaan penelitian secara terpisah dari pernyataan tujuan.",
  tinjauan_pustaka: "Tambahkan subbab tinjauan pustaka yang terpisah dari latar belakang.",
  rencana_luaran: "Sebutkan nama jurnal sasaran beserta status indeksasinya.",
};

/** Tahapan yang dijalankan untuk setiap berkas, ditampilkan pada modal progres. */
export const TAHAP_BERKAS = [
  "Mengunggah dan mengekstraksi teks",
  "Menilai tema dan tim peneliti",
  "Menilai struktur proposal",
  "Mengekstraksi tujuan dan ruang lingkup",
];

/** Tahap terakhir, dijalankan sekali untuk seluruh batch. */
export const TAHAP_AKHIR = "Menyusun berkas Excel";
