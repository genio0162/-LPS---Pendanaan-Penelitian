"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type Tema = "gelap" | "terang";

const KUNCI = "kak-tema";

interface Konteks {
  tema: Tema;
  ganti: () => void;
}

const TemaCtx = createContext<Konteks>({ tema: "gelap", ganti: () => {} });

export function useTema(): Konteks {
  return useContext(TemaCtx);
}

export function PenyediaTema({ children }: { children: React.ReactNode }) {
  // Nilai awal harus cocok dengan render server agar tidak terjadi hydration
  // mismatch; skrip anti-kedip di <head> sudah memasang atribut sebenarnya.
  const [tema, setTema] = useState<Tema>("gelap");
  const belumTersinkron = useRef(true);

  // Selaraskan state React dengan atribut yang sudah dipasang skrip anti-kedip.
  useEffect(() => {
    const aktif = document.documentElement.getAttribute("data-tema");
    if (aktif === "terang" || aktif === "gelap") setTema(aktif);
  }, []);

  useEffect(() => {
    // Commit pertama dilewati: DOM dan localStorage sudah benar dari skrip
    // anti-kedip, sedangkan state masih memegang nilai bawaan "gelap".
    // Tanpa penjagaan ini, pilihan pengguna tertimpa setiap kali pindah halaman.
    if (belumTersinkron.current) {
      belumTersinkron.current = false;
      return;
    }
    document.documentElement.setAttribute("data-tema", tema);
    try {
      localStorage.setItem(KUNCI, tema);
    } catch {
      /* mode privat memblokir penyimpanan — abaikan, tema tetap berlaku sesi ini */
    }
  }, [tema]);

  const ganti = useCallback(() => {
    setTema((t) => (t === "gelap" ? "terang" : "gelap"));
  }, []);

  return <TemaCtx.Provider value={{ tema, ganti }}>{children}</TemaCtx.Provider>;
}

/** Skrip yang dijalankan sebelum paint pertama agar tidak ada kedipan tema. */
export const SKRIP_ANTI_KEDIP = `(function(){try{var t=localStorage.getItem("${KUNCI}");document.documentElement.setAttribute("data-tema",t==="terang"?"terang":"gelap");}catch(e){document.documentElement.setAttribute("data-tema","gelap");}})();`;

export function TombolTema({ ukuran = 38 }: { ukuran?: number }) {
  const { tema, ganti } = useTema();
  const judul = tema === "gelap" ? "Beralih ke tema terang" : "Beralih ke tema gelap";

  return (
    <button
      type="button"
      onClick={ganti}
      title={judul}
      aria-label={judul}
      className="inline-flex shrink-0 items-center justify-center rounded-full border transition-colors"
      style={{
        width: ukuran,
        height: ukuran,
        borderColor: "var(--line)",
        background: "var(--panel)",
        color: "var(--fg3)",
      }}
    >
      {tema === "terang" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )}
    </button>
  );
}
