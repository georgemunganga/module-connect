import type { PolicyResult } from "@/mock/types";

export type TaskState = "Assigned" | "Delegated" | "Overdue" | "Completed" | "Escalated";
export type BudgetCheck =
  | { kind: "advisory"; result: "pass" | "warn"; source: string; at: string; detail: string }
  | { kind: "reservation"; reference: string; source: string; at: string; detail: string }
  | { kind: "hard-fail"; source: string; at: string; detail: string }
  | { kind: "unavailable"; source: string; at: string; detail: string };

export interface Stage {
  name: string;
  mode: "Sequential" | "Parallel";
  quorum?: number;
  approvers: { name: string; state: "Pending" | "Approved" | "Returned" | "Rejected" | "Skipped"; at?: string; entity: string }[];
  current?: boolean;
}

export interface ApprovalTask {
  id: string;
  subject: string;
  recordType: "Purchase request" | "Purchase order" | "Supplier";
  recordId: string;
  amount?: { value: number; currency: string };
  requester: string;
  assignee: string;
  delegatedFrom?: { name: string; from: string; to: string; limit: number; currency: string };
  state: TaskState;
  sla: { due: string; hoursLeft: number; paused?: string };
  policyVersion: string;
  stages: Stage[];
  policy: PolicyResult[];
  conflicts: string[];
  documents: string[];
  budget: BudgetCheck;
  exception?: { approver: string; evidence: string; approvedAt: string };
  stale?: string;
  /** Approver's authority in the record currency. */
  authorityLimit: number;
  approverEntity: string;
  recordEntity: string;
  consequential: boolean;
  reassignedNote?: string;
}

const pol = (id: string, label: string, outcome: PolicyResult["outcome"], detail: string): PolicyResult => ({ id, label, outcome, detail });

