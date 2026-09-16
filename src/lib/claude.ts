import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  KOMPONEN_KAK,
  PAGU_PENDANAAN,
  POIN_KAK,
  RUANG_LINGKUP_FIELDS,
  STATUS_DARI_KODE,
  STATUS_LIST,
  type KomponenKAK,
} from "./kak";
import type { EvaluasiKomponen, PetaHeuristik, RuangLingkupItem } from "./types";

/**
 * Sonnet 5 adalah bawaan berdasarkan pengukuran, bukan asumsi.
 *
 * Pada ketiga proposal contoh FEB UI 2026, Sonnet 5 dan Opus 5 menghasilkan
 * putusan yang sama — 19/19 cocok dengan cross-check manual pada proposal
 * Riyanto — sedangkan biayanya sekitar 2,4x lebih murah ($0,28 berbanding
 * $0,67 per proposal). Penyebabnya: putusan di sini dipandu ciri kondisi
 * eksplisit dari Admin Fine-Tuner, sehingga beban penalaran bebasnya kecil.
 * Makin tajam pengetahuan admin, makin kecil ketergantungan pada kecerdasan
 * mentah model.
 *
 * Naikkan ke Opus 5 lewat CLAUDE_MODEL bila suatu saat dibutuhkan.
 */
export const MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-5";
/** Dipakai bila permintaan utama ditolak classifier (stop_reason: "refusal"). */
const MODEL_CADANGAN = "claude-opus-4-8";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORT_SAH: Effort[] = ["low", "medium", "high", "xhigh", "max"];

/**
 * Penilaian ini dipandu ciri kondisi eksplisit dari Admin Fine-Tuner, jadi beban
 * penalaran bebasnya kecil. "medium" menekan token thinking — yang ditagih sebagai
 * output — tanpa kehilangan ketelitian. Naikkan lewat KAK_EFFORT bila perlu.
 *
 * Namanya KAK_EFFORT dan bukan CLAUDE_EFFORT secara sengaja: nama yang terakhir
 * sudah dipakai sebagian perkakas pengembangan dan diam-diam menimpa nilai ini.
 */
export const EFFORT: Effort = EFFORT_SAH.includes(process.env.KAK_EFFORT as Effort)
  ? (process.env.KAK_EFFORT as Effort)
  : "medium";

let klien: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!klien) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY belum diset. Tambahkan di Vercel → Settings → Environment Variables.",
      );
    }
    klien = new Anthropic({ apiKey, maxRetries: 2 });
  }
  return klien;
}

/* ------------------------------------------------------------------ *
 * Pengukuran biaya
 * ------------------------------------------------------------------ */

/** USD per 1 juta token. */
const HARGA: Record<string, { in: number; out: number; tulisCache: number; bacaCache: number }> = {
  "claude-opus-5": { in: 5, out: 25, tulisCache: 6.25, bacaCache: 0.5 },
  "claude-opus-4-8": { in: 5, out: 25, tulisCache: 6.25, bacaCache: 0.5 },
  "claude-sonnet-5": { in: 2, out: 10, tulisCache: 2.5, bacaCache: 0.2 },
  "claude-haiku-4-5": { in: 1, out: 5, tulisCache: 1.25, bacaCache: 0.1 },
};

export interface Pemakaian {
  masuk: number;
  tulisCache: number;
  bacaCache: number;
  keluar: number;
  thinking: number;
  biayaUsd: number;
}

export const PEMAKAIAN_KOSONG: Pemakaian = {
  masuk: 0,
  tulisCache: 0,
  bacaCache: 0,
  keluar: 0,
  thinking: 0,
  biayaUsd: 0,
};

function ukur(usage: Anthropic.Usage, model: string): Pemakaian {
  const h = HARGA[model] ?? HARGA["claude-opus-5"];
  const masuk = usage.input_tokens ?? 0;
  const tulisCache = usage.cache_creation_input_tokens ?? 0;
  const bacaCache = usage.cache_read_input_tokens ?? 0;
  const keluar = usage.output_tokens ?? 0;
  const thinking =
    (usage as { output_tokens_details?: { thinking_tokens?: number } }).output_tokens_details
      ?.thinking_tokens ?? 0;

  const biayaUsd =
    (masuk * h.in + tulisCache * h.tulisCache + bacaCache * h.bacaCache + keluar * h.out) / 1_000_000;

  return { masuk, tulisCache, bacaCache, keluar, thinking, biayaUsd };
}

