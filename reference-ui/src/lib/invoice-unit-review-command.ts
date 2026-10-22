/** A scoped nonsecret command locator, written before POST. Recovery is GET-only.
 * Reasons, attestation text, document content and money are never stored here. */
export type UnitReviewPending = { operation: "Open" | "Decision"; invoiceId: string; reviewId: string | null; key: string };
export type UnitReviewPendingState = { pending: UnitReviewPending | null; blocked: boolean };
const prefix = "procurement:invoice-unit-review:pending:v1:";
const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const valid = (v: unknown): v is UnitReviewPending => {
  if (!v || typeof v !== "object") return false;
  const x = v as Partial<UnitReviewPending>;
  return (x.operation === "Open" || x.operation === "Decision") && typeof x.invoiceId === "string" && uuid.test(x.invoiceId)
    && typeof x.key === "string" && uuid.test(x.key) && (x.reviewId === null || typeof x.reviewId === "string" && uuid.test(x.reviewId))
    && (x.operation !== "Decision" || x.reviewId !== null)
    && Object.keys(x).every((key) => ["operation", "invoiceId", "reviewId", "key"].includes(key));
};
export function readUnitReviewPending(scope: string): UnitReviewPendingState {
  try {
    const raw = sessionStorage.getItem(prefix + scope);
    if (raw === null) return { pending: null, blocked: false };
    const x: unknown = JSON.parse(raw);
    return valid(x) ? { pending: x, blocked: true } : { pending: null, blocked: true };
  } catch { return { pending: null, blocked: true }; }
}
export function claimUnitReviewPending(scope: string, value: UnitReviewPending): boolean {
  if (!valid(value) || readUnitReviewPending(scope).blocked) return false;
  try { const text = JSON.stringify(value); sessionStorage.setItem(prefix + scope, text); return sessionStorage.getItem(prefix + scope) === text; }
  catch { return false; }
}
export function clearUnitReviewPending(scope: string, value: UnitReviewPending): boolean {
  const current = readUnitReviewPending(scope);
  if (!current.pending || current.pending.key !== value.key || current.pending.operation !== value.operation) return false;
  try { sessionStorage.removeItem(prefix + scope); return sessionStorage.getItem(prefix + scope) === null; }
  catch { return false; }
}
