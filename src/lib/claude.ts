import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  KOMPONEN_KAK,
  PAGU_PENDANAAN,
  POIN_KAK,
  RUANG_LINGKUP_FIELDS,
  STATUS_LIST,
  komponenSegmen,
  type KomponenKAK,
} from "./kak";
import type { EvaluasiKomponen, PetaHeuristik, RuangLingkupItem } from "./types";

export const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5";
/** Dipakai bila permintaan utama ditolak classifier (stop_reason: "refusal"). */
const MODEL_CADANGAN = "claude-opus-4-8";

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
            "Ringkasan kondisi dalam 3-10 kata, gaya lembar cross-check. Contoh: 'Status indeksasi tidak dinyatakan', 'Peran tim tidak eksplisit', 'Ada', 'Tidak ada'.",
          ),
        halaman: z
          .string()
          .describe(
            "Rujukan halaman dokumen asli berdasarkan penanda [[HALAMAN n]]. Format: 'Hal 12' atau 'Hal 13-16'. Gunakan 'Seluruh dokumen' bila unsur dicari di seluruh berkas dan tidak ditemukan.",
          ),
        kutipan: z
          .string()
          .describe(
            "Kutipan pendek atau parafrase teks proposal yang menjadi bukti. Kosongkan dengan '-' bila unsur memang tidak ditemukan.",
          ),
        analisis: z
          .string()
          .describe(
            "Penalaran 1-3 kalimat: cocokkan bukti dokumen dengan bunyi ketentuan KAK DAN dengan baris pengetahuan admin yang relevan. Sebut secara eksplisit ciri kondisi mana yang terpenuhi atau tidak.",
          ),
        heuristik_terpakai: z
          .array(z.string())
          .describe(
            "Salin persis teks baris pengetahuan admin yang menjadi dasar putusan. Array kosong bila tidak ada yang cocok.",
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
      "Nama belakang ketua tim diikuti jenis tema dalam kurung, contoh: 'Riyanto (Tema Umum)'.",
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
    "<acuan_kak sumber=\"KAK-1/GRIS/2026 jo. PKS-1006/UN2.F6.D/PPM.00.00/2026\">",
    poin,
    `  <pagu>Total pembiayaan Program Pendanaan Penelitian adalah Rp${PAGU_PENDANAAN.toLocaleString(
      "id-ID",
    )},00 (seratus juta rupiah) per proposal.</pagu>`,
    "</acuan_kak>",
  ].join("\n");
}