export function jumlahkanPemakaian(daftar: Pemakaian[]): Pemakaian {
  return daftar.reduce(
    (a, b) => ({
      masuk: a.masuk + b.masuk,
      tulisCache: a.tulisCache + b.tulisCache,
      bacaCache: a.bacaCache + b.bacaCache,
      keluar: a.keluar + b.keluar,
      thinking: a.thinking + b.thinking,
      biayaUsd: a.biayaUsd + b.biayaUsd,
    }),
    PEMAKAIAN_KOSONG,
  );
}

/* ------------------------------------------------------------------ *
 * Skema keluaran terstruktur
 * ------------------------------------------------------------------ */

const StatusEnum = z.enum(STATUS_LIST as [string, ...string[]]);

/**
 * Urutan properti disengaja: model mengisi `analisis` (penalaran berantai)
 * SEBELUM `status`, sehingga putusan lahir dari alasan, bukan sebaliknya.
 */
function skemaEvaluasi(komponen: KomponenKAK[]) {
  const ids = komponen.map((k) => k.id) as [string, ...string[]];
  return z.object({
    evaluasi: z.array(
      z.object({
        komponen_id: z.enum(ids).describe("Kunci komponen KAK yang sedang dinilai."),
        ringkasan_temuan: z
          .string()
          .describe(
            "Ringkasan kondisi dalam 3-10 kata, gaya lembar screening. Contoh: 'Status indeksasi tidak dinyatakan', 'Peran tim tidak eksplisit', 'Ada', 'Tidak ada'.",
          ),
        halaman: z
          .string()
          .describe(
            "Rujukan halaman berdasarkan penanda [[HALAMAN n]]. Format: 'Hal 12' atau 'Hal 13-16'. Gunakan 'Seluruh dokumen' bila unsur dicari di seluruh berkas dan tidak ditemukan.",
          ),
        kutipan: z
          .string()
          .describe("Kutipan pendek atau parafrase bukti. Isi '-' bila unsur memang tidak ada."),
        analisis: z
          .string()
          .describe(
            "Penalaran 1-2 kalimat: cocokkan bukti dokumen dengan kriteria screening DAN dengan ciri kondisi admin yang relevan. Sebut ciri mana yang terpenuhi atau tidak.",
          ),
        heuristik_terpakai: z
          .array(z.string())
          .describe(
            "Salin persis teks ciri kondisi admin yang menjadi dasar putusan. Array kosong bila tidak ada yang cocok.",
          ),
        status: StatusEnum.describe("Putusan akhir setelah analisis di atas."),
      }),
    ),
  });
}

const SkemaRuangLingkup = z.object({
  nama_tim: z
    .string()
    .describe(
      "Nama belakang ketua tim, diikuti KATEGORI tema dalam kurung — persis 'Tema Umum' atau " +
        "'Tema Khusus', bukan nama temanya. 'Tema Khusus' HANYA untuk penelitian tentang " +
        "Pengembangan Model Financial Programming and Policies (FPP) Indonesia; semua tema " +
        "lain adalah 'Tema Umum'. Contoh benar: 'Riyanto (Tema Umum)'. " +
        "Contoh SALAH: 'Riyanto (Perbankan Digital)'.",
    ),
  judul: z.string().describe("Judul lengkap proposal penelitian."),
  ruang_lingkup: z.array(
    z.object({
      field_id: z
        .enum(RUANG_LINGKUP_FIELDS.map((f) => f.id) as [string, ...string[]])
        .describe("Kunci unsur ruang lingkup."),
      nilai: z
        .array(z.string())
        .describe(
          "Satu atau beberapa butir isi. Untuk 'tujuan_penelitian' dan 'variabel_fokus' pecah per butir. Gunakan ['Tidak disebutkan dalam proposal'] bila memang tidak ada.",
        ),
    }),
  ),
});

/* ------------------------------------------------------------------ *
 * Perakitan prompt
 * ------------------------------------------------------------------ */

