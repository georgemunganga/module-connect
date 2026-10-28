import { afterEach, describe, expect, it, vi } from "vitest";
import { pendingReceivingCommands as pending } from "./receiving-command-memory";
import type { ReceivingCommand } from "../../../src/platform/procurement-receiving-api";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const scope = (actor = id(3), target = "new") => `tenant:${id(1)}:${id(2)}:${actor}:goods:${target}:principal2`;
const command = (): ReceivingCommand => ({ protocol: "Principal2", operation: "ReceivingDraft", orderId: id(4),
  targetId: null, key: id(5), method: "POST", body: JSON.stringify({ purchaseOrderId: id(4), lines: [] }) });
const storage = () => {
  const rows = new Map<string, string>();
  return { rows, getItem: (key: string) => rows.get(key) ?? null,
    setItem: (key: string, value: string) => { rows.set(key, value); },
    removeItem: (key: string) => { rows.delete(key); } };
};
afterEach(() => vi.unstubAllGlobals());

describe("principal receiving original command journal", () => {
  it("retains the exact key and body across reload for the same actor and scope", () => {
    vi.stubGlobal("sessionStorage", storage());
    pending.set(scope(), command());
    expect(pending.get(scope())).toEqual(command());
    expect(pending.get(scope(id(6)))).toBeNull();
    expect(() => pending.set(scope(), { ...command(), key: id(7) })).toThrow();
    expect(pending.get(scope())?.key).toBe(id(5));
    pending.delete(scope());
    expect(pending.get(scope())).toBeNull();
  });
  it("fails closed on malformed storage, mismatched target, or unavailable storage", () => {
    const local = storage(); vi.stubGlobal("sessionStorage", local);
    local.rows.set(`erp.procurement.receiving.principal2:${scope()}`, "not-json");
    expect(pending.invalid(scope())).toBe(true);
    expect(() => pending.set(scope(), command())).toThrow();
    local.rows.clear();
    expect(() => pending.set(scope(id(3), id(8)), command())).toThrow();
    vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => { throw new Error("denied"); }, removeItem: () => undefined });
    expect(() => pending.set(scope(), command())).toThrow("No change was sent");
  });
});
