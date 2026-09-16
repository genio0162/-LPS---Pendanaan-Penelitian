/**
 * Verifikasi silang: menjalankan pipeline penuh (PDF → unpdf → Claude → Excel)
 * di luar server, lalu membandingkan putusan AI dengan lembar cross-check manual.
 *
 * Pemakaian:
 *   npm run verifikasi -- "/path/Proposal.pdf" [kunci-acuan] [keluaran.xlsx]
 *
 * `kunci-acuan` adalah salah satu kunci pada ACUAN_MANUAL di bawah (riyanto,
 * rulindo, wulandari). Bila dikosongkan, skrip hanya mencetak hasil AI tanpa
 * perbandingan.
 *
 * Skrip ini tidak menyentuh basis data — ia memakai SEED_HEURISTIK sebagai
 * pengetahuan admin, sehingga bisa dijalankan sebelum Neon tersambung.
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";

// .env.local lebih dulu (kebiasaan Next.js), lalu .env sebagai cadangan.
config({ path: ".env.local", quiet: true });
config({ quiet: true });

import { basename } from "node:path";
import { toFile } from "@anthropic-ai/sdk";
import { analisisKomponen, analisisRuangLingkup, anthropic, MODEL } from "../src/lib/claude";
import { bangunExcel } from "../src/lib/excel";
import { SEED_HEURISTIK } from "../src/lib/kak";
import { ekstrakPdf, tebakNamaTim } from "../src/lib/pdf";
import type { PetaHeuristik } from "../src/lib/types";

/** Putusan peninjau manusia pada lembar "Cross Check_Evaluasi FEB UI_GPS.xlsx". */
const ACUAN_MANUAL: Record<string, Record<string, string>> = {
  riyanto: {
    penentuan_tema: "Memenuhi",
    susunan_tim: "Memenuhi",
    tim_kolaboratif: "Memenuhi",
    gelar_doktor: "Memenuhi",
    jabatan_lektor: "Memenuhi",
    rekam_jejak_publikasi: "Memenuhi Sebagian",
    anggota_civitas: "Memenuhi",
    etika_non_double_funding: "Tidak Memenuhi",
    ringkasan_eksekutif: "Memenuhi",
    latar_belakang: "Memenuhi",
    tujuan_pertanyaan: "Memenuhi",
    tinjauan_pustaka: "Memenuhi",
    metodologi: "Memenuhi",
    rencana_kerja: "Memenuhi Sebagian",
    rencana_luaran: "Memenuhi",
    rab: "Memenuhi Sebagian",
    profil_tim: "Memenuhi",
  },
  rulindo: {
    penentuan_tema: "Memenuhi",
    susunan_tim: "Memenuhi",
    tim_kolaboratif: "Memenuhi",
    gelar_doktor: "Memenuhi",
    jabatan_lektor: "Memenuhi",
    rekam_jejak_publikasi: "Memenuhi Sebagian",
    anggota_civitas: "Memenuhi",
    etika_non_double_funding: "Tidak Memenuhi",
    ringkasan_eksekutif: "Memenuhi",
    latar_belakang: "Memenuhi",
    tujuan_pertanyaan: "Memenuhi",
    tinjauan_pustaka: "Memenuhi Sebagian",
    metodologi: "Memenuhi",
    rencana_kerja: "Memenuhi Sebagian",
    rencana_luaran: "Memenuhi",
    rab: "Memenuhi Sebagian",
    profil_tim: "Memenuhi",
  },
  wulandari: {
    penentuan_tema: "Memenuhi",
    susunan_tim: "Memenuhi",
    tim_kolaboratif: "Memenuhi",
    gelar_doktor: "Memenuhi",
    jabatan_lektor: "Memenuhi",
    rekam_jejak_publikasi: "Memenuhi",
    anggota_civitas: "Memenuhi",
    etika_non_double_funding: "Tidak Memenuhi",
    ringkasan_eksekutif: "Memenuhi",
    latar_belakang: "Memenuhi",
    tujuan_pertanyaan: "Memenuhi Sebagian",
    tinjauan_pustaka: "Memenuhi Sebagian",
    metodologi: "Memenuhi",
    rencana_kerja: "Memenuhi Sebagian",
    rencana_luaran: "Memenuhi Sebagian",
    rab: "Memenuhi Sebagian",
    profil_tim: "Memenuhi",
  },
};

const detik = (t: number) => `${((Date.now() - t) / 1000).toFixed(1)}s`;

