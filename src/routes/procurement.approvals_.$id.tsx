import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AppShell } from "@/platform/components/AppShell";
import { ApprovalPanel } from "@/platform/components/ApprovalPanel";
import { PageHeader } from "@/platform/components/PageHeader";
import { EmptyState } from "@/platform/components/States";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { approvalBlockers, slaLabel } from "@/modules/procurement/approvals";
import type { ApprovalTask } from "@/modules/procurement/approvals";
import { money } from "@/modules/procurement/catalog";
import { useProcurement, decideApproval, delegateApproval, reassignApproval } from "@/modules/procurement/store";
import { sameEntity, demoApprovalActors } from "@/modules/procurement/access";
import { useApp } from "@/platform/app-context";
import { RestrictedState } from "@/platform/components/States";

export const Route = createFileRoute("/procurement/approvals_/$id")({
  head: () => ({ meta: [{ title: "Procurement approval — Meridian ERP" }, { name: "description", content: "Restricted approval task" }] }),
  component: Decision,
});

function Decision() {
  const { id } = Route.useParams();
  const { role, entityId, approvalActor } = useApp();
  const { approvals } = useProcurement();
  const t = approvals.find((x) => x.id === id);
  const [result, setResult] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [replacement, setReplacement] = useState("");
  const [reassignmentReason, setReassignmentReason] = useState("");
  if (!t || !["manager", "buyer", "proc_admin"].includes(role) || !sameEntity(t.recordEntity, entityId) || role === "manager" && !t.stages.some((stage) => stage.approvers.some((approver) => approver.name === approvalActor && (t.state === "Completed" || stage.current && approver.state === "Pending"))) || role === "buyer" && !t.stages.some((stage) => stage.current && stage.name.includes("Procurement"))) return <AppShell><RestrictedState /></AppShell>;
  if (!t) return <AppShell><EmptyState title="Task not found" body="It may have been completed or reassigned." action={<Button variant="outline" asChild><Link to="/procurement/approvals">Back to approvals</Link></Button>} /></AppShell>;

  const actor = role === "manager" ? approvalActor : t.assignee;
  const blockers = approvalBlockers(t, actor);
  const amount = t.amount ? money(t.amount.value, t.amount.currency) : "";
  const sla = slaLabel(t);

  return (
    <AppShell>
      <PageHeader eyebrow={`${t.recordType} · ${t.recordId}`} title={t.subject} description={`${amount} · requested by ${t.requester} · ${t.policyVersion}`} />
      {role === "manager" ? <p className="mb-3 text-xs text-muted-foreground">Acting as {approvalActor}. <Link to="/procurement/approvals" className="text-primary underline">Change demo approver in the task queue</Link>.</p> : null}
      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <StatusBadge status={t.state} />
        <span className={`font-medium ${sla.tone}`}>{sla.text}</span>
        {t.delegatedFrom ? <span>Acting for <strong>{t.delegatedFrom.name}</strong> {t.delegatedFrom.from} → {t.delegatedFrom.to}, limit {money(t.delegatedFrom.limit, t.delegatedFrom.currency)}</span> : null}
      </div>
      {t.reassignedNote ? <Note tone="info">{t.reassignedNote}</Note> : null}
      {t.stale ? <Note tone="warning">This approval needs a fresh check: {t.stale}</Note> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <section aria-labelledby="stages-h" className="rounded-lg border bg-surface p-4">
            <h2 id="stages-h" className="text-sm font-semibold">Who approves, and when</h2>
            <ol className="mt-3 space-y-3">
              {t.stages.map((s, i) => (
                <li key={s.name} className={`rounded-md border p-3 ${s.current ? "border-primary" : ""}`}>
                  <p className="text-sm font-medium">{i + 1}. {s.name} <span className="text-xs font-normal text-muted-foreground">· {s.mode}{s.quorum ? ` · needs ${s.quorum} of ${s.approvers.length}` : ""}{s.current ? " · current" : ""}</span></p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {s.approvers.map((a) => <li key={a.name} className="flex justify-between gap-2"><span>{a.name} <span className="text-xs text-muted-foreground">({a.entity})</span></span><span className="text-xs">{a.state}{a.at ? ` · ${a.at}` : ""}</span></li>)}
                  </ul>
                </li>
              ))}
            </ol>
          </section>

          <BudgetCard t={t} />

          <section className="rounded-lg border bg-surface p-4 text-sm">
            <h2 className="font-semibold">Supporting documents</h2>
            {t.documents.length ? <ul className="mt-2 list-disc pl-5">{t.documents.map((d) => <li key={d}>{d}</li>)}</ul> : <p className="mt-1 text-muted-foreground">None attached.</p>}
            <Link to="/procurement/requests/$id" params={{ id: t.recordId }} className="mt-3 inline-block text-primary hover:underline">Open {t.recordId}</Link>
          </section>
        </div>

        <div className="space-y-4">
          {blockers.length && t.state !== "Completed" ? (
            <div role="alert" className="rounded-lg border border-danger/40 bg-danger-soft p-4 text-sm">
              <p className="font-medium">You cannot approve this yet</p>
              <ul className="mt-1 list-disc pl-5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
              <p className="mt-2 text-xs">You can still return, reject or delegate with a reason.</p>
            </div>
          ) : null}
          {role === "proc_admin" && t.state !== "Completed" && t.approverEntity !== t.recordEntity ? <section className="rounded-lg border bg-surface p-4 text-sm"><h2 className="font-semibold">Choose an approver in the right company</h2><p className="mt-1 text-muted-foreground">This task was sent to someone in another company. Choose a new approver here. Finance must still resolve any budget problem.</p><div className="mt-3"><Label htmlFor="new-approver">Approver in {t.recordEntity}</Label><select id="new-approver" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={replacement} onChange={(event) => setReplacement(event.target.value)}><option value="">Choose an approver</option>{(t.recordEntity.includes("Kenya") ? ["Grace Wanjiru", "Daniel Otieno"] : ["Marieke Hoek", "Joost Meijer", "Priya Raman", "Lukas Brandt"]).filter((name) => name !== t.requester).map((name) => <option key={name}>{name}</option>)}</select></div><div className="mt-3"><Label htmlFor="reassign-reason">Reason</Label><Textarea id="reassign-reason" value={reassignmentReason} onChange={(event) => setReassignmentReason(event.target.value)} /></div><Button className="mt-3" onClick={() => { try { reassignApproval(t.id, replacement, reassignmentReason, role); setResult(`Sent to ${replacement}. The previous assignment remains in the request history.`); setReplacement(""); setReassignmentReason(""); } catch (error) { setResult(error instanceof Error ? error.message : "Could not change the approver."); } }}>Change approver</Button></section> : null}
          {result ? <Note tone="info">{result}</Note> : null}
          {t.state === "Completed" ? (
            <Note tone="info">Decided. See stages for who decided and when.</Note>
          ) : confirming ? (
            <div className="rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm">
              <p className="font-medium">Confirm approval of {amount}?</p>
              <p className="mt-1">This sends {t.recordId} to the next person. It does not set money aside or contact a vendor.</p>
              <div className="mt-3 flex gap-2"><Button onClick={() => { setConfirming(false); try { decideApproval(t.id, "approve", "Approved in demo", role, actor); setResult("Approval recorded. Request and task updated."); } catch (error) { setResult(error instanceof Error ? error.message : "Could not approve."); } }}>Yes, approve</Button><Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button></div>
            </div>
          ) : (
            <ApprovalPanel
              decisionSummary={`${t.subject} · ${amount}`}
              policy={t.policy}
              conflicts={t.conflicts}
              delegates={role === "buyer" || t.state === "Delegated" || t.approverEntity !== t.recordEntity ? [] : demoApprovalActors(entityId).filter((name) => name !== actor && name !== t.requester)}
              onDecision={(d, reason, delegate) => {
                if (d === "approve") {
                  if (blockers.length) return setResult(`Not approved: ${blockers[0]}`);
                  if (t.consequential) return setConfirming(true);
                  try { decideApproval(t.id, "approve", reason || "Approved in demo", role, actor); setResult("Approval recorded. Request and task updated."); } catch (error) { setResult(error instanceof Error ? error.message : "Could not approve."); } return;
                }
                if (d === "delegate") { try { delegateApproval(t.id, delegate ?? "", reason, role, actor); setResult(`Delegated to ${delegate}. Effective dates and authority are recorded on this task.`); } catch (error) { setResult(error instanceof Error ? error.message : "Could not delegate."); } return; }
                try { decideApproval(t.id, d === "return" ? "return" : "reject", reason, role, actor); setResult(`${d === "return" ? "Returned" : "Rejected"}. Request and task updated.`); } catch (error) { setResult(error instanceof Error ? error.message : "Could not record decision."); }
              }}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}

function BudgetCard({ t }: { t: ApprovalTask }) {
  const b = t.budget;
  const map = {
    advisory: { icon: Info, title: "Estimated budget check", tone: "border-info/40 bg-info-soft" },
    reservation: { icon: CheckCircle2, title: "Finance set money aside", tone: "border-success/40 bg-success-soft" },
    "hard-fail": { icon: XCircle, title: "Budget check failed", tone: "border-danger/40 bg-danger-soft" },
    unavailable: { icon: AlertTriangle, title: "Could not check the budget", tone: "border-warning/40 bg-warning-soft" },
  } as const;
  const m = map[b.kind];
  const Icon = m.icon;
  return (
    <section className={`rounded-lg border p-4 text-sm ${m.tone}`}>
      <h2 className="flex items-center gap-2 font-semibold"><Icon className="size-4" aria-hidden />{m.title}</h2>
      <p className="mt-1">{b.detail}</p>
      <p className="mt-1 text-xs">{b.source} · {b.at}{b.kind === "reservation" ? ` · reference ${b.reference}` : b.kind === "advisory" ? " · no reservation reference" : ""}</p>
      {t.exception ? <p className="mt-2 rounded-md border bg-background p-2 text-xs">Exception approved by <strong>{t.exception.approver}</strong> on {t.exception.approvedAt} · evidence: {t.exception.evidence}</p> : null}
    </section>
  );
}

function Note({ tone, children }: { tone: "info" | "warning"; children: React.ReactNode }) {
  return <p role="status" className={`mb-4 rounded-md border p-3 text-sm ${tone === "info" ? "border-info/40 bg-info-soft" : "border-warning/40 bg-warning-soft"}`}>{children}</p>;
}
