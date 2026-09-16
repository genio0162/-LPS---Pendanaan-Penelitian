import { extractText, getDocumentProxy } from "unpdf";

export interface HasilEkstraksi {
  /** Teks gabungan, tiap halaman diawali penanda `[[HALAMAN n]]`. */
  teks: string;
  jumlahHalaman: number;
  /** Dugaan judul proposal dari halaman pertama. */
  judul: string;
  /**
   * Halaman tanpa lapisan teks — hampir selalu hasil pindaian, misalnya surat
   * pernyataan bertanda tangan atau lanjutan tabel RAB.
   */
  halamanKosong: number[];
  /**
   * True bila ada halaman pindaian, sehingga PDF asli perlu ikut dikirim ke
   * model agar halaman tersebut terbaca sebagai gambar.
   */
  perluPdfAsli: boolean;
}

/** Batas aman agar satu dokumen tidak membanjiri jendela konteks. */
const MAKS_KARAKTER = 420_000;

/** Di bawah ini sebuah halaman dianggap tidak punya lapisan teks. */
const AMBANG_HALAMAN_KOSONG = 40;

/**
 * Mengekstrak teks PDF per halaman menggunakan unpdf (murni JavaScript,
 * tanpa binding native — syarat agar berjalan di runtime serverless Vercel).
 *
 * Penanda halaman sengaja ditanam ke dalam teks supaya model dapat menyebut
 * rujukan halaman ("Hal 13-16") pada kolom "Cek Dokumen Asli" di Excel.
 */
export async function ekstrakPdf(buffer: ArrayBuffer): Promise<HasilEkstraksi> {
  // pdf.js mengambil alih (detach) buffer yang diberikan kepadanya. Salin dulu,
  // supaya pemanggil masih bisa memakai buffer aslinya untuk mengunggah ke Blob
  // dan ke Files API setelah ekstraksi selesai.
  const salinan = new Uint8Array(buffer.byteLength);
  salinan.set(new Uint8Array(buffer));

  const pdf = await getDocumentProxy(salinan);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });

  const halaman = Array.isArray(text) ? text : [String(text)];
  const potongan: string[] = [];
  const halamanKosong: number[] = [];
  let panjang = 0;
  let terpotong = false;

  for (let i = 0; i < halaman.length; i++) {
    const isi = rapikan(halaman[i] ?? "");
    const nomor = i + 1;

    // Halaman pindaian tidak punya lapisan teks. Ditandai eksplisit supaya model
    // tahu bahwa kekosongan itu keterbatasan ekstraksi, bukan bukti unsur hilang.
    if (isi.length < AMBANG_HALAMAN_KOSONG) {
      halamanKosong.push(nomor);
      potongan.push(
        `\n[[HALAMAN ${nomor}]]\n[[TANPA LAPISAN TEKS — halaman ini hasil pindaian. ` +
          `Baca isinya dari berkas PDF yang dilampirkan; jangan simpulkan halaman ini kosong.]]`,
      );
      continue;
    }

    const blok = `\n[[HALAMAN ${nomor}]]\n${isi}`;
    if (panjang + blok.length > MAKS_KARAKTER) {
      terpotong = true;
      break;
    }
    potongan.push(blok);
    panjang += blok.length;
  }

  if (terpotong) {
    potongan.push(
      `\n[[CATATAN SISTEM]] Dokumen terlalu panjang; ekstraksi dihentikan pada halaman ${potongan.length} dari ${totalPages}.`,
    );
  }

  return {
    teks: potongan.join("\n").trim(),
    jumlahHalaman: totalPages,
    judul: tebakJudul(halaman[0] ?? ""),
    halamanKosong,
    perluPdfAsli: halamanKosong.length > 0,
  };
}

/** Merapikan spasi berlebih sambil mempertahankan batas baris tabel. */
function rapikan(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Mengambil baris terpanjang yang masuk akal dari halaman sampul sebagai judul.
 * Hanya dugaan awal — Claude tetap menetapkan judul final dari isi dokumen.
 */
function tebakJudul(halamanPertama: string): string {
  const baris = rapikan(halamanPertama)
    .split("\n")
    .map((b) => b.trim())
    .filter((b) => b.length >= 18 && b.length <= 240)
    .filter((b) => !/^(proposal|usulan|kerangka acuan)\s*$/i.test(b));

  if (!baris.length) return "";
  return baris.reduce((a, b) => (b.length > a.length ? b : a), "");
}

/** Menurunkan nama tim dari nama berkas, mengikuti pola berkas FEB UI 2026. */
export function tebakNamaTim(namaBerkas: string): string {
  const dasar = namaBerkas.replace(/\.pdf$/i, "");
  const bagian = dasar.split("_").map((s) => s.trim()).filter(Boolean);

  // Pola: "Proposal (Accepted)_FEB UI_2026_Umum_Riyanto_Fintech vs Bank"
  const iTema = bagian.findIndex((b) => /^(umum|khusus)$/i.test(b));
  if (iTema >= 0 && bagian[iTema + 1]) {
    const tema = /khusus/i.test(bagian[iTema]) ? "Tema Khusus" : "Tema Umum";
    return `${bagian[iTema + 1]} (${tema})`;
  }
  return bagian.length > 1 ? bagian[bagian.length - 2] : dasar;
}
