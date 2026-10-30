import { afterEach, expect, it, vi } from "vitest";
import { captureManualPaymentScope, ManualPaymentApiError, recoverManualPaymentCommand, sendManualPaymentCommand,
  readManualPaymentValidationAcknowledgment, manualPaymentValidationAcknowledgmentMatches,
  type ManualPaymentCommand, type ManualPaymentIdentity } from "../../../src/platform/procurement-manual-payments-api";
import { createManualPaymentRecoveryJournal } from "./manual-payment-command-journal";
import { sendManualPaymentOnce } from "./manual-payment-command";

const company = "11111111-1111-4111-8111-111111111111";
const branch = "22222222-2222-4222-8222-222222222222";
const actor = "33333333-3333-4333-8333-333333333333";
const invoice = "44444444-4444-4444-8444-444444444444";
const payment = "55555555-5555-4555-8555-555555555555";
const key = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const nonce = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const locator = { key, action: "Create" as const, id: null };
const receipt = { id: payment, version: 1, status: "Draft", action: "Create", commandKey: key, amountExact: "10" };
const command = (): ManualPaymentCommand => ({ action: "Create", key, input: { branchId: branch,
  invoiceId: invoice, amountExact: "10", approverPrincipalId: actor, recorderPrincipalId: actor,
  confirmerPrincipalId: invoice, purpose: null, title: null } });
function fixture() {
  let identity: ManualPaymentIdentity = { tenantId: "tenant", legalEntityId: company,
    principalId: actor, branchId: branch, authEpoch: 1 };
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ entityId: company, branch }) });
  const scope = captureManualPaymentScope(identity, () => identity);
  const map = new Map<string, string>();
  const store = { getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } };
  const journal = createManualPaymentRecoveryJournal(scope, store, nonce);
  return { scope, map, store, journal, changeScope: () => { identity = { ...identity, authEpoch: 2 }; } };
}
afterEach(() => vi.unstubAllGlobals());

it.each([400, 401, 403, 404, 409, 422, 500, 503])("retains the exact key for an unproven HTTP %s, without retry", async status => {
  const f = fixture(); const fetcher = vi.fn().mockResolvedValue(Response.json({ code: "proxy-or-unknown", message: "Unconfirmed" }, { status }));
  vi.stubGlobal("fetch", fetcher);
  await expect(sendManualPaymentOnce(f.scope, f.journal, command())).rejects.toMatchObject({ status });
  expect(f.journal.state()).toEqual({ pending: locator, blocked: true });
  expect(f.journal.canReviewEntries()).toBe(false);
  expect(f.journal.acknowledgeValidation(locator)).toBe(false);
  await expect(sendManualPaymentOnce(f.scope, f.journal, { ...command(), key: payment })).rejects.toThrow(/saved command/);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("recovers a lost response by the original key GET and clears only its bound parsed receipt", async () => {
  const f = fixture(); const fetcher = vi.fn().mockRejectedValueOnce(new Error("network lost"))
    .mockResolvedValueOnce(Response.json(receipt));
  vi.stubGlobal("fetch", fetcher);
  await expect(sendManualPaymentOnce(f.scope, f.journal, command())).rejects.toMatchObject({ status: 0 });
  expect(f.journal.state().pending).toEqual(locator);
  const result = await recoverManualPaymentCommand(f.scope, { key, action: "Create" });
  expect(f.journal.confirm(locator, result)).toBe(true);
  expect(f.journal.state().blocked).toBe(false);
  expect(fetcher.mock.calls[1][0]).toBe(`/api/procurement/v1/manual-payments/commands/${key}`);
  expect(fetcher.mock.calls[1][1].method).toBeUndefined();
  expect(fetcher.mock.calls.filter(([, input]) => input.method === "POST")).toHaveLength(1);
});

it("requires explicit review after a live exact first-send validation rejection", async () => {
  const f = fixture(); const original = command();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: "payment-state-changed", message: "Enter valid payment details and exact amounts before trying again." }, { status: 422 })));
  await expect(sendManualPaymentOnce(f.scope, f.journal, original)).rejects.toMatchObject({ status: 422 });
  expect(f.journal.state().pending).toEqual(locator);
  expect(f.journal.canReviewEntries()).toBe(true);
  expect(f.journal.acknowledgeValidation({ ...locator, key: payment })).toBe(false);
  expect(f.journal.acknowledgeValidation(locator)).toBe(true);
  expect(f.journal.state().blocked).toBe(false);
});