export const approvalTasks: ApprovalTask[] = [
  {
    id: "AT-301", subject: "Laptops for Engineering", recordType: "Purchase request", recordId: "PR-2026-1042",
    amount: { value: 18450, currency: "EUR" }, requester: "Sanne de Vries", assignee: "Lukas Brandt", state: "Assigned",
    sla: { due: "2026-10-08 17:00", hoursLeft: 30 }, policyVersion: "Approval policy v4 (effective 1 Jul 2026)",
    stages: [
      { name: "Line manager", mode: "Sequential", approvers: [{ name: "Joost Meijer", state: "Approved", at: "2026-10-02 09:12", entity: "NL" }] },
      { name: "Budget holder + IT", mode: "Parallel", quorum: 2, current: true, approvers: [{ name: "Lukas Brandt", state: "Pending", entity: "NL" }, { name: "Ines Vogel (IT)", state: "Approved", at: "2026-10-02 14:40", entity: "NL" }] },
      { name: "Procurement", mode: "Sequential", approvers: [{ name: "Priya Raman", state: "Pending", entity: "NL" }] },
    ],
    policy: [pol("p1", "3 quotes above €10,000", "pass", "3 quotes attached"), pol("p2", "Supplier status", "warn", "Northwind insurance certificate expires 20 Oct")],
    conflicts: [], documents: ["Quote Northwind.pdf", "Quote Contoso.pdf", "Quote Dell.pdf"],
    budget: { kind: "advisory", result: "pass", source: "Budget check service (advisory)", at: "2026-10-02 14:41", detail: "Within indicative CAPEX-ENG-27 balance. No funds reserved." },
    authorityLimit: 25000, approverEntity: "Meridian Netherlands B.V.", recordEntity: "Meridian Netherlands B.V.", consequential: true,
  },
  {
    id: "AT-302", subject: "Freight Nairobi–Mombasa", recordType: "Purchase request", recordId: "PR-2026-1035",
    amount: { value: 940000, currency: "KES" }, requester: "Daniel Otieno", assignee: "Lukas Brandt", state: "Escalated",
    sla: { due: "2026-10-03 12:00", hoursLeft: -8 }, policyVersion: "Approval policy v4",
    stages: [{ name: "Budget holder", mode: "Sequential", current: true, approvers: [{ name: "Lukas Brandt", state: "Pending", entity: "NL" }] }],
    policy: [pol("p1", "Supplier onboarded", "fail", "Achieng & Partners not active")],
    conflicts: ["Approver is in a different entity (Meridian Netherlands B.V.) — Kenya approvals need a Kenya budget holder."],
    documents: [], budget: { kind: "hard-fail", source: "Finance budget service", at: "2026-10-03 08:00", detail: "No budget line for LOG-KE-27. Approval blocked." },
    authorityLimit: 2000000, approverEntity: "Meridian Netherlands B.V.", recordEntity: "Meridian Kenya Ltd", consequential: true,
    reassignedNote: "Escalated after SLA breach. Not auto-approved — it stays with a person.",
  },
  {
    id: "AT-303", subject: "Office chairs (version 2)", recordType: "Purchase request", recordId: "PR-2026-1038",
    amount: { value: 7200, currency: "EUR" }, requester: "Lukas Brandt", assignee: "Lukas Brandt", state: "Assigned",
    sla: { due: "2026-10-09 17:00", hoursLeft: 52, paused: "Paused while waiting for requester correction" }, policyVersion: "Approval policy v4",
    stages: [{ name: "Budget holder", mode: "Sequential", current: true, approvers: [{ name: "Lukas Brandt", state: "Pending", entity: "NL" }] }],
    policy: [pol("p1", "Segregation of duties", "fail", "You requested this — you can't give the final approval.")],
    conflicts: ["You are the requester."], documents: ["Chair spec.pdf"],
    budget: { kind: "unavailable", source: "Finance budget service", at: "2026-10-03 18:02", detail: "Service didn't respond. Decision can wait or proceed on advisory basis only." },
    stale: "Quantity changed 25 → 20 after the previous approval on 22 Sep. That approval no longer counts.",
    authorityLimit: 25000, approverEntity: "Meridian Netherlands B.V.", recordEntity: "Meridian Netherlands B.V.", consequential: false,
  },
  {
    id: "AT-304", subject: "Safety boots, Nairobi warehouse", recordType: "Purchase request", recordId: "PR-2026-1043",
    amount: { value: 386000, currency: "KES" }, requester: "Daniel Otieno", assignee: "Lukas Brandt", state: "Delegated",
    delegatedFrom: { name: "Grace Wanjiru", from: "2026-10-01", to: "2026-10-14", limit: 300000, currency: "KES" },
    sla: { due: "2026-10-07 12:00", hoursLeft: 4 }, policyVersion: "Approval policy v4",
    stages: [{ name: "Budget holder (delegated)", mode: "Sequential", current: true, approvers: [{ name: "Lukas Brandt (for Grace Wanjiru)", state: "Pending", entity: "KE" }] }],
    policy: [pol("p1", "Framework price", "pass", "Matches Kifaru contract")],
    conflicts: [], documents: ["Framework CT-2026-003.pdf"],
    budget: { kind: "reservation", reference: "FIN-RES-2026-8841", source: "Finance", at: "2026-10-02 10:15", detail: "Finance reserved KES 386,000 against OPEX-OPS-27." },
    authorityLimit: 300000, approverEntity: "Meridian Kenya Ltd", recordEntity: "Meridian Kenya Ltd", consequential: false,
    reassignedNote: "Reassigned from Grace Wanjiru after manager change on 1 Oct.",
  },
  {
    id: "AT-299", subject: "Conference catering (over budget)", recordType: "Purchase request", recordId: "PR-2026-1029",
    amount: { value: 4200, currency: "EUR" }, requester: "Femke Jansen", assignee: "Lukas Brandt", state: "Completed",
    sla: { due: "2026-09-28 17:00", hoursLeft: 0 }, policyVersion: "Approval policy v4",
    stages: [{ name: "Budget holder", mode: "Sequential", approvers: [{ name: "Lukas Brandt", state: "Approved", at: "2026-09-27 11:00", entity: "NL" }] }],
    policy: [pol("p1", "Budget", "warn", "Over budget — approved via exception")], conflicts: [], documents: ["CFO email.pdf"],
    budget: { kind: "hard-fail", source: "Finance budget service", at: "2026-09-26 09:00", detail: "Exceeded EVT-27 by €1,100." },
    exception: { approver: "Marieke Hoek (CFO)", evidence: "CFO email.pdf", approvedAt: "2026-09-26 16:30" },
    authorityLimit: 25000, approverEntity: "Meridian Netherlands B.V.", recordEntity: "Meridian Netherlands B.V.", consequential: false,
  },
];

/** Returns blocking reasons. Empty = approval permitted. */
export function approvalBlockers(t: ApprovalTask, me = "Lukas Brandt"): string[] {
  const b: string[] = [];
  if (t.state === "Completed") b.push("Already decided.");
  if (t.requester === me) b.push("You requested this. Someone else must give the final approval.");
  if (t.amount && t.amount.value > t.authorityLimit) b.push(`Amount exceeds your ${t.delegatedFrom ? "delegated " : ""}authority of ${t.amount.currency} ${t.authorityLimit.toLocaleString()}.`);
  if (t.approverEntity !== t.recordEntity) b.push(`You approve for ${t.approverEntity}; this belongs to ${t.recordEntity}.`);
  if (t.budget.kind === "hard-fail" && !t.exception) b.push("Budget check failed. Only an authorised exception route can unblock this.");
  if (t.stale) b.push("A material change made the earlier approval stale; review the change first.");
  return b;
}
