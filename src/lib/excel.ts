import ExcelJS from "exceljs";
import { PAGU_PENDANAAN, REKOMENDASI, type StatusValidasi } from "./kak";
import type { HasilProposal } from "./types";

/* Palet dokumen kenegaraan: navy untuk kepala tabel, emas untuk aksen. */
const NAVY = "FF10284B";
const NAVY_MUDA = "FF1C3F6E";
const EMAS = "FFFFC629";
const GARIS = "FFBFC7D2";

const ISI_STATUS: Record<StatusValidasi, string> = {
  Memenuhi: "FFD4EDDA",
  "Memenuhi Sebagian": "FFFFF3CD",
  "Tidak Memenuhi": "FFF8D7DA",
};

const TEKS_STATUS: Record<StatusValidasi, string> = {
  Memenuhi: "FF17603A",
  "Memenuhi Sebagian": "FF7A5B00",
  "Tidak Memenuhi": "FF8C1D18",
};

const FONT = "Calibri";

function garisPenuh(warna = GARIS): Partial<ExcelJS.Borders> {
  const sisi: ExcelJS.Border = { style: "thin", color: { argb: warna } };
  return { top: sisi, left: sisi, bottom: sisi, right: sisi };
}

function isi(warna: string): ExcelJS.FillPattern {
  return { type: "pattern", pattern: "solid", fgColor: { argb: warna } };
}

