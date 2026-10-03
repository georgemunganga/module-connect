import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useProcurement, saveProcurement, routeLine, decideApproval } from "@/modules/procurement/store";
import { requestVisible } from "@/modules/procurement/access";
import { deriveProgress, remaining } from "@/modules/procurement/requisition";
import type { LineRoute, ReqLine } from "@/modules/procurement/requisition";
import { useApp } from "@/platform/app-context";
import { AppShell } from "@/platform/components/AppShell";
import { ApprovalPanel } from "@/platform/components/ApprovalPanel";
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

const ROUTES: LineRoute[] = ["Direct PO", "RFQ / tender", "Contract / framework", "Deferred", "Cancelled"];
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
  const { role } = useApp();
  const { metadata, approvals } = useProcurement();
  const taskForRequest = approvals.find((task) => task.recordId === r.id && task.state !== "Completed");
  const meta = metadata[r.id];
  const lines = meta?.lines ?? [];
  const events = r.timeline;
  const status = r.status;
  const [notice, setNotice] = useState<string | null>(null);

  const money = new Intl.NumberFormat("en", { style: "currency", currency: r.currency, maximumFractionDigits: 0 });
  const isBuyer = BUYERS.includes(role);
  const isApprover = APPROVERS.includes(role);
  const isRequester = ["employee", "manager", "hr_ops", "payroll", "hr_admin"].includes(role);
  const progress = deriveProgress(lines);
  const changeRequest = (patch: Partial<typeof r>, event: string, reason?: string) => saveProcurement((state) => ({ ...state, requests: state.requests.map((item) => item.id === r.id ? { ...item, ...patch, timeline: [{ id: crypto.randomUUID(), at: now(), actor: "You (demo)", event, reason }, ...item.timeline] } : item) }));
  const updateLine = (id: string, patch: Partial<ReqLine>, event: string) => saveProcurement((state) => ({ ...state, metadata: { ...state.metadata, [r.id]: { ...state.metadata[r.id], lines: state.metadata[r.id].lines.map((line) => line.id === id ? { ...line, ...patch } : line) } }, requests: state.requests.map((item) => item.id === r.id ? { ...item, timeline: [{ id: crypto.randomUUID(), at: now(), actor: "You (demo)", event }, ...item.timeline] } : item) }));
  const convert = (line: ReqLine, partial: boolean) => {
    try {
      const available = Math.max(0, line.approvedQty - line.allocatedQty - line.orderedQty - line.cancelledQty);
      const qty = partial ? Math.ceil(available / 2) : available;
      const value = qty * line.unitPrice;
      if (meta?.budgetBalance && value > meta.budgetBalance.available) throw new Error(`Insufficient indicative balance: ${money.format(value)} exceeds ${money.format(meta.budgetBalance.available)}.`);
      const ref = routeLine(r.id, line.id, line.route, qty);
      setNotice(`${ref} created as a demo draft. No supplier message or financial commitment occurred.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not allocate this line."); }
  };

  // Header actions with permitted-state checks
  const actions: { label: string; why: string; enabled: boolean; run: () => void; tone?: "primary" }[] = [
    { label: "Submit", why: status === "Draft" ? "Draft is complete enough to send for approval." : "Only drafts can be submitted.", enabled: status === "Draft" && isRequester, run: () => { changeRequest({ status: "Submitted" }, "Submitted"); }, tone: "primary" },
    { label: "Withdraw", why: ["Submitted", "In review"].includes(status) && !lines.some((l) => l.orderedQty) ? "Nothing ordered yet, so you can still withdraw." : "Withdraw is only possible before any line is ordered.", enabled: isRequester && ["Submitted", "In review"].includes(status) && !lines.some((l) => l.orderedQty), run: () => { changeRequest({ status: "Cancelled" }, "Withdrawn by requester"); } },
    { label: "Return for correction", why: isBuyer ? "Buyer review found something the requester must fix." : "Only the buyer or approver can return a request.", enabled: (isBuyer || isApprover) && !["Draft", "Returned", "Cancelled"].includes(status), run: () => { changeRequest({ status: "Returned" }, "Returned for correction", "See line notes"); } },
    { label: "Reopen as new version", why: "Material edits after submission create a new version; the original is preserved.", enabled: isRequester && status === "Returned", run: () => { changeRequest({ status: "Draft" }, `Reopened as version ${(meta?.versions.length ?? 0) + 1}`); } },
    { label: "Close request", why: lines.every((l) => remaining(l) === 0 || l.route === "Cancelled" || l.route === "Deferred") ? "No remaining quantity to order." : "Can't close while approved quantity is still unordered.", enabled: isBuyer && lines.length > 0 && lines.every((l) => remaining(l) === 0 || l.route === "Cancelled" || l.route === "Deferred"), run: () => { changeRequest({ status: "Closed" as typeof status }, "Closed; remaining quantity cancelled"); } },
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
      summary={[
        { label: "Line progress", value: progress },
        { label: "Supplier", value: r.supplierId ? "Preference on file — verify before ordering" : "Not selected" },
        { label: "Total requested", value: money.format(r.amount) },
        { label: "Needed by", value: r.neededBy },
        { label: "Version", value: meta?.versions.length ? `v${meta.versions[0].version}` : "Draft" },
        { label: "Indicative budget", value: meta?.budgetBalance ? `${money.format(meta.budgetBalance.available)} — not reserved` : "Not checked" },
      ]}
      timeline={<StatusTimeline title="History" events={events} />}
    >
      <section aria-labelledby="actions-h" className="rounded-lg border bg-surface p-4">
        <h2 id="actions-h" className="text-sm font-semibold">Actions</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {actions.map((a) => (
            <li key={a.label} className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0"><span className="font-medium">{a.label}</span><span className="block text-xs text-muted-foreground">{a.why}</span></span>
              <Button size="sm" variant={a === primary ? "default" : "outline"} disabled={!a.enabled} onClick={a.run}>{a.label}</Button>
            </li>
          ))}
        </ul>
      </section>

      {notice ? <p role="alert" className="flex gap-2 rounded-md border border-danger/40 bg-danger-soft p-3 text-sm"><AlertTriangle className="size-4 shrink-0 text-danger" aria-hidden />{notice}</p> : null}

      <section aria-labelledby="lines-h" className="rounded-lg border bg-surface p-4">
        <h2 id="lines-h" className="text-sm font-semibold">Lines</h2>
        <p className="text-xs text-muted-foreground">Approved, ordered and received are separate facts. Header progress is worked out from these lines.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr><th className="py-2 pr-3">Line</th><th className="py-2 pr-3">Approval</th><th className="py-2 pr-3 text-right">Requested</th><th className="py-2 pr-3 text-right">Approved</th><th className="py-2 pr-3 text-right">Allocated</th><th className="py-2 pr-3 text-right">Ordered</th><th className="py-2 pr-3 text-right">Received</th><th className="py-2 pr-3 text-right">Remaining</th><th className="py-2 pr-3">Route</th><th className="py-2">Buyer actions</th></tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((l) => (
                <tr key={l.id} className="align-top">
                  <td className="py-2 pr-3">
                    <span className="font-medium">{l.description}</span>
                    <span className="block text-xs text-muted-foreground">{money.format(l.unitPrice)} each · {money.format(l.qty * l.unitPrice)}</span>
                    {l.splitNote ? <span className="block text-xs">{l.splitNote}</span> : null}
                    {l.cancelledQty ? <span className="block text-xs text-muted-foreground">{l.cancelledQty} cancelled (remainder)</span> : null}
                    {l.related.length ? <span className="mt-1 flex flex-wrap gap-1">{l.related.map((x) => x.kind === "RFQ" ? <Link key={x.ref} to="/procurement/sourcing/$id" params={{ id: x.ref }} className="rounded border px-1.5 text-xs text-primary underline">RFQ {x.ref}</Link> : x.kind === "PO" && !x.ref.includes("DRAFT") ? <Link key={x.ref} to="/procurement/orders/$id" params={{ id: x.ref }} className="rounded border px-1.5 text-xs text-primary underline">PO {x.ref}</Link> : <span key={x.ref} className="rounded border px-1.5 text-xs">{x.kind} {x.ref} {x.ref.includes("DRAFT") ? "· draft" : ""}</span>)}</span> : null}
                    {l.lockedBy ? <span className="mt-1 flex items-center gap-1 text-xs text-warning"><AlertTriangle className="size-3" aria-hidden />{l.lockedBy} is converting this line</span> : null}
                  </td>
                  <td className="py-2 pr-3"><StatusBadge status={l.approval} /></td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.qty}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.approvedQty}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.allocatedQty}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.orderedQty}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.receivedQty}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{remaining(l)}<span className="block text-xs text-muted-foreground">{money.format(remaining(l) * l.unitPrice)}</span></td>
                  <td className="py-2 pr-3">
                    {isBuyer ? (
                      <>
                        <Label htmlFor={`rt-${l.id}`} className="sr-only">Route for {l.description}</Label>
                        <select id={`rt-${l.id}`} className="h-8 rounded-md border bg-background px-2 text-xs" value={l.route}
                          disabled={status !== "Approved" || l.approval !== "Approved" || remaining(l) === 0} onChange={(e) => updateLine(l.id, { route: e.target.value as LineRoute }, `Line route selected: ${e.target.value}`)}>
                          <option disabled>Unassigned</option>{ROUTES.map((x) => <option key={x}>{x}</option>)}
                        </select>
                      </>
                    ) : l.route}
                  </td>
                  <td className="py-2">
                    {isBuyer ? (
                      <span className="flex flex-col gap-1">
                        {l.route === "RFQ / tender" && status === "Approved" && l.approval === "Approved" && !l.lockedBy && remaining(l) > 0 ? <Button size="sm" variant="outline" asChild><Link to="/procurement/sourcing/new" search={{ requestId: r.id, lineId: l.id }}>Create RFQ</Link></Button> : <Button size="sm" variant="outline" disabled={status !== "Approved" || l.approval !== "Approved" || l.lockedBy !== undefined || l.approvedQty - l.allocatedQty - l.orderedQty - l.cancelledQty <= 0 || !["Direct PO", "Contract / framework"].includes(l.route)} onClick={() => convert(l, false)}>Create {l.route === "Contract / framework" ? "contract release" : "draft PO"}</Button>}
                        {l.route !== "RFQ / tender" ? <Button size="sm" variant="ghost" disabled={status !== "Approved" || l.approval !== "Approved" || l.lockedBy !== undefined || l.approvedQty - l.allocatedQty - l.orderedQty - l.cancelledQty < 2 || !["Direct PO", "Contract / framework"].includes(l.route)} onClick={() => convert(l, true)}>Allocate half</Button> : null}
                      </span>
                    ) : <span className="text-xs text-muted-foreground">Buyer only</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {meta?.versions.length ? (
        <section className="rounded-lg border bg-surface p-4 text-sm">
          <h2 className="font-semibold">Versions</h2>
          <ul className="mt-2 space-y-1">{meta.versions.map((v) => <li key={v.version}>v{v.version} · {v.note} <span className="text-xs text-muted-foreground">— {v.by}, {v.date}</span></li>)}</ul>
        </section>
      ) : null}

      {isApprover && ["Submitted", "In review"].includes(status) ? (
        <ApprovalPanel decisionSummary={`Approve ${money.format(r.amount)} of spend for ${r.department}: ${r.title.toLowerCase()}.`} policy={r.policy} conflicts={r.conflicts} onDecision={(decision, reason) => { const task = taskForRequest; if (!task) return setNotice("No approval task is assigned to this request."); if (decision === "delegate") return setNotice("Delegation is preview-only. Open the approval task for available decisions."); try { decideApproval(task.id, decision === "approve" ? "approve" : decision === "return" ? "return" : "reject", reason, role); } catch (error) { setNotice(error instanceof Error ? error.message : "Decision could not be recorded."); } }} />
      ) : null}
    </RecordDetail>
  );
}
