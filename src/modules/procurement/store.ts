import { useEffect, useState } from "react";
import { purchaseRequests } from "./data";
import { reqMeta } from "./requisition";
import { approvalTasks, approvalBlockers } from "./approvals";
import { supplierRecords } from "./suppliers";
import { sourcingEvents } from "./sourcing";
import type { PurchaseRequest } from "./types";
import type { ReqMeta, ReqLine, LineRoute } from "./requisition";
import type { ApprovalTask } from "./approvals";
import type { SupplierRecord } from "./suppliers";
import type { SourcingEvent } from "./sourcing";
import type { Role } from "@/mock/types";
import { getCommercial, updateCommercial } from "./commercial/store";
import { demoManagerForEntity } from "./access";

export interface ProcurementState {
  requests: PurchaseRequest[];
  metadata: Record<string, ReqMeta>;
  approvals: ApprovalTask[];
  suppliers: SupplierRecord[];
  sourcing: SourcingEvent[];
}

const KEY = "erp.procurement.demo.v5";
const seed = (): ProcurementState => {
  const state: ProcurementState = structuredClone({ requests: purchaseRequests, metadata: reqMeta, approvals: approvalTasks, suppliers: supplierRecords, sourcing: sourcingEvents });
  state.requests = state.requests.map((request) => {
    const lines = state.metadata[request.id]?.lines;
    return lines ? { ...request, lines: lines.map(({ description, qty, unitPrice }) => ({ description, qty, unitPrice })), amount: lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0) } : request;
  });
  return state;
};
let current: ProcurementState | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function getProcurement(): ProcurementState {
  if (!current) {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
      current = raw ? JSON.parse(raw) as ProcurementState : seed();
    } catch { current = seed(); }
  }
  return current;
}

export function saveProcurement(change: (state: ProcurementState) => ProcurementState) {
  current = change(getProcurement());
  if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(current));
  emit();
}

export function resetProcurement() {
  current = seed();
  if (typeof window !== "undefined") localStorage.removeItem(KEY);
  emit();
}

export function useProcurement() {
  // Render the same seed on the server and first client pass; hydrate browser
  // storage after mount so persisted demo data cannot cause an SSR mismatch.
  const [state, setState] = useState(seed);
  useEffect(() => {
    const listener = () => setState(getProcurement());
    listeners.add(listener);
    listener();
    return () => { listeners.delete(listener); };
  }, []);
  return state;
}

const stamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

export function submitRequest(input: { title: string; requester: string; department: string; entity: string; currency: string; neededBy: string; deliverTo: string; costCentre: string; project?: string; evidence?: string[]; lines: { description: string; qty: number; unitPrice: number; supplier?: string; kind?: "Goods" | "Service" | "Asset" | "Subscription" }[] }) {
  const state = getProcurement();
  const next = Math.max(1044, ...state.requests.map((r) => Number(r.id.split("-").at(-1)) || 0)) + 1;
  const id = `PR-2026-${next}`;
  const amount = input.lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
  const request: PurchaseRequest = { id, title: input.title, requester: input.requester, department: input.department, currency: input.currency, amount, neededBy: input.neededBy, status: "Submitted", owner: "Budget holder", nextAction: "Budget holder decision", dueDate: input.neededBy, submittedAt: stamp(), policy: [], timeline: [{ id: crypto.randomUUID(), at: stamp(), actor: input.requester, event: "Request submitted" }], conflicts: [], lines: input.lines };
  const meta: ReqMeta = { entity: input.entity, deliverTo: input.deliverTo, costCentre: input.costCentre, project: input.project, evidence: input.evidence, category: "Mixed", exceptions: [], versions: [{ version: 1, date: stamp(), by: input.requester, note: "Submitted" }], lines: input.lines.map((line, index) => ({ id: `${next}-${index + 1}`, description: line.description, category: "Unclassified", qty: line.qty, unitPrice: line.unitPrice, preferredSupplier: line.supplier && line.supplier !== "To be sourced by buyer" ? line.supplier : undefined, kind: line.kind, approval: "Pending", approvedQty: 0, allocatedQty: 0, orderedQty: 0, receivedQty: 0, cancelledQty: 0, route: "Unassigned", related: [] })) };
  const approverName = (input.entity.includes("Kenya") ? ["Grace Wanjiru", "Daniel Otieno"] : ["Lukas Brandt", "Marieke Hoek"]).find((name) => name !== input.requester) ?? "Independent approver";
  const task: ApprovalTask = { id: `AT-${next}`, subject: input.title, recordType: "Purchase request", recordId: id, amount: { value: amount, currency: input.currency }, requester: input.requester, assignee: approverName, state: "Assigned", sla: { due: input.neededBy, hoursLeft: 72 }, policyVersion: "Demo approval policy v1", stages: [{ name: "Budget holder", mode: "Sequential", current: true, approvers: [{ name: approverName, state: "Pending", entity: input.entity }] }], policy: [], conflicts: [], documents: input.evidence ?? [], budget: { kind: "advisory", result: "pass", source: "Demo budget check", at: stamp(), detail: "Indicative only. No funds reserved." }, authorityLimit: Number.MAX_SAFE_INTEGER, approverEntity: input.entity, recordEntity: input.entity, consequential: amount > 10000 };
  saveProcurement((s) => ({ ...s, requests: [request, ...s.requests], metadata: { ...s.metadata, [id]: meta }, approvals: [task, ...s.approvals] }));
  return id;
}

