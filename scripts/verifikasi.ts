/**
 * Verifikasi silang: menjalankan pipeline penuh (PDF → unpdf → Claude → Excel)
 * di luar server, membandingkan putusan AI dengan lembar cross-check manual,
 * lalu melaporkan pemakaian token dan biaya nyata per proposal.
 *
 * Pemakaian:
 *   npm run verifikasi -- "/path/Proposal.pdf" [riyanto|rulindo|wulandari] [keluaran.xlsx]
 *
 * Model dan effort mengikuti CLAUDE_MODEL dan KAK_EFFORT, sehingga perbandingan
 * Opus/Sonnet atau medium/high dapat dijalankan tanpa menyentuh kode:
 *   CLAUDE_MODEL=claude-sonnet-5 KAK_EFFORT=medium npm run verifikasi -- ...
 *
 * Catatan: namanya KAK_EFFORT, bukan CLAUDE_EFFORT — nama yang terakhir itu
 * sudah dipakai sebagian lingkungan pengembangan dan akan menimpa nilai di sini.
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
import {
  analisisKomponen,
  analisisRuangLingkup,
  anthropic,
  jumlahkanPemakaian,
  EFFORT,
  MODEL,
  type LampiranPindaian,
} from "../src/lib/claude";
import { bangunExcel } from "../src/lib/excel";
import { KOMPONEN_KAK, SEED_HEURISTIK } from "../src/lib/kak";
import { ekstrakPdf, pdfHalamanTerpilih, tebakNamaTim } from "../src/lib/pdf";
import type { PetaHeuristik } from "../src/lib/types";

/**
 * Putusan peninjau manusia pada lembar "Cross Check_Evaluasi FEB UI_GPS.xlsx".
 *
 * Lembar itu memuat 17 baris, sedangkan lembar "Kriteria Screening" memuat 19.
 * Dua baris cross-check memang menggabungkan dua kriteria screening, jadi
 * putusannya diberlakukan untuk kedua kriteria turunannya:
 *   "Susunan Keanggotaan Tim"       → ketua_dan_anggota + jumlah_tim_maks4
 *   "Pernyataan Etika & Non-Double" → etika_penelitian  + non_double_funding
 */
