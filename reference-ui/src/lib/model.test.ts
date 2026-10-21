import { describe, it, expect } from "vitest";
import { transactionTotals, validateLines } from "./calculations";
import {
  saveToRecords,
  updateInRecords,
  removeFromRecords,
  fixtures,
  type Line,
} from "./store";
import { parseDelimited, parseNonNegativeAmount } from "./csv";
import { removeSelectedId, updateVisibleSelection } from "./list-state";
import { modules, canonicalRoutes } from "../data/modules";
import { settingsRoutes } from "../data/settings";

import { billBalance } from "./payables";
import { belongsToVendor, inferVendorId } from "./vendor-links";
import {
  CURRENT_DEMO_REQUESTER,
  filterEmployeeRequests,
  requesterFor,
  withDefaultRequestOwner,
} from "./request-views";

const lines: Line[] = [
  { id: "1", name: "Office chair", quantity: 2, rate: 1250, unit: "pcs" },
];
describe("shared transaction primitives", () => {
  it("applies discount before exclusive tax", () => {
    const result = transactionTotals(lines, 10, 16, false);
    expect(result).toEqual({
      subtotal: 2500,
      discountAmount: 250,
      tax: 360,
      total: 2610,
    });
  });
  it("does not add included tax a second time", () => {
    const result = transactionTotals(lines, 0, 16, true);
    expect(result.total).toBe(2500);
    expect(result.tax).toBeCloseTo(344.827586);
  });
  it("rejects missing items, zero quantities, and negative rates", () => {
    expect(validateLines([])).toBeTruthy();
    expect(validateLines([{ ...lines[0], name: "" }])).toBeTruthy();
    expect(validateLines([{ ...lines[0], quantity: 0 }])).toBeTruthy();
    expect(validateLines([{ ...lines[0], rate: -1 }])).toBeTruthy();
    expect(validateLines(lines)).toBe("");
  });
  it("clamps discounts without producing negative totals", () => {
    expect(transactionTotals(lines, 500, 0, false).total).toBe(0);
    expect(transactionTotals(lines, -10, 0, false).total).toBe(2500);
  });
});
describe("canonical screens and records", () => {
  it("has unique reachable declared routes and entity-specific editor mappings", () => {
    const routes = [...canonicalRoutes, ...settingsRoutes];
    expect(new Set(routes.map((route) => route.path)).size).toBe(routes.length);
    expect(routes.every((route) => route.path.startsWith("/"))).toBe(true);
    for (const module of Object.values(modules))
      expect(routes.some((route) => route.path === `/${module.key}/new`)).toBe(
        true,
      );
    for (const module of Object.values(modules))
      expect(routes.some((route) => route.path === `/${module.key}/:id`)).toBe(
        true,
      );
    expect(routes.some((route) => route.path === "/vendors/:id/:tab")).toBe(
      true,
    );
    expect(routes.some((route) => route.path === "/batch-payments/:id")).toBe(
      true,
    );
    expect(
      routes.some(
        (route) => route.path === "/settings/modules/purchase-orders/fields",
      ),
    ).toBe(true);
  });
  it("replaces a shared record instead of duplicating it for a different workflow", () => {
    const old = fixtures.find((record) => record.kind === "requests")!;
    const records = saveToRecords(fixtures, { ...old, status: "Approved" });
    expect(records.length).toBe(fixtures.length);
    expect(records.filter((record) => record.id === old.id)).toHaveLength(1);
    expect(records.find((record) => record.id === old.id)?.status).toBe(
      "Approved",
    );
  });
  it("removes only the selected local record without cascading to linked records", () => {
    const vendor = fixtures.find((record) => record.kind === "vendors")!;
    const bill = fixtures.find((record) => record.kind === "bills")!;
    const result = removeFromRecords(fixtures, vendor.id);
    expect(result.some((record) => record.id === vendor.id)).toBe(false);
    expect(result.some((record) => record.id === bill.id)).toBe(true);
  });
  it("uses fictional and distinct catalog identifiers", () => {
    expect(fixtures.filter((record) => record.kind === "items")).toHaveLength(
      3,
    );
    expect(fixtures.filter((record) => record.kind === "vendors")).toHaveLength(
      3,
    );
    expect(new Set(fixtures.map((record) => record.id)).size).toBe(
      fixtures.length,
    );
  });
});

