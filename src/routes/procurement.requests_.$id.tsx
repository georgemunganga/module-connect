import { FormSelect } from "@/components/ui/form-select";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useProcurement, saveProcurement, routeLine, cancelApprovedLineRemainder, resubmitReturnedRequest, submitDraftRequest, withdrawRequest } from "@/modules/procurement/store";
import { useCommercial } from "@/modules/procurement/commercial/store";
import { requestVisible, isDemoRequester, sameEntity } from "@/modules/procurement/access";
import { availableToAllocate, deriveProgress, remaining } from "@/modules/procurement/requisition";
import type { LineRoute, ReqLine } from "@/modules/procurement/requisition";
import { useApp } from "@/platform/app-context";
import { AppShell } from "@/platform/components/AppShell";
import { RecordDetail } from "@/platform/components/RecordDetail";
import { RestrictedState } from "@/platform/components/States";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { StatusTimeline } from "@/platform/components/StatusTimeline";

export const Route = createFileRoute("/procurement/requests_/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.id} — Purchase request — Meridian ERP Procurement` },
      { name: "description", content: "Purchase request with line-by-line approval, routing, ordering and receipt progress." },
      { property: "og:title", content: `${params.id} — Purchase request` },
      { property: "og:description", content: "Line-level progress, routing and decisions for a purchase request." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RequestDetail,
});

const ROUTES: LineRoute[] = ["Direct PO", "RFQ / tender", "Contract / framework", "Deferred"];
const routeLabel: Record<LineRoute, string> = { "Direct PO": "Order directly", "RFQ / tender": "Ask for quotes", "Contract / framework": "Use an existing contract", Deferred: "Buy later", Cancelled: "Do not buy" , Unassigned: "Choose how to buy" };
const BUYERS = ["buyer", "proc_admin"];
const APPROVERS = ["manager", "proc_admin"];
const now = () => new Date().toISOString().slice(0, 16).replace("T", " ");

function RequestDetail() {
  const { id } = Route.useParams();
  const { role, entityId } = useApp();
  const state = useProcurement();
  const r = state.requests.find((item) => item.id === id);
  return <AppShell>{r && requestVisible(role, entityId, state.metadata[id]?.entity, r.requester, r.department) ? <Workspace r={r} /> : <RestrictedState />}</AppShell>;
}