async function main() {
  const berkas = process.argv[2];
  const kunciAcuan = (process.argv[3] ?? "").toLowerCase();
  const keluaran = process.argv[4] ?? "verifikasi.xlsx";

  if (!berkas) {
    console.error('Pemakaian: npm run verifikasi -- "/path/Proposal.pdf" [riyanto|rulindo|wulandari] [keluaran.xlsx]');
    process.exit(1);
  }

  const peta = SEED_HEURISTIK as PetaHeuristik;
  console.log(`Model: ${MODEL}\n`);

  console.log("1) Ekstraksi PDF …");
  let t = Date.now();
  const buf = readFileSync(berkas);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const { teks, jumlahHalaman, halamanKosong, perluPdfAsli } = await ekstrakPdf(ab);
  console.log(`   ${jumlahHalaman} halaman · ${teks.length.toLocaleString("id-ID")} karakter · ${detik(t)}`);

  // Halaman pindaian tidak punya lapisan teks; lampirkan PDF asli agar terbaca.
  let fileId: string | null = null;
  if (perluPdfAsli) {
    console.log(`   halaman tanpa lapisan teks: ${halamanKosong.join(", ")} → melampirkan PDF asli`);
    t = Date.now();
    const unggah = await anthropic().files.upload({
      file: await toFile(new Blob([ab], { type: "application/pdf" }), basename(berkas), {
        type: "application/pdf",
      }),
      expires_in_seconds: 3600,
    });
    fileId = unggah.id;
    console.log(`   file_id ${fileId} · ${detik(t)}`);
  }

  console.log("2) Menilai tema dan tim peneliti (poin 7 – 8.2) …");
  t = Date.now();
  const temaTim = await analisisKomponen("tema_tim", teks, peta, fileId);
  console.log(`   ${temaTim.length} komponen · ${detik(t)}`);

  console.log("3) Menilai struktur proposal (poin 8.3) …");
  t = Date.now();
  const struktur = await analisisKomponen("struktur", teks, peta, fileId);
  console.log(`   ${struktur.length} komponen · ${detik(t)}`);

  console.log("4) Mengekstraksi tujuan dan ruang lingkup …");
  t = Date.now();
  const rl = await analisisRuangLingkup(teks, peta, fileId);
  console.log(`   ${rl.ruang_lingkup.length} unsur · ${detik(t)}`);
  console.log(`   nama tim : ${rl.nama_tim}`);
  console.log(`   judul    : ${rl.judul}`);

  const evaluasi = [...temaTim, ...struktur];
  const acuan = ACUAN_MANUAL[kunciAcuan];

  if (acuan) {
    console.log("\n===== PERBANDINGAN DENGAN CROSS-CHECK MANUAL =====");
    let cocok = 0;
    for (const e of evaluasi) {
      const m = acuan[e.komponen_id];
      const sama = m === e.status;
      if (sama) cocok++;
      console.log(
        `${sama ? " OK " : " XX "} ${e.komponen_nama.padEnd(36)} AI: ${e.status.padEnd(18)} Manual: ${(m ?? "-").padEnd(18)} ${e.halaman}`,
      );
      if (!sama) console.log(`      alasan AI: ${e.analisis}`);
    }
    console.log(`\n Kecocokan: ${cocok}/${evaluasi.length} (${Math.round((cocok / evaluasi.length) * 100)}%)`);
  } else {
    console.log("\n===== HASIL AI =====");
    for (const e of evaluasi) {
      console.log(` ${e.komponen_nama.padEnd(36)} ${e.status.padEnd(18)} ${e.halaman}`);
    }
  }

  console.log("\n===== DETAIL KOMPONEN KRITIS =====");
  for (const id of ["rekam_jejak_publikasi", "etika_non_double_funding", "rab"]) {
    const e = evaluasi.find((x) => x.komponen_id === id);
    if (!e) continue;
    console.log(`\n[${e.poin_kak}] ${e.komponen_nama} → ${e.status} (${e.halaman})`);
    console.log(`  ringkasan : ${e.ringkasan_temuan}`);
    console.log(`  analisis  : ${e.analisis}`);
    console.log(`  heuristik : ${e.heuristik_terpakai.join(" | ") || "(tidak ada yang cocok)"}`);
  }

  console.log("\n5) Menyusun berkas Excel …");
  const xlsx = await bangunExcel({
    batchId: "VERIFIKASI",
    proposal: [
      {
        doc_id: "verifikasi",
        nama_berkas: basename(berkas),
        nama_tim: rl.nama_tim || tebakNamaTim(basename(berkas)),
        judul: rl.judul,
        jumlah_halaman: jumlahHalaman,
        evaluasi,
        ruang_lingkup: rl.ruang_lingkup,
      },
    ],
  });
  writeFileSync(keluaran, xlsx);
  console.log(`   ${keluaran} · ${(xlsx.byteLength / 1024).toFixed(1)} KB`);
}

main().catch((e) => {
  console.error("GAGAL:", e);
  process.exit(1);
});
