import { useEffect, useState } from "react";
import { getCommercial } from "@/modules/procurement/commercial/store";

export type InvoiceStatus =
  | "Received"
  | "Exception"
  | "Validated"
  | "Handoff pending"
  | "Handed to AP"
  | "AP rejected"
  | "Posted"
  | "Partially paid"
  | "Paid"
  | "Duplicate";
export type IntakeSource = "Manual" | "Supplier portal" | "Email placeholder" | "API placeholder";
export interface Evidence {
  at: string;
  actor: string;
  action: string;
  reason?: string;
  audience?: "Internal" | "Supplier";
}
export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  acceptedQuantity: number;
  poUnitPrice: number;
}
export interface Invoice {
  id: string;
  number: string;
  supplierId: string;
  supplier: string;
  entityId: string;
  po: string;
  source: IntakeSource;
  currency: string;
  date: string;
  due: string;
  tax: number;
  status: InvoiceStatus;
  matchType: "2-way" | "3-way";
  lines: InvoiceLine[];
  owner: string;
  attachment: string;
  version: number;
  correctionOf?: string;
  exception?: { type: string; reason: string; owner: string; due: string };
  apKey?: string;
  apAttempts: number;
  financeAt?: string;
  timeline: Evidence[];
}
export interface SupplierItem {
  id: string;
  supplierId: string;
  kind: "Opportunity" | "Order" | "Document" | "Delivery";
  reference: string;
  title: string;
  status: string;
  due: string;
}
export interface CreditRef {
  id: string;
  invoiceId: string;
  supplierId: string;
  amount: number;
  currency: string;
  reason: string;
  status: "Commercial review" | "Sent to Finance";
  created: string;
}
export interface PolicyDraft {
  version: number;
  status: "Published" | "Draft" | "Pending review";
  threshold: number;
  currency: string;
  tolerance: number;
  effective: string;
  reason: string;
}
export interface PayablesState {
  invoices: Invoice[];
  supplierItems: SupplierItem[];
  credits?: CreditRef[];
  policy: PolicyDraft;
  candidate?: PolicyDraft;
  comments: Record<string, Evidence[]>;
}
const now = () => new Date().toISOString();
export const initialPayables: PayablesState = {
  invoices: [
    {
      id: "INV-1042",
      number: "NW-6781",
      supplierId: "sup-001",
      supplier: "Northwind Devices B.V.",
      entityId: "ent-nl",
      po: "PO-2026-1042",
      source: "Supplier portal",
      currency: "EUR",
      date: "2026-10-01",
      due: "2026-10-31",
      tax: 2583,
      status: "Exception",
      matchType: "3-way",
      lines: [
        {
          description: "Laptop",
          quantity: 10,
          unitPrice: 1230,
          acceptedQuantity: 8,
          poUnitPrice: 1230,
        },
      ],
      owner: "AP processor",
      attachment: "NW-6781.pdf",
      version: 1,
      exception: {
        type: "Quantity",
        reason: "Invoiced 10; accepted 8",
        owner: "Receiver",
        due: "2026-10-06",
      },
      apAttempts: 0,
      timeline: [
        {
          at: "2026-10-01T09:30:00Z",
          actor: "Northwind Devices B.V.",
          action: "Invoice submitted",
          audience: "Supplier",
        },
        {
          at: "2026-10-01T09:31:00Z",
          actor: "Match service",
          action: "Quantity exception",
          reason: "Accepted quantity 8; invoice quantity 10",
        },
      ],
    },
    {
      id: "INV-1043",
      number: "SERV-220",
      supplierId: "sup-001",
      supplier: "Northwind Devices B.V.",
      entityId: "ent-nl",
      po: "PO-2026-1043",
      source: "Manual",
      currency: "EUR",
      date: "2026-10-02",
      due: "2026-11-02",
      tax: 42,
      status: "Validated",
      matchType: "2-way",
      lines: [
        {
          description: "Warranty service milestone",
          quantity: 1,
          unitPrice: 200,
          acceptedQuantity: 1,
          poUnitPrice: 200,
        },
      ],
      owner: "AP processor",
      attachment: "SERV-220.pdf",
      version: 1,
      apAttempts: 0,
      timeline: [
        { at: "2026-10-02T10:00:00Z", actor: "AP processor", action: "Invoice validated" },
      ],
    },
    {
      id: "INV-1044",
      number: "SZ-6700",
      supplierId: "sup-003",
      supplier: "Studio Zit",
      entityId: "ent-nl",
      po: "PO-2026-0311",
      source: "Supplier portal",
      currency: "EUR",
      date: "2026-09-08",
      due: "2026-10-08",
      tax: 151.2,
      status: "Paid",
      matchType: "3-way",
      lines: [
        {
          description: "Ergonomic office chair",
          quantity: 2,
          unitPrice: 360,
          acceptedQuantity: 2,
          poUnitPrice: 360,
        },
      ],
      owner: "Finance",
      attachment: "SZ-6700.pdf",
      version: 1,
      apAttempts: 1,
      apKey: "AP-INV-1044-v1",
      financeAt: "2026-09-30T12:00:00Z",
      timeline: [
        {
          at: "2026-09-30T12:00:00Z",
          actor: "Finance demo callback",
          action: "Paid confirmed",
          reason: "Payment reference FIN-781",
        },
      ],
    },
  ],
  supplierItems: [
    {
      id: "sp-1",
      supplierId: "sup-001",
      kind: "Opportunity",
      reference: "RFQ-2026-0062",
      title: "Workplace equipment",
      status: "Open",
      due: "2026-10-12",
    },
    {
      id: "sp-2",
      supplierId: "sup-001",
      kind: "Order",
      reference: "PO-2026-1042",
      title: "Laptops",
      status: "Awaiting acknowledgment",
      due: "2026-10-05",
    },
    {
      id: "sp-3",
      supplierId: "sup-001",
      kind: "Document",
      reference: "DOC-12",
      title: "Insurance certificate",
      status: "Expiring",
      due: "2026-10-20",
    },
    {
      id: "sp-4",
      supplierId: "sup-001",
      kind: "Order",
      reference: "PO-2026-1043",
      title: "Warranty service",
      status: "Acknowledged",
      due: "2026-10-25",
    },
  ],
  credits: [],
  policy: {
    version: 1,
    status: "Published",
    threshold: 10000,
    currency: "EUR",
    tolerance: 2,
    effective: "2026-10-01",
    reason: "Illustrative demo policy",
  },
  comments: {},
};
const key = "meridian.procurement.payables.v4";
let snapshot = initialPayables;
const listeners = new Set<() => void>();
let loaded = false;
function hydrate() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(key);
    if (raw) snapshot = JSON.parse(raw) as PayablesState;
  } catch {
    snapshot = initialPayables;
  }
  listeners.forEach((fn) => fn());
}
export function usePayables() {
  const [state, setState] = useState(snapshot);
  useEffect(() => {
    hydrate();
    const update = () => setState(snapshot);
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);
  return state;
}
export function updatePayables(change: (s: PayablesState) => PayablesState) {
  snapshot = change(snapshot);
  if (typeof window !== "undefined") localStorage.setItem(key, JSON.stringify(snapshot));
  listeners.forEach((fn) => fn());
}
export function resetPayables() {
  snapshot = structuredClone(initialPayables);
  if (typeof window !== "undefined") localStorage.removeItem(key);
  listeners.forEach((fn) => fn());
}
export function reviseInvoice(id: string, change: (i: Invoice) => Invoice) {
  updatePayables((s) => ({ ...s, invoices: s.invoices.map((i) => (i.id === id ? change(i) : i)) }));
}
export function addEvidence(
  id: string,
  action: string,
  actor: string,
  reason?: string,
  audience: "Internal" | "Supplier" = "Internal",
) {
  reviseInvoice(id, (i) => ({
    ...i,
    timeline: [...i.timeline, { at: now(), action, actor, reason, audience }],
  }));
}
export function invoiceTotal(i: Invoice) {
  return i.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) + i.tax;
}
export function matchInvoice(i: Invoice, tolerancePercent: number) {
  const issues: string[] = [];
  const commercial = getCommercial();
  const order = commercial.orders.find((candidate) => candidate.id === i.po);
  if (!order) issues.push(`Purchase order ${i.po} is unavailable`);
  if (order && order.supplier !== i.supplier) issues.push("Invoice supplier does not match the PO supplier");
  if (order && order.currency !== i.currency) issues.push("Invoice currency does not match the PO currency");
  if (order && !["Issued", "Acknowledged", "Closed"].includes(order.status)) issues.push("PO is not issued");
  const accepted = order ? commercial.receipts.filter((receipt) => receipt.poId === order.id && ["Accepted", "Partially accepted"].includes(receipt.status)).reduce((sum, receipt) => sum + receipt.qty, 0) : 0;
  for (const line of i.lines) {
    if (i.matchType === "3-way" && line.quantity > accepted)
      issues.push(
        `${line.description}: invoice ${line.quantity} exceeds accepted ${accepted}`,
      );
    if (
      (Math.abs(line.unitPrice - (order?.line.price ?? line.poUnitPrice)) / Math.max(1, order?.line.price ?? line.poUnitPrice)) * 100 >
      tolerancePercent
    )
      issues.push(`${line.description}: price variance exceeds ${tolerancePercent}%`);
  }
  return issues;
}
export function addInvoice(
  input: Omit<Invoice, "id" | "status" | "version" | "apAttempts" | "timeline">,
): { ok: boolean; message: string; id?: string } {
  hydrate();
  const duplicate = snapshot.invoices.some(
    (i) =>
      i.supplierId === input.supplierId &&
      i.entityId === input.entityId &&
      i.number.trim().toLowerCase() === input.number.trim().toLowerCase() &&
      i.currency === input.currency,
  );
  if (duplicate)
    return {
      ok: false,
      message:
        "Duplicate supplier, entity, currency and invoice number. Open the existing invoice instead.",
    };
  const id = `INV-${Date.now().toString().slice(-7)}`;
  const invoice: Invoice = {
    ...input,
    id,
    status: "Received",
    version: 1,
    apAttempts: 0,
    timeline: [{ at: now(), actor: "Demo user", action: "Invoice captured", reason: input.source }],
  };
  updatePayables((s) => ({ ...s, invoices: [invoice, ...s.invoices] }));
  return { ok: true, message: `Saved ${id} as demo data`, id };
}
export function updateSupplierItem(id: string, status: string) {
  updatePayables((s) => ({
    ...s,
    supplierItems: s.supplierItems.map((i) => (i.id === id ? { ...i, status } : i)),
  }));
}
export function addComment(
  record: string,
  actor: string,
  reason: string,
  audience: "Internal" | "Supplier",
) {
  updatePayables((s) => ({
    ...s,
    comments: {
      ...s.comments,
      [record]: [
        ...(s.comments[record] ?? []),
        { at: now(), actor, action: "Comment", reason, audience },
      ],
    },
  }));
}
export function addCreditRef(invoice: Invoice, amount: number, reason: string) {
  const credit: CreditRef = {
    id: `CR-${Date.now().toString().slice(-7)}`,
    invoiceId: invoice.id,
    supplierId: invoice.supplierId,
    amount,
    currency: invoice.currency,
    reason,
    status: "Commercial review",
    created: now(),
  };
  updatePayables((s) => ({ ...s, credits: [credit, ...(s.credits ?? [])] }));
  addEvidence(invoice.id, `Credit reference ${credit.id} created`, "AP processor", reason);
  return credit;
}
