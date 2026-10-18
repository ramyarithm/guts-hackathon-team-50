// Minimal ambient typings for the test file in this folder. The root project has no
// test runner yet, so this keeps the root `tsc` green while the tests run under the
// Vitest installed in `chicken-cross/`. Delete this file once Vitest is a root dependency.
declare module 'vitest' {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>, timeoutMs?: number): void;
  export function expect(
    actual: unknown,
    message?: string,
  ): {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeNull(): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeGreaterThan(n: number): void;
    toBeGreaterThanOrEqual(n: number): void;
    toBeLessThan(n: number): void;
    toBeLessThanOrEqual(n: number): void;
    toBeCloseTo(n: number, digits?: number): void;
    toContain(item: unknown): void;
    toHaveLength(n: number): void;
    not: {
      toBe(expected: unknown): void;
      toEqual(expected: unknown): void;
      toBeNull(): void;
    };
  };
}
