/**
 * Deterministic RNG abstraction.
 *
 * Randomness is separate from the core rules so that, when a seeded RNG is
 * supplied, "same input + same authoritative state" yields an identical result.
 * The runtime default is non-deterministic (for live play); tests and replays
 * inject a seeded RNG to reproduce outcomes exactly.
 *
 * This is framework-independent (no React/Next/Three) and uses only `Math`.
 */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
}

/** mulberry32 PRNG: small, fast, deterministic for a given seed. */
export function createRng(seed?: number): Rng {
  let s = (seed ?? ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0)) >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    nextInt: (maxExclusive) => Math.floor(next() * maxExclusive),
  };
}
