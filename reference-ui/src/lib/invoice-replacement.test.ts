import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInvoiceReplacement, getInvoiceReplacementHistory, readInvoiceReplacementInput,
  recoverInvoiceReplacement, type InvoiceReplacementInput, type InvoiceReplacementResult,
  type InvoiceReplacementHistory } from "../../../src/platform/procurement-invoices-api";
import { invoiceReplacementJournal, type InvoiceReplacementScope,
  type InvoiceReplacementPending } from "./invoice-replacement-command-journal";

const company = "11111111-1111-4111-8111-111111111111", source = "22222222-2222-4222-8222-222222222222";
const successor = "33333333-3333-4333-8333-333333333333", key = "44444444-4444-4444-8444-444444444444";
const branch = "55555555-5555-4555-8555-555555555555", actor = "66666666-6666-4666-8666-666666666666";
const zero = "00000000-0000-0000-0000-000000000000";
const input: InvoiceReplacementInput = { sourceVersion: 4, reason: " Supplier issued correction ", correctedInvoice: {
  supplierId: "77777777-7777-4777-8777-777777777777", purchaseOrderId: "88888888-8888-4888-8888-888888888888",
  invoiceNumber: "CORRECTED-2026-01", invoiceDate: "2026-10-30", dueDate: "2026-11-30", currencyCode: "ZMW",
  intakeSchemaVersion: 2, expectedCurrencyReferenceId: "99999999-9999-4999-8999-999999999999",
  expectedCurrencyRevision: 1, expectedCalculationSha256: "a".repeat(64),
  lines: [{ description: "Supplies", quantity: "1", unitPrice: "5.1234", taxAmount: "0", costCenterRef: "HQ" }],
} };
const result: InvoiceReplacementResult = { schemaVersion: 1, sourceInvoiceId: source, successorInvoiceId: successor,
  linkId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", calculationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  captureReceiptId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", commandKey: key,
  invoiceNumber: "CORRECTED-2026-01", version: 1, status: "Received", canPostToFinance: false };
const history: InvoiceReplacementHistory = { schemaVersion: 1, linkId: result.linkId, sourceInvoiceId: source,
  successorInvoiceId: successor, sourceInvoiceNumber: "ORIGINAL-01", successorInvoiceNumber: result.invoiceNumber,
  sourceDisplayState: "SupersededByCorrection", successorStatus: "Received", commandKey: key,
  recordedAtUtc: "2026-10-30T08:00:00.1234567Z", originalResponseSha256: "f".repeat(64), canPostToFinance: false };
const scope: InvoiceReplacementScope = { tenantId: "test-tenant", companyId: company, branchId: branch,
  principalId: actor, sourceInvoiceId: source };
const command: InvoiceReplacementPending = { operation: "InvoiceReplaceV2", key, body: JSON.stringify(input, null, 2) };
function store() {
  const values = new Map<string, string>();
  const storage: Storage = { getItem: name => values.get(name) ?? null,
    setItem: (name, value) => { values.set(name, value); }, removeItem: name => { values.delete(name); },
    clear: () => values.clear(), key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; } };
  return { storage, values };
}
beforeEach(() => vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ entityId: company, branch }) }));
afterEach(() => vi.unstubAllGlobals());
const response = (value: unknown = result, status = 201) => new Response(JSON.stringify(value), { status });

