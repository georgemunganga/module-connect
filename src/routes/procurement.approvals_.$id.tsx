import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/platform/components/AppShell";
import { ApprovalPanel } from "@/platform/components/ApprovalPanel";
import { PageHeader } from "@/platform/components/PageHeader";
import { EmptyState } from "@/platform/components/States";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { approvalBlockers, approvalTasks, slaLabel } from "@/modules/procurement/approvals";
import type { ApprovalTask } from "@/modules/procurement/approvals";
import { money } from "@/modules/procurement/catalog";

export const Route = createFileRoute("/procurement/approvals_/$id")({
  head: ({ params }) => {
    const t = approvalTasks.find((x) => x.id === params.id);
    const title = `${t ? `Decide: ${t.subject}` : "Task not found"} — Meridian ERP Approvals`;
    const description = t ? `${t.recordType} ${t.recordId} · ${t.policyVersion}` : "This approval task doesn't exist.";
    return { meta: [{ title }, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] };
  },
  component: Decision,
});

function Decision() {
  const { id } = Route.useParams();
  const t = approvalTasks.find((x) => x.id === id);
  const [result, setResult] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  if (!t) return <AppShell><EmptyState title="Task not found" body="It may have been completed or reassigned." action={<Button variant="outline" asChild><Link to="/procurement/approvals">Back to approvals</Link></Button>} /></AppShell>;

  const blockers = approvalBlockers(t);
  const amount = t.amount ? money(t.amount.value, t.amount.currency) : "";
  const sla = slaLabel(t);

  return (
    <AppShell>
      <PageHeader eyebrow={`${t.recordType} · ${t.recordId}`} title={t.subject} description={`${amount} · requested by ${t.requester} · ${t.policyVersion}`} />
      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <StatusBadge status={t.state} />
        <span className={`font-medium ${sla.tone}`}>{sla.text}</span>
        {t.delegatedFrom ? <span>Acting for <strong>{t.delegatedFrom.name}</strong> {t.delegatedFrom.from} → {t.delegatedFrom.to}, limit {money(t.delegatedFrom.limit, t.delegatedFrom.currency)}</span> : null}
      </div>
      {t.reassignedNote ? <Note tone="info">{t.reassignedNote}</Note> : null}
      {t.stale ? <Note tone="warning">Stale approval: {t.stale}</Note> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <section aria-labelledby="stages-h" className="rounded-lg border bg-surface p-4">
            <h2 id="stages-h" className="text-sm font-semibold">Decision stages</h2>
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
              <p className="font-medium">Approve isn't available</p>
              <ul className="mt-1 list-disc pl-5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
              <p className="mt-2 text-xs">You can still return, reject or delegate with a reason.</p>
            </div>
          ) : null}
          {result ? (
            <Note tone="info">{result}</Note>
          ) : t.state === "Completed" ? (
            <Note tone="info">Decided. See stages for who decided and when.</Note>
          ) : confirming ? (
            <div className="rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm">
              <p className="font-medium">Confirm approval of {amount}?</p>
              <p className="mt-1">This moves {t.recordId} to the next stage. It doesn't reserve budget or send anything to a supplier.</p>
              <div className="mt-3 flex gap-2"><Button onClick={() => { setConfirming(false); setResult(`Approved (demo). Next: ${t.stages.find((s) => !s.current && s.approvers.some((a) => a.state === "Pending"))?.name ?? "buyer processing"}.`); }}>Yes, approve</Button><Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button></div>
            </div>
          ) : (
            <ApprovalPanel
              decisionSummary={`${t.subject} · ${amount}`}
              policy={t.policy}
              conflicts={t.conflicts}
              onDecision={(d, reason, delegate) => {
                if (d === "approve") {
                  if (blockers.length) return setResult(`Not approved: ${blockers[0]}`);
                  if (t.consequential) return setConfirming(true);
                  return setResult("Approved (demo).");
                }
                setResult(d === "delegate" ? `Delegated to ${delegate} (demo). Their authority limit still applies.` : `${d === "return" ? "Returned" : "Rejected"} (demo). Reason recorded: “${reason}”.`);
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
    advisory: { icon: Info, title: "Advisory budget check", tone: "border-info/40 bg-info-soft" },
    reservation: { icon: CheckCircle2, title: "Finance reservation", tone: "border-success/40 bg-success-soft" },
    "hard-fail": { icon: XCircle, title: "Budget check failed", tone: "border-danger/40 bg-danger-soft" },
    unavailable: { icon: AlertTriangle, title: "Budget service unavailable", tone: "border-warning/40 bg-warning-soft" },
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
