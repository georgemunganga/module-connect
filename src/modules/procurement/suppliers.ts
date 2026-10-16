import type { TimelineEvent } from "@/mock/types";

export type SupplierLifecycle =
  | "Proposed" | "Under diligence" | "More information required" | "Conditional"
  | "Active" | "Suspended" | "Expired" | "Inactive" | "Rejected";

export const lifecycleFilters: SupplierLifecycle[] = ["Proposed", "Under diligence", "More information required", "Conditional", "Active", "Suspended", "Expired", "Inactive"];

export type Decision = { state: "Not started" | "Pending" | "Approved" | "Returned" | "Rejected"; by?: string; at?: string; reference?: string; note?: string };

export interface VendorOnboardingDetails {
  displayName: string;
  salutation?: string;
  firstName?: string;
  lastName?: string;
  workPhone?: string;
  mobile?: string;
  language?: string;
  currency?: string;
  paymentTerms?: string;
  taxRateRef?: string;
  portalAccessRequested?: boolean;
  billingAddress?: { line1: string; line2?: string; city: string; region?: string; postalCode?: string; country: string };
  shippingAddress?: { line1: string; line2?: string; city: string; region?: string; postalCode?: string; country: string };
  bankName?: string;
  customFields?: { name: string; value: string }[];
  reportingTags?: { name: string; value: string }[];
  remarks?: string;
}

export interface SupplierRecord {
  id: string;
  name: string;
  legalName: string;
  country: string;
  registration: string;
  taxRef?: string;
  onboarding?: VendorOnboardingDetails;
  status: SupplierLifecycle;
  owner: string;
  nextAction: string;
  dueDate: string;
  categories: string[];
  sites: { name: string; address: string }[];
  contacts: { name: string; role: string; email: string }[];
  qualifications: { name: string; status: "Valid" | "Expiring" | "Expired" | "Missing"; validTo?: string }[];
  documents: { name: string; uploaded: string; size?: number; kind?: string }[];
  bank?: { masked: string; verification: Decision };
  procurementDecision: Decision;
  duplicates?: { name: string; reason: string }[];
  duplicateReview?: { state: "Cleared" | "Confirmed"; reason: string; by: string; at: string };
  portalUpdates?: { id: string; kind: "Contact email" | "Qualification evidence"; value: string; qualification?: string; validTo?: string; status: "Pending" | "Accepted" | "Returned"; at: string; decisionReason?: string }[];
  performance?: { period: string; source: string; delivery: number; quality: number; responsiveness: number; disputes: number };
  comments?: { id: string; at: string; actor: string; text: string; audience: "Internal" | "Supplier" }[];
  mailDrafts?: { id: string; at: string; actor: string; to: string; subject: string; body: string }[];
  openPOs: number;
  openInvoices: number;
  reviewVersion: number;
  timeline: TimelineEvent[];
}

