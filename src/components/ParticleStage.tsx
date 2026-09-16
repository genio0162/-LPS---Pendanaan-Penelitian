"use client";

import { useEffect, useRef } from "react";

/**
 * Panggung partikel: debu emas menyusun marka LPS, bernapas keluar-masuk saat
 * diam, dan berkumpul menjadi "otak" yang berputar selama analisis berjalan.
 * Partikel di bawah kursor disapu lalu memantul kembali ke posisinya.
 *
 * Kanvas dipasang fixed selebar viewport agar debu bebas terbang keluar dari
 * kotak tata letak logo; elemen host hanya menandai di mana marka berada.
 */

type Tema = "gelap" | "terang";

const TAU = Math.PI * 2;
const N = 2200;
const SAMPLE_PAL: number[][] = [
  [255, 198, 41],
  [221, 136, 41],
  [252, 250, 246],
];

const THEMES: Record<
  Tema,
  {
    pal: number[][];
    brain: number[][];
    syn: string;
    comp: GlobalCompositeOperation;
    alpha: number;
  }
> = {
  gelap: {
    pal: [
      [255, 198, 41],
      [221, 136, 41],
      [252, 250, 246],
    ],
    brain: [
      [255, 198, 41],
      [63, 208, 230],
      [216, 137, 44],
    ],
    syn: "127,166,214",
    comp: "lighter",
    alpha: 0.92,
  },
  terang: {
    pal: [
      [221, 136, 41],
      [221, 136, 41],
      [221, 136, 41],
    ],
    brain: [
      [221, 136, 41],
      [59, 111, 224],
      [190, 110, 30],
    ],
    syn: "59,111,224",
    comp: "source-over",
    alpha: 0.9,
  },
};

interface Titik {
  x: number;
  y: number;
  c: number;
}
interface Partikel {
  d: number;
  dir: number;
  amp: number;
  lift: number;
  swirl: number;
  s: number;
  ph: number;
  sh: number;
}
interface Medan {
  B: Titik[];
  S: { x: number; y: number }[];
  P: Partikel[];
  V: number[][];
  syn: [number, number][];
}