const ACUAN_MANUAL: Record<string, Record<string, string>> = {
  riyanto: {
    penentuan_tema: "Memenuhi",
    ketua_dan_anggota: "Memenuhi",
    jumlah_tim_maks4: "Memenuhi",
    tim_kolaboratif: "Memenuhi",
    jabatan_lektor: "Memenuhi",
    gelar_doktor: "Memenuhi",
    rekam_jejak_publikasi: "Memenuhi Sebagian",
    anggota_civitas: "Memenuhi",
    etika_penelitian: "Tidak Memenuhi",
    non_double_funding: "Tidak Memenuhi",
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
    ketua_dan_anggota: "Memenuhi",
    jumlah_tim_maks4: "Memenuhi",
    tim_kolaboratif: "Memenuhi",
    jabatan_lektor: "Memenuhi",
    gelar_doktor: "Memenuhi",
    rekam_jejak_publikasi: "Memenuhi Sebagian",
    anggota_civitas: "Memenuhi",
    etika_penelitian: "Tidak Memenuhi",
    non_double_funding: "Tidak Memenuhi",
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
    ketua_dan_anggota: "Memenuhi",
    jumlah_tim_maks4: "Memenuhi",
    tim_kolaboratif: "Memenuhi",
    jabatan_lektor: "Memenuhi",
    gelar_doktor: "Memenuhi",
    rekam_jejak_publikasi: "Memenuhi",
    anggota_civitas: "Memenuhi",
    etika_penelitian: "Tidak Memenuhi",
    non_double_funding: "Tidak Memenuhi",
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
const rb = (n: number) => n.toLocaleString("id-ID");

async function main() {
  const berkas = process.argv[2];
  const kunciAcuan = (process.argv[3] ?? "").toLowerCase();
  const keluaran = process.argv[4] ?? "verifikasi.xlsx";

  if (!berkas) {
    console.error(
      'Pemakaian: npm run verifikasi -- "/path/Proposal.pdf" [riyanto|rulindo|wulandari] [keluaran.xlsx]',
    );
    process.exit(1);
  }

  const peta = SEED_HEURISTIK as PetaHeuristik;
  console.log(`Model: ${MODEL} · effort: ${EFFORT} · ${KOMPONEN_KAK.length} kriteria screening\n`);

  console.log("1) Ekstraksi PDF …");
  let t = Date.now();
  const buf = readFileSync(berkas);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const { teks, jumlahHalaman, halamanKosong, perluPdfAsli } = await ekstrakPdf(ab);
  console.log(
    `   ${jumlahHalaman} halaman · ${rb(teks.length)} karakter · ${detik(t)}`,
  );

  // Hanya halaman pindaian yang dilampirkan, bukan seluruh PDF.
  let lampiran: LampiranPindaian | null = null;
  if (perluPdfAsli) {
    t = Date.now();
    const potongan = await pdfHalamanTerpilih(ab, halamanKosong);
    if (potongan) {
      const unggah = await anthropic().files.upload({
        file: await toFile(
          new Blob([potongan as BlobPart], { type: "application/pdf" }),
          `pindaian-${basename(berkas)}`,
          { type: "application/pdf" },
        ),
        expires_in_seconds: 3600,
      });
      lampiran = { fileId: unggah.id, halaman: halamanKosong };
      console.log(
        `   halaman tanpa lapisan teks: ${halamanKosong.join(", ")} → lampiran ${halamanKosong.length} halaman ` +
          `(${(potongan.byteLength / 1024).toFixed(0)} KB) · ${detik(t)}`,
      );
    }
  }

  console.log(`2) Menilai ${KOMPONEN_KAK.length} kriteria screening …`);
  t = Date.now();
  const a = await analisisKomponen(teks, peta, lampiran);
  console.log(`   ${a.evaluasi.length} kriteria · ${detik(t)} · $${a.pemakaian.biayaUsd.toFixed(4)}`);

  console.log("3) Mengekstraksi tujuan dan ruang lingkup …");
  t = Date.now();
  const rl = await analisisRuangLingkup(teks, lampiran);
  console.log(`   ${rl.ruang_lingkup.length} unsur · ${detik(t)} · $${rl.pemakaian.biayaUsd.toFixed(4)}`);
  console.log(`   nama tim : ${rl.nama_tim}`);
  console.log(`   judul    : ${rl.judul}`);

  const evaluasi = a.evaluasi;
  const acuan = ACUAN_MANUAL[kunciAcuan];

  if (acuan) {
    console.log("\n===== PERBANDINGAN DENGAN CROSS-CHECK MANUAL =====");
    let cocok = 0;
    for (const e of evaluasi) {
      const m = acuan[e.komponen_id];
      const sama = m === e.status;
      if (sama) cocok++;
      console.log(
        `${sama ? " OK " : " XX "} ${e.komponen_nama.padEnd(34)} AI: ${e.status.padEnd(18)} Manual: ${(m ?? "-").padEnd(18)} ${e.halaman}`,
      );
      if (!sama) console.log(`      alasan AI: ${e.analisis}`);
    }
    console.log(
      `\n Kecocokan: ${cocok}/${evaluasi.length} (${Math.round((cocok / evaluasi.length) * 100)}%)`,
    );
  } else {
    console.log("\n===== HASIL AI =====");
    for (const e of evaluasi) {
      console.log(` ${e.komponen_nama.padEnd(34)} ${e.status.padEnd(18)} ${e.halaman}`);
    }
  }

  /* ---------------- Laporan biaya ---------------- */
  const total = jumlahkanPemakaian([a.pemakaian, rl.pemakaian]);
  console.log("\n===== PEMAKAIAN TOKEN DAN BIAYA =====");
  const baris = [
    ["19 kriteria", a.pemakaian],
    ["Ruang lingkup", rl.pemakaian],
  ] as const;
  console.log(
    `  ${"segmen".padEnd(16)}${"masuk".padStart(9)}${"tulis$".padStart(10)}${"baca$".padStart(10)}${"keluar".padStart(9)}${"think".padStart(8)}${"biaya".padStart(10)}`,
  );
  for (const [nama, u] of baris) {
    console.log(
      `  ${nama.padEnd(16)}${rb(u.masuk).padStart(9)}${rb(u.tulisCache).padStart(10)}${rb(u.bacaCache).padStart(10)}` +
        `${rb(u.keluar).padStart(9)}${rb(u.thinking).padStart(8)}${("$" + u.biayaUsd.toFixed(4)).padStart(10)}`,
    );
  }
  console.log(
    `  ${"TOTAL".padEnd(16)}${rb(total.masuk).padStart(9)}${rb(total.tulisCache).padStart(10)}${rb(total.bacaCache).padStart(10)}` +
      `${rb(total.keluar).padStart(9)}${rb(total.thinking).padStart(8)}${("$" + total.biayaUsd.toFixed(4)).padStart(10)}`,
  );

  const hematCache = total.bacaCache > 0 ? (total.bacaCache / (total.bacaCache + total.tulisCache)) * 100 : 0;
  console.log(`  cache terpakai: ${hematCache.toFixed(0)}% token masukan dibaca dari cache`);

  console.log("\n4) Menyusun berkas Excel …");
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
