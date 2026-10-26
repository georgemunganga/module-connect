import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeGovernanceBody, type GovernanceCommand } from "../../../src/platform/procurement-principal-governance-api";
import { principalOrderGovernanceJournal, principalOrderGovernanceScope,
  recoverJournaledGovernanceCommand, sendNewJournaledGovernanceCommand } from "./principal-order-governance-journal";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const storage = () => {
  const rows = new Map<string, string>();
  return { rows, getItem: (key: string) => rows.get(key) ?? null,
    setItem: (key: string, value: string) => { rows.set(key, value); },
    removeItem: (key: string) => { rows.delete(key); } };
};
const scope = (operation: "Submit" | "Issue" = "Submit", principal = id(3), branch = id(4)) =>
  principalOrderGovernanceScope("tenant-a", id(2), principal, branch, id(5), operation);
const command = (operation: "Submit" | "Issue" = "Submit"): GovernanceCommand => ({ operation,
  key: id(operation === "Submit" ? 6 : 7), orderId: id(5), assignmentId: null,
  expectedOriginalDirectSourceSha256: "a".repeat(64),
  body: encodeGovernanceBody(operation, { expectedOrderVersion: 2 }) });
const reply = { schemaVersion: 2, operation: "Submit", orderId: id(5), number: "PO-1",
  status: "PendingApproval", version: 3, originalDirectSourceSha256: "a".repeat(64),
  commandKey: id(6), evidenceId: id(8), recordedHistoricalResult: true,
  manualFundingOnly: true, financeReservationChanged: false, supplierSendPerformed: false };
afterEach(() => vi.unstubAllGlobals());

describe("principal governed order original-key journal", () => {
  it("survives a hard reload without an auth-epoch slot and keeps actor/branch/order separate", () => {
    const local = storage(); vi.stubGlobal("sessionStorage", local);
    principalOrderGovernanceJournal.claim(scope(), command());
    expect(principalOrderGovernanceJournal.read(scope())).toEqual(command());
    expect(principalOrderGovernanceJournal.read(scope("Submit", id(9)))).toBeNull();
    expect(principalOrderGovernanceJournal.read(scope("Submit", id(3), id(10)))).toBeNull();
    expect(scope()).not.toContain("authEpoch");
    expect(() => principalOrderGovernanceJournal.claim(scope("Issue"), command("Issue"))).toThrow();
    expect(() => principalOrderGovernanceJournal.clear(scope(), { ...command(),
      expectedOriginalDirectSourceSha256: "b".repeat(64) })).toThrow();
    expect(principalOrderGovernanceJournal.read(scope())?.expectedOriginalDirectSourceSha256)
      .toBe("a".repeat(64));
    principalOrderGovernanceJournal.clear(scope(), command());
    expect(principalOrderGovernanceJournal.read(scope())).toBeNull();
  });
  it("saves the original key/body before its one POST and leaves it after uncertainty", async () => {
    const local = storage(); vi.stubGlobal("sessionStorage", local);
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe("POST");
      expect(principalOrderGovernanceJournal.read(scope())).toEqual(command());
      throw new Error("lost response");
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(sendNewJournaledGovernanceCommand(id(2), scope(), command())).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(principalOrderGovernanceJournal.read(scope())?.key).toBe(id(6));
    await expect(sendNewJournaledGovernanceCommand(id(2), scope(), { ...command(), key: id(99) }))
      .rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("recovers by the exact original GET without clearing or repeating the POST", async () => {
    const local = storage(); vi.stubGlobal("sessionStorage", local);
    principalOrderGovernanceJournal.claim(scope(), command());
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.method).toBeUndefined();
      return new Response(JSON.stringify({ operation: "Submit", commandKey: id(6), originalStatusCode: 201,
        responseJson: JSON.stringify(reply), recordedHistoricalResult: true, historicalOnly: true,
        financeReservationChanged: false, supplierSendPerformed: false }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);
    expect((await recoverJournaledGovernanceCommand(id(2), scope())).evidenceId).toBe(id(8));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(principalOrderGovernanceJournal.read(scope())?.key).toBe(id(6));
  });
  it("blocks POST when storage cannot retain the key or contains malformed evidence", () => {
    vi.stubGlobal("sessionStorage", { getItem: () => null,
      setItem: () => { throw new Error("storage denied"); }, removeItem: () => undefined });
    expect(() => principalOrderGovernanceJournal.claim(scope(), command())).toThrow();
    const local = storage(); vi.stubGlobal("sessionStorage", local);
    local.rows.set(scope(), '{"operation":"Submit","key":"wrong"}');
    expect(() => principalOrderGovernanceJournal.read(scope())).toThrow();
    expect(() => principalOrderGovernanceScope("tenant-a", id(2), id(3), "all", id(5), "Submit"))
      .toThrow();
  });
  it("rejects a company argument that differs from the durable scope before either request", async () => {
    const local = storage(); vi.stubGlobal("sessionStorage", local);
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(sendNewJournaledGovernanceCommand(id(99), scope(), command())).rejects.toThrow();
    expect(local.rows.size).toBe(0);
    principalOrderGovernanceJournal.claim(scope(), command());
    await expect(recoverJournaledGovernanceCommand(id(99), scope())).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