export function decideApproval(id: string, decision: "approve" | "return" | "reject", reason: string, role: Role) {
  const state = getProcurement();
  const task = state.approvals.find((item) => item.id === id);
  if (!task) throw new Error("Approval task not found.");
  if (role === "manager" && task.assignee !== demoManagerForEntity(task.recordEntity)) throw new Error("This approval is assigned to another person.");
  const stageName = task.stages.find((stage) => stage.current)?.name ?? "";
  const allowedRoles = stageName.includes("Procurement") ? ["buyer", "proc_admin"] : ["manager", "proc_admin"];
  if (!allowedRoles.includes(role)) throw new Error("This approval stage is assigned to another role.");
  if (decision === "approve" && approvalBlockers(task, task.assignee).length) throw new Error(approvalBlockers(task, task.assignee)[0]);
  if (task.state === "Completed") throw new Error("This task was already decided.");
  const nextStatus = decision === "approve" ? "Approved" : decision === "return" ? "Returned" : "Rejected";
  const currentIndex = task.stages.findIndex((stage) => stage.current);
  const stages = task.stages.map((stage, index) => ({ ...stage, current: decision === "approve" && index === currentIndex + 1, approvers: index === currentIndex ? stage.approvers.map((a) => a.state === "Pending" ? { ...a, state: nextStatus as "Approved" | "Returned" | "Rejected", at: stamp() } : a) : stage.approvers }));
  const nextStage = decision === "approve" ? stages[currentIndex + 1] : undefined;
  const finalApproval = decision === "approve" && !nextStage;
  saveProcurement((s) => ({
    ...s,
    approvals: s.approvals.map((item) => item.id === id ? { ...item, state: nextStage ? "Assigned" : "Completed", assignee: nextStage?.approvers.find((a) => a.state === "Pending")?.name ?? item.assignee, stages } : item),
    requests: s.requests.map((request) => request.id === task.recordId ? { ...request, status: finalApproval ? "Approved" : decision === "approve" ? "In review" : nextStatus, owner: nextStage?.approvers.find((a) => a.state === "Pending")?.name ?? (finalApproval ? "Procurement buyer" : request.requester), nextAction: nextStage ? `${nextStage.name} decision` : finalApproval ? "Route approved lines" : decision === "return" ? "Correct and resubmit" : "No further action", timeline: [{ id: crypto.randomUUID(), at: stamp(), actor: task.assignee, event: nextStage ? `${task.stages[currentIndex]?.name ?? "Approval"} approved` : nextStatus, reason, after: nextStage ? "In review" : nextStatus }, ...request.timeline] } : request),
    metadata: Object.fromEntries(Object.entries(s.metadata).map(([key, meta]) => [key, key === task.recordId && (finalApproval || decision !== "approve") ? { ...meta, lines: meta.lines.map((line) => ({ ...line, approval: nextStatus === "Approved" ? "Approved" : nextStatus, approvedQty: finalApproval ? line.qty : 0 })) } : meta])),
  }));
}

