"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TombolTema } from "@/components/tema";
import { KOMPONEN_KAK, POIN_KAK, type KodeStatus } from "@/lib/kak";

interface Baris {
  id: number;
  komponen_id: string;
  status: KodeStatus;
  teks: string;
  urutan: number;
}

interface RiwayatBaris {
  id: string;
  institusi: string;
  jumlah_berkas: number;
  skor: number;
  status: string;
  tanggal: string;
  tim: string;
}

const BLOK: { kode: KodeStatus; label: string; deskripsi: string; warna: string; contoh: string }[] = [
  {
    kode: "M",
    label: "Memenuhi",
    deskripsi: "ciri kondisi yang memenuhi ketentuan",
    warna: "#3FBF7F",
    contoh: "mis. daftar publikasi mencantumkan indeksasi Scopus Q3 secara eksplisit",
  },
  {
    kode: "S",
    label: "Memenuhi Sebagian",
    deskripsi: "ciri kondisi yang hanya sebagian terpenuhi",
    warna: "#E8B43D",
    contoh: "mis. unsur ada namun tanpa keterangan indeksasi",
  },
  {
    kode: "T",
    label: "Tidak Memenuhi",
    deskripsi: "ciri kondisi yang menggugurkan komponen",
    warna: "#E06B62",
    contoh: "mis. dokumen tidak dilampirkan sama sekali",
  },
];

const KUNCI_SESI = "kak-admin-key";

