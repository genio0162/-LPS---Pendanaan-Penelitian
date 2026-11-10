/**
 * Menyuntikkan pengetahuan bawaan ke basis data: seluruh isi tabel heuristik
 * diganti dengan SEED_HEURISTIK (src/lib/kak.ts, salinan dokumen "Kriteria KAK").
 *
 *   npm run suntik -- --ya
 *
 * Baris yang ditambahkan admin lewat panel ikut terhapus, jadi skrip menolak
 * berjalan tanpa --ya. Basis data yang dituju adalah DATABASE_URL pada
 * .env.local; host-nya dicetak di akhir supaya bisa diperiksa.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import { sql, suntikUlangHeuristik } from "../src/lib/db";
import { STATUS_DARI_KODE, type KodeStatus } from "../src/lib/kak";

async function main() {
  if (!process.argv.includes("--ya")) {
    console.error(
      "Skrip ini MENGGANTI seluruh pengetahuan admin di basis data.\n" +
        "Jalankan dengan konfirmasi: npm run suntik -- --ya",
    );
    process.exit(1);
  }

  await suntikUlangHeuristik();

  const hitungan = (await sql()`
    SELECT status, COUNT(*)::int AS jumlah
    FROM heuristik GROUP BY status ORDER BY status DESC`) as {
    status: KodeStatus;
    jumlah: number;
  }[];
  const total = hitungan.reduce((n, h) => n + h.jumlah, 0);

  for (const h of hitungan) {
    console.log(`  ${STATUS_DARI_KODE[h.status].padEnd(16)} ${h.jumlah} baris`);
  }
  const host = new URL(process.env.DATABASE_URL ?? "postgres://tidak-diketahui").host;
  console.log(`Pengetahuan bawaan tersuntik: ${total} baris → ${host}`);
}

main().catch((e) => {
  console.error("GAGAL:", e);
  process.exit(1);
});