export function delegateApproval(id: string, delegate: string, reason: string, role: Role) {
  const state = getProcurement();
  const task = state.approvals.find((item) => item.id === id);
  if (!task || !["manager", "proc_admin"].includes(role) || !["Assigned", "Overdue", "Escalated"].includes(task.state) || task.approverEntity !== task.recordEntity || role === "manager" && task.assignee !== demoManagerForEntity(task.recordEntity)) throw new Error("This approval cannot be delegated across entities, by another approver, or in its current state.");
  if (!reason.trim() || !delegate.trim() || delegate === task.assignee || delegate === task.requester) throw new Error("Choose an independent delegate and record a reason.");
  const allowed = task.recordEntity.includes("Kenya") ? ["Grace Wanjiru", "Daniel Otieno"] : ["Marieke Hoek", "Joost Meijer", "Priya Raman", "Lukas Brandt"];
  if (!allowed.includes(delegate)) throw new Error("Delegate must belong to the same entity's approved demo authority list.");
  const from = new Date().toISOString().slice(0, 10);
  const sevenDays = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const to = task.sla.due.slice(0, 10) >= from ? task.sla.due.slice(0, 10) : sevenDays;
  const currentName = task.assignee;
  saveProcurement((current) => ({ ...current,
    approvals: current.approvals.map((item) => item.id === id ? { ...item, assignee: delegate, state: "Delegated", delegatedFrom: { name: currentName, from, to, limit: item.authorityLimit, currency: item.amount?.currency ?? "EUR" }, reassignedNote: `Delegated by ${currentName} to ${delegate} until ${to}. Reason: ${reason}`,
      stages: item.stages.map((stage) => stage.current ? { ...stage, approvers: stage.approvers.map((approver) => approver.name === currentName && approver.state === "Pending" ? { ...approver, name: delegate } : approver) } : stage) } : item),
    requests: current.requests.map((request) => request.id === task.recordId ? { ...request, owner: delegate, nextAction: `Delegated approval by ${delegate}`, timeline: [{ id: crypto.randomUUID(), at: stamp(), actor: currentName, event: `Approval delegated to ${delegate}`, reason }, ...request.timeline] } : request),
  }));
}

export function reassignApproval(id: string, assignee: string, reason: string, role: Role) {
  const state = getProcurement();
  const task = state.approvals.find((item) => item.id === id);
  if (!task || role !== "proc_admin" || task.state === "Completed") throw new Error("Only Procurement admin can reassign an open task.");
  const allowed = task.recordEntity.includes("Kenya") ? ["Grace Wanjiru", "Daniel Otieno"] : ["Marieke Hoek", "Joost Meijer", "Priya Raman", "Lukas Brandt"];
  if (!reason.trim() || !allowed.includes(assignee) || assignee === task.requester) throw new Error("Select an independent approver in the record entity and give a reason.");
  const previous = task.assignee;
  saveProcurement((current) => ({ ...current,
    approvals: current.approvals.map((item) => item.id === id ? { ...item, assignee, approverEntity: item.recordEntity, state: "Assigned", delegatedFrom: undefined, reassignedNote: `Reassigned from ${previous} to ${assignee}. Reason: ${reason}`,
      stages: item.stages.map((stage) => stage.current ? { ...stage, approvers: stage.approvers.map((approver) => approver.state === "Pending" ? { ...approver, name: assignee, entity: item.recordEntity } : approver) } : stage) } : item),
    requests: current.requests.map((request) => request.id === task.recordId ? { ...request, owner: assignee, nextAction: `Approval by ${assignee}`, timeline: [{ id: crypto.randomUUID(), at: stamp(), actor: "Procurement admin (demo)", event: `Approval reassigned to ${assignee}`, reason }, ...request.timeline] } : request),
  }));
}