describe("controlled invoice replacement adapter", () => {
  it("sends the original exact body once with the source/key and shared ERP scope", async () => {
    const fetcher = vi.fn().mockResolvedValue(response()); vi.stubGlobal("fetch", fetcher);
    expect(await createInvoiceReplacement(company, source, key, command.body)).toEqual(result);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`/api/procurement/v1/invoices/${source}/replacement`);
    expect(init).toMatchObject({ method: "POST", body: command.body, credentials: "include", cache: "no-store" });
    expect(init.headers.get("X-Shell-Entity")).toBe(company);
    expect(init.headers.get("X-Shell-Location")).toBe(branch);
    expect(init.headers.get("Idempotency-Key")).toBe(key);
    expect(init.headers.get("Content-Type")).toBe("application/json");
  });
  it("recovers the original raw201 response using GET only, without reconstructing or posting", async () => {
    const fetcher = vi.fn().mockResolvedValue(response()); vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    expect(await recoverInvoiceReplacement(company, source, key, controller.signal)).toEqual(result);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`/api/procurement/v1/invoices/${source}/replacement/commands/${key}`);
    expect(init.method).toBeUndefined(); expect(init.body).toBeUndefined(); expect(init.signal).toBe(controller.signal);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([200, 202, 204])("does not accept HTTP%s as the original201 confirmation", async status => {
    const fetcher = vi.fn().mockResolvedValue(status === 204 ? new Response(null, { status }) : response(result, status));
    vi.stubGlobal("fetch", fetcher);
    await expect(createInvoiceReplacement(company, source, key, command.body)).rejects.toMatchObject({ status: 0 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...result, sourceInvoiceId: successor }, { ...result, successorInvoiceId: source },
    { ...result, commandKey: source }, { ...result, calculationId: zero }, { ...result, captureReceiptId: undefined },
    { ...result, schemaVersion: 2 }, { ...result, version: 2 }, { ...result, status: "Paid" },
    { ...result, canPostToFinance: true }, { ...result, extra: "not-the-original-contract" },
    { recordedResult: result }, { ...result, invoiceNumber: "ANOTHER-INVOICE" },
  ])("leaves malformed or mismatched successful responses uncertain: %j", async value => {
    const fetcher = vi.fn().mockResolvedValue(response(value)); vi.stubGlobal("fetch", fetcher);
    await expect(createInvoiceReplacement(company, source, key, command.body)).rejects.toMatchObject({ status: 0 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("requires the original201 status on recovery even when a200 body looks correct", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(result, 200)); vi.stubGlobal("fetch", fetcher);
    await expect(recoverInvoiceReplacement(company, source, key)).rejects.toMatchObject({ status: 0 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("treats a lost response as uncertain without retrying", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("Network error")); vi.stubGlobal("fetch", fetcher);
    await expect(createInvoiceReplacement(company, source, key, command.body)).rejects.toMatchObject({ status: 0 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not turn malformed JSON into a confirmed operation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{invalid", { status: 201 })));
    await expect(recoverInvoiceReplacement(company, source, key)).rejects.toMatchObject({ status: 0 });
  });
  it.each([401, 403, 404, 409, 503])("preserves HTTP%s and its server error without a second request", async status => {
    const fetcher = vi.fn().mockResolvedValue(response({ code: "invoice-replacement-history-unavailable", message: "Review original" }, status));
    vi.stubGlobal("fetch", fetcher);
    await expect(recoverInvoiceReplacement(company, source, key)).rejects.toMatchObject({ status, code: "invoice-replacement-history-unavailable" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not interpret recovery404 as permission to release a pending command or issue another key", async () => {
    const { storage } = store(); expect(invoiceReplacementJournal.claim(scope, command, storage)).toBe(true);
    const fetcher = vi.fn().mockResolvedValue(response({ code: "not-found" }, 404)); vi.stubGlobal("fetch", fetcher);
    await expect(recoverInvoiceReplacement(company, source, key)).rejects.toMatchObject({ status: 404 });
    expect(invoiceReplacementJournal.read(scope, storage)).toEqual({ blocked: true, pending: command });
    expect(invoiceReplacementJournal.claim(scope, { ...command, key: successor }, storage)).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([source, successor])("loads the verified relation from either linked invoice %s", async invoiceId => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(history, 200)));
    expect(await getInvoiceReplacementHistory(company, invoiceId)).toEqual(history);
  });
  it.each([
    { ...history, sourceInvoiceId: branch }, { ...history, successorInvoiceId: source },
    { ...history, originalResponseSha256: "invalid" }, { ...history, canPostToFinance: true },
    { ...history, sourceDisplayState: "Paid" }, { ...history, successorStatus: "Posted" },
    { ...history, recordedAtUtc: "not-a-date" }, { ...history, recordedAtUtc: "2026-02-30T08:00:00Z" }, { ...history, commandKey: zero },
  ])("rejects foreign or corrupt relation history: %j", async value => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(value, 200)));
    await expect(getInvoiceReplacementHistory(company, source)).rejects.toMatchObject({ status: 0 });
  });
  it("rejects invalid references before making a request", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(createInvoiceReplacement(company, source, zero, command.body)).rejects.toMatchObject({ status: 422 });
    await expect(recoverInvoiceReplacement(company, "invalid", key)).rejects.toMatchObject({ status: 422 });
    await expect(getInvoiceReplacementHistory(company, zero)).rejects.toMatchObject({ status: 422 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses the shared company-switch protection instead of an independent scope fallback", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ entityId: successor, branch }) });
    await expect(createInvoiceReplacement(company, source, key, command.body)).rejects.toThrow("company changed");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("bounded replacement command body", () => {
  it("retains decimal strings without floating-point conversion", () => {
    const draft = structuredClone(input); draft.correctedInvoice.lines[0].unitPrice = "99999999999999.9999";
    expect(readInvoiceReplacementInput(JSON.stringify(draft)).correctedInvoice.lines[0].unitPrice).toBe("99999999999999.9999");
  });
  it.each([
    { ...input, sourceVersion: 0 }, { ...input, reason: " " }, { ...input, reason: "é".repeat(501) },
    { ...input, authorization: "must-not-be-retained" },
    { ...input, correctedInvoice: { ...input.correctedInvoice, currencyCode: "" } },
    { ...input, correctedInvoice: { ...input.correctedInvoice, purchaseOrderId: zero } },
    { ...input, correctedInvoice: { ...input.correctedInvoice, intakeSchemaVersion: 1 } },
    { ...input, correctedInvoice: { ...input.correctedInvoice, expectedCurrencyRevision: 0 } },
    { ...input, correctedInvoice: { ...input.correctedInvoice, expectedCalculationSha256: "" } },
    { ...input, correctedInvoice: { ...input.correctedInvoice, invoiceDate: "2026-02-30" } },
    { ...input, correctedInvoice: { ...input.correctedInvoice, dueDate: "2026-01-01" } },
    { ...input, correctedInvoice: { ...input.correctedInvoice, lines: [] } },
    { ...input, correctedInvoice: { ...input.correctedInvoice, lines: [{ description: "Goods", quantity: "0", unitPrice: "1", taxAmount: "0" }] } },
    { ...input, correctedInvoice: { ...input.correctedInvoice, lines: [{ ...input.correctedInvoice.lines[0], unitPrice: "1.12345" }] } },
    { ...input, correctedInvoice: { ...input.correctedInvoice, lines: [{ ...input.correctedInvoice.lines[0], headers: { Cookie: "not-allowed" } }] } },
  ])("rejects incomplete, out-of-bounds or credential-shaped input: %j", value => {
    expect(() => readInvoiceReplacementInput(JSON.stringify(value))).toThrow();
  });
});

describe("actor/company/branch/source-bound durable replacement journal", () => {
  it("retains the original exact bytes across another view, and releases only a matching confirmed201", () => {
    const { storage, values } = store();
    expect(invoiceReplacementJournal.claim(scope, command, storage)).toBe(true);
    expect(invoiceReplacementJournal.read({ ...scope }, storage)).toEqual({ blocked: true, pending: command });
    expect([...values.values()][0]).toContain("InvoiceReplaceV2");
    expect(invoiceReplacementJournal.confirm(scope, command, result, storage)).toBe(true);
    expect(invoiceReplacementJournal.read(scope, storage)).toEqual({ blocked: false, pending: null });
  });
  it.each([
    { ...scope, tenantId: "another-tenant" }, { ...scope, companyId: successor },
    { ...scope, branchId: successor }, { ...scope, principalId: successor }, { ...scope, sourceInvoiceId: successor },
  ])("never reveals or releases another identity/scope/source's pending command: %j", other => {
    const { storage } = store(); invoiceReplacementJournal.claim(scope, command, storage);
    expect(invoiceReplacementJournal.read(other, storage).pending).toBeNull();
    expect(invoiceReplacementJournal.confirm(other, command, result, storage)).toBe(false);
    expect(invoiceReplacementJournal.read(scope, storage).pending).toEqual(command);
  });
  it("treats differently cased GUIDs as the same scope rather than allowing a second journal", () => {
    const { storage } = store(); const mixed = { ...scope, sourceInvoiceId: result.linkId.toUpperCase() };
    expect(invoiceReplacementJournal.claim(mixed, command, storage)).toBe(true);
    expect(invoiceReplacementJournal.read({ ...mixed, sourceInvoiceId: result.linkId }, storage).pending).toEqual(command);
  });
  it("blocks another key, modified exact body and another operation while a command remains unresolved", () => {
    const { storage } = store(); invoiceReplacementJournal.claim(scope, command, storage);
    expect(invoiceReplacementJournal.claim(scope, { ...command, key: successor }, storage)).toBe(false);
    expect(invoiceReplacementJournal.confirm(scope, { ...command, body: JSON.stringify(input) }, result, storage)).toBe(false);
    expect(invoiceReplacementJournal.claim(scope, { ...command, operation: "CaptureV2" } as unknown as InvoiceReplacementPending, storage)).toBe(false);
    expect(invoiceReplacementJournal.read(scope, storage).pending).toEqual(command);
  });
  it.each([{ ...result, commandKey: successor }, { ...result, sourceInvoiceId: successor }, { ...result, canPostToFinance: true },
    { ...result, invoiceNumber: "ANOTHER-INVOICE" }, { ...result, version: 2 }])("does not clear a mismatched response: %j", receipt => {
    const { storage } = store(); invoiceReplacementJournal.claim(scope, command, storage);
    expect(invoiceReplacementJournal.confirm(scope, command, receipt as InvoiceReplacementResult, storage)).toBe(false);
    expect(invoiceReplacementJournal.read(scope, storage).pending).toEqual(command);
  });
  it.each([{ name: "corrupt", raw: "{corrupt" }, { name: "oversized", raw: " ".repeat(256_001) }, { name: "multibyte-overlimit", raw: "é".repeat(128_001) }])("leaves $name saved data blocked", ({ raw }) => {
    const { storage, values } = store(); invoiceReplacementJournal.claim(scope, command, storage);
    values.set([...values.keys()][0], raw);
    expect(invoiceReplacementJournal.read(scope, storage)).toEqual({ pending: null, blocked: true });
    expect(invoiceReplacementJournal.claim(scope, command, storage)).toBe(false);
    expect(invoiceReplacementJournal.confirm(scope, command, result, storage)).toBe(false);
  });
  it("rejects altered metadata or credential-shaped commands instead of repairing/deleting them", () => {
    const { storage, values } = store(); invoiceReplacementJournal.claim(scope, command, storage);
    const name = [...values.keys()][0]; const saved = JSON.parse(values.get(name)!);
    saved.scope.principalId = successor; values.set(name, JSON.stringify(saved));
    expect(invoiceReplacementJournal.read(scope, storage)).toEqual({ pending: null, blocked: true });
    expect(invoiceReplacementJournal.confirm(scope, command, result, storage)).toBe(false);
    const other = store(); expect(invoiceReplacementJournal.claim(scope,
      { ...command, token: "not-allowed" } as InvoiceReplacementPending, other.storage)).toBe(false);
  });
  it("blocks unavailable/quota-limited storage and failed removal without confirming completion", () => {
    const inaccessible = { ...store().storage, getItem: () => { throw new Error("denied"); } };
    expect(invoiceReplacementJournal.read(scope, inaccessible)).toEqual({ pending: null, blocked: true });
    const full = { ...store().storage, setItem: () => { throw new Error("quota"); } };
    expect(invoiceReplacementJournal.claim(scope, command, full)).toBe(false);
    const { storage } = store(); invoiceReplacementJournal.claim(scope, command, storage);
    expect(invoiceReplacementJournal.confirm(scope, command, result,
      { ...storage, removeItem: () => { throw new Error("denied"); } })).toBe(false);
    expect(invoiceReplacementJournal.read(scope, storage).pending).toEqual(command);
  });
  it("cannot save an invalid or unselected branch/company/source identity", () => {
    const { storage } = store();
    for (const invalid of [{ ...scope, branchId: "all" }, { ...scope, companyId: zero }, { ...scope, sourceInvoiceId: "" }]) {
      expect(invoiceReplacementJournal.read(invalid, storage)).toEqual({ pending: null, blocked: true });
      expect(invoiceReplacementJournal.claim(invalid, command, storage)).toBe(false);
    }
  });
});
