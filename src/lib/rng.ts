/** Deterministic RNG so every demo run is byte-identical. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller normal from a uniform source. */
export function gauss(rnd: () => number, mean = 0, sd = 1) {
  const u = Math.max(rnd(), 1e-9);
  const v = rnd();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Stable 32-bit hash of a string (FNV-1a), for per-id seeds. */
export function hashSeed(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export const clamp =(x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Weibull sample — used for time-between-failure on mine equipment. */
export function weibull(rnd: () => number, shape: number, scale: number) {
  return scale * Math.pow(-Math.log(Math.max(rnd(), 1e-9)), 1 / shape);
}