function blokAcuanKAK(): string {
  const poin = POIN_KAK.map(
    (p) => `  <poin kode="${p.kode}" nama="${p.nama}">\n    ${p.acuan}\n  </poin>`,
  ).join("\n");

  return [
    '<acuan_kak sumber="KAK-1/GRIS/2026 jo. PKS-1006/UN2.F6.D/PPM.00.00/2026">',
    poin,
    `  <pagu>Total pembiayaan Program Pendanaan Penelitian adalah Rp${PAGU_PENDANAAN.toLocaleString(
      "id-ID",
    )},00 (seratus juta rupiah) per proposal.</pagu>`,
    "</acuan_kak>",
  ].join("\n");
}

/** Blok pengetahuan admin untuk seluruh 19 kriteria screening. */
function blokHeuristik(peta: PetaHeuristik): string {
  const isi = KOMPONEN_KAK.map((k) => {
    const perStatus = peta[k.id] ?? {};
    const blokStatus = (["M", "S", "T"] as const)
      .map((s) => {
        const baris = perStatus[s] ?? [];
        if (!baris.length) return "";
        const li = baris.map((t) => `      <ciri>${escapeXml(t)}</ciri>`).join("\n");
        return `    <status nilai="${STATUS_DARI_KODE[s]}">\n${li}\n    </status>`;
      })
      .filter(Boolean)
      .join("\n");

    const badan =
      blokStatus ||
      '    <status nilai="catatan">\n      <ciri>Admin belum menyuntikkan ciri kondisi untuk komponen ini. Nilai murni berdasarkan bunyi kriteria screening.</ciri>\n    </status>';

    const lazim = k.statusLazim.map((s) => STATUS_DARI_KODE[s]).join(" / ");

    return (
      `  <komponen id="${k.id}" nama="${escapeXml(k.nama)}" poin="${k.poin}">\n` +
      `    <kriteria_screening>${escapeXml(k.kriteria)}</kriteria_screening>\n` +
      `    <status_tersedia>${lazim}</status_tersedia>\n${badan}\n  </komponen>`
    );
  }).join("\n");

  return `<pengetahuan_admin>\n${isi}\n</pengetahuan_admin>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const PERAN = `<peran>
Anda adalah verifikator senior seleksi administratif Program Pendanaan Penelitian
Lembaga Penjamin Simpanan (LPS) bersama fakultas ekonomi dan bisnis perguruan tinggi mitra.
Tugas Anda mengisi lembar "Kriteria Screening" terhadap Kerangka Acuan Kerja (KAK) poin 7
sampai 8.3, dengan ketelitian setara peninjau manusia yang memeriksa dokumen halaman per halaman.
</peran>`;

const ATURAN = `<aturan_penilaian>
1. Nilai HANYA berdasarkan isi dokumen proposal di dalam <dokumen_proposal> dan berkas
   lampiran bila ada. Jangan pernah mengarang temuan, nama, angka, nama jurnal, status
   indeksasi, atau nomor halaman.
2. <pengetahuan_admin> adalah pedoman lokal yang WAJIB diikuti dan lebih berwibawa daripada
   pembacaan harfiah Anda sendiri. Bila bukti dokumen cocok dengan sebuah <ciri> pada status
   tertentu, tetapkan status tersebut. Ciri bertanda [kalibrasi] berasal dari putusan peninjau
   manusia pada kasus nyata — patuhi, sekalipun naluri Anda menyarankan status lain.
3. <status_tersedia> menunjukkan status yang lazim dipakai pada lembar screening untuk komponen
   itu. Untuk komponen biner "Memenuhi / Tidak Memenuhi", hindari "Memenuhi Sebagian" kecuali
   ada <ciri> admin yang secara khusus menyebutkannya. PENTING: pada komponen biner, bukti yang
   tidak sempurna tetapi menunjukkan unsurnya ADA berarti "Memenuhi", bukan "Tidak Memenuhi".
   "Tidak Memenuhi" hanya untuk unsur yang benar-benar tidak terpenuhi atau tidak ditemukan.
4. Bila sebuah unsur tidak ditemukan setelah menelusuri seluruh dokumen termasuk lampiran,
   tetapkan "Tidak Memenuhi" dan isi halaman dengan "Seluruh dokumen". Jangan menetapkan
   "Memenuhi Sebagian" hanya karena Anda ragu.
5. Rujukan halaman diambil dari penanda [[HALAMAN n]] pada teks. Sebut rentang bila unsur
   tersebar, contoh "Hal 13-16". Jangan menyebut nomor halaman yang tidak ada penandanya.
6. Halaman bertanda [[TANPA LAPISAN TEKS]] adalah hasil pindaian, BUKAN halaman kosong.
   Bila ada berkas lampiran pada permintaan ini, halaman pindaian itu ada di dalamnya —
   bacalah dari sana. Surat pernyataan bertanda tangan, lembar pengesahan, dan lanjutan tabel
   RAB sering berada di halaman semacam ini. Jangan pernah menyimpulkan sebuah unsur tidak ada
   semata-mata karena halamannya tidak punya lapisan teks.
7. Untuk rekam jejak publikasi: yang dinilai adalah APA YANG TERTULIS DI PROPOSAL. Daftar
   publikasi panjang tanpa keterangan indeksasi Sinta/Scopus BUKAN bukti pemenuhan syarat
   Sinta 2 / Scopus Q3. Anda tidak boleh mengasumsikan peringkat sebuah jurnal.
8. Untuk RAB: periksa total terhadap Rp100.000.000,00 DAN struktur perpajakannya — pemisahan
   Dasar Pengenaan Pajak (DPP), PPN 11% atas pengadaan barang/jasa, PPh 21 atas honorarium
   orang pribadi, PPh 23 atas jasa badan.
9. Isi "analisis" lebih dahulu sebagai penalaran, baru tetapkan "status". Tulis ringkas —
   satu sampai dua kalimat sudah cukup. "status" WAJIB konsisten dengan kesimpulan "analisis":
   bila analisis menyatakan unsurnya terpenuhi, status harus "Memenuhi"; bila analisis menyatakan
   unsurnya tidak ada, status harus "Tidak Memenuhi". Periksa ulang konsistensi ini sebelum
   mengeluarkan setiap entri.
10. Seluruh keluaran dalam Bahasa Indonesia baku, ringkas, dan faktual.
</aturan_penilaian>`;

/**
 * Prefiks sistem — identik untuk SETIAP panggilan pada batch yang sama.
 * Kestabilan inilah yang membuat prompt caching bekerja.
 */
function sistem(peta: PetaHeuristik): Anthropic.TextBlockParam[] {
  return [
    { type: "text", text: PERAN },
    { type: "text", text: blokAcuanKAK() },
    { type: "text", text: blokHeuristik(peta) },
    { type: "text", text: ATURAN, cache_control: { type: "ephemeral" } },
  ];
}

/**
 * Sistem ringan untuk ekstraksi ruang lingkup. Tugas itu murni menyalin isi
 * proposal dan sama sekali tidak memakai ciri kondisi admin, jadi blok
 * pengetahuan yang besar itu tidak dikirim — memangkas beberapa ribu token
 * masukan pada setiap proposal.
 */
function sistemRingan(): Anthropic.TextBlockParam[] {
  return [
    { type: "text", text: PERAN },
    {
      type: "text",
      text:
        "<aturan>\n" +
        "Salin isi proposal apa adanya, ringkas, dalam Bahasa Indonesia baku. Jangan menilai,\n" +
        "jangan menyimpulkan, dan jangan mengarang. Halaman bertanda [[TANPA LAPISAN TEKS]] adalah\n" +
        "hasil pindaian; bila ada berkas lampiran, baca isinya dari sana.\n" +
        "</aturan>",
      cache_control: { type: "ephemeral" },
    },
  ];
}

/* ------------------------------------------------------------------ *
 * Pemanggilan
 * ------------------------------------------------------------------ */

export interface LampiranPindaian {
  /** file_id di Files API, berisi HANYA halaman pindaian. */
  fileId: string;
  /** Nomor halaman asli, urut sesuai urutan halaman di dalam lampiran. */
  halaman: number[];
}

interface OpsiPanggil<T> {
  sistem: Anthropic.TextBlockParam[];
  teksDokumen: string;
  instruksi: string;
  skema: z.ZodType<T>;
  lampiran?: LampiranPindaian | null;
  maxTokens?: number;
}

interface HasilPanggil<T> {
  data: T;
  pemakaian: Pemakaian;
}

async function panggil<T>({
  sistem: sistemBlok,
  teksDokumen,
  instruksi,
  skema,
  lampiran,
  maxTokens = 16000,
}: OpsiPanggil<T>): Promise<HasilPanggil<T>> {
  const client = anthropic();
  const isi: Anthropic.ContentBlockParam[] = [];

  // Hanya halaman pindaian yang dilampirkan, bukan seluruh PDF. Pada proposal
  // 42 halaman dengan 3 halaman pindaian, ini memangkas sekitar 80.000 token
  // gambar menjadi sekitar 6.000.
  if (lampiran) {
    isi.push({
      type: "document",
      source: { type: "file", file_id: lampiran.fileId },
      title: `Halaman pindaian (asli: ${lampiran.halaman.map((h) => `Hal ${h}`).join(", ")})`,
    });
  }

  isi.push({
    type: "text",
    text: `<dokumen_proposal>\n${teksDokumen}\n</dokumen_proposal>`,
    // Titik potong cache: seluruh prefiks di atasnya dipakai ulang oleh
    // panggilan berikutnya pada berkas yang sama.
    cache_control: { type: "ephemeral" },
  });
  isi.push({ type: "text", text: instruksi });

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: isi }];

  const kirim = (model: string) =>
    client.messages.parse({
      model,
      max_tokens: maxTokens,
      thinking: { type: "adaptive" },
      output_config: { effort: EFFORT, format: zodOutputFormat(skema) },
      system: sistemBlok,
      messages,
    });

  let res = await kirim(MODEL);
  let modelTerpakai = MODEL;

  // Classifier sesekali menolak permintaan (HTTP 200, stop_reason "refusal").
  if (res.stop_reason === "refusal") {
    res = await kirim(MODEL_CADANGAN);
    modelTerpakai = MODEL_CADANGAN;
    if (res.stop_reason === "refusal") {
      throw new Error(
        "Permintaan analisis ditolak oleh pemeriksa keamanan model. Periksa isi dokumen lalu coba lagi.",
      );
    }
  }

  if (res.stop_reason === "max_tokens") {
    throw new Error(
      "Keluaran model terpotong sebelum selesai. Kurangi jumlah halaman proposal lalu ulangi.",
    );
  }
  if (!res.parsed_output) {
    throw new Error("Model tidak mengembalikan keluaran terstruktur yang valid.");
  }

  return { data: res.parsed_output, pemakaian: ukur(res.usage, modelTerpakai) };
}

/**
 * Menilai SELURUH kriteria screening terhadap satu dokumen dalam satu panggilan.
 *
 * Sebelumnya ini dipecah menjadi dua panggilan (tema+tim, lalu struktur) dengan
 * harapan panggilan kedua membaca prefiks dari cache. Pengukuran menunjukkan
 * caching tidak pernah mengena: skema keluaran terstruktur berbeda antar segmen,
 * dan perbedaan itu membatalkan pencocokan prefiks. Akibatnya teks dokumen —
 * bagian termahal dari permintaan — dibayar penuh dua kali. Satu panggilan
 * membayarnya sekali.
 */
export async function analisisKomponen(
  teksDokumen: string,
  peta: PetaHeuristik,
  lampiran?: LampiranPindaian | null,
): Promise<{ evaluasi: EvaluasiKomponen[]; pemakaian: Pemakaian }> {
  const komponen = KOMPONEN_KAK;
  const daftar = komponen
    .map((k, i) => `${i + 1}. [${k.id}] ${k.nama} (${k.poin}) — ${k.kriteria}`)
    .join("\n");

  const instruksi = `<tugas>
Isi lembar "Kriteria Screening" untuk proposal di atas: nilai ${komponen.length} kriteria berikut,
mencakup tema penelitian (poin 7), susunan tim (poin 8.1), persyaratan peserta dan tim (poin 8.2),
serta struktur proposal (poin 8.3).

Kembalikan tepat ${komponen.length} entri pada array "evaluasi", satu untuk setiap kriteria,
dalam urutan yang sama seperti daftar ini. Jangan menilai kriteria di luar daftar ini,
dan jangan mengembalikan entri ganda untuk kriteria yang sama.

<daftar_kriteria>
${daftar}
</daftar_kriteria>

Telusuri seluruh dokumen termasuk lembar pengesahan, lampiran, daftar publikasi, tabel anggaran,
dan daftar riwayat hidup sebelum menyimpulkan bahwa sebuah unsur tidak ada.
</tugas>`;

  const { data, pemakaian } = await panggil({
    sistem: sistem(peta),
    teksDokumen,
    instruksi,
    skema: skemaEvaluasi(komponen),
    lampiran,
    // Pengukuran: 19 kriteria menghasilkan sekitar 7.000 token keluaran, jadi
    // 16.000 memberi ruang dua kali lipat. Jangan dinaikkan lagi tanpa beralih
    // ke streaming — SDK menolak permintaan non-streaming dengan max_tokens
    // yang perkiraan durasinya melebihi sepuluh menit.
    maxTokens: 16000,
  });

  return { evaluasi: rapikanEvaluasi(data.evaluasi, komponen), pemakaian };
}

/**
 * Menjamin seluruh komponen selalu lengkap di Excel: entri yang hilang diisi
 * penanda eksplisit, entri ganda dibuang, urutan dikembalikan ke urutan screening.
 */
function rapikanEvaluasi(
  mentah: z.infer<ReturnType<typeof skemaEvaluasi>>["evaluasi"],
  komponen: KomponenKAK[],
): EvaluasiKomponen[] {
  const byId = new Map(mentah.map((e) => [e.komponen_id, e]));

  return komponen.map((k) => {
    const e = byId.get(k.id);
    if (!e) {
      return {
        komponen_id: k.id,
        komponen_nama: k.nama,
        poin_kak: k.poin,
        ringkasan_temuan: "Tidak dievaluasi",
        halaman: "-",
        kutipan: "-",
        analisis: "Model tidak mengembalikan penilaian untuk kriteria ini. Perlu reviu manual.",
        heuristik_terpakai: [],
        status: "Memenuhi Sebagian" as const,
      };
    }
    return {
      komponen_id: k.id,
      komponen_nama: k.nama,
      poin_kak: k.poin,
      ringkasan_temuan: e.ringkasan_temuan,
      halaman: e.halaman,
      kutipan: e.kutipan,
      analisis: e.analisis,
      heuristik_terpakai: e.heuristik_terpakai,
      status: e.status as EvaluasiKomponen["status"],
    };
  });
}

/** Mengekstraksi tujuan dan ruang lingkup untuk lembar ketiga berkas Excel. */
export async function analisisRuangLingkup(
  teksDokumen: string,
  lampiran?: LampiranPindaian | null,
): Promise<{
  nama_tim: string;
  judul: string;
  ruang_lingkup: RuangLingkupItem[];
  pemakaian: Pemakaian;
}> {
  const daftar = RUANG_LINGKUP_FIELDS.map((f) => `- [${f.id}] ${f.nama}`).join("\n");

  const instruksi = `<tugas>
Abaikan penilaian status untuk tugas ini. Ekstraksi identitas dan ruang lingkup penelitian
dari proposal di atas, satu entri untuk setiap unsur berikut, dalam urutan yang sama:

<daftar_unsur>
${daftar}
</daftar_unsur>

Panduan isi:
- tujuan_penelitian: pecah menjadi satu butir per tujuan, salin substansinya secara ringkas.
- objek_penelitian: apa yang menjadi objek atau fenomena yang diteliti.
- periode_pengamatan: rentang waktu data atau observasi, sebut tahunnya bila ada.
- variabel_fokus: pecah per kelompok — variabel dependen, independen, kontrol/moderator.
- batasan_wilayah: cakupan wilayah, unit analisis, dan jumlah sampel bila disebut.
- metode_analisis: teknik analisis atau model yang digunakan.

Gunakan ["Tidak disebutkan dalam proposal"] bila sebuah unsur memang tidak ada.
</tugas>`;

  const { data, pemakaian } = await panggil({
    sistem: sistemRingan(),
    teksDokumen,
    instruksi,
    skema: SkemaRuangLingkup,
    lampiran,
  });

  const byId = new Map(data.ruang_lingkup.map((r) => [r.field_id, r]));
  const ruang_lingkup: RuangLingkupItem[] = RUANG_LINGKUP_FIELDS.map((f) => ({
    field_id: f.id,
    field_nama: f.nama,
    nilai: byId.get(f.id)?.nilai ?? ["Tidak disebutkan dalam proposal"],
  }));

  return { nama_tim: data.nama_tim, judul: data.judul, ruang_lingkup, pemakaian };
}
