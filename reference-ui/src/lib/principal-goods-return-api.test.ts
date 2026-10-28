import { afterEach, describe, expect, it, vi } from "vitest";
import { assertReturnScope, getReturnDraft, listEligibleGoods, listReturnDrafts, readReturnAck, readReturnDetail, recoverReturnCommand, returnCommandPath, returnQuantity, returnText, sendReturnCommand, type ReturnCommand } from "./principal-goods-return-api";
import { ERP_SHELL_STORAGE_KEY } from "../../../shared/shell-scope";

const id = (n: number) => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const company = id(1), branch = id(2), draft = id(3), key = id(4);
const labels = { purchaseOrderNumber: "PO-14", supplierDisplayName: "Retained supplier", lineNumber: 1, description: "Verified goods", unitCode: "EA", currencyCode: "ZMW", deliveryNoteReference: "DN-1", receivedAt: "2026-10-25T10:00:00Z" };
const base = { id: draft, status: "Draft", version: 1, branchId: branch, receiptId: id(5), acceptanceFactId: id(6), purchaseOrderId: id(7), purchaseOrderLineId: id(8), acceptedFactQuantityExact: "1.0001", quantityExact: "0.5001", reason: "Wrong colour", evidenceReference: null, draftOnly: true, stockChanged: false, financeChanged: false, supplierNotified: false };
const detail = { ...base, labels, allowedActions: ["Edit", "Cancel"] };
const command: ReturnCommand = { operation: "Create", key, targetId: null, method: "POST", body: JSON.stringify({ acceptanceFactId: id(6), quantity: "0.5001", reason: "Wrong colour", evidenceReference: null }) };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());
function selectedBranch() { vi.stubGlobal("localStorage", { getItem: (key: string) => key === ERP_SHELL_STORAGE_KEY ? JSON.stringify({ entityId: company, branch }) : null }); }

