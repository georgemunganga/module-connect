import { afterEach, describe, expect, it, vi } from "vitest";
import { budgetCheckMatches, listBudgetChecks, listBudgetQueue, recordBudgetCheck, type BudgetDecision } from "../../src/platform/procurement-budget-api";
import { budgetAmountCoversSource, budgetSourceAmount, defaultBudgetCheckedAmount, parseBudgetJson } from "../../src/platform/procurement-budget-exact";
import { parseInvoiceOriginalJson } from "../../src/platform/procurement-invoice-json";
const company = "11111111-1111-4111-8111-111111111111", request = "22222222-2222-4222-8222-222222222222", checkId = "33333333-3333-4333-8333-333333333333";
const decision = (): BudgetDecision => ({ requestVersion: 5, financeCheckRef: "FIN-1", status: "Available", checkedAmount: "12345678901234.5678",
  currencyCode: "ZMW", evidenceRef: "finance/checks/1", decisionReason: null, reservationRef: "RES-1", reservationStatus: "Confirmed" });
function rawCheck(amount = "12345678901234.5678", version = 3) { return `{"id":"${checkId}","requestVersion":${version},"financeCheckRef":"FIN-1","status":"Available","checkedAmount":${amount},"currencyCode":"ZMW","checkedAt":"2026-10-20T12:00:00Z","checkedBySubjectId":"checker","evidenceRef":"finance/checks/1","decisionReason":null,"reservationRef":"RES-1","reservationStatus":"Confirmed","checkerIdentitySchemaVersion":1,"checkedByWorkerId":"${checkId}"}`; }
function queue(amount = "12345678901234.56780001", business = '"businessVersion":3,') {
  const purpose = JSON.stringify('Escaped "checkedAmount":12345678901234.5678');
  return `{"records":[{"id":"${request}","number":"PR-1","purpose":${purpose},"currencyCode":"ZMW","submittedAt":"2026-10-20T10:00:00Z","version":5,${business}"approvalState":"PendingPolicyAndBudget","createdBy":"requester","estimatedAmount":${amount}}],"count":1,"limit":50,"offset":0}`;
}
function respond(raw: string) { const fetch = vi.fn().mockResolvedValue(new Response(raw)); vi.stubGlobal("fetch", fetch); return fetch; }
afterEach(() => vi.unstubAllGlobals());
describe("exact budget transport and reviewed amount", () => {
  it("preserves raw numeric8dp queue amounts, escaped text and separate current/business versions", async () => {
    respond(queue()); const result = await listBudgetQueue(company);
    expect(result.records[0].estimatedAmount).toBe("12345678901234.56780001"); expect(result.records[0].version).toBe(5); expect(result.records[0].businessVersion).toBe(3);
    expect(result.records[0].purpose).toBe('Escaped "checkedAmount":12345678901234.5678');
  });
  it("reads raw18,4 check amounts without roundtrip through financial JS numbers", async () => {
    respond(`{"records":[${rawCheck()}]}`); const result = await listBudgetChecks(company, request);
    expect(result[0].checkedAmount).toBe("12345678901234.5678"); expect(result[0].requestVersion).toBe(3);
    expect(result[0]).not.toHaveProperty("checkedByWorkerId"); // Additive server identity is never command input/authority.
  });
  it("defaults only exactly representable source amounts, with no implicit ceiling or currency rounding", () => {
    expect(defaultBudgetCheckedAmount("12345678901234.5678")).toBe("12345678901234.5678");
    expect(defaultBudgetCheckedAmount("0.00010001")).toBe(""); expect(defaultBudgetCheckedAmount("0.00000001")).toBe("");
    expect(defaultBudgetCheckedAmount("100000000000000")).toBe(""); expect(defaultBudgetCheckedAmount("1.23000000")).toBe("1.23");
    expect(budgetSourceAmount("1E-8")).toBe("0.00000001");
  });
  it("compares full8dp source coverage exactly, including wide midpoint edges", () => {
    expect(budgetAmountCoversSource("0.0001", "0.00010001")).toBe(false);
    expect(budgetAmountCoversSource("0.0002", "0.00010001")).toBe(true);
    expect(budgetAmountCoversSource("12345678901234.5678", "12345678901234.56780001")).toBe(false);
    expect(budgetAmountCoversSource("12345678901234.5679", "12345678901234.56780001")).toBe(true);
  });
  it("blocks underfunded or overprecision decisions before any POST for all outcomes", async () => {
    const fetch = respond(rawCheck());
    for (const status of ["Available", "Insufficient", "PartiallyAvailable", "NotConfigured"] as const)
      await expect(recordBudgetCheck(company, request, { ...decision(), status }, "12345678901234.56780001", 3)).rejects.toThrow("full exact");
    await expect(recordBudgetCheck(company, request, { ...decision(), checkedAmount: "0.00010001" }, "0.0001", 3)).rejects.toThrow("four decimal");
    await expect(recordBudgetCheck(company, request, { ...decision(), checkedAmount: 12345678901234.568 as unknown as string }, "1", 3)).rejects.toThrow("four decimal");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends exact checked text/current CAS only and validates returned business version separately", async () => {
    const fetch = respond(rawCheck()); const result = await recordBudgetCheck(company, request, decision(), "12345678901234.5678", 3);
    expect(result.requestVersion).toBe(3); expect(result.checkedAmount).toBe("12345678901234.5678");
    const body = JSON.parse(fetch.mock.calls[0][1].body); expect(body.requestVersion).toBe(5); expect(body.checkedAmount).toBe("12345678901234.5678");
    expect(body).not.toHaveProperty("businessVersion"); expect(body).not.toHaveProperty("checkedByWorkerId");
    expect(fetch.mock.calls[0][1].headers.get("X-Shell-Entity")).toBe(company);
  });
  it("requires the real business version rather than defaulting an older queue to CAS", async () => {
    respond(queue("1", "")); await expect(listBudgetQueue(company)).rejects.toThrow("business version");
    respond(queue("1", '"businessVersion":9007199254740992,')); await expect(listBudgetQueue(company)).rejects.toThrow("business version");
    const fetch = respond(rawCheck()); await expect(recordBudgetCheck(company, request, decision(), "1", 0)).rejects.toThrow("business version"); expect(fetch).not.toHaveBeenCalled();
  });
  it("treats mismatched recorded amounts or business versions as unconfirmed", async () => {
    respond(rawCheck("12345678901234.5679")); await expect(recordBudgetCheck(company, request, decision(), "1", 3)).rejects.toThrow("not confirm");
    respond(rawCheck("12345678901234.5678", 5)); await expect(recordBudgetCheck(company, request, decision(), "1", 3)).rejects.toThrow("not confirm");
  });
  it("has no automatic retry after unknown save and history matching proves only recorded content", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("Disconnected")); vi.stubGlobal("fetch", fetch);
    await expect(recordBudgetCheck(company, request, decision(), "1", 3)).rejects.toThrow("not confirmed"); expect(fetch).toHaveBeenCalledTimes(1);
    const reads = respond(`{"records":[${rawCheck()}]}`); const history = await listBudgetChecks(company, request);
    expect(budgetCheckMatches(history[0], decision(), 3)).toBe(true); expect(budgetCheckMatches(history[0], decision(), 5)).toBe(false);
    expect(reads).toHaveBeenCalledTimes(1); expect(reads.mock.calls[0][1].method ?? "GET").toBe("GET");
  });
  it("shares the bounded string-aware lexer without changing invoice default precision/keys", () => {
    expect(parseBudgetJson('{"estimatedAmount":1e-8,"checkedAmount":1.2300,"description":"checkedAmount:12345678901234.5678"}'))
      .toEqual({ estimatedAmount: "0.00000001", checkedAmount: "1.23", description: "checkedAmount:12345678901234.5678" });
    expect(parseInvoiceOriginalJson('{"quantity":1,"unitPrice":12345678901234.5678,"netAmount":12345678901234.5678}'))
      .toEqual({ quantity: "1", unitPrice: "12345678901234.5678", netAmount: "12345678901234.5678" });
    expect(() => parseInvoiceOriginalJson('{"netAmount":0.00010001}')).toThrow();
    for (const raw of ['{"estimatedAmount":1e-9}', '{"checkedAmount":0.00010001}', '{"estimatedAmount":1,"estimatedAmount":2}', '{"estimatedAmount":null}', '[}'.repeat(30)])
      expect(() => parseBudgetJson(raw)).toThrow();
  });
});
