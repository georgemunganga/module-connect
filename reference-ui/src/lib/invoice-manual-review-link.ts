/** Nonsecret historical locator; the API still authorizes every detail read. */
const prefix = "procurement:manual-unit-review:recorded:v1:";
const guid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/;
export function readManualReviewLink(scope: string): string | null {
  try { const value = sessionStorage.getItem(prefix + scope); return value && guid.test(value) ? value : null; }
  catch { return null; }
}
/** Save before clearing a pending Open key, so reload can still reach the reviewed record. */
export function rememberManualReviewLink(scope: string, reviewId: string): boolean {
  if (!guid.test(reviewId)) return false;
  try { sessionStorage.setItem(prefix + scope, reviewId); return sessionStorage.getItem(prefix + scope) === reviewId; }
  catch { return false; }
}