describe("goods return source and command boundary", () => {
  it("compares exact 18,4 values without floating-point rounding or over-return", () => {
    expect(returnQuantity("0.0001", "0.0001")).toBe("0.0001");
    expect(returnQuantity("1.0000", "1")).toBe("1.0000");
    for (const bad of ["0", "0.0000", "1.0002", "1e-4", "0.00001", "-1", "999999999999999.0000"])
      expect(() => returnQuantity(bad, "1.0001")).toThrow();
    expect(returnText("  reason  ", "  REF  ")).toEqual({ reason: "reason", evidenceReference: "REF" });
    expect(() => returnText(" ")).toThrow();
    expect(() => returnText("R", "x".repeat(301))).toThrow();
  });
  it("accepts only bounded GET labels/actions and rejects private or forged effect claims", () => {
    expect(readReturnDetail(detail, draft).labels.purchaseOrderNumber).toBe("PO-14");
    expect(() => readReturnDetail({ ...detail, allowedActions: ["Dispatch"] })).toThrow();
    expect(() => readReturnDetail({ ...detail, labels: { ...labels, purchaseOrderNumber: id(7), receivedAt: "invalid" } })).toThrow();
    expect(() => readReturnDetail({ ...detail, stockChanged: true })).toThrow();
    expect(() => readReturnDetail({ ...detail, status: "Cancelled" })).toThrow();
    expect(() => readReturnAck(detail, command)).toThrow();
    expect(readReturnAck(base, command).id).toBe(draft);
  });
  it("requires explicit branch scope independent of receiving capability and uses exact endpoints", async () => {
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => json(url.includes("eligible-goods") ? { items: [{ acceptanceFactId: id(6), receiptId: id(5), purchaseOrderId: id(7), purchaseOrderLineId: id(8), branchId: branch, acceptedFactQuantityExact: "1.0001", labels }], hasMore: false, nextOffset: null } : { items: [detail], hasMore: false, nextOffset: null }));
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("localStorage", { getItem: () => null });
    await expect(listReturnDrafts(company, 0)).rejects.toThrow("branch");
    expect(fetcher).not.toHaveBeenCalled();
    selectedBranch();
    expect((await listEligibleGoods(company, 0)).items[0].labels.description).toBe("Verified goods");
    expect((await listReturnDrafts(company, 0)).items[0].allowedActions).toEqual(["Edit", "Cancel"]);
    expect(fetcher.mock.calls[0][0]).toContain("/eligible-goods?offset=0");
    expect((fetcher.mock.calls[0][1] as RequestInit).headers).toBeInstanceOf(Headers);
  });
  it("permits Company All only for verified collections, never detail, recovery or writes", async () => {
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ entityId: company, branchScope: "all" }) });
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => json({ items: [detail], hasMore: false, nextOffset: null }));
    vi.stubGlobal("fetch", fetcher);
    expect((await listReturnDrafts(company, 0)).items).toHaveLength(1);
    expect(((fetcher.mock.calls[0][1] as RequestInit).headers as Headers).get("X-Shell-Branch-Scope")).toBe("all");
    await expect(getReturnDraft(company, draft)).rejects.toThrow("permitted branch");
    await expect(recoverReturnCommand(company, command)).rejects.toThrow("permitted branch");
    await expect(sendReturnCommand(company, command)).rejects.toThrow("permitted branch");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("blocks a mounted editor after branch change or All selection", () => {
    selectedBranch(); expect(() => assertReturnScope(company, branch)).not.toThrow();
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ entityId: company, branch: id(9) }) });
    expect(() => assertReturnScope(company, branch)).toThrow("branch changed");
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ entityId: company, branchScope: "all" }) });
    expect(() => assertReturnScope(company, branch)).toThrow("branch changed");
  });
  it("sends one keyed write, recovers by GET only, and reloads current scoped detail", async () => {
    selectedBranch();
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => json(url.endsWith(`/commands/${key}`) ? base : url.endsWith(`/${draft}`) ? detail : base));
    vi.stubGlobal("fetch", fetcher);
    expect(returnCommandPath(command)).toBe("/api/procurement/v1/returns/principal-drafts");
    expect((await sendReturnCommand(company, command)).id).toBe(draft);
    expect((await recoverReturnCommand(company, command)).id).toBe(draft);
    expect((await getReturnDraft(company, draft)).allowedActions).toContain("Edit");
    expect(fetcher.mock.calls.map((call) => (call[1] as RequestInit).method)).toEqual(["POST", undefined, undefined]);
    expect((fetcher.mock.calls[0][1] as RequestInit).body).toBe(command.body);
    expect(((fetcher.mock.calls[0][1] as RequestInit).headers as Headers).get("Idempotency-Key")).toBe(key);
    expect(fetcher.mock.calls[1][0]).toContain(`/commands/${key}`);
  });
  it("rejects an acknowledgement with substituted target and pages claiming an invented total", async () => {
    selectedBranch();
    const revision: ReturnCommand = { operation: "Revise", key, targetId: draft, method: "PUT", body: JSON.stringify({ expectedRevision: 1, quantity: "0.4", reason: "R", evidenceReference: null }) };
    expect(() => readReturnAck({ ...base, id: id(9) }, revision)).toThrow();
    vi.stubGlobal("fetch", vi.fn(async () => json({ items: [detail], nextOffset: null, hasMore: false, total: 1 })));
    await expect(listReturnDrafts(company, 0)).rejects.toThrow("incomplete");
  });
  it("binds saved Create and Revise acknowledgements to the original exact command body", async () => {
    expect(() => readReturnAck({ ...base, acceptanceFactId: id(9) }, command)).toThrow("incomplete");
    expect(() => readReturnAck({ ...base, quantityExact: "0.5002" }, command)).toThrow("incomplete");
    expect(() => readReturnAck({ ...base, reason: "Substituted reason" }, command)).toThrow("incomplete");
    const revise: ReturnCommand = { operation: "Revise", key, targetId: draft, method: "PUT",
      body: JSON.stringify({ expectedRevision: 1, quantity: "0.1000", reason: "Changed", evidenceReference: "REF-1" }) };
    const revised = { ...base, version: 2, quantityExact: "0.1", reason: "Changed", evidenceReference: "REF-1" };
    expect(readReturnAck(revised, revise).version).toBe(2);
    expect(() => readReturnAck({ ...revised, version: 1 }, revise)).toThrow("incomplete");
    expect(() => readReturnAck({ ...revised, quantityExact: "0.2" }, revise)).toThrow("incomplete");
    selectedBranch();vi.stubGlobal("fetch", vi.fn(async () => json({ ...base, acceptanceFactId: id(9) })));
    await expect(recoverReturnCommand(company, command)).rejects.toThrow("incomplete");
  });
  it("binds cancellation to its original revision and retained proposal values", () => {
    const cancel: ReturnCommand = { operation: "Cancel", key, targetId: draft, method: "POST",
      body: JSON.stringify({ expectedRevision: 1, reason: "Withdrawn" }),
      prior: { quantityExact: "0.5001", evidenceReference: null } };
    const saved = { ...base, status: "Cancelled", version: 2, reason: "Withdrawn" };
    expect(readReturnAck(saved, cancel).status).toBe("Cancelled");
    expect(() => readReturnAck({ ...saved, quantityExact: "0.5" }, cancel)).toThrow("incomplete");
    expect(() => readReturnAck({ ...saved, version: 3 }, cancel)).toThrow("incomplete");
  });
});
