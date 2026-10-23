import { afterEach, describe, expect, it, vi } from "vitest";
import { budgetAmountExact, budgetEstimateExact, coversBudgetMinimum, formatBudgetAmount,
  minimumBudgetCheckAmount, sameBudgetAmount, validBudgetMinimum } from "../../../src/platform/procurement-budget-amount";
import { listBudgetQueue, recordBudgetCheck, type BudgetDecision } from "../../../src/platform/procurement-budget-api";

const company = "11111111-1111-4111-8111-111111111111";
const request = "22222222-2222-4222-8222-222222222222";
const check = "33333333-3333-4333-8333-333333333333";
const queueRecord = (exact?: unknown, minimum?: unknown) => ({
  id: request, number: "PR-1042", purpose: "Equipment", currencyCode: "ZMW",
  submittedAt: "2026-10-23T09:00:00Z", version: 2, approvalState: "Submitted",
  createdBy: company, estimatedAmount: 99999999999999.98,
  ...(exact === undefined ? {} : { estimatedAmountExact: exact }),
  ...(minimum === undefined ? {} : { minimumCheckedAmountExact: minimum }),
});
const decision = (amount: unknown): BudgetDecision => ({
  requestVersion: 2, financeCheckRef: "FIN-1042", status: "Available",
  checkedAmount: amount as string, currencyCode: "ZMW", evidenceRef: "EVID-1042",
  decisionReason: null, reservationRef: "RES-1042", reservationStatus: "Confirmed",
});
const json = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200, headers: { "Content-Type": "application/json" },
});

afterEach(() => vi.unstubAllGlobals());

describe("exact Finance budget amounts", () => {
  it("preserves numeric(18,4) whole and fractional digits in display and equality", () => {
    expect(budgetAmountExact("99999999999999.9999")).toBe(true);
    const displayed = formatBudgetAmount("99999999999999.9999", "ZMW");
    expect(displayed).toContain(".9999");
    expect(displayed.replace(/\D/g, "")).toBe("999999999999999999");
    expect(formatBudgetAmount("0.0001", "ZMW")).toBe("ZMW 0.0001");
    expect(sameBudgetAmount("1.23", "1.2300")).toBe(true);
    expect(sameBudgetAmount("1.2301", "1.23")).toBe(false);
    expect(budgetAmountExact(99999999999999.9999)).toBe(false);
    expect(budgetAmountExact("1.00001")).toBe(false);
    expect(budgetEstimateExact("1.00000001")).toBe(true);
    expect(budgetEstimateExact("1.000000001")).toBe(false);
    expect(formatBudgetAmount("0.00000001", "ZMW")).toBe("ZMW 0.00000001");
  });

  it("requires the real upward numeric(18,4) coverage minimum without rounding down", () => {
    expect(minimumBudgetCheckAmount("0.00000001")).toBe("0.0001");
    expect(minimumBudgetCheckAmount("1.0001")).toBe("1.0001");
    expect(minimumBudgetCheckAmount("1.00010001")).toBe("1.0002");
    expect(minimumBudgetCheckAmount("99999999999999.99990001")).toBeNull();
    expect(validBudgetMinimum("0.00000001", "0.0001")).toBe(true);
    expect(validBudgetMinimum("0.00000001", "0.0000")).toBe(false);
    expect(coversBudgetMinimum("0.0001", "0.0001")).toBe(true);
    expect(coversBudgetMinimum("0", "0.0001")).toBe(false);
    expect(coversBudgetMinimum(0.0001, "0.0001")).toBe(false);
  });

  it("reads an old numeric-only queue row without manufacturing an exact amount", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(json({
      records: [queueRecord()], count: 1, limit: 50, offset: 0,
    })));
    const page = await listBudgetQueue(company);
    expect(page.records[0].estimatedAmountExact).toBeUndefined();
    expect(formatBudgetAmount(page.records[0].estimatedAmountExact, "ZMW")).toBe("Exact amount unavailable");
  });

  it("sends exact text as a JSON string, and requires exact confirmation", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({
      id: check, requestVersion: 2, financeCheckRef: "FIN-1042", status: "Available",
      checkedAmount: 99999999999999.98, checkedAmountExact: "99999999999999.9999",
    }));
    vi.stubGlobal("fetch", fetcher);
    const result = await recordBudgetCheck(company, request, decision("99999999999999.9999"));
    expect(result.checkedAmountExact).toBe("99999999999999.9999");
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).checkedAmount)
      .toBe("99999999999999.9999");
  });

  it("blocks missing, numeric, and malformed command amounts before POST", async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);
    for (const amount of [undefined, 1.0001, "1.00001", "999999999999999.0000"]) {
      await expect(recordBudgetCheck(company, request, decision(amount))).rejects.toThrow("exact request amount");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not accept a numeric-only or mismatched write response as confirmed", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ id: check, requestVersion: 2, financeCheckRef: "FIN-1042", status: "Available", checkedAmount: 0.0001 }))
      .mockResolvedValueOnce(json({ id: check, requestVersion: 2, financeCheckRef: "FIN-1042", status: "Available", checkedAmountExact: "0.0002" }));
    vi.stubGlobal("fetch", fetcher);
    await expect(recordBudgetCheck(company, request, decision("0.0001"))).rejects.toThrow("did not confirm");
    await expect(recordBudgetCheck(company, request, decision("0.0001"))).rejects.toThrow("did not confirm");
  });

  it("rejects malformed exact queue strings instead of trusting the rounded number", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(json({
      records: [queueRecord("1.000000001")], count: 1, limit: 50, offset: 0,
    })));
    await expect(listBudgetQueue(company)).rejects.toThrow("invalid Finance review list");
  });

  it("rejects a server minimum that rounds the exact estimate down", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(json({
      records: [queueRecord("0.00000001", "0.0000")], count: 1, limit: 50, offset: 0,
    })));
    await expect(listBudgetQueue(company)).rejects.toThrow("invalid Finance review list");
  });
});
