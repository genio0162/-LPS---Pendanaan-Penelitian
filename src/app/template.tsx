"use client";

import { AnimatePresence, motion } from "framer-motion";

/**
 * Pembungkus transisi rute.
 *
 * Sengaja diletakkan di template.tsx, bukan layout.tsx: layout mempertahankan
 * state dan menolak render ulang saat URL berubah, sedangkan template selalu
 * diinisialisasi ulang sehingga AnimatePresence dapat menjalankan koreografi
 * keluar-masuk. minHeight 100dvh memesan ruang blok lebih awal agar browser
 * menetapkan bounding box dan skor CLS tidak terkena penalti.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.38, ease: [0.22, 0.9, 0.3, 1] }}
        style={{ minHeight: "100dvh" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
