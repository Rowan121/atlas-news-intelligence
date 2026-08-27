import assert from "node:assert/strict";

export function expect<T>(actual: T) {
  return {
    toBe(expected: unknown): void {
      assert.strictEqual(actual, expected);
    },
    toEqual(expected: unknown): void {
      assert.deepStrictEqual(actual, expected);
    },
    toMatchObject(expected: unknown): void {
      assert.partialDeepStrictEqual(actual, expected);
    },
    toContain(expected: unknown): void {
      if (typeof actual === "string" && typeof expected === "string") {
        assert.ok(actual.includes(expected), `Expected ${actual} to contain ${expected}`);
        return;
      }
      if (Array.isArray(actual)) {
        assert.ok(actual.includes(expected), "Expected array to contain value");
        return;
      }
      assert.fail("toContain supports strings and arrays only");
    },
    toThrow(expected?: new (...args: never[]) => Error): void {
      assert.strictEqual(typeof actual, "function", "toThrow requires a function");
      if (expected === undefined) {
        assert.throws(actual as () => unknown);
      } else {
        assert.throws(actual as () => unknown, expected as unknown as typeof Error);
      }
    },
  };
}