export function routeLine(requestId: string, lineId: string, route: LineRoute, quantity?: number) {
  const state = getProcurement();
  const request = state.requests.find((item) => item.id === requestId);
  if (request?.status !== "Approved") throw new Error("The request must be fully approved before a line can be routed.");
  const meta = state.metadata[requestId];
  const line = meta?.lines.find((item) => item.id === lineId);
  if (!line || line.approval !== "Approved") throw new Error("Only approved lines can be routed.");
  if (line.lockedBy) throw new Error(`${line.lockedBy} is converting this line.`);
  const available = Math.max(0, line.approvedQty - line.allocatedQty - line.orderedQty - line.cancelledQty);
  const qty = quantity ?? available;
  if (qty <= 0 || qty > available) throw new Error("Quantity exceeds the unallocated approved balance.");
  const kind = route === "RFQ / tender" ? "RFQ" : route === "Contract / framework" ? "Contract" : route === "Direct PO" ? "PO" : null;
  if (!kind) throw new Error("Choose Direct PO, RFQ or Contract for a new allocation.");
  const supplier = state.suppliers.find((item) => (line.preferredSupplier ? item.name === line.preferredSupplier : item.id === request.supplierId) && item.status === "Active");
  if (kind !== "RFQ" && !supplier) throw new Error("An active approved supplier is required before creating a draft PO.");
  const commercial = getCommercial();
  const contract = kind === "Contract" ? commercial.contracts.find((item) =>
    item.kind === "Framework" && ["Active", "Expiring", "Renewed"].includes(item.state) && Boolean(item.signedVersion) &&
    item.supplier === supplier?.name && (item.entity === meta.entity || item.entity.includes(meta.entity) || meta.entity.includes(item.entity)) &&
    new Date(item.end).getTime() >= Date.now()
  ) : undefined;
  if (kind === "Contract" && !contract) throw new Error("No active signed framework is available for this supplier and entity.");
  if (contract) {
    const pending = commercial.orders.filter((item) => item.source === contract.id && ["Draft", "Pending approval", "Approved"].includes(item.status)).reduce((sum, item) => sum + item.line.qty * item.line.price, 0);
    if (qty * line.unitPrice > contract.ceiling - contract.committed - pending) throw new Error("Contract ceiling is insufficient for this release.");
  }
  const ref = kind === "RFQ" ? `RFQ-DEMO-${Date.now()}` : `PO-2026-${Date.now()}`;
  saveProcurement((current) => {
    const related: ReqLine["related"] = kind === "Contract" && contract ? [...line.related, { kind: "Contract", ref: contract.id }, { kind: "PO", ref }] : [...line.related, { kind, ref }];
    const updated: ReqLine = { ...line, route, allocatedQty: line.allocatedQty + qty, related };
    const event: SourcingEvent | undefined = kind === "RFQ" ? { id: ref, title: `${line.description} — ${qty} units`, method: "RFQ", state: "Draft", buyer: "Procurement buyer", entity: meta.entity, sourceLines: [`${requestId} / ${lineId}`], items: [{ description: line.description, qty, unit: "each" }], opensAt: "", closesAt: "", timeZone: "Europe/Amsterdam", opened: false, eligibility: "To be defined", terms: "To be defined", responseDocuments: [], criteria: [], invitations: [], qa: [], bids: [], amendments: [], nextAction: "Complete sourcing event", dueDate: "—" } : undefined;
    return { ...current, metadata: { ...current.metadata, [requestId]: { ...meta, lines: meta.lines.map((item) => item.id === lineId ? updated : item) } }, requests: current.requests.map((item) => item.id === requestId ? { ...item, nextAction: `${kind} allocation ${ref} created; ${kind === "RFQ" ? "not published" : "draft PO not issued"}`, timeline: [{ id: crypto.randomUUID(), at: stamp(), actor: "Procurement buyer (demo)", event: `${qty} × ${line.description} allocated to ${ref}` }, ...item.timeline] } : item), sourcing: event ? [event, ...current.sourcing] : current.sourcing };
  });
  if (kind !== "RFQ" && supplier) updateCommercial((current) => ({ ...current, orders: [{ id: ref, supplier: supplier.name, entity: meta.entity, source: contract?.id ?? `${requestId} / ${lineId}`, originRequest: contract ? `${requestId} / ${lineId}` : undefined, sourceApprovedValue: qty * line.unitPrice, status: "Draft", version: 1, currency: request.currency, shipTo: meta.deliverTo || (meta.entity.includes("Kenya") ? "Nairobi Office" : meta.entity.includes("Germany") ? "Hamburg Works" : "Rotterdam HQ"), billTo: meta.entity, taxRef: "Confirm tax treatment", terms: contract ? `Contract ${contract.id} signed v${contract.signedVersion}` : "Net 30", due: request.neededBy, line: { description: line.description, qty, price: line.unitPrice, received: 0, invoiced: 0, unit: line.kind === "Service" ? "service" : line.kind === "Subscription" ? "year" : "each", type: line.kind === "Service" || line.kind === "Subscription" ? "Service" : "Goods" }, supplierActive: true, revisions: [], audit: [{ at: stamp(), actor: "Procurement buyer (demo)", action: "Created draft PO", detail: `${qty} units from ${requestId} / ${lineId}${contract ? ` against ${contract.id}` : ""}; no supplier commitment yet` }] }, ...current.orders] }));
  return ref;
}
