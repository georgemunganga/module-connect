import type { Role } from "@/mock/types";
import type { ProcWorkItem, PurchaseRequest, Supplier } from "./types";

export const suppliers: Supplier[] = [
  {
    id: "sup-001",
    name: "Koninklijke Van der Berghe Kantoor BV",
    country: "Netherlands",
    category: "Office facilities",
    status: "Active",
    paymentTerms: "Net 30",
    currency: "EUR",
    contact: "orders@vdbkantoor.example",
    taxId: "NL8210.44.192.B01",
  },
  {
    id: "sup-002",
    name: "Nairobi Industrial Supplies Ltd",
    country: "Kenya",
    category: "Maintenance and safety",
    status: "Active",
    paymentTerms: "Net 45",
    currency: "KES",
    contact: "sales@nisupplies.example",
  },
  {
    id: "sup-003",
    name: "Brandenburg Cloud & Data GmbH",
    country: "Germany",
    category: "IT hardware",
    status: "On hold",
    paymentTerms: "Prepayment",
    currency: "EUR",
    contact: "accounts@bcdata.example",
    taxId: "DE314159265",
  },
  {
    id: "sup-004",
    name: "Achieng & Partners Logistics",
    country: "Kenya",
    category: "Freight",
    status: "Pending onboarding",
    paymentTerms: "Net 14",
    currency: "KES",
  },
  {
    id: "sup-005",
    name: "Meridian Print Collective",
    country: "Netherlands",
    category: "Print and branding",
    status: "Active",
    paymentTerms: "Net 30",
    currency: "EUR",
  },
];

export const purchaseRequests: PurchaseRequest[] = [
  {
    id: "PR-2026-1042",
    title: "Replacement laptops for Q4 engineering hires",
    requester: "Amara Chukwuemeka-Van der Berghe",
    department: "Engineering",
    supplierId: "sup-001",
    currency: "EUR",
    amount: 18450,
    neededBy: "2026-10-30",
    status: "Approved",
    owner: "Priya Raman (buyer)",
    nextAction: "Route remaining docking stations",
    dueDate: "2026-10-08",
    submittedAt: "2026-09-29",
    policy: [
      { id: "p1", label: "Within departmental IT budget", outcome: "pass", detail: "€18,450 of €60,000 remaining Q4 budget." },
      { id: "p2", label: "Preferred supplier used", outcome: "warn", detail: "Northwind Devices B.V. is active; insurance renewal is due 20 Oct." },
      { id: "p3", label: "Three-quote rule (> €10,000)", outcome: "pass", detail: "3 quotes attached, lowest compliant quote selected." },
    ],
    timeline: [
      { id: "t1", at: "2026-09-29 09:14", actor: "A. Chukwuemeka-Van der Berghe", event: "Request submitted", evidence: { label: "3 quotes (PDF)", href: "#" } },
      { id: "t2", at: "2026-09-30 11:02", actor: "System", event: "Policy checks completed", after: "1 warning: supplier on hold" },
      { id: "t3", at: "2026-10-01 15:40", actor: "Lukas Brandt", event: "Approved", reason: "Budget and supplier confirmed" },
      { id: "t4", at: "2026-09-29 10:30", actor: "Priya Raman", event: "Ordered 12 laptops on PO-2026-1042" },
    ],
    conflicts: [],
    lines: [
      { description: "14-inch engineering laptop, 32GB", qty: 6, unitPrice: 2450 },
      { description: "Docking station", qty: 6, unitPrice: 310 },
      { description: "4-year accidental damage cover", qty: 6, unitPrice: 295 },
    ],
  },
  {
    id: "PR-2026-1043",
    title: "Safety boots and hi-vis for Nairobi warehouse team",
    requester: "Wanjiru Muthoni",
    department: "Operations",
    supplierId: "sup-002",
    currency: "KES",
    amount: 386000,
    neededBy: "2026-10-15",
    status: "Submitted",
    owner: "Procurement triage",
    nextAction: "Assign a buyer",
    dueDate: "2026-10-06",
    submittedAt: "2026-10-02",
    policy: [
      { id: "p1", label: "Within departmental budget", outcome: "pass", detail: "KES 386,000 of KES 1.2m remaining." },
      { id: "p2", label: "Safety equipment standards", outcome: "pass", detail: "Items meet EN ISO 20345 requirement." },
    ],
    timeline: [
      { id: "t1", at: "2026-10-02 08:31", actor: "W. Muthoni", event: "Request submitted" },
      { id: "t2", at: "2026-10-02 08:31", actor: "System", event: "Policy checks completed", after: "All checks passed" },
    ],
    conflicts: [],
    lines: [
      { description: "Safety boots, sizes 38–47", qty: 22, unitPrice: 12500 },
      { description: "Hi-vis jackets, class 2", qty: 22, unitPrice: 5050 },
    ],
  },
  {
    id: "PR-2026-1038",
    title: "Office chairs for Amsterdam floor 3 refit",
    requester: "Sanne de Vries",
    department: "Facilities",
    supplierId: "sup-003",
    currency: "EUR",
    amount: 7200,
    neededBy: "2026-11-01",
    status: "Approved",
    owner: "M. Jansen (buyer)",
    nextAction: "Track delivery and remaining RFQ",
    dueDate: "2026-10-10",
    submittedAt: "2026-09-22",
    policy: [
      { id: "p1", label: "Within departmental budget", outcome: "pass", detail: "€7,200 of €25,000 refit budget." },
      { id: "p2", label: "Preferred supplier used", outcome: "pass", detail: "Studio Zit was approved when the PO was issued; suspended from new orders on 1 Oct." },
    ],
    timeline: [
      { id: "t1", at: "2026-09-22 14:05", actor: "S. de Vries", event: "Request submitted" },
      { id: "t2", at: "2026-09-24 10:12", actor: "P. Hendriks", event: "Approved", reason: "Within budget, contracted supplier" },
    ],
    conflicts: [],
    lines: [{ description: "Ergonomic task chair", qty: 18, unitPrice: 400 }],
  },
  {
    id: "PR-2026-1035",
    title: "Freight for Q3 stock replenishment, Mombasa → Nairobi",
    requester: "Otieno Odhiambo",
    department: "Logistics",
    supplierId: "sup-004",
    currency: "KES",
    amount: 940000,
    neededBy: "2026-10-03",
    status: "Returned",
    owner: "O. Odhiambo",
    nextAction: "Resubmit with completed supplier onboarding",
    dueDate: "2026-10-05",
    submittedAt: "2026-09-28",
    policy: [
      { id: "p1", label: "Supplier onboarding complete", outcome: "fail", detail: "Achieng & Partners Logistics has not completed onboarding — no tax ID or bank details on file." },
      { id: "p2", label: "Within departmental budget", outcome: "pass", detail: "KES 940,000 of KES 2.4m remaining." },
    ],
    timeline: [
      { id: "t1", at: "2026-09-28 16:44", actor: "O. Odhiambo", event: "Request submitted" },
      { id: "t2", at: "2026-09-29 09:20", actor: "R. Kamau", event: "Returned", reason: "Supplier onboarding incomplete — attach tax ID and bank letter, then resubmit." },
    ],
    conflicts: ["Needed-by date is tomorrow — resubmission is urgent."],
    lines: [{ description: "40ft container haulage, Mombasa → Nairobi", qty: 4, unitPrice: 235000 }],
  },
  {
    id: "PR-2026-1044",
    title: "Branded welcome packs for November onboarding cohort",
    requester: "Amara Chukwuemeka-Van der Berghe",
    department: "People",
    currency: "EUR",
    amount: 1150,
    neededBy: "2026-11-10",
    status: "Draft",
    owner: "A. Chukwuemeka-Van der Berghe",
    nextAction: "Complete supplier selection and submit",
    dueDate: "2026-10-20",
    submittedAt: "—",
    policy: [],
    timeline: [{ id: "t1", at: "2026-10-03 10:02", actor: "A. Chukwuemeka-Van der Berghe", event: "Draft saved" }],
    conflicts: [],
    lines: [{ description: "Welcome pack (notebook, bottle, tote)", qty: 25, unitPrice: 46 }],
  },
];

