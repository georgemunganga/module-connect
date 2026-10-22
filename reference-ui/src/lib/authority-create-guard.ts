/** A non-secret browser marker prevents a second create when a response is lost. */
export type AuthorityCreateGuardState = "clear" | "pending" | "unavailable";
const marker = "pending";
type GuardStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readAuthorityCreateGuard(key: string, storage?: GuardStorage): AuthorityCreateGuardState {
  try {
    const value = (storage ?? window.sessionStorage).getItem(key);
    return value === null ? "clear" : value === marker ? "pending" : "unavailable";
  } catch { return "unavailable"; }
}

/** Claim before POST. A blocked or unverifiable storage write fails closed. */
export function claimAuthorityCreateGuard(key: string, storage?: GuardStorage): boolean {
  if (readAuthorityCreateGuard(key, storage) !== "clear") return false;
  try { (storage ?? window.sessionStorage).setItem(key, marker); } catch { return false; }
  return readAuthorityCreateGuard(key, storage) === "pending";
}

/** Only a confirmed response or definitive 400/422 may clear the marker. */
export function clearAuthorityCreateGuard(key: string, storage?: GuardStorage): boolean {
  try { (storage ?? window.sessionStorage).removeItem(key); } catch { return false; }
  return readAuthorityCreateGuard(key, storage) === "clear";
}
