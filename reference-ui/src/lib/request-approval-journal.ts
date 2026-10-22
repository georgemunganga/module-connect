import { AUTH_CONTEXT_KEY, observeAuthContext } from "./auth-context-invalidation";

import type { ApprovalOperation, ApprovalJournalScope, ApprovalLocator } from "../../../shared/procurement-approval-command";
export type { ApprovalOperation, ApprovalJournalScope, ApprovalLocator } from "../../../shared/procurement-approval-command";
export type ApprovalJournalState = { pending: ApprovalLocator | null; blocked: boolean };
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const approvalJournalPrefix = "erp.procurement.pr-command.v1:";
const nonceKey = "erp.procurement.pr-browser-tab.v1";
export const approvalJournalEvent = "erp:pr-command-journal-changed";
const guid = (v: unknown): v is string => typeof v === "string" && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(v)
  && v !== "00000000-0000-0000-0000-000000000000";
const positive = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: object, names: string[]) => Object.keys(v).length === names.length && Object.keys(v).every(k => names.includes(k));
export function validApprovalScope(v: unknown): v is ApprovalJournalScope {
  return object(v) && keys(v, ["tenantId", "principalId", "companyId", "branchId", "browserTabNonce"])
    && typeof v.tenantId === "string" && v.tenantId.length > 0 && v.tenantId.length <= 300 && !/[\u0000-\u001f\u007f]/.test(v.tenantId)
    && guid(v.principalId) && guid(v.companyId) && (v.branchId === null || guid(v.branchId)) && guid(v.browserTabNonce);
}
export function validApprovalLocator(v: unknown): v is ApprovalLocator {
  if (!object(v) || !keys(v, ["locatorSchemaVersion", "operation", "key", "requestId", "caseId", "assignmentId", "expectedRequestVersion", "expectedCaseVersion", "expectedAssignmentVersion", "fingerprint"])
    || v.locatorSchemaVersion !== 1 || !guid(v.key) || !guid(v.requestId) || !positive(v.expectedRequestVersion)
    || typeof v.fingerprint !== "string" || !/^[a-f\d]{64}$/.test(v.fingerprint)) return false;
  return v.operation === "Open" ? v.caseId === null && v.assignmentId === null && v.expectedCaseVersion === null && v.expectedAssignmentVersion === null
    : v.operation === "Decide" && guid(v.caseId) && guid(v.assignmentId) && positive(v.expectedCaseVersion) && positive(v.expectedAssignmentVersion);
}
export function approvalJournalSlot(scope: ApprovalJournalScope, operation: ApprovalOperation): string {
  if (!validApprovalScope(scope) || !["Open", "Decide"].includes(operation)) throw new Error("Approval recovery context is unavailable.");
  return approvalJournalPrefix + JSON.stringify([scope.tenantId, scope.principalId, scope.companyId, scope.branchId, scope.browserTabNonce, operation]);
}
export function readApprovalJournal(scope: ApprovalJournalScope, operation: ApprovalOperation, storage: Store = sessionStorage): ApprovalJournalState {
  try {
    const raw = storage.getItem(approvalJournalSlot(scope, operation));
    if (raw === null) return { pending: null, blocked: false };
    if (raw.length > 4096) return { pending: null, blocked: true };
    const v: unknown = JSON.parse(raw);
    if (!object(v) || !keys(v, ["scope", "locator"]) || !validApprovalScope(v.scope)
      || JSON.stringify(v.scope) !== JSON.stringify(scope) || !validApprovalLocator(v.locator) || v.locator.operation !== operation)
      return { pending: null, blocked: true };
    return { pending: v.locator, blocked: true };
  } catch { return { pending: null, blocked: true }; }
}
export function claimApprovalJournal(scope: ApprovalJournalScope, locator: ApprovalLocator, storage: Store = sessionStorage): boolean {
  if (!validApprovalLocator(locator) || readApprovalJournal(scope, locator.operation, storage).blocked) return false;
  try {
    const slot = approvalJournalSlot(scope, locator.operation), text = JSON.stringify({ scope, locator });
    storage.setItem(slot, text);
    return storage.getItem(slot) === text && JSON.stringify(readApprovalJournal(scope, locator.operation, storage).pending) === JSON.stringify(locator);
  } catch { return false; }
}
/** Caller may invoke only after a strictly bound persisted result/acknowledgement. Never clear on error/history. */
export function confirmApprovalJournal(scope: ApprovalJournalScope, locator: ApprovalLocator, storage: Store = sessionStorage): boolean {
  const saved = readApprovalJournal(scope, locator.operation, storage).pending;
  if (!saved || JSON.stringify(saved) !== JSON.stringify(locator)) return false;
  try { const slot = approvalJournalSlot(scope, locator.operation); storage.removeItem(slot); return storage.getItem(slot) === null; }
  catch { return false; }
}
export async function approvalPayloadFingerprint(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(v => v.toString(16).padStart(2, "0")).join("");
}
let observing = false;
/** A browser-tab partition only, never a server session ID or an authentication grant.
 * Public auth invalidation seals prior nonce journals; they are never deleted. */
export function approvalBrowserTabNonce(tenantId: string, principalId: string): string | null {
  try {
    if (!observing) {
      observeAuthContext(window, () => {
        try { sessionStorage.removeItem(nonceKey); } catch { /* New claims fail closed. Existing journals remain. */ }
        window.dispatchEvent(new Event(approvalJournalEvent));
      }); observing = true;
    }
    const signal = localStorage.getItem(AUTH_CONTEXT_KEY);
    if (signal !== null && signal.length > 1024) return null;
    const raw = sessionStorage.getItem(nonceKey);
    if (raw !== null) {
      if (raw.length > 2048) return null;
      const saved: unknown = JSON.parse(raw);
      if (!object(saved) || !keys(saved, ["nonce", "tenantId", "principalId", "authSignal"]) || !guid(saved.nonce)) return null;
      if (saved.tenantId === tenantId && saved.principalId === principalId && saved.authSignal === signal) return saved.nonce;
    }
    const nonce = crypto.randomUUID(), text = JSON.stringify({ nonce, tenantId, principalId, authSignal: signal });
    sessionStorage.setItem(nonceKey, text);
    return sessionStorage.getItem(nonceKey) === text ? nonce : null;
  } catch { return null; }
}
