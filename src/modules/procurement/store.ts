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
import { updateCommercial } from "./commercial/store";

export interface ProcurementState {
  requests: PurchaseRequest[];
  metadata: Record<string, ReqMeta>;
  approvals: ApprovalTask[];
  suppliers: SupplierRecord[];
  sourcing: SourcingEvent[];
}

const KEY = "erp.procurement.demo.v3";
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

export function submitRequest(input: { title: string; requester: string; department: string; entity: string; currency: string; neededBy: string; lines: { description: string; qty: number; unitPrice: number; supplier?: string }[] }) {
  const state = getProcurement();
  const next = Math.max(1044, ...state.requests.map((r) => Number(r.id.split("-").at(-1)) || 0)) + 1;
  const id = `PR-2026-${next}`;
  const amount = input.lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
  const request: PurchaseRequest = { id, title: input.title, requester: input.requester, department: input.department, currency: input.currency, amount, neededBy: input.neededBy, status: "Submitted", owner: "Budget holder", nextAction: "Budget holder decision", dueDate: input.neededBy, submittedAt: stamp(), policy: [], timeline: [{ id: crypto.randomUUID(), at: stamp(), actor: input.requester, event: "Request submitted" }], conflicts: [], lines: input.lines };
  const meta: ReqMeta = { entity: input.entity, category: "Mixed", exceptions: [], versions: [{ version: 1, date: stamp(), by: input.requester, note: "Submitted" }], lines: input.lines.map((line, index) => ({ id: `${next}-${index + 1}`, description: line.description, category: "Unclassified", qty: line.qty, unitPrice: line.unitPrice, preferredSupplier: line.supplier && line.supplier !== "To be sourced by buyer" ? line.supplier : undefined, approval: "Pending", approvedQty: 0, allocatedQty: 0, orderedQty: 0, receivedQty: 0, cancelledQty: 0, route: "Unassigned", related: [] })) };
  const task: ApprovalTask = { id: `AT-${next}`, subject: input.title, recordType: "Purchase request", recordId: id, amount: { value: amount, currency: input.currency }, requester: input.requester, assignee: "Lukas Brandt", state: "Assigned", sla: { due: input.neededBy, hoursLeft: 72 }, policyVersion: "Demo approval policy v1", stages: [{ name: "Budget holder", mode: "Sequential", current: true, approvers: [{ name: "Lukas Brandt", state: "Pending", entity: input.entity }] }], policy: [], conflicts: [], documents: [], budget: { kind: "advisory", result: "pass", source: "Demo budget check", at: stamp(), detail: "Indicative only. No funds reserved." }, authorityLimit: Number.MAX_SAFE_INTEGER, approverEntity: input.entity, recordEntity: input.entity, consequential: amount > 10000 };
  saveProcurement((s) => ({ ...s, requests: [request, ...s.requests], metadata: { ...s.metadata, [id]: meta }, approvals: [task, ...s.approvals] }));
  return id;
}

export function decideApproval(id: string, decision: "approve" | "return" | "reject", reason: string, role: Role) {
  const state = getProcurement();
  const task = state.approvals.find((item) => item.id === id);
  if (!task) throw new Error("Approval task not found.");
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

export function routeLine(requestId: string, lineId: string, route: LineRoute, quantity?: number) {
  const state = getProcurement();
  if (state.requests.find((request) => request.id === requestId)?.status !== "Approved") throw new Error("The request must be fully approved before a line can be routed.");
  const meta = state.metadata[requestId];
  const line = meta?.lines.find((item) => item.id === lineId);
  if (!line || line.approval !== "Approved") throw new Error("Only approved lines can be routed.");
  if (line.lockedBy) throw new Error(`${line.lockedBy} is converting this line.`);
  const available = Math.max(0, line.approvedQty - line.allocatedQty - line.orderedQty - line.cancelledQty);
  const qty = quantity ?? available;
  if (qty <= 0 || qty > available) throw new Error("Quantity exceeds the unallocated approved balance.");
  const kind = route === "RFQ / tender" ? "RFQ" : route === "Contract / framework" ? "Contract" : route === "Direct PO" ? "PO" : null;
  if (!kind) throw new Error("Choose Direct PO, RFQ or Contract for a new allocation.");
  const request = state.requests.find((item) => item.id === requestId)!;
  const supplier = state.suppliers.find((item) => (line.preferredSupplier ? item.name === line.preferredSupplier : item.id === request.supplierId) && item.status === "Active");
  if (kind === "PO" && !supplier) throw new Error("Choose an active approved supplier before creating a direct PO.");
  const ref = kind === "RFQ" ? `RFQ-DEMO-${Date.now()}` : kind === "PO" ? `PO-2026-${Date.now()}` : `CONTRACT-RELEASE-${Date.now()}`;
  saveProcurement((s) => {
    const updated: ReqLine = { ...line, route, allocatedQty: line.allocatedQty + qty, related: [...line.related, { kind, ref }] };
    const event: SourcingEvent | undefined = kind === "RFQ" ? { id: ref, title: `${line.description} — ${qty} units`, method: "RFQ", state: "Draft", buyer: "Procurement buyer", entity: meta.entity, sourceLines: [`${requestId} / ${lineId}`], items: [{ description: line.description, qty, unit: "each" }], opensAt: "", closesAt: "", timeZone: "Europe/Amsterdam", opened: false, eligibility: "To be defined", terms: "To be defined", responseDocuments: [], criteria: [], invitations: [], qa: [], bids: [], amendments: [], nextAction: "Complete sourcing event", dueDate: "—" } : undefined;
    return { ...s, metadata: { ...s.metadata, [requestId]: { ...meta, lines: meta.lines.map((item) => item.id === lineId ? updated : item) } }, requests: s.requests.map((request) => request.id === requestId ? { ...request, nextAction: `${kind} allocation ${ref} created; ${kind === "PO" ? "draft not issued" : "not published"}`, timeline: [{ id: crypto.randomUUID(), at: stamp(), actor: "Procurement buyer (demo)", event: `${qty} × ${line.description} allocated to ${ref}` }, ...request.timeline] } : request), sourcing: event ? [event, ...s.sourcing] : s.sourcing };
  });
  if (kind === "PO" && supplier) updateCommercial((commercial) => ({ ...commercial, orders: [{ id: ref, supplier: supplier.name, entity: meta.entity, source: `${requestId} / ${lineId}`, sourceApprovedValue: qty * line.unitPrice, status: "Draft", version: 1, currency: request.currency, shipTo: meta.entity.includes("Kenya") ? "Nairobi Office" : meta.entity.includes("Germany") ? "Hamburg Works" : "Rotterdam HQ", billTo: meta.entity, taxRef: "Confirm tax treatment", terms: "Net 30", due: request.neededBy, line: { description: line.description, qty, price: line.unitPrice, received: 0, invoiced: 0, unit: "each", type: "Goods" }, supplierActive: true, revisions: [], audit: [{ at: stamp(), actor: "Procurement buyer (demo)", action: "Created draft PO", detail: `${qty} units from ${requestId} / ${lineId}; no supplier commitment yet` }] }, ...commercial.orders] }));
  return ref;
}