it("a caller-created error or GET422 cannot grant review/clear authority", async () => {
  const f = fixture(); const original = command(); expect(f.journal.claim(locator)).toBe(true);
  expect(f.journal.reportValidation(locator, new ManualPaymentApiError(422, "Forged", "payment-state-changed"), original)).toBe(false);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: "payment-state-changed", message: "Not a mutation result" }, { status: 422 })));
  let error: unknown; try { await recoverManualPaymentCommand(f.scope, { key, action: "Create" }); } catch (cause) { error = cause; }
  expect(f.journal.reportValidation(locator, error, original)).toBe(false);
  expect(f.journal.acknowledgeValidation(locator)).toBe(false);
  expect(f.journal.state().pending).toEqual(locator);
});

it("binds validation reporting to exact command body and original scope", async () => {
  const f = fixture(); const original = command();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: "payment-state-changed", message: "Enter valid payment details and exact amounts before trying again." }, { status: 422 })));
  expect(f.journal.claim(locator)).toBe(true);
  let error: unknown; try { await sendManualPaymentCommand(f.scope, original); } catch (cause) { error = cause; }
  const changed = command(); if (changed.action === "Create") changed.input.amountExact = "11";
  expect(f.journal.reportValidation(locator, error, changed)).toBe(false);
  expect(f.journal.canReviewEntries()).toBe(false);
  expect(f.journal.reportValidation(locator, error, original)).toBe(true);
  expect(f.journal.canReviewEntries()).toBe(true);
  f.changeScope();
  expect(f.journal.reportValidation(locator, error, original)).toBe(false);
  expect(f.journal.acknowledgeValidation(locator)).toBe(false);
  expect(f.map.size).toBe(1);
});

it.each([201, 422])("preserves pending scope and prevents late HTTP %s cleanup after context changes", async status => {
  const f = fixture(); let finish!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; })));
  const pending = sendManualPaymentOnce(f.scope, f.journal, command());
  f.changeScope(); finish(Response.json(status === 201 ? receipt : { code: "payment-state-changed", message: "Validation" }, { status }));
  await expect(pending).rejects.toMatchObject({ status: 0 });
  expect(f.map.size).toBe(1);
  expect(f.journal.acknowledgeValidation(locator)).toBe(false);
});

it("does not create a pending key for local validation that sent no request", async () => {
  const f = fixture(); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const invalid = command(); if (invalid.action === "Create") invalid.input.amountExact = "-1";
  await expect(sendManualPaymentOnce(f.scope, f.journal, invalid)).rejects.toMatchObject({ status: 422 });
  expect(f.map.size).toBe(0); expect(fetcher).not.toHaveBeenCalled();
});

it.each([null, { ...receipt, commandKey: payment }, { ...receipt, status: "Paid" }])("keeps malformed or mismatched success pending", async body => {
  const f = fixture(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body, { status: 201 })));
  await expect(sendManualPaymentOnce(f.scope, f.journal, command())).rejects.toMatchObject({ status: 0 });
  expect(f.journal.state().pending).toEqual(locator); expect(f.journal.canReviewEntries()).toBe(false);
});

it("clears a pending key after a matching initial success without persisting sensitive fields", async () => {
  const f = fixture(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(receipt, { status: 201 })));
  expect((await sendManualPaymentOnce(f.scope, f.journal, command())).id).toBe(payment);
  expect(f.map.size).toBe(0);
});


it("same rejection code with a different message does not authorize clearing", async () => {
  const f = fixture(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
    code: "payment-state-changed", message: "Proxy changed the outcome" }, { status: 422 })));
  await expect(sendManualPaymentOnce(f.scope, f.journal, command())).rejects.toMatchObject({ status: 422 });
  expect(f.journal.canReviewEntries()).toBe(false);
  expect(f.journal.acknowledgeValidation(locator)).toBe(false);
  expect(f.journal.state().pending).toEqual(locator);
});

it("converts exact-body transport proof once into an opaque body-free acknowledgment", async () => {
  const f = fixture(); const original = command();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: "payment-state-changed",
    message: "Enter valid payment details and exact amounts before trying again." }, { status: 422 })));
  let error: unknown; try { await sendManualPaymentCommand(f.scope, original); } catch (cause) { error = cause; }
  const acknowledgment = readManualPaymentValidationAcknowledgment(error, f.scope, original);
  expect(acknowledgment).not.toBeNull(); expect(Object.keys(acknowledgment!)).toEqual([]);
  expect(JSON.stringify(acknowledgment)).toBe("{}");
  expect(manualPaymentValidationAcknowledgmentMatches(acknowledgment!, f.scope, locator)).toBe(true);
  expect(manualPaymentValidationAcknowledgmentMatches({}, f.scope, locator)).toBe(false);
  expect(readManualPaymentValidationAcknowledgment(error, f.scope, original)).toBeNull();
  f.changeScope();
  expect(manualPaymentValidationAcknowledgmentMatches(acknowledgment!, f.scope, locator)).toBe(false);
});