export default function PanelAdmin() {
  const [tab, setTab] = useState<"finetuner" | "riwayat">("finetuner");
  const [buka, setBuka] = useState(true);
  const [baris, setBaris] = useState<Baris[]>([]);
  const [riwayat, setRiwayat] = useState<RiwayatBaris[]>([]);
  const [pilih, setPilih] = useState(KOMPONEN_KAK[6].id); // "Rekam jejak publikasi"
  const [draf, setDraf] = useState<Record<KodeStatus, string>>({ M: "", S: "", T: "" });
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [perluKunci, setPerluKunci] = useState(false);
  const [kunci, setKunci] = useState("");
  const [sibuk, setSibuk] = useState(false);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pesan = useCallback((t: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), 3600);
  }, []);

  useEffect(() => {
    try {
      const k = sessionStorage.getItem(KUNCI_SESI);
      if (k) setKunci(k);
    } catch {
      /* penyimpanan sesi diblokir — kunci cukup diketik ulang */
    }
  }, []);

  const muat = useCallback(async () => {
    setMemuat(true);
    setGalat(null);
    try {
      const r = await fetch("/api/heuristics");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Gagal memuat pengetahuan.");
      setBaris(d.baris);
      setPerluKunci(Boolean(d.perluKunci));
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal memuat pengetahuan.");
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  useEffect(() => {
    if (tab !== "riwayat") return;
    void (async () => {
      try {
        const r = await fetch("/api/batches");
        const d = await r.json();
        if (r.ok) setRiwayat(d.baris ?? []);
      } catch {
        /* riwayat bersifat informatif — kegagalan tidak memblokir panel */
      }
    })();
  }, [tab]);

  const headerKunci = useMemo(
    () => (kunci ? { "x-admin-key": kunci } : undefined),
    [kunci],
  );

  const tambah = useCallback(
    async (status: KodeStatus) => {
      const teks = draf[status].trim();
      if (teks.length < 8) {
        pesan("Tulis ciri kondisi yang lebih spesifik, minimal 8 karakter.");
        return;
      }
      setSibuk(true);
      try {
        const r = await fetch("/api/heuristics", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headerKunci },
          body: JSON.stringify({ komponenId: pilih, status, teks }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Gagal menyimpan.");
        setBaris((s) => s.concat(d.baris));
        setDraf((s) => ({ ...s, [status]: "" }));
        pesan("Baris pengetahuan ditambahkan.");
      } catch (e) {
        pesan(e instanceof Error ? e.message : "Gagal menyimpan.");
      } finally {
        setSibuk(false);
      }
    },
    [draf, headerKunci, pesan, pilih],
  );

  const hapus = useCallback(
    async (id: number) => {
      setBaris((s) => s.filter((b) => b.id !== id));
      try {
        const r = await fetch(`/api/heuristics?id=${id}`, { method: "DELETE", headers: headerKunci });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error ?? "Gagal menghapus.");
        }
      } catch (e) {
        pesan(e instanceof Error ? e.message : "Gagal menghapus.");
        void muat();
      }
    },
    [headerKunci, muat, pesan],
  );

  const komponenTerpilih = KOMPONEN_KAK.find((k) => k.id === pilih) ?? KOMPONEN_KAK[0];
  const poinTerpilih = POIN_KAK.find((p) => p.kode === komponenTerpilih.poin);
  const hitung = useCallback(
    (komponenId: string) => baris.filter((b) => b.komponen_id === komponenId).length,
    [baris],
  );

  const grup = POIN_KAK.map((p) => ({
    ...p,
    items: KOMPONEN_KAK.filter((k) => k.poin === p.kode),
  }));

  return (
    <div className="relative flex min-h-dvh">
      <div className="awan" />

      {/* ---------------- Sidebar ---------------- */}
      <aside
        className="relative z-[2] hidden shrink-0 flex-col justify-between gap-6 border-r p-4 transition-[width] duration-300 md:flex"
        style={{
          width: buka ? 244 : 88,
          background: "var(--side)",
          borderColor: "var(--line)",
        }}
      >
        <div className="grid gap-6">
          <div className="flex items-center justify-between gap-2">
            {buka && (
              <div className="flex min-w-0 items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/lps-mark.png" alt="LPS" className="h-7 w-auto shrink-0" />
                <span
                  className="font-[family-name:var(--font-mono)] text-[9.5px] uppercase leading-[1.5] tracking-[0.1em]"
                  style={{ color: "var(--mute2)" }}
                >
                  LPS
                  <br />
                  Pendanaan
                  <br />
                  Penelitian
                </span>
              </div>
            )}
            <div className="flex shrink-0 items-center gap-1.5">
              {buka && <TombolTema ukuran={30} />}
              <button
                type="button"
                onClick={() => setBuka((b) => !b)}
                title="Buka atau tutup panel"
                aria-label="Buka atau tutup panel"
                className="h-[30px] w-[30px] rounded-[10px] border text-[13px] leading-none transition-colors"
                style={{ borderColor: "var(--line)", background: "var(--panel)", color: "var(--mute)" }}
              >
                {buka ? "‹" : "›"}
              </button>
            </div>
          </div>

          <nav className="grid gap-1.5">
            {(
              [
                { id: "finetuner", kode: "01", label: "Panel Fine-Tuner" },
                { id: "riwayat", kode: "02", label: "Riwayat Analisis" },
              ] as const
            ).map((n) => {
              const aktif = tab === n.id;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setTab(n.id)}
                  title={n.label}
                  className="flex items-center gap-3 rounded-[14px] border px-[13px] py-3 text-left text-[13.5px] transition-colors"
                  style={{
                    borderColor: aktif ? "rgb(255 198 41 / 0.45)" : "var(--line)",
                    background: aktif ? "rgb(255 198 41 / 0.12)" : "var(--panel)",
                    color: aktif ? "var(--accent)" : "var(--fg3)",
                  }}
                >
                  <span className="shrink-0 font-[family-name:var(--font-mono)] text-[10.5px] opacity-80">
                    {n.kode}
                  </span>
                  {buka && <span className="truncate">{n.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="grid gap-2.5 px-1">
          {buka && (
            <div
              className="font-[family-name:var(--font-mono)] text-[9.5px] uppercase leading-[1.6] tracking-[0.12em]"
              style={{ color: "var(--mute3)" }}
            >
              Admin Fine-Tuner
              <br />
              {baris.length} baris aktif
            </div>
          )}
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-[14px] border px-[13px] py-[11px] text-[12.5px] transition-colors hover:border-[rgb(255_198_41_/_0.5)] hover:text-[var(--accent)]"
            style={{ borderColor: "var(--line)", background: "var(--panel)", color: "var(--fg3)" }}
          >
            <span className="font-[family-name:var(--font-mono)] text-[10.5px]">←</span>
            {buka && <span className="whitespace-nowrap">Halaman unggah</span>}
          </Link>
        </div>
      </aside>

      {/* ---------------- Konten ---------------- */}
      <main className="relative z-[2] min-w-0 flex-1 px-5 pb-[70px] pt-6 sm:px-[30px]">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div
              className="mb-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.2em]"
              style={{ color: "var(--accent)" }}
            >
              {tab === "finetuner" ? "Injeksi Pengetahuan" : "Rekam Jejak Batch"}
            </div>
            <h1 className="m-0 font-[family-name:var(--font-display)] text-[26px] font-semibold tracking-[-0.03em] sm:text-[32px]">
              {tab === "finetuner" ? "Panel Fine-Tuner" : "Riwayat Analisis"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="md:hidden">
              <TombolTema ukuran={34} />
            </div>
            <div
              className="text-right font-[family-name:var(--font-mono)] text-[10.5px] leading-[1.7]"
              style={{ color: "var(--mute3)" }}
            >
              KAK-1/GRIS/2026
              <br />
              poin 7 – 8.3
            </div>
          </div>
        </div>

        {perluKunci && !kunci && (
          <div
            className="mb-5 flex flex-wrap items-center gap-3 rounded-[18px] border px-5 py-4"
            style={{ borderColor: "rgb(255 198 41 / 0.4)", background: "rgb(255 198 41 / 0.08)" }}
          >
            <span className="text-[12.5px]" style={{ color: "var(--fg3)" }}>
              Panel ini dikunci. Masukkan kunci admin untuk menyunting pengetahuan.
            </span>
            <form
              className="flex flex-1 flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const nilai = new FormData(e.currentTarget).get("kunci");
                const k = String(nilai ?? "").trim();
                if (!k) return;
                setKunci(k);
                try {
                  sessionStorage.setItem(KUNCI_SESI, k);
                } catch {
                  /* diabaikan */
                }
                pesan("Kunci admin dipasang untuk sesi ini.");
              }}
            >
              <input
                name="kunci"
                type="password"
                autoComplete="current-password"
                placeholder="Kunci admin"
                className="min-w-0 flex-1 rounded-[14px] border px-3.5 py-2.5 text-[13px]"
                style={{ borderColor: "var(--line)", background: "var(--field)" }}
              />
              <button
                type="submit"
                className="rounded-[14px] border-0 px-5 py-2.5 text-[12.5px] font-semibold"
                style={{ color: "var(--btn-fg)", background: "linear-gradient(120deg, #FFD873, #FFC629)" }}
              >
                Pasang
              </button>
            </form>
          </div>
        )}

        {galat && (
          <div
            className="mb-5 rounded-[18px] border px-5 py-4 text-[12.5px]"
            style={{ borderColor: "rgb(224 107 98 / 0.4)", background: "rgb(224 107 98 / 0.1)", color: "var(--fg2)" }}
          >
            {galat}
          </div>
        )}

        {tab === "finetuner" ? (
          <div className="flex flex-wrap items-start gap-6">
            {/* Daftar kriteria screening */}
            <div
              className="min-w-0 flex-[1_1_268px] overflow-hidden rounded-[22px] border lg:max-w-[340px]"
              style={{ background: "var(--panel)", borderColor: "var(--line)" }}
            >
              <div className="border-b px-[18px] py-4" style={{ borderColor: "var(--line)" }}>
                <div className="text-[13px] font-semibold">{KOMPONEN_KAK.length} kriteria screening</div>
                <div className="mt-0.5 text-[11.5px]" style={{ color: "var(--mute2)" }}>
                  Pilih komponen untuk disunting
                </div>
              </div>
              <div className="max-h-[60vh] overflow-y-auto rapi-scroll lg:max-h-none">
                {grup.map((g) => (
                  <div key={g.kode}>
                    <div
                      className="px-[18px] pb-[7px] pt-[11px] font-[family-name:var(--font-mono)] text-[9.5px] uppercase tracking-[0.12em]"
                      style={{ color: "var(--accent)" }}
                    >
                      {g.kode} · {g.nama}
                    </div>
                    {g.items.map((k) => {
                      const aktif = k.id === pilih;
                      const n = hitung(k.id);
                      return (
                        <button
                          key={k.id}
                          type="button"
                          onClick={() => setPilih(k.id)}
                          className="flex w-full items-center justify-between gap-2.5 border-0 px-[18px] py-2.5 text-left text-[12.5px] transition-colors"
                          style={{
                            borderLeft: `2px solid ${aktif ? "var(--accent)" : "transparent"}`,
                            background: aktif ? "rgb(255 198 41 / 0.1)" : "transparent",
                            color: aktif ? "var(--fg)" : "var(--fg3)",
                          }}
                        >
                          <span className="min-w-0 truncate">{k.nama}</span>
                          <span
                            className="shrink-0 rounded-full px-2 py-[3px] font-[family-name:var(--font-mono)] text-[9.5px]"
                            style={{
                              background: n ? "rgb(255 198 41 / 0.16)" : "var(--panel2)",
                              color: n ? "var(--accent)" : "var(--mute3)",
                            }}
                          >
                            {n}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Penyunting komponen terpilih */}
            <div className="grid min-w-0 flex-[4_1_400px] gap-4">
              <motion.div
                key={komponenTerpilih.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="rounded-[22px] border px-6 py-[22px]"
                style={{ background: "var(--panel)", borderColor: "var(--line)" }}
              >
                <div
                  className="mb-2.5 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.14em]"
                  style={{ color: "var(--accent)" }}
                >
                  {komponenTerpilih.poin}
                </div>
                <div className="mb-2.5 font-[family-name:var(--font-display)] text-[21px] font-medium tracking-[-0.02em] sm:text-[25px]">
                  {komponenTerpilih.nama}
                </div>
                <div className="text-[13px] leading-[1.65]" style={{ color: "var(--mute2)" }}>
                  {poinTerpilih?.acuan}
                </div>
                <div
                  className="mt-3 border-t pt-3 text-[12.5px] leading-[1.6]"
                  style={{ borderColor: "var(--line)", color: "var(--fg3)" }}
                >
                  <span style={{ color: "var(--mute3)" }}>Kriteria screening: </span>
                  {komponenTerpilih.kriteria}
                </div>
              </motion.div>

              {BLOK.map((b) => {
                const isi = baris
                  .filter((r) => r.komponen_id === pilih && r.status === b.kode)
                  .sort((x, y) => x.urutan - y.urutan || x.id - y.id);
                return (
                  <div
                    key={b.kode}
                    className="overflow-hidden rounded-[22px] border"
                    style={{ background: "var(--panel)", borderColor: "var(--line)" }}
                  >
                    <div
                      className="flex items-center justify-between gap-3.5 border-b px-5 py-3.5"
                      style={{ borderColor: "var(--panel2)" }}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: b.warna }}
                        />
                        <span className="text-[13px] font-semibold" style={{ color: b.warna }}>
                          {b.label}
                        </span>
                        <span className="truncate text-[12px]" style={{ color: "var(--mute2)" }}>
                          {b.deskripsi}
                        </span>
                      </div>
                      <span
                        className="shrink-0 font-[family-name:var(--font-mono)] text-[10.5px]"
                        style={{ color: "var(--mute3)" }}
                      >
                        {isi.length} baris
                      </span>
                    </div>

                    <AnimatePresence initial={false}>
                      {isi.map((r, i) => (
                        <motion.div
                          key={r.id}
                          layout
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25 }}
                          className="flex items-start gap-3 border-b px-5 py-[13px]"
                          style={{ borderColor: "var(--panel)" }}
                        >
                          <span
                            className="shrink-0 pt-[3px] font-[family-name:var(--font-mono)] text-[10px]"
                            style={{ color: "var(--accent)" }}
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <div
                            className="min-w-0 flex-1 text-[13px] leading-[1.6]"
                            style={{ color: "var(--fg2)" }}
                          >
                            {r.teks}
                          </div>
                          <button
                            type="button"
                            aria-label="Hapus baris pengetahuan"
                            onClick={() => hapus(r.id)}
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] leading-none transition-colors hover:text-[var(--danger)]"
                            style={{ background: "var(--panel2)", color: "var(--mute)" }}
                          >
                            ×
                          </button>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    {!isi.length && !memuat && (
                      <div className="px-5 py-[18px] text-[12.5px]" style={{ color: "var(--mute3)" }}>
                        Belum ada ciri kondisi untuk status ini.
                      </div>
                    )}

                    <form
                      className="flex flex-wrap gap-2.5 px-5 py-3.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void tambah(b.kode);
                      }}
                    >
                      <input
                        type="text"
                        value={draf[b.kode]}
                        onChange={(e) => setDraf((s) => ({ ...s, [b.kode]: e.target.value }))}
                        placeholder={b.contoh}
                        maxLength={1200}
                        className="min-w-0 flex-[1_1_220px] rounded-[14px] border px-3.5 py-[11px] text-[13px]"
                        style={{ borderColor: "var(--line)", background: "var(--field)" }}
                      />
                      <button
                        type="submit"
                        disabled={sibuk}
                        className="shrink-0 rounded-[14px] border-0 px-5 py-[11px] text-[12.5px] font-semibold transition-transform hover:-translate-y-px disabled:opacity-50"
                        style={{
                          color: "var(--btn-fg)",
                          background: "linear-gradient(120deg, #FFD873, #FFC629)",
                        }}
                      >
                        Tambah
                      </button>
                    </form>
                  </div>
                );
              })}

              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="text-[12.5px]" style={{ color: "var(--mute2)" }}>
                  Pengetahuan tersimpan otomatis dan disuntikkan pada batch analisis berikutnya.
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void muat();
                    pesan(`${baris.length} baris pengetahuan aktif dan tersinkron.`);
                  }}
                  className="rounded-full border px-[26px] py-3 text-[13px] font-semibold transition-colors"
                  style={{
                    borderColor: "rgb(255 198 41 / 0.4)",
                    color: "var(--accent)",
                    background: "rgb(255 198 41 / 0.08)",
                  }}
                >
                  Segarkan pengetahuan
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="max-w-[980px] overflow-hidden rounded-[22px] border"
            style={{ background: "var(--panel)", borderColor: "var(--line)" }}
          >
            {riwayat.length ? (
              riwayat.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-[18px] border-b px-[22px] py-4"
                  style={{ borderColor: "var(--panel)" }}
                >
                  <div className="min-w-[190px] flex-[1_1_240px]">
                    <div className="flex flex-wrap items-baseline gap-2.5">
                      <span
                        className="font-[family-name:var(--font-mono)] text-[11.5px]"
                        style={{ color: "var(--accent)" }}
                      >
                        {r.id}
                      </span>
                      <span
                        className="font-[family-name:var(--font-mono)] text-[10px]"
                        style={{ color: "var(--mute3)" }}
                      >
                        {r.tanggal} · {r.jumlah_berkas} PDF
                      </span>
                    </div>
                    <div className="mt-1 text-[13px]" style={{ color: "var(--fg2)" }}>
                      {r.tim && r.tim !== "-" ? r.tim : r.institusi}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="font-[family-name:var(--font-display)] text-[21px]">{r.skor}%</span>
                    <span
                      className="whitespace-nowrap rounded-full px-[11px] py-[5px] font-[family-name:var(--font-mono)] text-[10px] tracking-[0.06em]"
                      style={{
                        background: r.status === "Selesai" ? "rgb(63 191 127 / 0.14)" : "rgb(232 180 61 / 0.14)",
                        color: r.status === "Selesai" ? "var(--ok)" : "var(--accent)",
                      }}
                    >
                      {r.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-[22px] py-9 text-center text-[12.5px]" style={{ color: "var(--mute3)" }}>
                Belum ada batch analisis yang tercatat.
              </div>
            )}
          </div>
        )}
      </main>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            role="status"
            className="fixed bottom-7 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-full border px-[22px] py-3 text-center text-[12.5px]"
            style={{ background: "var(--modal)", borderColor: "var(--line)", color: "var(--fg3)" }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
