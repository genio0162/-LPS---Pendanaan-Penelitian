"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ParticleStage, { type KontrolPanggung } from "@/components/ParticleStage";
import { TombolTema, useTema } from "@/components/tema";
import { KOMPONEN_KAK, TAHAP_AKHIR, TAHAP_BERKAS } from "@/lib/kak";

const MAKS_BERKAS = 5;
const MAKS_MB = 25;

interface BerkasTerpilih {
  file: File;
  nama: string;
  ukuran: string;
}

interface Proses {
  indeksBerkas: number;
  indeksTahap: number;
  namaBerkas: string;
  pct: number;
  komponenSelesai: number;
  final: boolean;
}

interface Selesai {
  batchId: string;
  namaBerkas: string;
  jumlah: number;
  skor: number | null;
  blobUrl: string;
}

type Fase = "unggah" | "proses" | "selesai";

const TUTORIAL = [
  "Unggah sampai 5 proposal PDF",
  "Teks dan tabel dokumen diekstraksi",
  "19 kriteria screening KAK dinilai",
  "Unduh satu berkas Excel",
];

export default function Beranda() {
  const { tema } = useTema();
  const panggung = useRef<KontrolPanggung | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const batalRef = useRef<AbortController | null>(null);

  const [berkas, setBerkas] = useState<BerkasTerpilih[]>([]);
  const [fase, setFase] = useState<Fase>("unggah");
  const [proses, setProses] = useState<Proses | null>(null);
  const [hasil, setHasil] = useState<Selesai | null>(null);
  const [hover, setHover] = useState(false);
  const [riak, setRiak] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const riakTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pesan = useCallback((t: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  const percik = useCallback(() => {
    panggung.current?.splash(0.5, 0.62);
    if (riakTimer.current) clearTimeout(riakTimer.current);
    setRiak(true);
    riakTimer.current = setTimeout(() => setRiak(false), 950);
  }, []);

  const tambah = useCallback(
    (list: File[]) => {
      const pdf = list.filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
      if (!pdf.length) {
        pesan("Hanya berkas PDF yang diterima.");
        return;
      }
      const terlaluBesar = pdf.filter((f) => f.size > MAKS_MB * 1024 * 1024);
      const muat = pdf.filter((f) => f.size <= MAKS_MB * 1024 * 1024);
      if (terlaluBesar.length) pesan(`${terlaluBesar.length} berkas melebihi ${MAKS_MB} MB dan dilewati.`);

      setBerkas((s) => {
        const sisa = MAKS_BERKAS - s.length;
        if (sisa <= 0) {
          pesan(`Batas ${MAKS_BERKAS} PDF sudah tercapai.`);
          return s;
        }
        const masuk = muat.slice(0, sisa).map((f) => ({
          file: f,
          nama: f.name,
          ukuran: `${(f.size / 1048576).toFixed(1).replace(".", ",")} MB`,
        }));
        if (muat.length > sisa) pesan(`Hanya ${sisa} berkas ditambahkan.`);
        if (masuk.length) percik();
        return s.concat(masuk);
      });
      setHover(false);
    },
    [pesan, percik],
  );

  /* ---------------- Orkestrasi analisis ---------------- */

  const mulai = useCallback(async () => {
    if (!berkas.length) return;

    const ac = new AbortController();
    batalRef.current = ac;
    const batchId = crypto.randomUUID().slice(0, 8);
    let selesaiKomponen = 0;

    setFase("proses");
    setProses({
      indeksBerkas: 0,
      indeksTahap: 0,
      namaBerkas: berkas[0].nama,
      pct: 4,
      komponenSelesai: 0,
      final: false,
    });

    const maju = (indeksBerkas: number, indeksTahap: number, namaBerkas: string) => {
      const totalLangkah = berkas.length * TAHAP_BERKAS.length + 1;
      const langkahKe = indeksBerkas * TAHAP_BERKAS.length + indeksTahap;
      setProses({
        indeksBerkas,
        indeksTahap,
        namaBerkas,
        pct: Math.min(99, Math.round((langkahKe / totalLangkah) * 100) + 3),
        komponenSelesai: selesaiKomponen,
        final: false,
      });
    };

    try {
      for (const [i, b] of berkas.entries()) {
        maju(i, 0, b.nama);

        const fd = new FormData();
        fd.append("file", b.file);
        fd.append("batchId", batchId);

        const rExtract = await fetch("/api/extract", {
          method: "POST",
          body: fd,
          signal: ac.signal,
        });
        const dExtract = await rExtract.json();
        if (!rExtract.ok) throw new Error(dExtract.error ?? `Gagal memproses ${b.nama}.`);

        const segmen = ["kriteria", "ruang_lingkup"] as const;
        for (const [j, s] of segmen.entries()) {
          maju(i, j + 1, b.nama);
          const r = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ docId: dExtract.docId, segmen: s }),
            signal: ac.signal,
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error ?? `Analisis ${s} gagal untuk ${b.nama}.`);
          if (typeof d.jumlah === "number" && s !== "ruang_lingkup") {
            selesaiKomponen = Math.min(KOMPONEN_KAK.length, selesaiKomponen + d.jumlah);
          }
        }
      }

      setProses((p) =>
        p ? { ...p, indeksTahap: TAHAP_BERKAS.length, pct: 99, final: true, komponenSelesai: KOMPONEN_KAK.length } : p,
      );

      const rExport = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId }),
        signal: ac.signal,
      });
      if (!rExport.ok) {
        const d = await rExport.json().catch(() => ({}));
        throw new Error(d.error ?? "Gagal menyusun berkas Excel.");
      }

      const skorHeader = rExport.headers.get("X-Skor-Batch");
      const disposisi = rExport.headers.get("Content-Disposition") ?? "";
      const cocok = /filename="([^"]+)"/.exec(disposisi);
      const blob = await rExport.blob();

      setHasil({
        batchId,
        namaBerkas: cocok?.[1] ?? `Hasil_Evaluasi_Proposal_${batchId}.xlsx`,
        jumlah: berkas.length,
        skor: skorHeader ? Number(skorHeader) : null,
        blobUrl: URL.createObjectURL(blob),
      });
      setFase("selesai");
      setProses(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setFase("unggah");
        setProses(null);
        pesan("Analisis dibatalkan.");
        return;
      }
      setFase("unggah");
      setProses(null);
      pesan(e instanceof Error ? e.message : "Terjadi kesalahan saat analisis.");
    } finally {
      batalRef.current = null;
    }
  }, [berkas, pesan]);

  const unduh = useCallback(() => {
    if (!hasil) return;
    const a = document.createElement("a");
    a.href = hasil.blobUrl;
    a.download = hasil.namaBerkas;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [hasil]);

  const ulang = useCallback(() => {
    if (hasil) URL.revokeObjectURL(hasil.blobUrl);
    setHasil(null);
    setBerkas([]);
    setFase("unggah");
  }, [hasil]);

  const tahapLabel = proses?.final
    ? TAHAP_AKHIR
    : (TAHAP_BERKAS[proses?.indeksTahap ?? 0] ?? TAHAP_BERKAS[0]);

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <div className="awan" />

      <header className="relative z-[3] flex flex-wrap items-center justify-between gap-5 px-6 py-[22px] sm:px-[34px]">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/lps-mark.png" alt="Lembaga Penjamin Simpanan" className="block h-[30px] w-auto" />
          <span
            className="ml-1 font-[family-name:var(--font-mono)] text-[10px] uppercase leading-[1.5] tracking-[0.14em]"
            style={{ color: "var(--mute2)" }}
          >
            LPS — Pendanaan Penelitian
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <TombolTema />
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-full border px-[18px] py-[9px] text-[12.5px] font-medium transition-colors"
            style={{ borderColor: "var(--line)", background: "var(--panel)", color: "var(--fg3)" }}
          >
            Panel admin
          </Link>
        </div>
      </header>

      <main className="relative z-[2] mx-auto grid max-w-[880px] justify-items-center gap-[30px] px-6 pb-[90px] pt-10 sm:pt-14">
        <div className="rise-in grid max-w-[720px] justify-items-center gap-[22px] text-center">
          <ParticleStage
            tema={tema}
            busy={fase === "proses"}
            kontrolRef={panggung}
            className="relative h-[140px] w-[140px] sm:h-[172px] sm:w-[172px]"
          />
          <h1 className="m-0 text-pretty font-[family-name:var(--font-display)] text-[34px] font-semibold leading-[1.06] tracking-[-0.032em] sm:text-[54px]">
            Unggah proposal, terima berkas validasinya.
          </h1>
        </div>

        <AnimatePresence mode="wait">
          {fase !== "selesai" ? (
            <motion.div
              key="zona"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35 }}
              className="grid w-full min-w-0 max-w-[480px] grid-cols-[minmax(0,1fr)] gap-4"
            >
              <div
                role="button"
                tabIndex={0}
                aria-label="Pilih berkas PDF proposal"
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    inputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setHover(true);
                }}
                onDragLeave={() => setHover(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  tambah(Array.from(e.dataTransfer.files));
                }}
                className="relative cursor-pointer overflow-hidden rounded-[26px] border px-7 py-[34px] text-center backdrop-blur-[16px] transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  background: hover ? "var(--panel2)" : "var(--panel)",
                  borderColor: hover ? "var(--accent)" : "var(--line)",
                  boxShadow: "0 26px 70px -32px rgb(0 0 0 / 0.9), inset 0 1px 0 var(--panel2)",
                }}
              >
                {riak && (
                  <span
                    className="pointer-events-none absolute left-1/2 top-1/2 -ml-[160px] -mt-[160px] h-[320px] w-[320px] rounded-full border"
                    style={{ borderColor: "rgb(63 208 230 / 0.5)", animation: "ripple .95s ease-out both" }}
                  />
                )}
                <div className="relative grid justify-items-center gap-3.5">
                  <div
                    className="grid h-[76px] w-[76px] place-items-center rounded-[22px] border"
                    style={{ background: "var(--panel)", borderColor: "var(--line)" }}
                  >
                    <svg width="38" height="46" viewBox="0 0 38 46" fill="none" aria-label="PDF">
                      <path
                        d="M5 1.5h17l11 11V40.5a4 4 0 0 1-4 4H5a4 4 0 0 1-4-4V5.5a4 4 0 0 1 4-4Z"
                        stroke="var(--fg3)"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      />
                      <path d="M22 1.5v11h11" stroke="var(--fg3)" strokeWidth="1.5" strokeLinejoin="round" />
                      <text
                        x="17"
                        y="33"
                        textAnchor="middle"
                        fontFamily="ui-monospace, monospace"
                        fontSize="9.5"
                        fontWeight="600"
                        letterSpacing="1.2"
                        fill="var(--accent)"
                      >
                        PDF
                      </text>
                    </svg>
                  </div>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept="application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    tambah(Array.from(e.target.files ?? []));
                    e.target.value = "";
                  }}
                />
              </div>

              <div className="text-center text-[12px] tracking-[0.01em]" style={{ color: "var(--mute3)" }}>
                Tarik atau klik untuk memilih · maksimal {MAKS_BERKAS} PDF · {MAKS_MB} MB per berkas
              </div>

              <AnimatePresence initial={false}>
                {berkas.map((f, i) => (
                  <motion.div
                    key={`${f.nama}-${i}`}
                    layout
                    initial={{ opacity: 0, y: -10, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.32, ease: [0.2, 0.9, 0.3, 1.2] }}
                    className="flex min-w-0 items-center gap-3.5 rounded-[18px] border px-[18px] py-[13px]"
                    style={{ background: "var(--panel)", borderColor: "var(--line)" }}
                  >
                    <span
                      className="font-[family-name:var(--font-mono)] text-[10.5px]"
                      style={{ color: "var(--accent)" }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px]">{f.nama}</span>
                    <span
                      className="shrink-0 whitespace-nowrap font-[family-name:var(--font-mono)] text-[10.5px]"
                      style={{ color: "var(--mute2)" }}
                    >
                      {f.ukuran}
                    </span>
                    <button
                      type="button"
                      aria-label={`Hapus ${f.nama}`}
                      onClick={() => setBerkas((s) => s.filter((_, k) => k !== i))}
                      className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full text-[13px] leading-none transition-colors hover:text-[var(--danger)]"
                      style={{ background: "var(--panel2)", color: "var(--mute)" }}
                    >
                      ×
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>

              {berkas.length > 0 && (
                <motion.button
                  type="button"
                  layout
                  onClick={mulai}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  className="justify-self-center rounded-full border-0 px-10 py-4 text-[14.5px] font-semibold"
                  style={{
                    color: "var(--btn-fg)",
                    background: "linear-gradient(120deg, #FFD873, #FFC629 55%, #E8A33D)",
                    boxShadow: "0 16px 40px -18px rgb(255 198 41 / 0.8)",
                  }}
                >
                  Analisis {berkas.length} proposal
                </motion.button>
              )}
            </motion.div>
          ) : (
            hasil && (
              <motion.div
                key="selesai"
                initial={{ opacity: 0, y: 14, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="grid w-full max-w-[560px] justify-items-center gap-[18px] rounded-[30px] border px-[34px] py-10 text-center backdrop-blur-[16px]"
                style={{
                  background: "var(--panel)",
                  borderColor: "var(--line)",
                  boxShadow: "0 26px 70px -32px rgb(0 0 0 / 0.9)",
                }}
              >
                <div
                  className="grid h-[52px] w-[52px] place-items-center rounded-full border text-[20px]"
                  style={{
                    background: "rgb(63 208 230 / 0.14)",
                    borderColor: "rgb(63 208 230 / 0.45)",
                    color: "#8DE6F5",
                  }}
                >
                  ✓
                </div>
                <div className="break-words font-[family-name:var(--font-display)] text-[22px] font-medium tracking-[-0.02em] sm:text-[26px]">
                  {hasil.namaBerkas}
                </div>
                <div
                  className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.04em]"
                  style={{ color: "var(--mute2)" }}
                >
                  {hasil.jumlah} proposal · {KOMPONEN_KAK.length} kriteria KAK
                  {hasil.skor !== null ? ` · skor ${hasil.skor}%` : ""}
                </div>
                <motion.button
                  type="button"
                  onClick={unduh}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  className="rounded-full border-0 px-[38px] py-[15px] text-[14.5px] font-semibold"
                  style={{
                    color: "var(--btn-fg)",
                    background: "linear-gradient(120deg, #FFD873, #FFC629 55%, #E8A33D)",
                    boxShadow: "0 16px 40px -18px rgb(255 198 41 / 0.8)",
                  }}
                >
                  Unduh
                </motion.button>
                <button
                  type="button"
                  onClick={ulang}
                  className="border-0 bg-transparent text-[12.5px] transition-colors hover:text-[var(--fg3)]"
                  style={{ color: "var(--mute2)" }}
                >
                  Unggah proposal lain
                </button>
              </motion.div>
            )
          )}
        </AnimatePresence>

        <div className="flex max-w-[760px] flex-wrap items-start justify-center gap-x-[30px] gap-y-4 pt-1.5">
          {TUTORIAL.map((t, i) => (
            <div key={t} className="flex max-w-[160px] items-baseline gap-2.5">
              <span
                className="font-[family-name:var(--font-mono)] text-[10.5px]"
                style={{ color: "var(--accent)" }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-[12.5px] leading-[1.5]" style={{ color: "var(--mute2)" }}>
                {t}
              </span>
            </div>
          ))}
        </div>
      </main>

      {/* ---------------- Modal pemrosesan ---------------- */}
      <AnimatePresence>
        {fase === "proses" && proses && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 grid place-items-center p-6 backdrop-blur-[6px]"
            style={{ background: "var(--overlay)" }}
            role="dialog"
            aria-live="polite"
            aria-label="Pemrosesan proposal"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.34 }}
              className="grid w-full max-w-[520px] gap-[22px] rounded-[30px] border px-8 pb-[30px] pt-[34px]"
              style={{
                background: "var(--modal)",
                borderColor: "var(--line)",
                boxShadow: "0 30px 90px -30px rgb(0 0 0 / 0.95)",
              }}
            >
              <div className="grid gap-[7px] text-center">
                <div
                  className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.2em]"
                  style={{ color: "var(--accent)" }}
                >
                  Pemrosesan · berkas {Math.min(proses.indeksBerkas + 1, berkas.length)} dari {berkas.length}
                </div>
                <div className="font-[family-name:var(--font-display)] text-[21px] font-medium tracking-[-0.02em] sm:text-[25px]">
                  {tahapLabel}
                </div>
                <div
                  className="truncate font-[family-name:var(--font-mono)] text-[11px]"
                  style={{ color: "var(--mute2)" }}
                >
                  {proses.namaBerkas}
                </div>
              </div>

              <div className="relative">
                <div
                  className="holo absolute -inset-y-2 -inset-x-0.5 rounded-full opacity-[0.55] blur-[14px]"
                  style={{ width: `${proses.pct}%` }}
                />
                <div
                  className="relative h-2.5 overflow-hidden rounded-full"
                  style={{ background: "var(--panel2)" }}
                >
                  <div
                    className="holo h-full rounded-full transition-[width] duration-300 ease-linear"
                    style={{ width: `${proses.pct}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-[5px]">
                {KOMPONEN_KAK.map((k, i) => {
                  const nyala = i < proses.komponenSelesai;
                  return (
                    <span
                      key={k.id}
                      title={`${k.poin} · ${k.nama}`}
                      className="h-[7px] w-[7px] rounded-full transition-colors duration-300"
                      style={{
                        background: nyala ? "var(--accent)" : "var(--line2)",
                        animation: i === proses.komponenSelesai ? "breathe 1.4s ease-in-out infinite" : undefined,
                      }}
                    />
                  );
                })}
              </div>

              <div
                className="flex items-center justify-between gap-3.5 font-[family-name:var(--font-mono)] text-[11px]"
                style={{ color: "var(--mute2)" }}
              >
                <span>{proses.pct}%</span>
                <button
                  type="button"
                  onClick={() => batalRef.current?.abort()}
                  className="rounded-full border bg-transparent px-4 py-2 text-[11.5px] transition-colors hover:text-[var(--danger)]"
                  style={{ borderColor: "var(--line)", color: "var(--mute)" }}
                >
                  Batalkan
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- Toast ---------------- */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            role="status"
            className="fixed bottom-[30px] left-1/2 z-[60] max-w-[90vw] -translate-x-1/2 rounded-full border px-[22px] py-3 text-center text-[12.5px]"
            style={{ background: "var(--modal)", borderColor: "var(--line)", color: "var(--fg3)" }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
