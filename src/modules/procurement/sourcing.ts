export type SourcingMethod = "Direct" | "Single source" | "Emergency" | "RFQ" | "RFP" | "Tender";
export type EventState = "Draft" | "Pending approval" | "Published" | "Closed" | "Cancelled" | "Reopened";

export interface Invitation {
  supplier: string;
  delivery: "Delivered" | "Opened" | "Not delivered" | "Resend pending" | "Declined";
  at?: string;
  note?: string;
}

export interface BidReceipt {
  id: string;
  supplier: string;
  version: number;
  receivedAt: string;
  channel: "Supplier portal" | "Email (surrogate)" | "Post (surrogate)" | "Hand delivery (surrogate)";
  late: boolean;
  enteredBy?: string;
  enteredAt?: string;
  evidence?: string;
  /** Only visible after the authorised opening. */
  sealedContent: { total: number; currency: string; leadTimeDays: number; notes: string };
}

export interface SourcingEvent {
  id: string;
  title: string;
  /** Plain-language requirement summary shown to invited suppliers. */
  description?: string;
  method: SourcingMethod;
  state: EventState;
  buyer: string;
  entity: string;
  sourceLines: string[];
  items: { description: string; qty: number; unit: string }[];
  opensAt: string;
  closesAt: string;
  timeZone: string;
  openingAuthorisedBy?: string;
  opened: boolean;
  eligibility: string;
  terms: string;
  responseDocuments: string[];
  criteria: { name: string; weight: number }[];
  invitations: Invitation[];
  qa: { q: string; a?: string; askedBy: string; publishedToAll: boolean }[];
  bids: BidReceipt[];
  amendments: { no: number; at: string; change: string; notified: boolean }[];
  portalOutage?: string;
  nextAction: string;
  dueDate: string;
}

