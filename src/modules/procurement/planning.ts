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
  snapshot?: PlanLine[];
}

export interface PlanHistory {
  at: string;
  actor: string;
  from: PlanState;
  to: PlanState;
  reason: string;
  version: number;
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
  history?: PlanHistory[];
}

export const plans: Plan[] = [
  {
    id: "PLAN-FAC-NL-2027", department: "Facilities", entity: "Meridian Netherlands B.V.", period: "FY 2027", state: "Draft", owner: "Lukas Brandt", nextAction: "Complete plan and submit", dueDate: "2026-10-31",
    versions: [{ version: 1, state: "Draft", date: "2026-10-03", by: "Lukas Brandt", note: "Draft created", locked: false }],
    lines: [{ id: "f1", requirement: "Office maintenance supplies", category: "Facilities", estimate: 5000, currency: "EUR", expected: "2027-02-01", funding: "OPEX-FAC-27", method: "Catalog", owner: "Lukas Brandt", status: "Planned" }],
  },
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

const KEY = "erp.procurement.plans.v1";
let current: Plan[] | undefined;
const listeners = new Set<() => void>();
const now = () => new Date().toISOString().slice(0, 16).replace("T", " ");
const seed = () => structuredClone(plans).map((plan) => ({
  ...plan,
  history: plan.history ?? [],
  versions: plan.versions.map((version) => ({
    ...version,
    snapshot: version.locked
      ? plan.id === "PLAN-ENG-2027" && version.version === 2
        ? plan.lines.map((line) => ({ ...line, estimate: line.previousEstimate ?? line.estimate, status: line.status === "Cancelled" ? "Planned" as const : line.status }))
        : undefined
      : structuredClone(plan.lines),
  })),
}));

export function getPlans(): Plan[] {
  if (!current) {
    try { const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null; current = raw ? JSON.parse(raw) as Plan[] : seed(); }
    catch { current = seed(); }
  }
  return current;
}

function savePlans(next: Plan[]) {
  current = next;
  if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

export function resetPlans() {
  current = seed();
  if (typeof window !== "undefined") localStorage.removeItem(KEY);
  listeners.forEach((listener) => listener());
}

export function usePlans() {
  const [state, setState] = useState<Plan[]>(seed);
  useEffect(() => {
    const listener = () => setState(getPlans());
    listeners.add(listener);
    listener();
    return () => { listeners.delete(listener); };
  }, []);
  return state;
}

const allowed: Record<PlanState, { next: PlanState; roles: Role[] }[]> = {
  Draft: [{ next: "Submitted", roles: ["manager", "proc_admin"] }],
  Submitted: [{ next: "Reviewed", roles: ["buyer", "proc_admin"] }],
  Reviewed: [{ next: "Approved", roles: ["proc_admin"] }],
  Approved: [{ next: "Active", roles: ["buyer", "proc_admin"] }, { next: "Revised", roles: ["manager", "proc_admin"] }],
  Active: [{ next: "Revised", roles: ["manager", "proc_admin"] }, { next: "Closed", roles: ["buyer", "proc_admin"] }],
  Revised: [{ next: "Reviewed", roles: ["buyer", "proc_admin"] }],
  Closed: [],
};

export function availablePlanTransitions(plan: Plan, role: Role) { return allowed[plan.state].filter((action) => action.roles.includes(role)).map((action) => action.next); }

export function transitionPlan(id: string, next: PlanState, role: Role, reason: string) {
  const plan = getPlans().find((item) => item.id === id);
  if (!plan || !availablePlanTransitions(plan, role).includes(next)) throw new Error("This transition is unavailable for the current role or state.");
  if (["Revised", "Closed"].includes(next) && !reason.trim()) throw new Error("A reason is required.");
  if (["Submitted", "Reviewed", "Approved"].includes(next)) {
    if (!plan.lines.some((line) => line.status !== "Cancelled")) throw new Error("Add at least one active requirement.");
    if (plan.lines.some((line) => !line.requirement.trim() || !line.category.trim() || !line.owner.trim() || !line.expected || line.estimate <= 0)) throw new Error("Complete requirement, category, owner, date and positive estimate on every line.");
    if (new Set(plan.lines.filter((line) => line.status !== "Cancelled").map((line) => line.currency)).size > 1) throw new Error("One plan must use a single currency.");
  }
  const version = next === "Revised" ? plan.versions[0].version + 1 : plan.versions[0].version;
  const action: PlanHistory = { at: now(), actor: role, from: plan.state, to: next, reason: reason.trim() || `${next} in demo`, version };
  const versions = next === "Revised"
    ? [{ version, state: next, date: now(), by: role, note: reason.trim(), locked: false, snapshot: structuredClone(plan.lines) }, ...plan.versions.map((item) => ({ ...item, locked: true }))]
    : plan.versions.map((item, index) => index === 0 ? { ...item, state: next, date: now(), by: role, note: reason.trim() || `${next} in demo`, snapshot: structuredClone(plan.lines) } : item);
  const nextAction: Record<PlanState, string> = { Draft: "Complete plan", Submitted: "Procurement review", Reviewed: "Approval by Procurement admin", Approved: "Activate or create request", Active: "Monitor and request planned spend", Revised: "Review revised plan", Closed: "None" };
  savePlans(getPlans().map((item) => item.id === id ? { ...item, state: next, versions, history: [action, ...(item.history ?? [])], nextAction: nextAction[next] } : item));
}

export function updatePlanLine(id: string, lineId: string, change: Partial<PlanLine>, role: Role) {
  const plan = getPlans().find((item) => item.id === id);
  if (!plan || !["Draft", "Revised"].includes(plan.state) || !["manager", "proc_admin"].includes(role)) throw new Error("This plan version is locked for editing.");
  const line = plan.lines.find((item) => item.id === lineId);
  if (!line) throw new Error("Plan line not found.");
  if (change.estimate !== undefined && (!Number.isFinite(change.estimate) || change.estimate <= 0)) throw new Error("Estimate must be positive.");
  const lines = plan.lines.map((item) => item.id === lineId ? { ...item, ...change, previousEstimate: change.estimate !== undefined && change.estimate !== item.estimate ? item.estimate : item.previousEstimate, status: change.status === "Cancelled" ? "Cancelled" as const : change.estimate !== undefined && change.estimate !== item.estimate ? "Changed" as const : change.status ?? item.status } : item);
  const versions = plan.versions.map((item, index) => index === 0 ? { ...item, snapshot: structuredClone(lines) } : item);
  savePlans(getPlans().map((item) => item.id === id ? { ...item, lines, versions } : item));
}

export function addPlanLine(id: string, role: Role) {
  const plan = getPlans().find((item) => item.id === id);
  if (!plan || !["Draft", "Revised"].includes(plan.state) || !["manager", "proc_admin"].includes(role)) throw new Error("This plan version is locked for editing.");
  const currency = plan.lines[0]?.currency ?? "EUR";
  const line: PlanLine = { id: crypto.randomUUID(), requirement: "", category: "", estimate: 0, currency, expected: "", funding: "", method: "Catalog", owner: plan.owner, status: "Planned" };
  const lines = [...plan.lines, line];
  savePlans(getPlans().map((item) => item.id === id ? { ...item, lines, versions: item.versions.map((version, index) => index === 0 ? { ...version, snapshot: structuredClone(lines) } : version) } : item));
  return line.id;
}

export function linkPlanRequest(id: string, lineId: string, requestId: string, amount: number) {
  const plan = getPlans().find((item) => item.id === id);
  if (!plan || !["Approved", "Active"].includes(plan.state)) return;
  const lines = plan.lines.map((line) => line.id === lineId ? { ...line, status: "Requested" as const, linkedRequest: requestId, actual: amount } : line);
  savePlans(getPlans().map((item) => item.id === id ? { ...item, lines, versions: item.versions.map((version, index) => index === 0 ? { ...version, snapshot: structuredClone(lines) } : version) } : item));
}
import { useEffect, useState } from "react";
import type { Role } from "@/mock/types";
