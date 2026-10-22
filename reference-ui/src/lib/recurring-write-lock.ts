/** Only an opaque marker is retained: no purchase inputs, amounts or personal data. */
const prefix = "erp.procurement.recurring-write.v1:";
export function recurringWriteLocked(scope: string): boolean {
  try { return sessionStorage.getItem(prefix + scope) !== null; }
  catch { return true; }
}
export function claimRecurringWrite(scope: string): boolean {
  try {
    if (recurringWriteLocked(scope)) return false;
    sessionStorage.setItem(prefix + scope, "unconfirmed");
    return sessionStorage.getItem(prefix + scope) === "unconfirmed";
  } catch { return false; }
}
export function confirmRecurringWrite(scope: string): void {
  try { sessionStorage.removeItem(prefix + scope); }
  catch { /* Remain blocked when browser storage is unavailable. */ }
}