function kepalaTabel(ws: ExcelJS.Worksheet, baris: number, tinggi = 30): void {
  const row = ws.getRow(baris);
  row.height = tinggi;
  row.eachCell((cell) => {
    cell.font = { name: FONT, bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    cell.fill = isi(NAVY);
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = garisPenuh(NAVY_MUDA);
  });
}

/** Judul dokumen di atas setiap lembar. */
function judulLembar(ws: ExcelJS.Worksheet, kolomTerakhir: string, judul: string, sub: string): void {
  ws.mergeCells(`A1:${kolomTerakhir}1`);
  const t = ws.getCell("A1");
  t.value = judul;
  t.font = { name: FONT, bold: true, size: 15, color: { argb: NAVY } };
  t.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 26;

  ws.mergeCells(`A2:${kolomTerakhir}2`);
  const s = ws.getCell("A2");
  s.value = sub;
  s.font = { name: FONT, size: 9.5, color: { argb: "FF5B6170" } };
  s.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(2).height = 18;

  ws.mergeCells(`A3:${kolomTerakhir}3`);
  ws.getCell("A3").fill = isi(EMAS);
  ws.getRow(3).height = 4;
}

export interface OpsiExcel {
  proposal: HasilProposal[];
  batchId: string;
}

export async function bangunExcel({ proposal, batchId }: OpsiExcel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Portal Pendanaan Penelitian LPS - FEB UI";
  wb.created = new Date();

  lembarRingkasan(wb, proposal, batchId);
  lembarValidasi(wb, proposal);
  lembarRuangLingkup(wb, proposal);

  // writeBuffer (bukan writeFile) — runtime serverless tidak punya disk yang persisten.
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/* ------------------------------------------------------------------ *
 * Lembar 1 — Ringkasan
 * ------------------------------------------------------------------ */

function lembarRingkasan(wb: ExcelJS.Workbook, proposal: HasilProposal[], batchId: string): void {
  const ws = wb.addWorksheet("Ringkasan", {
    views: [{ state: "frozen", ySplit: 6 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.columns = [
    { key: "no", width: 5 },
    { key: "tim", width: 26 },
    { key: "judul", width: 58 },
    { key: "berkas", width: 34 },
    { key: "m", width: 11 },
    { key: "s", width: 17 },
    { key: "t", width: 15 },
    { key: "skor", width: 10 },
  ];

  judulLembar(
    ws,
    "H",
    "Ringkasan Hasil Evaluasi Proposal",
    `Program Pendanaan Penelitian LPS - FEB UI · KAK-1/GRIS/2026 poin 7 s.d. 8.3 · ` +
      `Batch ${batchId} · Dihasilkan ${new Date().toLocaleString("id-ID")}`,
  );

  ws.getRow(5).values = [
    "No",
    "Nama Tim (Proposal)",
    "Judul Penelitian",
    "Berkas",
    "Memenuhi",
    "Memenuhi Sebagian",
    "Tidak Memenuhi",
    "Skor",
  ];
  kepalaTabel(ws, 5, 34);

  let r = 6;
  for (const [i, p] of proposal.entries()) {
    const m = p.evaluasi.filter((e) => e.status === "Memenuhi").length;
    const s = p.evaluasi.filter((e) => e.status === "Memenuhi Sebagian").length;
    const t = p.evaluasi.filter((e) => e.status === "Tidak Memenuhi").length;
    const total = p.evaluasi.length || 1;
    const skor = Math.round(((m + s * 0.5) / total) * 100);

    const row = ws.getRow(r);
    row.values = [i + 1, p.nama_tim, p.judul, p.nama_berkas, m, s, t, `${skor}%`];
    row.height = 30;
    row.eachCell((cell, col) => {
      cell.font = { name: FONT, size: 10.5 };
      cell.border = garisPenuh();
      cell.alignment = {
        vertical: "middle",
        wrapText: true,
        horizontal: col >= 5 ? "center" : "left",
      };
    });
    row.getCell(5).fill = isi(ISI_STATUS["Memenuhi"]);
    row.getCell(6).fill = isi(ISI_STATUS["Memenuhi Sebagian"]);
    row.getCell(7).fill = isi(ISI_STATUS["Tidak Memenuhi"]);
    row.getCell(8).font = { name: FONT, size: 11, bold: true, color: { argb: NAVY } };
    r++;
  }

  r += 1;
  ws.mergeCells(`A${r}:H${r}`);
  const nota = ws.getCell(`A${r}`);
  nota.value =
    `Skor = (jumlah "Memenuhi" + 0,5 × jumlah "Memenuhi Sebagian") ÷ ${proposal[0]?.evaluasi.length ?? 17} komponen. ` +
    `Pagu pendanaan per proposal: Rp${PAGU_PENDANAAN.toLocaleString("id-ID")},00. ` +
    `Hasil ini adalah bantuan penyaringan administratif dan tetap memerlukan validasi peninjau.`;
  nota.font = { name: FONT, size: 9, italic: true, color: { argb: "FF5B6170" } };
  nota.alignment = { wrapText: true, vertical: "top" };
  ws.getRow(r).height = 30;
}

/* ------------------------------------------------------------------ *
 * Lembar 2 — Validasi 17 komponen
 * ------------------------------------------------------------------ */

function lembarValidasi(wb: ExcelJS.Workbook, proposal: HasilProposal[]): void {
  const ws = wb.addWorksheet("Validasi vs Manual", {
    views: [{ state: "frozen", ySplit: 5 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.columns = [
    { key: "no", width: 5 },
    { key: "tim", width: 22 },
    { key: "poin", width: 10 },
    { key: "komponen", width: 30 },
    { key: "hasil", width: 30 },
    { key: "halaman", width: 16 },
    { key: "temuan", width: 60 },
    { key: "ciri", width: 46 },
    { key: "rekom", width: 40 },
    { key: "status", width: 19 },
  ];

  judulLembar(
    ws,
    "J",
    "Validasi Proposal terhadap KAK poin 7 - 8.3",
    "Kolom \"Ciri Kondisi Admin\" menunjukkan baris pengetahuan Fine-Tuner yang menjadi dasar putusan, sehingga setiap status dapat ditelusuri.",
  );

  ws.getRow(5).values = [
    "No",
    "Nama Tim (Proposal)",
    "Poin KAK",
    "Komponen yang Direviu",
    "Hasil Evaluasi",
    "Cek Dokumen Asli (Halaman)",
    "Temuan dan Analisis",
    "Ciri Kondisi Admin yang Terpakai",
    "Rekomendasi Perbaikan",
    "Status Validasi Akhir",
  ];
  kepalaTabel(ws, 5, 40);

  let r = 6;
  for (const [i, p] of proposal.entries()) {
    const mulai = r;

    for (const [j, e] of p.evaluasi.entries()) {
      const row = ws.getRow(r);
      const status = e.status;
      row.values = [
        j === 0 ? i + 1 : "",
        j === 0 ? p.nama_tim : "",
        e.poin_kak,
        e.komponen_nama,
        e.ringkasan_temuan,
        e.halaman,
        [e.analisis, e.kutipan && e.kutipan !== "-" ? `Bukti: "${e.kutipan}"` : ""]
          .filter(Boolean)
          .join("\n"),
        e.heuristik_terpakai.length ? e.heuristik_terpakai.map((h) => `• ${h}`).join("\n") : "—",
        status === "Memenuhi" ? "—" : (REKOMENDASI[e.komponen_id] ?? "Lengkapi unsur sesuai ketentuan KAK."),
        status,
      ];
      row.height = 46;
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.font = { name: FONT, size: 10 };
        cell.border = garisPenuh();
        cell.alignment = {
          vertical: "middle",
          wrapText: true,
          horizontal: col === 1 || col === 3 || col === 6 ? "center" : "left",
        };
      });

      // Sel status: latar bersyarat agar auditor bisa memindai satu kolom saja.
      const sel = row.getCell(10);
      sel.fill = isi(ISI_STATUS[status]);
      sel.font = { name: FONT, size: 10.5, bold: true, color: { argb: TEKS_STATUS[status] } };
      sel.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

      row.getCell(3).font = { name: FONT, size: 9.5, color: { argb: NAVY_MUDA } };
      row.getCell(4).font = { name: FONT, size: 10, bold: true };
      r++;
    }

    // Gabung kolom No + Nama Tim sepanjang blok proposal, seperti lembar manual.
    if (r - mulai > 1) {
      ws.mergeCells(`A${mulai}:A${r - 1}`);
      ws.mergeCells(`B${mulai}:B${r - 1}`);
      for (const c of ["A", "B"]) {
        const cell = ws.getCell(`${c}${mulai}`);
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.fill = isi("FFF3F6FB");
        cell.font = { name: FONT, size: 10.5, bold: c === "B", color: { argb: NAVY } };
      }
    }
  }

  ws.autoFilter = { from: "A5", to: `J${Math.max(5, r - 1)}` };
}

/* ------------------------------------------------------------------ *
 * Lembar 3 — Tujuan dan ruang lingkup
 * ------------------------------------------------------------------ */

function lembarRuangLingkup(wb: ExcelJS.Workbook, proposal: HasilProposal[]): void {
  const ws = wb.addWorksheet("Tujuan dan Ruang Lingkup", {
    views: [{ state: "frozen", ySplit: 5 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.columns = [
    { key: "no", width: 5 },
    { key: "tim", width: 24 },
    { key: "komponen", width: 26 },
    { key: "ket", width: 104 },
  ];

  judulLembar(
    ws,
    "D",
    "Tujuan dan Ruang Lingkup Penelitian",
    "Ekstraksi substansi tiap proposal sebagai pendamping lembar validasi administratif.",
  );

  ws.getRow(5).values = ["No", "Nama Tim (Proposal)", "Komponen yang Direviu", "Keterangan"];
  kepalaTabel(ws, 5, 30);

  let r = 6;
  for (const [i, p] of proposal.entries()) {
    const mulai = r;
    let pertama = true;

    for (const item of p.ruang_lingkup) {
      const nilai = item.nilai.length ? item.nilai : ["Tidak disebutkan dalam proposal"];
      for (const [k, v] of nilai.entries()) {
        const row = ws.getRow(r);
        row.values = [
          pertama ? i + 1 : "",
          pertama ? p.nama_tim : "",
          k === 0 ? item.field_nama : "",
          nilai.length > 1 ? `${k + 1}. ${v}` : v,
        ];
        row.height = 32;
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          cell.font = { name: FONT, size: 10 };
          cell.border = garisPenuh();
          cell.alignment = {
            vertical: "middle",
            wrapText: true,
            horizontal: col === 1 ? "center" : "left",
          };
        });
        if (k === 0) row.getCell(3).font = { name: FONT, size: 10, bold: true, color: { argb: NAVY } };
        pertama = false;
        r++;
      }
    }

    if (r - mulai > 1) {
      ws.mergeCells(`A${mulai}:A${r - 1}`);
      ws.mergeCells(`B${mulai}:B${r - 1}`);
      for (const c of ["A", "B"]) {
        const cell = ws.getCell(`${c}${mulai}`);
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.fill = isi("FFF3F6FB");
        cell.font = { name: FONT, size: 10.5, bold: c === "B", color: { argb: NAVY } };
      }
    }
  }
}

/** Nama berkas unduhan. */
export function namaBerkasExcel(batchId: string): string {
  const tgl = new Date().toISOString().slice(0, 10);
  return `Hasil_Evaluasi_Proposal_${tgl}_${batchId}.xlsx`;
}