export const sourcingEvents: SourcingEvent[] = [
  {
    id: "RFQ-2026-0052", title: "Ergonomic chairs — 4 units (moved from PR-2026-1038)", method: "RFQ", state: "Published", buyer: "Priya Raman",
    entity: "Meridian Netherlands B.V.", sourceLines: ["PR-2026-1038 line 1 (4 of 20)"],
    items: [{ description: "Ergonomic office chair, EN 1335", qty: 4, unit: "each" }],
    opensAt: "2026-10-01 09:00", closesAt: "2026-10-09 17:00", timeZone: "Europe/Amsterdam", opened: false,
    eligibility: "Active suppliers in Furniture category, NL delivery", terms: "Meridian standard purchase terms v3 (demo)",
    responseDocuments: ["Price schedule", "Product safety declaration"],
    criteria: [{ name: "Price", weight: 50 }, { name: "Delivery time", weight: 20 }, { name: "Quality & compliance", weight: 30 }],
    invitations: [
      { supplier: "Ahrend Office B.V.", delivery: "Opened", at: "2026-10-01 09:04" },
      { supplier: "Bureau Comfort", delivery: "Delivered", at: "2026-10-01 09:02" },
      { supplier: "Zitmaat", delivery: "Not delivered", note: "Email bounced — contact address invalid" },
    ],
    qa: [{ q: "Is assembly included?", a: "Yes, assembly at Amsterdam HQ is required.", askedBy: "Supplier (anonymised)", publishedToAll: true }, { q: "Can we offer an alternative model?", askedBy: "Supplier (anonymised)", publishedToAll: false }],
    bids: [
      { id: "b1", supplier: "Ahrend Office B.V.", version: 2, receivedAt: "2026-10-03 11:20", channel: "Supplier portal", late: false, sealedContent: { total: 1380, currency: "EUR", leadTimeDays: 10, notes: "Incl. assembly" } },
    ],
    amendments: [{ no: 1, at: "2026-10-02 10:00", change: "Added assembly requirement (from Q&A)", notified: true }],
    nextAction: "Wait for closing; then authorised opening", dueDate: "2026-10-09",
  },
  {
    id: "TND-2026-0007", title: "Freight contract Nairobi–Mombasa 2027", method: "Tender", state: "Closed", buyer: "Grace Wanjiru",
    entity: "Meridian Kenya Ltd", sourceLines: ["Plan line PLAN-OPS-KE-2027 / k2"],
    items: [{ description: "Road freight, up to 10 t", qty: 60, unit: "trip" }],
    opensAt: "2026-09-01 08:00", closesAt: "2026-09-30 12:00", timeZone: "Africa/Nairobi", opened: true, openingAuthorisedBy: "Opening committee (2 of 2) · 30 Sep 14:00",
    eligibility: "Registered transporters with goods-in-transit insurance", terms: "Tender conditions TC-KE-2026 (demo)",
    responseDocuments: ["Technical proposal", "Price schedule", "Insurance certificate"],
    criteria: [{ name: "Price", weight: 60 }, { name: "Capacity & fleet", weight: 25 }, { name: "Safety record", weight: 15 }],
    invitations: [
      { supplier: "Kifaru Logistics", delivery: "Opened" }, { supplier: "Savannah Haulage", delivery: "Opened" }, { supplier: "Coast Movers", delivery: "Declined", note: "Capacity full" },
    ],
    qa: [],
    bids: [
      { id: "b2", supplier: "Kifaru Logistics", version: 1, receivedAt: "2026-09-29 16:40", channel: "Supplier portal", late: false, sealedContent: { total: 10800000, currency: "KES", leadTimeDays: 2, notes: "Fleet of 14 trucks" } },
      { id: "b3", supplier: "Savannah Haulage", version: 1, receivedAt: "2026-09-30 11:05", channel: "Hand delivery (surrogate)", late: false, enteredBy: "Grace Wanjiru", enteredAt: "2026-09-30 11:30", evidence: "Scanned envelope + bid.pdf", sealedContent: { total: 9950000, currency: "KES", leadTimeDays: 3, notes: "Requires 30% advance" } },
      { id: "b4", supplier: "Rift Freight", version: 1, receivedAt: "2026-09-30 12:47", channel: "Email (surrogate)", late: true, enteredBy: "Grace Wanjiru", enteredAt: "2026-09-30 13:10", evidence: "Original email .eml", sealedContent: { total: 9400000, currency: "KES", leadTimeDays: 4, notes: "Late — held for committee decision" } },
    ],
    amendments: [],
    portalOutage: "Supplier portal was unavailable 30 Sep 10:15–10:50 (EAT). Bids received by other channels in that window are accepted with evidence.",
    nextAction: "Evaluation (Milestone 09)", dueDate: "2026-10-14",
  },
  {
    id: "RFP-2026-0011", title: "Cloud monitoring subscription", method: "RFP", state: "Pending approval", buyer: "Priya Raman",
    entity: "Meridian Netherlands B.V.", sourceLines: ["Plan line PLAN-ENG-2027 / l2"],
    items: [{ description: "Monitoring platform, 50 hosts, 12 months", qty: 1, unit: "subscription" }],
    opensAt: "2026-10-10 09:00", closesAt: "2026-10-31 17:00", timeZone: "Europe/Amsterdam", opened: false,
    eligibility: "Software suppliers with data processing agreement", terms: "SaaS terms v2 (demo)", responseDocuments: ["Solution proposal", "Pricing", "Security questionnaire"],
    criteria: [{ name: "Functionality", weight: 40 }, { name: "Price", weight: 35 }, { name: "Security", weight: 25 }],
    invitations: [], qa: [], bids: [], amendments: [],
    nextAction: "Procurement lead to approve publication", dueDate: "2026-10-08",
  },
  {
    id: "RFQ-2026-0049", title: "Printer toner, Q4", method: "RFQ", state: "Closed", buyer: "Priya Raman", entity: "Meridian GmbH",
    sourceLines: ["PR-2026-1021 line 1"], items: [{ description: "Toner cartridge, black", qty: 40, unit: "each" }],
    opensAt: "2026-09-10 09:00", closesAt: "2026-09-20 17:00", timeZone: "Europe/Berlin", opened: true, openingAuthorisedBy: "Priya Raman · 21 Sep",
    eligibility: "Office supplies", terms: "Standard v3", responseDocuments: ["Price schedule"], criteria: [{ name: "Price", weight: 100 }],
    invitations: [{ supplier: "Office Depot DE", delivery: "Opened" }, { supplier: "Lyreco DE", delivery: "Opened" }],
    qa: [], bids: [], amendments: [],
    nextAction: "No responses — re-invite or use direct purchase with reason", dueDate: "2026-10-05",
  },
  {
    id: "RFQ-2026-0055", title: "Welcome packs, 30 units", method: "RFQ", state: "Draft", buyer: "Priya Raman", entity: "Meridian Netherlands B.V.",
    sourceLines: ["PR-2026-1044 line 1"], items: [{ description: "Welcome pack (notebook, bottle, hoodie)", qty: 30, unit: "each" }],
    opensAt: "", closesAt: "", timeZone: "Europe/Amsterdam", opened: false, eligibility: "", terms: "Standard v3", responseDocuments: [], criteria: [],
    invitations: [], qa: [], bids: [], amendments: [], nextAction: "Finish deadlines, suppliers and criteria", dueDate: "2026-10-07",
  },
  {
    id: "RFQ-2026-0044", title: "Meeting room AV kit", method: "RFQ", state: "Cancelled", buyer: "Priya Raman", entity: "Meridian GmbH",
    sourceLines: ["PR-2026-1012 line 1"], items: [{ description: "AV kit", qty: 2, unit: "set" }], opensAt: "2026-08-20 09:00", closesAt: "2026-08-30 17:00", timeZone: "Europe/Berlin", opened: false,
    eligibility: "IT hardware", terms: "Standard v3", responseDocuments: [], criteria: [{ name: "Price", weight: 100 }],
    invitations: [{ supplier: "Contoso Tech GmbH", delivery: "Delivered" }], qa: [], bids: [], amendments: [{ no: 1, at: "2026-08-25", change: "Cancelled — requirement withdrawn by requester", notified: true }],
    nextAction: "None — can be reopened by buyer", dueDate: "—",
  },
  {
    id: "RFQ-2026-0061", title: "Warranty service capacity for 2027", method: "RFQ", state: "Closed", buyer: "Priya Raman", entity: "Meridian Netherlands B.V.",
    sourceLines: ["Plan line PLAN-ENG-2027 / l3"], items: [{ description: "Warranty service milestones", qty: 12, unit: "month" }],
    opensAt: "2026-09-01 09:00", closesAt: "2026-09-30 17:00", timeZone: "Europe/Amsterdam", opened: true, openingAuthorisedBy: "Opening committee · 2026-10-01 09:00",
    eligibility: "Active suppliers with a service agreement", terms: "Meridian standard service terms v3 (demo)", responseDocuments: ["Service proposal", "Price schedule"],
    criteria: [{ name: "Service capacity", weight: 40 }, { name: "Price", weight: 40 }, { name: "Response time", weight: 20 }],
    invitations: [{ supplier: "Northwind Devices B.V.", delivery: "Opened", at: "2026-09-01 09:10" }], qa: [],
    bids: [{ id: "b61", supplier: "Northwind Devices B.V.", version: 1, receivedAt: "2026-09-29 15:00", channel: "Supplier portal", late: false, sealedContent: { total: 12000, currency: "EUR", leadTimeDays: 5, notes: "Monthly warranty milestone and service response" } }],
    amendments: [], nextAction: "Evaluate and recommend award", dueDate: "2026-10-10",
  },
  {
    id: "RFQ-2026-0062", title: "Laptop docking replenishment", method: "RFQ", state: "Published", buyer: "Priya Raman", entity: "Meridian Netherlands B.V.",
    sourceLines: ["Plan line PLAN-ENG-2027 / l4"], items: [{ description: "Docking station", qty: 12, unit: "each" }],
    opensAt: "2026-10-01 09:00", closesAt: "2026-10-12 17:00", timeZone: "Europe/Amsterdam", opened: false,
    eligibility: "Active IT hardware suppliers", terms: "Meridian standard purchase terms v3 (demo)", responseDocuments: ["Price schedule"],
    criteria: [{ name: "Price", weight: 70 }, { name: "Delivery", weight: 30 }],
    invitations: [{ supplier: "Northwind Devices B.V.", delivery: "Opened", at: "2026-10-01 09:15" }], qa: [], bids: [], amendments: [],
    nextAction: "Collect sealed supplier quotations", dueDate: "2026-10-12",
  },
];

/** Methods allowed for an estimated value (demo thresholds — not confirmed policy). */
export function permittedMethods(estimateEur: number): { method: SourcingMethod; allowed: boolean; why: string }[] {
  return [
    { method: "Direct", allowed: estimateEur <= 10000, why: "Up to €10,000 (demo threshold)" },
    { method: "Single source", allowed: true, why: "Needs written justification and Procurement approval" },
    { method: "Emergency", allowed: true, why: "Needs emergency reason; reviewed afterwards" },
    { method: "RFQ", allowed: estimateEur <= 140000, why: "Up to €140,000 (demo threshold)" },
    { method: "RFP", allowed: true, why: "For solutions where requirements need proposals" },
    { method: "Tender", allowed: estimateEur > 50000, why: "Above €50,000 (demo threshold)" },
  ];
}