function rng(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const ease = (t: number) => {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
const swell = (t: number) => Math.pow(Math.sin(Math.PI * clamp01(t)), 1.4);

function nearestPal(r: number, g: number, b: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < SAMPLE_PAL.length; i++) {
    const p = SAMPLE_PAL[i];
    const d = (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

function rgb(a: number[], b: number[], u: number): string {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * u)},${Math.round(
    a[1] + (b[1] - a[1]) * u,
  )},${Math.round(a[2] + (b[2] - a[2]) * u)})`;
}

/**
 * Mencuplik logo menjadi N titik dalam kotak satuan. Piksel tepi selalu
 * dipertahankan dan interior padat ditipiskan, sehingga bentuk terbaca
 * lewat konturnya alih-alih menjadi gumpalan rata.
 */
function sample(img: HTMLImageElement, n: number, seed: number, orangeOnly: boolean): Titik[] {
  const gw = 210;
  const gh = Math.max(8, Math.round((gw * img.height) / img.width));
  const cv = document.createElement("canvas");
  cv.width = gw;
  cv.height = gh;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, gw, gh);
  const d = ctx.getImageData(0, 0, gw, gh).data;

  const cls = new Int8Array(gw * gh);
  for (let k = 0; k < gw * gh; k++) {
    const i = k * 4;
    let c = -1;
    if (d[i + 3] > 150) {
      if (orangeOnly) {
        const mx = Math.max(d[i], d[i + 1], d[i + 2]);
        const mn = Math.min(d[i], d[i + 1], d[i + 2]);
        c = mx - mn > 70 ? 1 : -1;
      } else c = nearestPal(d[i], d[i + 1], d[i + 2]);
    }
    cls[k] = c;
  }

  const pick = rng(seed ^ 0x5bf03635);
  const raw: Titik[] = [];
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const k = y * gw + x;
      const c = cls[k];
      if (c < 0) continue;
      const edge =
        x === 0 ||
        y === 0 ||
        x === gw - 1 ||
        y === gh - 1 ||
        cls[k - 1] !== c ||
        cls[k + 1] !== c ||
        cls[k - gw] !== c ||
        cls[k + gw] !== c;
      if (edge) {
        raw.push({ x, y, c });
        continue;
      }
      if (pick() < (orangeOnly ? 0.7 : 0.26)) raw.push({ x, y, c });
    }
  }
  if (!raw.length) return [];

  const r = rng(seed);
  for (let i = raw.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [raw[i], raw[j]] = [raw[j], raw[i]];
  }

  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  for (const p of raw) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }

  const s = 1 / Math.max(x1 - x0, y1 - y0);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const out: Titik[] = [];
  for (let i = 0; i < n; i++) {
    const q = raw[i % raw.length];
    out.push({ x: (q.x - cx) * s, y: (q.y - cy) * s, c: q.c });
  }
  return out;
}

/** Urutan polar menjaga ketetanggaan sehingga morf terbaca seperti pusaran. */
function polarSort(pts: Titik[]): Titik[] {
  const WEDGES = 26;
  return pts
    .map((p) => ({
      p,
      w: Math.floor(((Math.atan2(p.y, p.x) + Math.PI) / TAU) * WEDGES),
      r: Math.hypot(p.x, p.y),
    }))
    .sort((u, v) => u.w - v.w || u.r - v.r)
    .map((o) => o.p);
}

function build(img: HTMLImageElement): Medan | null {
  const B = polarSort(sample(img, N, 4242, true));
  if (!B.length) return null;

  const r = rng(90210);
  const S: { x: number; y: number }[] = [];
  const P: Partikel[] = [];
  const V: number[][] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < N; i++) {
    const ang = r() * TAU;
    const rad = 0.9 + r() * 1.1;
    S.push({ x: Math.cos(ang) * rad * 1.3, y: Math.sin(ang) * rad * 0.8 });
    P.push({
      d: r() * 0.34,
      dir: r() * TAU,
      amp: 0.12 + r() * 0.5,
      lift: 0.03 + r() * 0.3,
      swirl: (r() - 0.5) * 1.1,
      s: 0.55 + r() * 0.75,
      ph: r() * TAU,
      sh: 0.6 + r() * 1.6,
    });

    // Otak: bola fibonacci, dipipihkan jadi dua lobus dengan celah dangkal.
    const y = 1 - (i / (N - 1)) * 2;
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i;
    const shell = 0.86 + r() * 0.16;
    let vx = Math.cos(th) * rr * shell;
    let vz = Math.sin(th) * rr * shell;
    let vy = y * shell;
    const wr = 1 + 0.045 * Math.sin(vx * 9.5) * Math.sin(vy * 8 + vz * 6);
    vx *= wr;
    vy *= wr;
    vz *= wr;
    vx = vx * 1.12 + (vx > 0 ? 0.075 : -0.075) * (1 - Math.abs(vy) * 0.6);
    vy = vy * 0.86 + 0.04;
    V.push([vx, vy, vz]);
  }

  const syn: [number, number][] = [];
  let tries = 0;
  while (syn.length < 190 && tries < 12000) {
    tries++;
    const a = Math.floor(r() * N);
    const b = Math.floor(r() * N);
    if (a === b) continue;
    const dx = V[a][0] - V[b][0];
    const dy = V[a][1] - V[b][1];
    const dz = V[a][2] - V[b][2];
    if (dx * dx + dy * dy + dz * dz < 0.06) syn.push([a, b]);
  }

  return { B, S, P, V, syn };
}

export interface KontrolPanggung {
  splash(nx: number, ny: number): void;
}

interface Props {
  busy?: boolean;
  tema: Tema;
  className?: string;
  kontrolRef?: React.MutableRefObject<KontrolPanggung | null>;
}

export default function ParticleStage({ busy = false, tema, className, kontrolRef }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  const temaRef = useRef<Tema>(tema);

  busyRef.current = busy;
  temaRef.current = tema;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const cv = document.createElement("canvas");
    cv.style.cssText =
      "position:fixed;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;display:block;";
    document.body.appendChild(cv);
    const ctx = cv.getContext("2d");
    if (!ctx) {
      cv.remove();
      return;
    }

    let W = 1;
    let H = 1;
    let DPR = 1;
    const resize = () => {
      W = window.innerWidth || 1;
      H = window.innerHeight || 1;
      DPR = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(W * DPR);
      cv.height = Math.round(H * DPR);
    };
    resize();
    window.addEventListener("resize", resize);

    let field: Medan | null = null;
    let hidup = true;
    const img = new Image();
    img.onload = () => {
      if (hidup) field = build(img);
    };
    img.src = "/assets/logo-lps.webp";

    let blend = 0;
    let spin = 0.35;
    let ry = 0;
    let last = performance.now();
    const t0 = last;

    const pointer = { x: 0, y: 0 };
    const cam = { x: 0, y: 0 };
    let mx = -9999,
      my = -9999,
      lastMx = -9999,
      lastMy = -9999,
      pvx = 0,
      pvy = 0;

    const OX = new Float32Array(N);
    const OY = new Float32Array(N);
    const VX = new Float32Array(N);
    const VY = new Float32Array(N);

    interface Tetes {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      r: number;
    }
    const drops: Tetes[] = [];
    const colorCache: Record<Tema, Record<number, string>> = { gelap: {}, terang: {} };

    if (kontrolRef) {
      kontrolRef.current = {
        splash(nx, ny) {
          const ox = (nx ?? 0.5) * W;
          const oy = (ny ?? 0.5) * H;
          const k = Math.min(W, H) / 540;
          for (let i = 0; i < 60; i++) {
            const ang = Math.random() * TAU;
            const sp = (40 + Math.random() * 160) * k;
            drops.push({
              x: ox + (Math.random() - 0.5) * 30 * k,
              y: oy,
              vx: Math.cos(ang) * sp,
              vy: (-220 - Math.random() * 260) * k,
              life: 1,
              r: 0.8 + Math.random() * 1.4,
            });
          }
        },
      };
    }

    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX / window.innerWidth - 0.5;
      pointer.y = e.clientY / window.innerHeight - 0.5;
      mx = e.clientX;
      my = e.clientY;
    };
    const onLeave = () => {
      mx = my = -9999;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);
    document.addEventListener("mouseleave", onLeave);

    const INTRO = 2.4;
    const HOLD = 6.5;
    const MORPH = 2.4;
    const PERIOD = HOLD + MORPH;

    function travel(
      from: { x: number; y: number },
      to: { x: number; y: number },
      ph: number,
      p: Partikel,
      size: number,
    ): [number, number, number, number] {
      const lt = clamp01((ph - p.d) / 0.66);
      const e = ease(lt);
      const bell = swell(lt);
      let x = from.x + (to.x - from.x) * e;
      let y = from.y + (to.y - from.y) * e;
      x += Math.cos(p.dir) * p.amp * bell;
      y += Math.sin(p.dir) * p.amp * bell * 0.66 - p.lift * bell;
      const rot = p.swirl * bell;
      const ca = Math.cos(rot);
      const sa = Math.sin(rot);
      return [(x * ca - y * sa) * size, (x * sa + y * ca) * size, bell, lt];
    }

    function colorFor(
      T: (typeof THEMES)[Tema],
      ca: number,
      cb: number,
      bc: number,
      bl: number,
      kunciTema: Tema,
    ): string {
      const lvl = Math.round(bl * 15);
      const key = ((ca * 3 + cb) * 3 + bc) * 16 + lvl;
      const cache = colorCache[kunciTema];
      const ada = cache[key];
      if (ada) return ada;
      const idle = T.pal[cb] ?? T.pal[0];
      const s = rgb(idle, T.brain[bc], lvl / 15);
      cache[key] = s;
      return s;
    }

    let raf = 0;
    const frame = () => {
      if (!hidup) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;

      const kunciTema = temaRef.current;
      const T = THEMES[kunciTema] ?? THEMES.gelap;
      const target = busyRef.current ? 1 : 0;

      blend += (target - blend) * Math.min(1, dt * 2.2);
      if (blend < 0.002) blend = 0;
      if (blend > 0.998) blend = 1;
      spin += ((busyRef.current ? 1.3 : 0.3) - spin) * 0.04;
      ry += spin * dt;

      const bl = ease(blend);
      const bellB = swell(blend);

      if (lastMx > -9000 && mx > -9000 && dt > 0) {
        pvx += ((mx - lastMx) / dt - pvx) * 0.5;
        pvy += ((my - lastMy) / dt - pvy) * 0.5;
      } else pvx = pvy = 0;
      lastMx = mx;
      lastMy = my;

      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);

      cam.x += (pointer.x * 5 - cam.x) * 0.05;
      cam.y += (pointer.y * 4 - cam.y) * 0.05;

      const rc = host.getBoundingClientRect();
      const box = Math.max(1, Math.min(rc.width, rc.height));
      const cx = rc.left + rc.width / 2 + cam.x;
      const cy = rc.top + rc.height / 2 + cam.y;
      const size = box * 0.84;
      const scale = Math.max(0.6, Math.min(1.4, box / 300));
      const k = box / 540;
      const RR = Math.max(22, box * 0.2);
      const RR2 = RR * RR;
      const damp = Math.exp(-4.2 * dt);

      if (field) {
        const { B, S, P, V } = field;
        const intro = t < INTRO ? t / INTRO : 1;
        const lt = intro < 1 ? 0 : (t - INTRO) % PERIOD;
        let seg: number;
        let ph = 0;
        if (intro < 1) {
          seg = 0;
          ph = intro;
        } else if (lt < HOLD) {
          seg = 3;
        } else {
          seg = 2;
          ph = (lt - HOLD) / MORPH; // napas: LPS -> debu -> LPS
        }

        const cry = Math.cos(ry);
        const sry = Math.sin(ry);
        const tilt = Math.sin(t * 0.3) * 0.28;
        const ctl = Math.cos(tilt);
        const stl = Math.sin(tilt);
        const R = size * 0.46;
        const bx = new Float32Array(N);
        const by = new Float32Array(N);
        const groups: Record<string, number[]> = {};

        for (let i = 0; i < N; i++) {
          const p = P[i];
          const b = B[i];
          const s0 = S[i];
          let x: number;
          let y: number;
          let grow = 1;
          let dust = 0;

          if (seg === 0) {
            const pos = travel(s0, b, ph, p, size);
            x = pos[0];
            y = pos[1];
            grow = 0.35 + 0.65 * pos[3];
            dust = pos[2];
          } else if (seg === 2) {
            const pos = travel(b, b, ph, p, size);
            x = pos[0];
            y = pos[1];
            dust = pos[2];
          } else {
            x = b.x * size;
            y = b.y * size;
          }

          const v = V[i];
          const vx = v[0] * cry + v[2] * sry;
          const vz = -v[0] * sry + v[2] * cry;
          const vy = v[1];
          const vy2 = vy * ctl - vz * stl;
          const vz2 = vy * stl + vz * ctl;
          bx[i] = vx * R;
          by[i] = vy2 * R;

          if (bl > 0) {
            const puff = bellB * p.amp * 0.7 * size;
            x = x + (bx[i] - x) * bl + Math.cos(p.dir) * puff;
            y = y + (by[i] - y) * bl + Math.sin(p.dir) * puff * 0.7 - p.lift * bellB * size * 0.5;
            grow *= 1 - 0.25 * bellB;
            grow *= 1 + 0.25 * vz2 * bl;
          }

          const drift = 0.35 + 0.65 * Math.max(dust, bellB);
          x += Math.sin(t * p.sh + p.ph) * 1.6 * k * drift;
          y += Math.cos(t * p.sh * 0.8 + p.ph) * 1.6 * k * drift;

          const sz = p.s * 1.85 * scale * grow * (1 - 0.3 * dust);

          // Sapuan kursor: partikel di bawah pointer terdorong lalu memantul pulang.
          let sx = cx + x;
          let sy = cy + y;
          let ox = OX[i];
          let oy = OY[i];
          let ovx = VX[i];
          let ovy = VY[i];
          const ddx = sx + ox - mx;
          const ddy = sy + oy - my;
          const d2 = ddx * ddx + ddy * ddy;

          if (d2 < RR2 || Math.abs(ox) + Math.abs(oy) + Math.abs(ovx) + Math.abs(ovy) > 0.05) {
            if (d2 < RR2 && d2 > 0.01) {
              const dd = Math.sqrt(d2);
              const fall = 1 - dd / RR;
              const imp = fall * fall * 1500 * k * dt;
              ovx += (ddx / dd) * imp + pvx * fall * 6 * dt;
              ovy += (ddy / dd) * imp + pvy * fall * 6 * dt;
            }
            ovx += -ox * 22 * dt;
            ovy += -oy * 22 * dt;
            ovx *= damp;
            ovy *= damp;
            ox += ovx * dt;
            oy += ovy * dt;
            OX[i] = ox;
            OY[i] = oy;
            VX[i] = ovx;
            VY[i] = ovy;
            sx += ox;
            sy += oy;
          }

          const bc = i % 7 === 0 ? 1 : i % 3 === 0 ? 2 : 0;
          const col = colorFor(T, b.c, b.c, bc, bl, kunciTema);
          (groups[col] ??= []).push(sx, sy, sz);
        }

        ctx.globalCompositeOperation = T.comp;
        if (bl > 0.04) {
          ctx.strokeStyle = `rgba(${T.syn},${(0.28 * bl).toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (const [a, b2] of field.syn) {
            ctx.moveTo(cx + bx[a] * (1 + (1 - bl) * 0.4), cy + by[a]);
            ctx.lineTo(cx + bx[b2], cy + by[b2]);
          }
          ctx.stroke();
        }

        ctx.globalAlpha = T.alpha;
        for (const key2 in groups) {
          const arr = groups[key2];
          ctx.fillStyle = key2;
          for (let i = 0; i < arr.length; i += 3) {
            const w = arr[i + 2];
            ctx.fillRect(arr[i] - w / 2, arr[i + 1] - w / 2, w, w);
          }
        }
        ctx.globalAlpha = 1;
      }

      if (drops.length) {
        ctx.globalCompositeOperation = T.comp;
        const dc = kunciTema === "terang" ? "59,111,224" : "191,233,255";
        for (let j = drops.length - 1; j >= 0; j--) {
          const dr = drops[j];
          dr.life -= dt * 1.1;
          if (dr.life <= 0) {
            drops.splice(j, 1);
            continue;
          }
          dr.vy += 620 * k * dt;
          dr.x += dr.vx * dt;
          dr.y += dr.vy * dt;
          ctx.fillStyle = `rgba(${dc},${dr.life.toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(dr.x, dr.y, dr.r, 0, TAU);
          ctx.fill();
        }
      }

      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);

    return () => {
      hidup = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("mouseleave", onLeave);
      cv.remove();
      if (kontrolRef) kontrolRef.current = null;
    };
  }, [kontrolRef]);

  return <div ref={hostRef} className={className} aria-hidden="true" />;
}
