/** Optional capability. When false, Planning disappears from navigation and its page shows a disabled state. */
export const PLANNING_ENABLED = true;

export type PlanState = "Draft" | "Submitted" | "Reviewed" | "Approved" | "Active" | "Revised" | "Closed";

export interface PlanLine {
  id: string;
  requirement: string;
  category: string;
  estimate: number;
  currency: string;
  expected: string;
  funding?: string;
  method: "Catalog" | "Direct PO" | "RFQ" | "Tender" | "Framework call-off";
  owner: string;
  notes?: string;
  status: "Planned" | "Changed" | "Cancelled" | "Requested";
  previousEstimate?: number;
  linkedRequest?: string;
  actual?: number;
}

export interface PlanVersion {
  version: number;
  state: PlanState;
  date: string;
  by: string;
  note: string;
  locked: boolean;
}

export interface Plan {
  id: string;
  department: string;
  entity: string;
  period: string;
  state: PlanState;
  owner: string;
  nextAction: string;
  dueDate: string;
  versions: PlanVersion[];
  lines: PlanLine[];
}

export const plans: Plan[] = [
  {
    id: "PLAN-ENG-2027",
    department: "Engineering",
    entity: "Meridian Netherlands B.V.",
    period: "FY 2027",
    state: "Revised",
    owner: "Sanne de Vries",
    nextAction: "Procurement review of revision v3",
    dueDate: "2026-10-20",
    versions: [
      { version: 3, state: "Revised", date: "2026-09-29", by: "Sanne de Vries", note: "Laptop estimate raised; monitor refresh cancelled", locked: false },
      { version: 2, state: "Approved", date: "2026-06-12", by: "Priya Raman", note: "Approved by Procurement", locked: true },
      { version: 1, state: "Submitted", date: "2026-05-30", by: "Sanne de Vries", note: "First submission", locked: true },
    ],
    lines: [
      { id: "l1", requirement: "Laptop refresh, 40 developers", category: "IT hardware", estimate: 49200, currency: "EUR", expected: "2027-02-01", funding: "CAPEX-ENG-27", method: "Framework call-off", owner: "Sanne de Vries", status: "Changed", previousEstimate: 44000, linkedRequest: "PR-2026-1042", actual: 18450 },
      { id: "l2", requirement: "Cloud monitoring subscription", category: "Software", estimate: 12000, currency: "EUR", expected: "2027-01-01", method: "RFQ", owner: "Tom Bakker", notes: "Compare 3 vendors", status: "Planned" },
      { id: "l3", requirement: "Monitor refresh", category: "IT hardware", estimate: 8400, currency: "EUR", expected: "2027-04-01", funding: "CAPEX-ENG-27", method: "Catalog", owner: "Sanne de Vries", status: "Cancelled", notes: "Deferred to FY 2028" },
      { id: "l4", requirement: "Ergonomic chairs, new hires", category: "Furniture", estimate: 7200, currency: "EUR", expected: "2026-11-15", funding: "OPEX-ENG-27", method: "Catalog", owner: "Tom Bakker", status: "Requested", linkedRequest: "PR-2026-1038", actual: 7200 },
    ],
  },
  {
    id: "PLAN-OPS-KE-2027",
    department: "Operations Kenya",
    entity: "Meridian Kenya Ltd",
    period: "FY 2027",
    state: "Submitted",
    owner: "Daniel Otieno",
    nextAction: "Department head to review",
    dueDate: "2026-10-10",
    versions: [{ version: 1, state: "Submitted", date: "2026-09-30", by: "Daniel Otieno", note: "First submission", locked: false }],
    lines: [
      { id: "k1", requirement: "Safety boots, warehouse staff", category: "Safety equipment", estimate: 386000, currency: "KES", expected: "2026-11-01", funding: "OPEX-OPS-27", method: "Framework call-off", owner: "Daniel Otieno", status: "Requested", linkedRequest: "PR-2026-1043", actual: 386000 },
      { id: "k2", requirement: "Freight contract, Nairobi–Mombasa", category: "Logistics", estimate: 2250000, currency: "KES", expected: "2027-01-15", method: "Tender", owner: "Daniel Otieno", status: "Planned" },
    ],
  },
];
