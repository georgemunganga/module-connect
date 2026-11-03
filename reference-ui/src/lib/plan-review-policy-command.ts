import { PolicyActionError } from "../../../src/platform/procurement-policy-api";
import { isDefiniteHttpRejection } from "./http-write-outcome";
import { clearAuthorityCreateGuard, readAuthorityCreateGuard } from "./authority-create-guard";
export type PlanPolicyOutcome = { confirmed: true } | { confirmed: false; error: unknown };
type GuardStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Plan operational commands commit only 2xx; known API rejections roll back.
 * Transport/proxy/5xx/malformed-2xx outcomes remain pending without another POST. */
export function settlePlanPolicyCommand(marker: string, outcome: PlanPolicyOutcome, storage?: GuardStorage) {
  const rejected = !outcome.confirmed && outcome.error instanceof PolicyActionError && isDefiniteHttpRejection(outcome.error.status);
  if (outcome.confirmed || rejected) clearAuthorityCreateGuard(marker, storage);
  return { guard: readAuthorityCreateGuard(marker, storage), rejected, needsFreshRead: rejected };
}