function blokHeuristik(peta: PetaHeuristik, komponen: KomponenKAK[]): string {
  const label: Record<string, string> = {
    M: "Memenuhi",
    S: "Memenuhi Sebagian",
    T: "Tidak Memenuhi",
  };

  const isi = komponen
    .map((k) => {
      const perStatus = peta[k.id] ?? {};
      const blokStatus = (["M", "S", "T"] as const)
        .map((s) => {
          const baris = perStatus[s] ?? [];
          if (!baris.length) return "";
          const li = baris.map((t) => `      <ciri>${escapeXml(t)}</ciri>`).join("\n");
          return `    <status nilai="${label[s]}">\n${li}\n    </status>`;
        })
        .filter(Boolean)
        .join("\n");

      const badan =
        blokStatus ||
        "    <status nilai=\"catatan\">\n      <ciri>Admin belum menyuntikkan ciri kondisi untuk komponen ini. Nilai murni berdasarkan bunyi ketentuan KAK.</ciri>\n    </status>";

      return `  <komponen id="${k.id}" nama="${escapeXml(k.nama)}" poin="${k.poin}">\n    <ketentuan_kak>${escapeXml(
        k.acuan,
      )}</ketentuan_kak>\n${badan}\n  </komponen>`;
    })
    .join("\n");

  return `<pengetahuan_admin>\n${isi}\n</pengetahuan_admin>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const PERAN = `<peran>
Anda adalah verifikator senior seleksi administratif Program Pendanaan Penelitian
Lembaga Penjamin Simpanan (LPS) bersama Fakultas Ekonomi dan Bisnis Universitas Indonesia.
Tugas Anda menilai proposal penelitian terhadap Kerangka Acuan Kerja (KAK) poin 7 sampai 8.3,
dengan ketelitian setara peninjau manusia yang memeriksa dokumen halaman per halaman.
</peran>`;

const ATURAN = `<aturan_penilaian>
1. Nilai HANYA berdasarkan isi dokumen proposal di dalam <dokumen_proposal>. Jangan pernah
   mengarang temuan, nama, angka, nama jurnal, status indeksasi, atau nomor halaman.
2. <pengetahuan_admin> adalah pedoman lokal yang WAJIB diikuti. Bila bukti dokumen cocok dengan
   sebuah <ciri> pada status tertentu, tetapkan status tersebut. Ciri yang lebih spesifik
   mengalahkan penilaian umum Anda.
3. Bila sebuah unsur sama sekali tidak ditemukan setelah menelusuri seluruh dokumen termasuk
   lampiran, tetapkan "Tidak Memenuhi" dan isi halaman dengan "Seluruh dokumen".
   Jangan menetapkan "Memenuhi Sebagian" hanya karena Anda ragu.
4. Ketiadaan dokumen yang bersifat mutlak — misalnya surat pernyataan etika dan non-double
   funding — adalah "Tidak Memenuhi", bukan "Memenuhi Sebagian".
5. Rujukan halaman diambil dari penanda [[HALAMAN n]] pada teks. Sebut rentang bila unsur
   tersebar, contoh "Hal 13-16". Jangan menyebut nomor halaman yang tidak ada penandanya.
5b. Halaman bertanda [[TANPA LAPISAN TEKS]] adalah hasil pindaian, bukan halaman kosong.
   Bila berkas PDF asli dilampirkan pada permintaan ini, baca isi halaman itu dari berkas
   tersebut. Surat pernyataan bertanda tangan dan lanjutan tabel RAB sering berada di
   halaman semacam ini. Jangan pernah menyimpulkan sebuah unsur tidak ada semata-mata
   karena halamannya tidak punya lapisan teks.
6. Untuk rekam jejak publikasi: yang dinilai adalah APA YANG TERTULIS DI PROPOSAL. Daftar
   publikasi yang panjang tetapi tanpa keterangan indeksasi Sinta/Scopus BUKAN bukti pemenuhan
   syarat Sinta 2 / Scopus Q3. Anda tidak boleh mengasumsikan peringkat sebuah jurnal.
7. Untuk RAB: periksa total pagu terhadap Rp100.000.000,00, DAN periksa struktur perpajakannya —
   pemisahan Dasar Pengenaan Pajak (DPP), PPN 11% atas pengadaan barang/jasa, PPh 21 atas
   honorarium orang pribadi (peneliti, asisten, narasumber, proofreader), serta PPh 23 atas jasa
   pihak ketiga/badan. Total yang tepat tetapi struktur pajak yang absen adalah "Memenuhi Sebagian".
8. Isi "analisis" lebih dahulu sebagai penalaran, baru tetapkan "status". Status harus merupakan
   kesimpulan logis dari analisis, dan konsisten dengan ciri kondisi yang Anda kutip.
9. Tulis seluruh keluaran dalam Bahasa Indonesia baku, ringkas, dan faktual.
</aturan_penilaian>`;

/** Blok sistem yang stabil antar-permintaan → aman untuk prompt caching. */
function sistem(peta: PetaHeuristik, komponen: KomponenKAK[]): Anthropic.TextBlockParam[] {
  return [
    { type: "text", text: PERAN },
    { type: "text", text: blokAcuanKAK() },
    { type: "text", text: blokHeuristik(peta, komponen) },
    { type: "text", text: ATURAN, cache_control: { type: "ephemeral" } },
  ];
}

/* ------------------------------------------------------------------ *
 * Pemanggilan
 * ------------------------------------------------------------------ */

interface OpsiPanggil<T> {
  sistem: Anthropic.TextBlockParam[];
  teksDokumen: string;
  instruksi: string;
  skema: z.ZodType<T>;
  /** Berkas PDF di Files API, dilampirkan bila dokumen punya halaman pindaian. */
  fileId?: string | null;
}

async function panggil<T>({
  sistem,
  teksDokumen,
  instruksi,
  skema,
  fileId,
}: OpsiPanggil<T>): Promise<T> {
  const client = anthropic();

  const isi: Anthropic.ContentBlockParam[] = [];

  // PDF asli hanya dilampirkan bila ekstraksi teks menemukan halaman pindaian.
  // Untuk PDF yang seluruhnya berlapis teks, jalur teks jauh lebih murah dan cepat.
  if (fileId) {
    isi.push({
      type: "document",
      source: { type: "file", file_id: fileId },
      title: "Proposal penelitian (berkas asli)",
    });
  }

  isi.push({
    type: "text",
    text: `<dokumen_proposal>\n${teksDokumen}\n</dokumen_proposal>`,
    // Teks dokumen dipakai ulang oleh setiap segmen analisis pada berkas yang sama,
    // jadi di-cache agar panggilan kedua dan ketiga hanya membayar ~0,1x.
    cache_control: { type: "ephemeral" },
  });
  isi.push({ type: "text", text: instruksi });

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: isi }];

  const kirim = (model: string) =>
    client.messages.parse({
      model,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: zodOutputFormat(skema) },
      system: sistem,
      messages,
    });

  let res = await kirim(MODEL);

  // Classifier sesekali menolak permintaan (HTTP 200, stop_reason "refusal").
  // Coba sekali pada model sebelumnya sebelum menyerah.
  if (res.stop_reason === "refusal") {
    res = await kirim(MODEL_CADANGAN);
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
  return res.parsed_output;
}

/** Menilai satu kelompok komponen KAK terhadap satu dokumen. */
export async function analisisKomponen(
  segmen: "tema_tim" | "struktur",
  teksDokumen: string,
  peta: PetaHeuristik,
  fileId?: string | null,
): Promise<EvaluasiKomponen[]> {
  const komponen = komponenSegmen(segmen);
  const daftar = komponen
    .map((k, i) => `${i + 1}. [${k.id}] ${k.nama} (${k.poin}) — ${k.acuan}`)
    .join("\n");

  const judulSegmen =
    segmen === "tema_tim"
      ? "tema penelitian (poin 7), susunan tim (poin 8.1), dan persyaratan peserta serta tim (poin 8.2)"
      : "struktur proposal (poin 8.3)";

  const instruksi = `<tugas>
Nilai proposal di atas terhadap ${komponen.length} komponen berikut, yang mencakup ${judulSegmen}.
Kembalikan tepat ${komponen.length} entri pada array "evaluasi", satu untuk setiap komponen,
dalam urutan yang sama seperti daftar ini.

<daftar_komponen>
${daftar}
</daftar_komponen>

Telusuri seluruh dokumen termasuk lembar pengesahan, lampiran, daftar publikasi, tabel anggaran,
dan curriculum vitae sebelum menyimpulkan bahwa sebuah unsur tidak ada.
</tugas>`;

  const { evaluasi } = await panggil({
    sistem: sistem(peta, komponen),
    teksDokumen,
    instruksi,
    skema: skemaEvaluasi(komponen),
    fileId,
  });

  return rapikanEvaluasi(evaluasi, komponen);
}

/**
 * Menjamin 17 komponen selalu lengkap di Excel: entri yang hilang diisi
 * penanda eksplisit, entri ganda dibuang, urutan dikembalikan ke urutan KAK.
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
        analisis: "Model tidak mengembalikan penilaian untuk komponen ini. Perlu reviu manual.",
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

/** Mengekstrak tujuan dan ruang lingkup untuk lembar kedua berkas Excel. */
export async function analisisRuangLingkup(
  teksDokumen: string,
  peta: PetaHeuristik,
  fileId?: string | null,
): Promise<{ nama_tim: string; judul: string; ruang_lingkup: RuangLingkupItem[] }> {
  const daftar = RUANG_LINGKUP_FIELDS.map((f) => `- [${f.id}] ${f.nama}`).join("\n");

  const instruksi = `<tugas>
Ekstraksi identitas dan ruang lingkup penelitian dari proposal di atas.
Kembalikan satu entri untuk setiap unsur berikut, dalam urutan yang sama:

<daftar_unsur>
${daftar}
</daftar_unsur>

Panduan isi:
- tujuan_penelitian: pecah menjadi satu butir per tujuan, salin substansinya secara ringkas.
- objek_penelitian: apa yang menjadi objek/fenomena yang diteliti.
- periode_pengamatan: rentang waktu data atau observasi, sebut tahunnya bila ada.
- variabel_fokus: pecah per kelompok — variabel dependen, independen, kontrol/moderator.
- batasan_wilayah: cakupan wilayah, unit analisis, dan jumlah sampel bila disebut.
- metode_analisis: teknik analisis atau model yang digunakan.

Gunakan ["Tidak disebutkan dalam proposal"] bila sebuah unsur memang tidak ada.
</tugas>`;

  const hasil = await panggil({
    sistem: [
      { type: "text", text: PERAN },
      { type: "text", text: blokAcuanKAK(), cache_control: { type: "ephemeral" } },
    ],
    teksDokumen,
    instruksi,
    skema: SkemaRuangLingkup,
    fileId,
  });

  const byId = new Map(hasil.ruang_lingkup.map((r) => [r.field_id, r]));
  const ruang_lingkup: RuangLingkupItem[] = RUANG_LINGKUP_FIELDS.map((f) => ({
    field_id: f.id,
    field_nama: f.nama,
    nilai: byId.get(f.id)?.nilai ?? ["Tidak disebutkan dalam proposal"],
  }));

  return { nama_tim: hasil.nama_tim, judul: hasil.judul, ruang_lingkup };
}

export const TOTAL_KOMPONEN = KOMPONEN_KAK.length;
