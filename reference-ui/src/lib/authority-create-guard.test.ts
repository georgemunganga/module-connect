import { describe, expect, it } from "vitest";
import { claimAuthorityCreateGuard, clearAuthorityCreateGuard, readAuthorityCreateGuard } from "./authority-create-guard";

const key = "authority-test";
function storage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next; },
    removeItem: () => { value = null; },
  };
}

describe("approval limit create guard", () => {
  it("claims before a POST and stays pending until explicitly cleared after a known response", () => {
    const store = storage();
    expect(readAuthorityCreateGuard(key, store)).toBe("clear");
    expect(claimAuthorityCreateGuard(key, store)).toBe(true);
    expect(readAuthorityCreateGuard(key, store)).toBe("pending");
    expect(claimAuthorityCreateGuard(key, store)).toBe(false);
    expect(clearAuthorityCreateGuard(key, store)).toBe(true);
    expect(readAuthorityCreateGuard(key, store)).toBe("clear");
  });

  it("fails closed on blocked, malformed, and unverifiable storage", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(readAuthorityCreateGuard(key, blocked)).toBe("unavailable");
    expect(claimAuthorityCreateGuard(key, blocked)).toBe(false);
    expect(clearAuthorityCreateGuard(key, blocked)).toBe(false);
    const malformed = storage("other value");
    expect(readAuthorityCreateGuard(key, malformed)).toBe("unavailable");
    expect(claimAuthorityCreateGuard(key, malformed)).toBe(false);
    const noWrite = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    expect(claimAuthorityCreateGuard(key, noWrite)).toBe(false);
  });
});