function Workspace({ r }: { r: import("@/modules/procurement/types").PurchaseRequest }) {
  const { role, entityId, approvalActor } = useApp();
  const { metadata, approvals, suppliers } = useProcurement();
  const receipts = useCommercial().receipts;
  const taskForRequest = approvals.find((task) => task.recordId === r.id && task.state !== "Completed");
  const meta = metadata[r.id];
  const lines = meta?.lines ?? [];
  const events = r.timeline;
  const status = r.status;
  const [notice, setNotice] = useState<string | null>(null);
  const [section, setSection] = useState<"Items" | "Details" | "History">("Items");
  const [cancelLine, setCancelLine] = useState<{ id: string; available: number } | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const money = new Intl.NumberFormat("en", { style: "currency", currency: r.currency, maximumFractionDigits: 0 });
  const isBuyer = BUYERS.includes(role);
  const isApprover = APPROVERS.includes(role) && Boolean(taskForRequest && (role === "proc_admin" || taskForRequest.stages.some((stage) => stage.current && stage.approvers.some((approver) => approver.name === approvalActor && approver.state === "Pending"))));
  const isRequester = ["employee", "manager", "hr_ops", "payroll", "hr_admin"].includes(role) && isDemoRequester(r.requester, role, entityId);
  const progress = deriveProgress(lines);
  const changeRequest = (patch: Partial<typeof r>, event: string, reason?: string) => saveProcurement((state) => ({ ...state, requests: state.requests.map((item) => item.id === r.id ? { ...item, ...patch, timeline: [{ id: crypto.randomUUID(), at: now(), actor: "You (demo)", event, reason }, ...item.timeline] } : item) }));
  const updateLine = (id: string, patch: Partial<ReqLine>, event: string) => saveProcurement((state) => ({ ...state, metadata: { ...state.metadata, [r.id]: { ...state.metadata[r.id], lines: state.metadata[r.id].lines.map((line) => line.id === id ? { ...line, ...patch } : line) } }, requests: state.requests.map((item) => item.id === r.id ? { ...item, timeline: [{ id: crypto.randomUUID(), at: now(), actor: "You (demo)", event }, ...item.timeline] } : item) }));
  const convert = (line: ReqLine, partial: boolean) => {
    try {
      const available = Math.max(0, line.approvedQty - line.allocatedQty - line.orderedQty - line.cancelledQty);
      const qty = partial ? Math.ceil(available / 2) : available;
      const value = qty * line.unitPrice;
      if (meta?.budgetBalance && value > meta.budgetBalance.available) throw new Error(`This may be over budget: ${money.format(value)} is more than the estimated available amount of ${money.format(meta.budgetBalance.available)}.`);
      const ref = routeLine(r.id, line.id, line.route, qty);
      setNotice(`${ref} is ready as a draft. It has not been sent to the vendor or Finance.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not start buying this item."); }
  };
  const cancelRemainder = () => {
    if (!cancelLine) return;
    try {
      const quantity = cancelApprovedLineRemainder(r.id, cancelLine.id, cancelLine.available, cancelReason, role, entityId);
      setNotice(`${quantity} unallocated units cancelled. Existing quotes and orders were kept.`);
      setCancelLine(null);
      setCancelReason("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not cancel the remaining quantity."); }
  };

  // Header actions with permitted-state checks
  const actions: { label: string; why: string; enabled: boolean; run: () => void; tone?: "primary" }[] = [
    { label: "Withdraw", why: ["Submitted", "In review"].includes(status) && !lines.some((l) => l.allocatedQty || l.orderedQty || l.related.length) ? "No quotes or orders have started yet." : "You can withdraw only before quotes or orders start.", enabled: isRequester && ["Submitted", "In review"].includes(status) && !lines.some((l) => l.allocatedQty || l.orderedQty || l.related.length), run: () => { try { withdrawRequest(r.id, r.requester); setNotice("Request withdrawn. Any open approval tasks were closed."); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not withdraw request."); } } },
    { label: "Close request", why: status !== "Approved" ? "Only an approved request can be closed." : lines.every((l) => remaining(l) === 0 || l.route === "Cancelled" || l.route === "Deferred") ? "No remaining quantity to order." : "Can't close while approved quantity is still unordered.", enabled: isBuyer && status === "Approved" && lines.length > 0 && lines.every((l) => remaining(l) === 0 || l.route === "Cancelled" || l.route === "Deferred"), run: () => { changeRequest({ status: "Closed" as typeof status }, "Closed; remaining quantity cancelled"); } },
  ];
  const primary = actions.find((a) => a.enabled && a.tone === "primary") ?? actions.find((a) => a.enabled);

  return (
    <RecordDetail
      reference={r.id}
      title={r.title}
      subtitle={`${r.department} · ${meta?.entity ?? ""} · requested by ${r.requester}`}
      status={status}
      owner={r.owner}
      nextAction={`${r.nextAction} · due ${r.dueDate}`}
      primaryAction={primary ? <Button onClick={primary.run}>{primary.label}</Button> : undefined}
      summary={[
        { label: "Total requested", value: money.format(r.amount) },
        { label: "Needed by", value: r.neededBy },
        { label: "Deliver to", value: meta?.deliverTo ?? "Not recorded on seed request" },
        { label: "Buying progress", value: progress },
      ]}
    >
      {notice ? <p role="alert" className="flex gap-2 rounded-md border border-danger/40 bg-danger-soft p-3 text-sm"><AlertTriangle className="size-4 shrink-0 text-danger" aria-hidden />{notice}</p> : null}

      <div role="tablist" aria-label="Purchase request sections" className="flex gap-1 overflow-x-auto border-b">
        {(["Items", "Details", "History"] as const).map((name) => <button key={name} type="button" role="tab" aria-selected={section === name} onClick={() => setSection(name)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium ${section === name ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{name}{name === "Items" ? ` (${lines.length})` : ""}</button>)}
      </div>

      {section === "Items" ? <div role="tabpanel" aria-label="Items" className="space-y-6">

      {isRequester && ["Draft", "Returned"].includes(status) && meta ? <CorrectionEditor request={r} meta={meta} onResult={setNotice} /> : null}

      <section aria-labelledby="lines-h" className="space-y-3">
        <h2 id="lines-h" className="text-base font-semibold">Items in this request</h2>
        {lines.map((l) => (
          <article key={l.id} className="rounded-lg border bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{l.description}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{money.format(l.unitPrice)} each · {money.format(l.qty * l.unitPrice)} estimated total</p>
              </div>
              <StatusBadge status={l.approval} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 border-t pt-4 text-sm sm:grid-cols-4">
              <div><dt className="text-muted-foreground">Requested</dt><dd className="mt-1 text-lg font-semibold">{l.qty}</dd></div>
              <div><dt className="text-muted-foreground">Approved</dt><dd className="mt-1 text-lg font-semibold">{l.approvedQty}</dd></div>
              <div><dt className="text-muted-foreground">Ordered</dt><dd className="mt-1 text-lg font-semibold">{l.orderedQty}</dd></div>
              <div><dt className="text-muted-foreground">Not yet being bought</dt><dd className="mt-1 text-lg font-semibold">{availableToAllocate(l)}</dd></div>
            </dl>
            {isBuyer ? <div className="mt-4 flex flex-wrap items-end gap-3 border-t pt-4">
              <div><Label htmlFor={`rt-${l.id}`}>How to buy</Label><FormSelect id={`rt-${l.id}`} className="mt-1 h-9 rounded-md border bg-background px-3 text-sm" value={l.route} disabled={status !== "Approved" || l.approval !== "Approved" || availableToAllocate(l) === 0} onChange={(e) => updateLine(l.id, { route: e.target.value as LineRoute }, `Line route selected: ${e.target.value}`)}><option value="Unassigned" disabled>{routeLabel.Unassigned}</option>{l.route === "Cancelled" ? <option value="Cancelled" disabled>{routeLabel.Cancelled}</option> : null}{ROUTES.map((x) => <option key={x} value={x}>{routeLabel[x]}</option>)}</FormSelect></div>
              <div><Label htmlFor={`supplier-${l.id}`}>Preferred vendor</Label><FormSelect id={`supplier-${l.id}`} className="mt-1 h-9 max-w-52 rounded-md border bg-background px-3 text-sm" value={l.preferredSupplier ?? ""} disabled={status !== "Approved" || l.approval !== "Approved" || l.orderedQty > 0 || l.allocatedQty > 0} onChange={(event) => updateLine(l.id, { preferredSupplier: event.target.value || undefined }, `Supplier preference set for ${l.description}: ${event.target.value || "none"}`)}><option value="">Choose approved vendor</option>{suppliers.filter((supplier) => supplier.status === "Active" && sameEntity(supplier.country, entityId)).map((supplier) => <option key={supplier.id}>{supplier.name}</option>)}</FormSelect></div>
              {l.route === "RFQ / tender" && status === "Approved" && l.approval === "Approved" && !l.lockedBy && availableToAllocate(l) > 0 ? <Button asChild><Link to="/procurement/sourcing/new" search={{ requestId: r.id, lineId: l.id }}>Ask for quotes</Link></Button> : ["Direct PO", "Contract / framework"].includes(l.route) && status === "Approved" && l.approval === "Approved" && !l.lockedBy && availableToAllocate(l) > 0 ? <Button onClick={() => convert(l, false)}>{l.route === "Contract / framework" ? "Order from contract" : "Start order"}</Button> : null}
              {l.route !== "RFQ / tender" && ["Direct PO", "Contract / framework"].includes(l.route) && status === "Approved" && l.approval === "Approved" && !l.lockedBy && l.approvedQty - l.allocatedQty - l.orderedQty - l.cancelledQty >= 2 ? <Button variant="outline" onClick={() => convert(l, true)}>Buy part of this</Button> : null}
              {status === "Approved" && l.approval === "Approved" && !l.lockedBy && availableToAllocate(l) > 0 ? <Button variant="outline" onClick={() => { setCancelLine({ id: l.id, available: availableToAllocate(l) }); setCancelReason(""); setNotice(null); }}>Cancel unallocated balance</Button> : null}
            </div> : <p className="mt-4 border-t pt-3 text-sm text-muted-foreground">Buying route: {routeLabel[l.route]}</p>}
            {isBuyer && cancelLine?.id === l.id ? <div className="mt-3 rounded-md border border-warning/40 bg-warning-soft p-3 text-sm">
              <p>Cancel {cancelLine.available} approved units that have not entered a quote or order. Existing allocations and orders stay in place.</p>
              <Label htmlFor={`cancel-reason-${l.id}`} className="mt-3 block">Why are these units no longer needed?</Label>
              <Textarea id={`cancel-reason-${l.id}`} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} className="mt-1" />
              <div className="mt-3 flex gap-2"><Button onClick={cancelRemainder} disabled={!cancelReason.trim()}>Confirm cancellation</Button><Button variant="outline" onClick={() => { setCancelLine(null); setCancelReason(""); }}>Keep units</Button></div>
            </div> : null}
            <details className="mt-4 rounded-md bg-surface-muted px-3 py-2 text-sm">
              <summary className="cursor-pointer font-medium">See delivery and linked records</summary>
              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"><div><dt className="text-muted-foreground">Being bought</dt><dd>{l.allocatedQty}</dd></div><div><dt className="text-muted-foreground">Delivered</dt><dd>{l.receivedQty}</dd></div><div><dt className="text-muted-foreground">Cancelled</dt><dd>{l.cancelledQty}</dd></div><div><dt className="text-muted-foreground">Value not yet being bought</dt><dd>{money.format(availableToAllocate(l) * l.unitPrice)}</dd></div></dl>
              {l.splitNote ? <p className="mt-2">{l.splitNote}</p> : null}
              {l.lockedBy ? <p className="mt-2 text-warning">{l.lockedBy} is working on this item</p> : null}
              {l.related.length ? <div className="mt-3 flex flex-wrap gap-2">{l.related.map((x) => x.kind === "RFQ" ? <Link key={x.ref} to="/procurement/sourcing/$id" params={{ id: x.ref }} className="text-primary underline">Quote request {x.ref}</Link> : x.kind === "PO" && !x.ref.includes("DRAFT") ? <Link key={x.ref} to="/procurement/orders/$id" params={{ id: x.ref }} className="text-primary underline">Order {x.ref}</Link> : x.kind === "Receipt" && receipts.some((receipt) => receipt.id === x.ref) ? <Link key={x.ref} to="/procurement/receiving/$id" params={{ id: receipts.find((receipt) => receipt.id === x.ref)!.poId }} className="text-primary underline">Delivery {x.ref}</Link> : <span key={x.ref}>{x.kind} {x.ref} {x.ref.includes("DRAFT") ? "· draft" : ""}</span>)}</div> : <p className="mt-2 text-muted-foreground">No linked quotes, orders or deliveries yet.</p>}
            </details>
          </article>
        ))}
      </section>

      {isApprover && ["Submitted", "In review"].includes(status) && taskForRequest ? <section className="rounded-lg border bg-surface p-4 text-sm"><h2 className="font-semibold">Approval decision</h2><p className="mt-1 text-muted-foreground">Review the current stage, budget result and policy blockers before deciding.</p><Button className="mt-3" asChild><Link to="/procurement/approvals/$id" params={{ id: taskForRequest.id }}>Open approval task</Link></Button></section> : null}
      </div> : null}

      {section === "Details" ? <section role="tabpanel" aria-label="Details" className="rounded-lg border bg-surface p-5">
        <h2 className="text-base font-semibold">More about this request</h2>
        <dl className="mt-4 grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-muted-foreground">Requested by</dt><dd className="mt-1 font-medium">{r.requester}</dd></div>
          <div><dt className="text-muted-foreground">Department</dt><dd className="mt-1 font-medium">{r.department}</dd></div>
          <div><dt className="text-muted-foreground">Preferred vendor</dt><dd className="mt-1 font-medium">{r.supplierId ? "Suggested; check before ordering" : "Not selected"}</dd></div>
          <div><dt className="text-muted-foreground">Cost centre</dt><dd className="mt-1 font-medium">{meta?.costCentre ?? "Not recorded"}</dd></div>
          <div><dt className="text-muted-foreground">Project</dt><dd className="mt-1 font-medium">{meta?.project || "Not linked"}</dd></div>
          <div><dt className="text-muted-foreground">Budget check</dt><dd className="mt-1 font-medium">{meta?.budgetBalance ? `${money.format(meta.budgetBalance.available)} available; Finance has not set this aside` : "Not checked"}</dd></div>
        </dl>
        {meta?.evidence?.length ? <div className="mt-6 border-t pt-4"><h3 className="font-semibold">Supporting files</h3><ul className="mt-2 list-disc pl-5 text-sm">{meta.evidence.map((reference) => <li key={reference}>{reference} · name only; no file uploaded in this demo</li>)}</ul></div> : null}
        {meta?.versions.length ? <div className="mt-6 border-t pt-4"><h3 className="font-semibold">Changes to this request</h3><ul className="mt-2 space-y-2 text-sm">{meta.versions.map((v) => <li key={v.version}><span className="font-medium">Version {v.version} · {v.note}</span><span className="block text-muted-foreground">{v.by} · {v.date}</span></li>)}</ul></div> : null}
      </section> : null}

      {section === "History" ? <div role="tabpanel" aria-label="History" className="rounded-lg border bg-surface p-5"><StatusTimeline title="History" events={events} /></div> : null}
    </RecordDetail>
  );
}

function CorrectionEditor({ request, meta, onResult }: { request: import("@/modules/procurement/types").PurchaseRequest; meta: import("@/modules/procurement/requisition").ReqMeta; onResult: (message: string) => void }) {
  const isDraft = request.status === "Draft";
  const [title, setTitle] = useState(request.title);
  const [neededBy, setNeededBy] = useState(request.neededBy);
  const [deliverTo, setDeliverTo] = useState(meta.deliverTo ?? "");
  const [costCentre, setCostCentre] = useState(meta.costCentre ?? "");
  const [project, setProject] = useState(meta.project ?? "");
  const [evidence, setEvidence] = useState((meta.evidence ?? []).join("\n"));
  const [lines, setLines] = useState(meta.lines.map(({ id, description, qty, unitPrice }) => ({ id, description, qty, unitPrice })));
  const update = (id: string, patch: Partial<(typeof lines)[number]>) => setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
  return <section className="rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm" aria-labelledby="correct-h">
    <h2 id="correct-h" className="font-semibold">{isDraft ? "Complete and submit draft" : "Correct and resubmit"}</h2>
    <p className="mt-1 text-muted-foreground">{isDraft ? "Fill in the required details before asking for approval." : "Check the reason in History, fix the request, and send it again. If there is still a rule or budget problem, approval will stay blocked."}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2"><Label htmlFor="correct-title">Request title</Label><Input id="correct-title" value={title} onChange={(event) => setTitle(event.target.value)} /></div>
      <div><Label htmlFor="correct-needed">Needed by</Label><Input id="correct-needed" type="date" value={neededBy.slice(0, 10)} onChange={(event) => setNeededBy(event.target.value)} /></div>
      <div><Label htmlFor="correct-deliver">Deliver to</Label><Input id="correct-deliver" value={deliverTo} onChange={(event) => setDeliverTo(event.target.value)} /></div>
      <div><Label htmlFor="correct-cost">Cost centre</Label><Input id="correct-cost" value={costCentre} onChange={(event) => setCostCentre(event.target.value)} /></div>
      <div><Label htmlFor="correct-project">Project, if applicable</Label><Input id="correct-project" value={project} onChange={(event) => setProject(event.target.value)} /></div>
      <div className="sm:col-span-2"><Label htmlFor="correct-evidence">Evidence references, one per line</Label><Textarea id="correct-evidence" value={evidence} onChange={(event) => setEvidence(event.target.value)} /></div>
    </div>
    <div className="mt-4 space-y-3">{lines.map((line, index) => <div key={line.id} className="grid gap-2 rounded-md border bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_7rem_9rem]">
      <div><Label htmlFor={`correct-description-${line.id}`}>Line {index + 1} description</Label><Input id={`correct-description-${line.id}`} value={line.description} onChange={(event) => update(line.id, { description: event.target.value })} /></div>
      <div><Label htmlFor={`correct-qty-${line.id}`}>Quantity</Label><Input id={`correct-qty-${line.id}`} type="number" min="1" value={line.qty} onChange={(event) => update(line.id, { qty: Number(event.target.value) })} /></div>
      <div><Label htmlFor={`correct-price-${line.id}`}>Unit price</Label><Input id={`correct-price-${line.id}`} type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => update(line.id, { unitPrice: Number(event.target.value) })} /></div>
    </div>)}</div>
    <div className="mt-4 rounded-md border bg-surface p-3 text-xs"><strong>Review change:</strong> {request.amount.toLocaleString()} → {lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0).toLocaleString()} {request.currency} · {isDraft ? "Draft" : `v${meta.versions[0]?.version ?? 1}`} → v{isDraft ? 1 : (meta.versions[0]?.version ?? 1) + 1}</div>
    <Button className="mt-4" onClick={() => { try { const input = { title, neededBy, deliverTo, costCentre, project, evidence: evidence.split("\n").map((item) => item.trim()).filter(Boolean), lines }; const task = isDraft ? submitDraftRequest(request.id, request.requester, input) : resubmitReturnedRequest(request.id, request.requester, input); onResult(`Request submitted. Approval task ${task} is assigned.`); } catch (error) { onResult(error instanceof Error ? error.message : "Request could not be submitted."); } }}>{isDraft ? "Submit draft for approval" : "Resubmit corrected request"}</Button>
  </section>;
}
