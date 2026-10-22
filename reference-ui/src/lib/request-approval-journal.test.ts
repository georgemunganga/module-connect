import { describe, expect, it } from "vitest";
import { approvalJournalSlot, claimApprovalJournal, confirmApprovalJournal, readApprovalJournal,
  validApprovalLocator, type ApprovalJournalScope, type ApprovalLocator } from "./request-approval-journal";
const id = (n: number) => `${n.toString().padStart(8, "0")}-1111-4111-8111-111111111111`;
const scope: ApprovalJournalScope = { tenantId: "actual-tenant", principalId: id(1), companyId: id(2), branchId: id(3), browserTabNonce: id(4) };
const locator: ApprovalLocator = { locatorSchemaVersion: 1, operation: "Open", key: id(5), requestId: id(6), caseId: null,
  assignmentId: null, expectedRequestVersion: 4, expectedCaseVersion: null, expectedAssignmentVersion: null, fingerprint: "a".repeat(64) };
function storage() { const data = new Map<string, string>(); return { data, getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } }; }
describe("actor-owned PR locator journal", () => {
  it("claims before POST, reads after reload, and refuses a second command", () => {
    const store = storage(); expect(claimApprovalJournal(scope, locator, store)).toBe(true);
    expect(readApprovalJournal(scope, "Open", store)).toEqual({ pending: locator, blocked: true });
    expect(claimApprovalJournal(scope, { ...locator, key: id(7) }, store)).toBe(false);
    expect([...store.data.values()].join()).not.toMatch(/reason|payload|credential/);
  });
  it.each(["tenantId", "principalId", "companyId", "branchId", "browserTabNonce"] as const)("does not expose or unlock another %s", field => {
    const store = storage(); claimApprovalJournal(scope, locator, store);
    const other = { ...scope, [field]: field === "tenantId" ? "different-tenant" : id(8) };
    expect(readApprovalJournal(other, "Open", store)).toEqual({ pending: null, blocked: false });
    expect(confirmApprovalJournal(other, locator, store)).toBe(false);
    expect(readApprovalJournal(scope, "Open", store).pending).toEqual(locator);
  });
  it("unknown/malformed storage blocks instead of clearing or replacing", () => {
    const store = storage(), key = approvalJournalSlot(scope, "Open"); store.setItem(key, "invalid");
    expect(readApprovalJournal(scope, "Open", store)).toEqual({ pending: null, blocked: true });
    expect(claimApprovalJournal(scope, locator, store)).toBe(false); expect(store.getItem(key)).toBe("invalid");
  });
  it("storage rejection or incorrect readback cannot authorize POST", () => {
    const denied = { getItem: () => null, setItem: () => { throw Error("denied"); }, removeItem: () => {} };
    expect(claimApprovalJournal(scope, locator, denied)).toBe(false);
    const dropped = { ...denied, setItem: () => {} }; expect(claimApprovalJournal(scope, locator, dropped)).toBe(false);
  });
  it("requires the exact original locator to release after validated acknowledgement", () => {
    const store = storage(); claimApprovalJournal(scope, locator, store);
    expect(confirmApprovalJournal(scope, { ...locator, fingerprint: "b".repeat(64) }, store)).toBe(false);
    expect(confirmApprovalJournal(scope, locator, store)).toBe(true);
    expect(readApprovalJournal(scope, "Open", store).blocked).toBe(false);
  });
  it("rejects extra fields, zero UUIDs and unbound decision locators", () => {
    expect(validApprovalLocator({ ...locator, reason: "must never be saved" })).toBe(false);
    expect(validApprovalLocator({ ...locator, operation: "Decide" })).toBe(false);
    expect(validApprovalLocator({ ...locator, key: "00000000-0000-0000-0000-000000000000" })).toBe(false);
  });
});

it("browser-tab nonce survives reload reads and seals old markers on public auth invalidation", async () => {
  const { vi } = await import("vitest");
  const store = storage(), local = storage(), host = new EventTarget();
  vi.stubGlobal("window", host); vi.stubGlobal("sessionStorage", store); vi.stubGlobal("localStorage", local);
  try {
    const { approvalBrowserTabNonce } = await import("./request-approval-journal");
    const nonce = approvalBrowserTabNonce(scope.tenantId, scope.principalId);
    expect(nonce).not.toBeNull(); expect(approvalBrowserTabNonce(scope.tenantId, scope.principalId)).toBe(nonce);
    const original = { ...scope, browserTabNonce: nonce! }; expect(claimApprovalJournal(original, locator, store)).toBe(true);
    host.dispatchEvent(new Event("erp:auth-context-changed"));
    const next = approvalBrowserTabNonce(scope.tenantId, scope.principalId); expect(next).not.toBe(nonce);
    expect(readApprovalJournal(original, "Open", store).pending).toEqual(locator);
    expect(readApprovalJournal({ ...scope, browserTabNonce: next! }, "Open", store).pending).toBeNull();
    local.setItem("erp.auth-context.v1", "a-public-login-change");
    expect(approvalBrowserTabNonce(scope.tenantId, scope.principalId)).not.toBe(next);
  } finally { vi.unstubAllGlobals(); }
});
