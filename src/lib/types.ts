import type { KodeStatus, StatusValidasi } from "./kak";

/** Satu baris pengetahuan yang disuntikkan admin pada satu komponen + satu status. */
export interface BarisHeuristik {
  id: number;
  komponen_id: string;
  status: KodeStatus;
  teks: string;
  urutan: number;
}

/** Peta heuristik yang dipakai saat merakit prompt: komponen -> status -> daftar teks. */
export type PetaHeuristik = Record<string, Partial<Record<KodeStatus, string[]>>>;

/** Hasil evaluasi satu komponen KAK. */
export interface EvaluasiKomponen {
  komponen_id: string;
  komponen_nama: string;
  poin_kak: string;
  /** Ringkas — masuk ke kolom "Hasil Evaluasi" pada Excel. */
  ringkasan_temuan: string;
  /** Contoh: "Hal 13-16" atau "Seluruh dokumen". */
  halaman: string;
  /** Kutipan/parafrase bukti dari dokumen. */
  kutipan: string;
  /** Penalaran yang merujuk heuristik admin — ditulis sebelum status ditetapkan. */
  analisis: string;
  /** Baris heuristik admin yang dinilai cocok (teks persis), boleh kosong. */
  heuristik_terpakai: string[];
  status: StatusValidasi;
}

export interface RuangLingkupItem {
  field_id: string;
  field_nama: string;
  nilai: string[];
}

export interface HasilProposal {
  doc_id: string;
  nama_berkas: string;
  nama_tim: string;
  judul: string;
  jumlah_halaman: number;
  evaluasi: EvaluasiKomponen[];
  ruang_lingkup: RuangLingkupItem[];
}

export interface RingkasanBatch {
  id: string;
  dibuat: string;
  jumlah_berkas: number;
  skor: number;
  status: string;
  institusi: string;
}