export const supplierRecords: SupplierRecord[] = [
  {
    id: "sup-001", name: "Northwind Devices B.V.", legalName: "Northwind Devices Benelux B.V.", country: "Netherlands", registration: "KvK 61234567", taxRef: "NL861234567B01",
    status: "Active", owner: "Priya Raman", nextAction: "Annual review", dueDate: "2027-03-01",
    categories: ["IT hardware", "Warranty services"],
    sites: [{ name: "Head office", address: "Stationsplein 12, Utrecht" }],
    contacts: [{ name: "Maarten Visser", role: "Account manager", email: "m.visser@northwind.example" }],
    qualifications: [{ name: "ISO 9001", status: "Valid", validTo: "2027-11-30" }, { name: "Insurance certificate", status: "Expiring", validTo: "2026-10-20" }],
    documents: [{ name: "Chamber of Commerce extract.pdf", uploaded: "2025-02-11" }, { name: "Bank confirmation letter.pdf", uploaded: "2025-02-11" }],
    bank: { masked: "NL•• •••• •••• •••• 4821", verification: { state: "Approved", by: "Finance — Jonas Keller", at: "2025-02-14", reference: "FV-2025-0031" } },
    procurementDecision: { state: "Approved", by: "Priya Raman", at: "2025-02-13" },
    performance: { period: "Apr–Sep 2026", source: "Goods receipts and invoice disputes", delivery: 96, quality: 98, responsiveness: 91, disputes: 1 },
    openPOs: 3, openInvoices: 1, reviewVersion: 2,
    timeline: [
      { id: "t1", at: "2026-07-01 10:00", actor: "Priya Raman", event: "Contract price updated" },
      { id: "t2", at: "2025-02-14 09:30", actor: "Jonas Keller (Finance)", event: "Payment details verified", evidence: { label: "FV-2025-0031", href: "#" } },
      { id: "t3", at: "2025-02-13 15:10", actor: "Priya Raman", event: "Approved by Procurement", before: "Under diligence", after: "Active" },
    ],
  },
  {
    id: "sup-004", name: "Achieng & Partners Logistics", legalName: "Achieng and Partners Logistics Limited", country: "Kenya", registration: "PVT-7XQ2R9", status: "More information required",
    owner: "Grace Wanjiru", nextAction: "Supplier to provide tax PIN certificate and bank letter", dueDate: "2026-10-08",
    categories: ["Logistics"], sites: [{ name: "Depot", address: "Mombasa Road, Nairobi" }], contacts: [{ name: "Wanjiku Achieng", role: "Director", email: "w.achieng@apl.example" }],
    qualifications: [{ name: "KRA PIN certificate", status: "Missing" }, { name: "Goods-in-transit insurance", status: "Valid", validTo: "2027-04-30" }],
    documents: [{ name: "Certificate of incorporation.pdf", uploaded: "2026-09-28" }],
    procurementDecision: { state: "Returned", by: "Grace Wanjiru", at: "2026-10-01", note: "Tax PIN and bank letter missing" },
    duplicates: [{ name: "A&P Logistics Ltd", reason: "Same director and phone number" }],
    openPOs: 0, openInvoices: 0, reviewVersion: 1,
    timeline: [
      { id: "t1", at: "2026-10-01 11:20", actor: "Grace Wanjiru", event: "Returned for more information", reason: "Tax PIN certificate and bank letter missing", before: "Under diligence", after: "More information required" },
      { id: "t2", at: "2026-09-28 08:45", actor: "Daniel Otieno", event: "Proposed as new supplier" },
    ],
  },
  {
    id: "sup-003", name: "Studio Zit", legalName: "Studio Zit Interieur V.O.F.", country: "Netherlands", registration: "KvK 70011223", taxRef: "NL859900112B01", status: "Suspended",
    owner: "Priya Raman", nextAction: "Review open orders affected by suspension", dueDate: "2026-10-12",
    categories: ["Furniture"], sites: [{ name: "Showroom", address: "Westerstraat 44, Amsterdam" }], contacts: [{ name: "Eva de Boer", role: "Sales", email: "eva@studiozit.example" }],
    qualifications: [{ name: "Product safety declaration", status: "Expired", validTo: "2026-08-31" }],
    documents: [{ name: "Price list 2026.pdf", uploaded: "2026-01-04" }],
    bank: { masked: "NL•• •••• •••• •••• 9917", verification: { state: "Approved", by: "Finance — Jonas Keller", at: "2025-09-01", reference: "FV-2025-0102" } },
    procurementDecision: { state: "Approved", by: "Priya Raman", at: "2025-08-30" },
    performance: { period: "Apr–Sep 2026", source: "Goods receipts", delivery: 71, quality: 88, responsiveness: 64, disputes: 3 },
    openPOs: 1, openInvoices: 2, reviewVersion: 1,
    timeline: [{ id: "t1", at: "2026-09-30 14:00", actor: "Priya Raman", event: "Suspended", reason: "Product safety declaration expired; three late deliveries", before: "Active", after: "Suspended (effective 1 Oct 2026)" }],
  },
  {
    id: "sup-006", name: "Kifaru Safety Ltd", legalName: "Kifaru Safety Limited", country: "Kenya", registration: "PVT-K2L8M1", taxRef: "P051234567X", status: "Conditional",
    owner: "Grace Wanjiru", nextAction: "Finance to verify payment details", dueDate: "2026-10-06",
    categories: ["Safety equipment"], sites: [{ name: "Warehouse", address: "Industrial Area, Nairobi" }], contacts: [{ name: "Peter Mwangi", role: "Sales", email: "peter@kifaru.example" }],
    qualifications: [{ name: "KEBS certification", status: "Valid", validTo: "2027-05-31" }],
    documents: [{ name: "KRA PIN certificate.pdf", uploaded: "2026-09-20" }, { name: "Bank letter.pdf", uploaded: "2026-09-20" }],
    bank: { masked: "•••• •••• 3310", verification: { state: "Pending" } },
    procurementDecision: { state: "Approved", by: "Grace Wanjiru", at: "2026-09-25" },
    openPOs: 0, openInvoices: 0, reviewVersion: 2,
    timeline: [
      { id: "t1", at: "2026-09-26 09:00", actor: "Daniel Otieno", event: "Bank details changed — new review version", before: "v1", after: "v2" },
      { id: "t2", at: "2026-09-25 16:00", actor: "Grace Wanjiru", event: "Approved by Procurement — awaiting Finance verification" },
    ],
  },
  {
    id: "sup-007", name: "Pixelworks SaaS", legalName: "Pixelworks Software GmbH", country: "Germany", registration: "HRB 220145", status: "Under diligence",
    owner: "Priya Raman", nextAction: "Complete data-protection questionnaire review", dueDate: "2026-10-15",
    categories: ["Software"], sites: [], contacts: [], qualifications: [{ name: "Data processing agreement", status: "Missing" }], documents: [],
    procurementDecision: { state: "Pending" }, openPOs: 0, openInvoices: 0, reviewVersion: 1,
    timeline: [{ id: "t1", at: "2026-09-30 12:00", actor: "Priya Raman", event: "Diligence started" }],
  },
  {
    id: "sup-008", name: "QuickPrint Express", legalName: "QuickPrint Express B.V.", country: "Netherlands", registration: "KvK 80099881", status: "Rejected",
    owner: "Priya Raman", nextAction: "None — closed", dueDate: "—",
    categories: ["Printing"], sites: [], contacts: [], qualifications: [], documents: [],
    procurementDecision: { state: "Rejected", by: "Priya Raman", at: "2026-08-12", note: "Duplicate of existing preferred printer" }, openPOs: 0, openInvoices: 0, reviewVersion: 1,
    timeline: [{ id: "t1", at: "2026-08-12 10:00", actor: "Priya Raman", event: "Application rejected", reason: "Duplicate of existing preferred printer" }],
  },
];