describe("local list tools", () => {
  it("preserves hidden selections and removes deleted IDs", () => {
    expect(updateVisibleSelection(["hidden"], ["visible"], true)).toEqual([
      "hidden",
      "visible",
    ]);
    expect(
      updateVisibleSelection(["hidden", "visible"], ["visible"], false),
    ).toEqual(["hidden"]);
    expect(removeSelectedId(["hidden", "visible"], "visible")).toEqual([
      "hidden",
    ]);
  });
  it("parses tab-separated data even when a header contains commas", () => {
    expect(
      parseDelimited(
        "Display Name\tNotes, Internal\nDemo Vendor\tTier 2, local",
        "\t",
      ),
    ).toEqual({
      headers: ["Display Name", "Notes, Internal"],
      rows: [
        { "Display Name": "Demo Vendor", "Notes, Internal": "Tier 2, local" },
      ],
    });
  });
  it("accepts valid nonnegative prices and rejects malformed or negative values", () => {
    expect(parseNonNegativeAmount("$1,250.50")).toBe(1250.5);
    expect(parseNonNegativeAmount("")).toBe(0);
    expect(parseNonNegativeAmount("-5")).toBeNull();
    expect(parseNonNegativeAmount("not a number")).toBeNull();
    expect(parseNonNegativeAmount("1.2.3")).toBeNull();
  });
  it("preserves creation time and advances modification time on local edits", () => {
    const vendor = fixtures.find((record) => record.kind === "vendors")!;
    const existing = {
      ...vendor,
      createdAt: "2025-01-01T00:00:00.000Z",
      lastModifiedAt: "2025-01-01T00:00:00.000Z",
    };
    const saved = saveToRecords(
      [existing],
      { ...existing, title: "Renamed local vendor" },
      "2026-02-03T04:05:06.000Z",
    )[0];
    expect(saved.createdAt).toBe(existing.createdAt);
    expect(saved.lastModifiedAt).toBe("2026-02-03T04:05:06.000Z");
    const updated = updateInRecords(
      [saved],
      saved.id,
      { title: "Edited local vendor" },
      "2026-03-04T05:06:07.000Z",
    )[0];
    expect(updated.createdAt).toBe(existing.createdAt);
    expect(updated.lastModifiedAt).toBe("2026-03-04T05:06:07.000Z");
  });
});

describe("employee purchase request views", () => {
  const requests = fixtures.filter((record) => record.kind === "requests");

  it("shows only the current demo user's pending requests by default", () => {
    expect(
      filterEmployeeRequests(requests, "pending", "mine").map(
        (record) => record.id,
      ),
    ).toEqual(["PR-00001"]);
  });

  it("switches between my requests and all requests without mixing tab states", () => {
    expect(
      filterEmployeeRequests(requests, "all", "mine").map(
        (record) => record.id,
      ),
    ).toEqual(["PR-00001", "PR-00002"]);
    expect(
      filterEmployeeRequests(requests, "pending", "all").map(
        (record) => record.id,
      ),
    ).toEqual(["PR-00001", "PR-00003"]);
    expect(
      filterEmployeeRequests(requests, "all", "all").map((record) => record.id),
    ).toEqual(["PR-00001", "PR-00002", "PR-00003"]);
  });

  it("labels legacy records as the current demo user and preserves explicit owners", () => {
    const legacy = { ...requests[0], meta: undefined };
    expect(requesterFor(legacy)).toBe(CURRENT_DEMO_REQUESTER);
    expect(withDefaultRequestOwner(legacy).meta).toEqual({
      requester: CURRENT_DEMO_REQUESTER,
    });
    const otherOwner = {
      ...requests[2],
      meta: { requester: "Another employee" },
    };
    expect(withDefaultRequestOwner(otherOwner)).toBe(otherOwner);
  });
});

describe("stable catalog relationships", () => {
  const vendor = fixtures.find((record) => record.kind === "vendors")!;
  it("matches vendor records by ID and supports legacy name fallback", () => {
    const order = fixtures.find((record) => record.kind === "purchase-orders")!;
    expect(belongsToVendor(order, vendor)).toBe(true);
    expect(inferVendorId({ ...order, meta: undefined }, [vendor])).toBe(
      vendor.id,
    );
  });
  it("links catalog items to transaction lines using a stable item ID", () => {
    const item = fixtures.find(
      (record) => record.kind === "items" && record.title === "Office chair",
    )!;
    const order = fixtures.find((record) => record.kind === "purchase-orders")!;
    expect(order.lines?.some((line) => line.itemId === item.id)).toBe(true);
  });
});

describe("payable lifecycle balance", () => {
  const bill = fixtures.find((record) => record.kind === "bills")!;
  const payment = {
    ...fixtures.find((record) => record.kind === "payments")!,
    meta: { billId: bill.id },
  };
  const credit = {
    ...fixtures.find((record) => record.kind === "vendor-credits")!,
    meta: { appliedBillId: bill.id },
  };
  it("does not apply a vendor payment until it is linked to this bill", () => {
    expect(billBalance(fixtures, bill)).toBe(1700);
  });
  it("deducts applied payment and credit once, not orders or batch values", () => {
    expect(billBalance([...fixtures, payment, credit], bill)).toBe(680);
  });
  it("draft allocations do not change a posted bill balance", () => {
    expect(
      billBalance(
        [
          ...fixtures,
          { ...payment, status: "Draft" },
          { ...credit, status: "Draft" },
        ],
        bill,
      ),
    ).toBe(1700);
    expect(billBalance(fixtures, { ...bill, status: "Draft" })).toBe(0);
  });
  it("supports editing an allocation without counting it twice and clamps to zero", () => {
    expect(billBalance([...fixtures, payment], bill, payment.id)).toBe(1700);
    expect(billBalance([...fixtures, { ...payment, amount: 9999 }], bill)).toBe(
      0,
    );
  });
});
