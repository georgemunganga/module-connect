import { beforeEach, describe, expect, it } from "vitest";
import { readManualReviewLink, rememberManualReviewLink } from "./invoice-manual-review-link";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } });
});
describe("manual review historical link", () => {
  it("retains a nonsecret review ID across reloads only in its actor and invoice scope", () => {
    expect(rememberManualReviewLink("actor-a:invoice-a", a)).toBe(true);
    expect(readManualReviewLink("actor-a:invoice-a")).toBe(a);
    expect(readManualReviewLink("actor-b:invoice-a")).toBeNull();
    expect(rememberManualReviewLink("actor-a:invoice-b", b)).toBe(true);
    expect(readManualReviewLink("actor-a:invoice-a")).toBe(a);
    expect(rememberManualReviewLink("actor-a:invoice-a", "not-a-guid")).toBe(false);
  });
});