const queueItems: ProcWorkItem[] = [
  {
    id: "q1",
    band: "exception",
    title: "PR-2026-1035 returned — supplier not onboarded",
    context: "Freight needed tomorrow · Achieng & Partners Logistics missing tax ID and bank letter",
    due: "Overdue · due 3 Oct",
    overdue: true,
    to: "/procurement/requests/$id",
    params: { id: "PR-2026-1035" },
    roles: ["manager", "buyer", "proc_admin"],
  },
  {
    id: "q2",
    band: "approval",
    title: "PR-2026-1042 · €18,450 laptops — budget holder decision",
    context: "Engineering · supplier on hold warning · 3 quotes attached",
    due: "Due 8 Oct",
    to: "/procurement/requests/$id",
    params: { id: "PR-2026-1042" },
    roles: ["manager", "proc_admin"],
  },
  {
    id: "q3",
    band: "task",
    title: "Assign a buyer to PR-2026-1043",
    context: "Safety equipment, Nairobi warehouse · all policy checks passed",
    due: "Due 6 Oct",
    to: "/procurement/requests/$id",
    params: { id: "PR-2026-1043" },
    roles: ["buyer", "proc_admin"],
  },
  {
    id: "q4",
    band: "task",
    title: "Convert PR-2026-1038 to a purchase order",
    context: "Office chairs, approved 24 Sep · buyer: M. Jansen",
    due: "Due 10 Oct",
    to: "/procurement/requests/$id",
    params: { id: "PR-2026-1038" },
    roles: ["buyer"],
  },
  {
    id: "q5",
    band: "deadline",
    title: "Supplier review: Brandenburg Cloud & Data GmbH",
    context: "On hold since 12 Sep · prepayment terms under negotiation",
    due: "Review 12 Oct",
    to: "/procurement/suppliers",
    roles: ["supplier_steward", "proc_admin"],
  },
];

const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms));

/** Procurement mock API — same delay/failure conventions as the shared mock service. */
export const procApi = {
  async purchaseRequests() {
    await delay();
    return purchaseRequests;
  },
  async purchaseRequest(id: string) {
    await delay();
    return purchaseRequests.find((r) => r.id === id) ?? null;
  },
  async suppliers() {
    await delay();
    return suppliers;
  },
  async workQueue(role: Role) {
    await delay();
    return queueItems.filter((i) => i.roles.includes(role));
  },
};
