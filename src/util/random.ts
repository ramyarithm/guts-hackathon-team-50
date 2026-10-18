/**
 * Shared seeded PRNG utilities.
 * 
 * All run randomness should use these functions for reproducibility.
 * Never use Math.random() for anything that affects gameplay.
 */

/**
 * Convert a string (like runId) into a numeric seed.
 * Uses FNV-1a hash for good distribution.
 */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Create a seeded PRNG using mulberry32 algorithm.
 * Returns a function that produces values in [0, 1).
 * 
 * @example
 * const rng = createSeededRng(hashSeed(runId));
 * const value = rng(); // 0 <= value < 1
 */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle using a seeded RNG.
 * Returns a new array; does not mutate the input.
 */
export function shuffleArray<T>(arr: readonly T[], rng: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Pick a random integer in [min, max] inclusive using a seeded RNG.
 */
export function randomInt(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Pick a random element from an array using a seeded RNG.
 */
export function randomElement<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Return true with the given probability using a seeded RNG.
 */
export function randomChance(probability: number, rng: () => number): boolean {
  return rng() < probability;
}
