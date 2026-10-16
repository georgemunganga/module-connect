/**
 * Line-level fulfilment for purchase requests (PROC-02). Header progress is DERIVED
 * from these lines — never stored separately.
 */
export type LineRoute = "Unassigned" | "Direct PO" | "RFQ / tender" | "Contract / framework" | "Deferred" | "Cancelled";
export type LineApproval = "Pending" | "Approved" | "Returned" | "Rejected";

export interface ReqLine {
  id: string;
  /** Stable reference for a catalog line; display text may change independently. */
  catalogItemId?: string;
  description: string;
  category: string;
  qty: number;
  unitPrice: number;
  preferredSupplier?: string;
  kind?: "Goods" | "Service" | "Asset" | "Subscription";
  approval: LineApproval;
  approvedQty: number;
  allocatedQty: number;
  orderedQty: number;
  receivedQty: number;
  cancelledQty: number;
  route: LineRoute;
  splitNote?: string;
  related: { kind: "RFQ" | "PO" | "Receipt" | "Contract"; ref: string }[];
  /** Another buyer is converting this line right now (demo concurrency). */
  lockedBy?: string;
}

export interface ReqMeta {
  entity: string;
  deliverTo?: string;
  costCentre?: string;
  project?: string;
  evidence?: string[];
  category: string;
  exceptions: string[];
  budgetBalance?: { available: number; note: string };
  versions: { version: number; date: string; by: string; note: string; snapshot?: {
    title: string; neededBy: string; deliverTo: string; costCentre: string; project: string; evidence: string[];
    lines: { id: string; description: string; qty: number; unitPrice: number }[];
  } }[];
  lines: ReqLine[];
}

export const reqMeta: Record<string, ReqMeta> = {
  "PR-2026-1042": {
    entity: "Meridian Netherlands B.V.", category: "IT hardware",
    exceptions: [],
    budgetBalance: { available: 60000, note: "CAPEX-ENG-27 indicative balance (Finance not confirmed)" },
    versions: [{ version: 1, date: "2026-10-01", by: "Sanne de Vries", note: "Submitted" }],
    lines: [
      { id: "1042-1", catalogItemId: "itm-laptop-14", description: "Laptop 14\" standard build", category: "IT hardware", qty: 12, unitPrice: 1230, approval: "Approved", approvedQty: 12, allocatedQty: 0, orderedQty: 12, receivedQty: 8, cancelledQty: 0, route: "Contract / framework", related: [{ kind: "Contract", ref: "CT-2025-014" }, { kind: "PO", ref: "PO-2026-1042" }, { kind: "Receipt", ref: "GRN-2026-1042" }] },
      { id: "1042-2", description: "Docking station", category: "IT hardware", qty: 12, unitPrice: 307.5, approval: "Approved", approvedQty: 12, allocatedQty: 0, orderedQty: 0, receivedQty: 0, cancelledQty: 0, route: "Unassigned", related: [] },
    ],
  },
  "PR-2026-1043": {
    entity: "Meridian Kenya Ltd", category: "Safety equipment", exceptions: [],
    versions: [{ version: 1, date: "2026-10-02", by: "Daniel Otieno", note: "Submitted" }],
    lines: [
      { id: "1043-1", catalogItemId: "itm-boots", description: "Safety boots, size range", category: "Safety equipment", qty: 50, unitPrice: 7720, approval: "Approved", approvedQty: 50, allocatedQty: 50, orderedQty: 0, receivedQty: 0, cancelledQty: 0, route: "Direct PO", related: [{ kind: "PO", ref: "PO-2026-0044" }] },
    ],
  },
  "PR-2026-1038": {
    entity: "Meridian Netherlands B.V.", category: "Furniture",
    exceptions: ["Supplier suspended after PO issue"],
    budgetBalance: { available: 1500, note: "OPEX-ENG-27 indicative balance (Finance not confirmed)" },
    versions: [
      { version: 2, date: "2026-09-26", by: "Lukas Brandt", note: "Reopened: quantity 25 → 20 (original preserved)" },
      { version: 1, date: "2026-09-20", by: "Lukas Brandt", note: "Submitted" },
    ],
    lines: [
      { id: "1038-1", catalogItemId: "itm-chair-ergo", description: "Ergonomic office chair", category: "Furniture", qty: 20, unitPrice: 360, approval: "Approved", approvedQty: 20, allocatedQty: 4, orderedQty: 12, receivedQty: 8, cancelledQty: 4, route: "Direct PO", splitNote: "12 ordered on PO-2026-0311; 4 cancelled (supplier suspended); 4 moved to RFQ", related: [{ kind: "PO", ref: "PO-2026-0311" }, { kind: "Receipt", ref: "GR-2026-0144" }, { kind: "RFQ", ref: "RFQ-2026-0052" }] },
    ],
  },
  "PR-2026-1035": {
    entity: "Meridian Kenya Ltd", category: "Logistics", exceptions: ["Supplier not onboarded"],
    versions: [{ version: 1, date: "2026-09-29", by: "Daniel Otieno", note: "Submitted" }],
    lines: [
      { id: "1035-1", catalogItemId: "itm-freight-nbo-mba", description: "Freight, Nairobi → Mombasa", category: "Logistics", qty: 5, unitPrice: 188000, approval: "Returned", approvedQty: 0, allocatedQty: 0, orderedQty: 0, receivedQty: 0, cancelledQty: 0, route: "Unassigned", related: [] },
    ],
  },
  "PR-2026-1044": {
    entity: "Meridian Netherlands B.V.", category: "Office supplies", exceptions: [],
    versions: [],
    lines: [
      { id: "1044-1", description: "Welcome pack (notebook, bottle, hoodie)", category: "Office supplies", qty: 30, unitPrice: 45, approval: "Pending", approvedQty: 0, allocatedQty: 0, orderedQty: 0, receivedQty: 0, cancelledQty: 0, route: "Unassigned", related: [] },
    ],
  },
};

export const remaining = (l: ReqLine) => Math.max(0, l.approvedQty - l.orderedQty - l.cancelledQty);
export const availableToAllocate = (l: ReqLine) => Math.max(0, l.approvedQty - l.allocatedQty - l.orderedQty - l.cancelledQty);

/** Derived header progress from line facts. */
export function deriveProgress(lines: ReqLine[]): string {
  if (!lines.length) return "No lines";
  const live = lines.filter((l) => l.route !== "Cancelled");
  if (!live.length) return "Cancelled";
  if (live.some((l) => l.approval === "Returned")) return "Returned for correction";
  if (live.every((l) => l.approval === "Pending")) return "Awaiting approval";
  const ordered = live.reduce((s, l) => s + l.orderedQty, 0);
  const received = live.reduce((s, l) => s + l.receivedQty, 0);
  const approved = live.reduce((s, l) => s + l.approvedQty, 0);
  if (live.every((l) => l.approval === "Approved" && l.orderedQty + l.cancelledQty >= l.approvedQty && l.receivedQty >= l.orderedQty)) return "Fulfilled";
  if (received) return "Partially received";
  if (ordered) return ordered >= approved ? "Ordered" : "Partially ordered";
  if (live.some((l) => l.allocatedQty)) return "Allocated — awaiting order";
  if (live.some((l) => l.approval === "Pending")) return "Partly approved";
  return "Approved — awaiting buyer";
}
