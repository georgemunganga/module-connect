import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { EmptyState } from "@/platform/components/States";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { slaLabel } from "@/modules/procurement/approvals";
import type { ApprovalTask, TaskState } from "@/modules/procurement/approvals";
import { money } from "@/modules/procurement/catalog";
import { useProcurement } from "@/modules/procurement/store";
import { sameEntity, demoApprovalActors } from "@/modules/procurement/access";
import { useApp } from "@/platform/app-context";
import { RestrictedState } from "@/platform/components/States";

type Search = { tab?: TaskState };
const TABS: TaskState[] = ["Assigned", "Delegated", "Overdue", "Escalated", "Completed"];

export const Route = createFileRoute("/procurement/approvals")({
  validateSearch: (s: Record<string, unknown>): Search => ({ tab: TABS.includes(s.tab as TaskState) ? (s.tab as TaskState) : undefined }),
  head: () => ({
    meta: [
      { title: "Tasks & approvals — Meridian ERP Procurement" },
      { name: "description", content: "Assigned, delegated, overdue, escalated and completed procurement approvals with SLA countdowns." },
      { property: "og:title", content: "Tasks & approvals — Meridian ERP Procurement" },
      { property: "og:description", content: "Every procurement decision waiting on you, with its deadline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApprovalsPage,
});

const inTab = (t: ApprovalTask, tab: TaskState) =>
  tab === "Overdue" ? t.state !== "Completed" && t.sla.hoursLeft < 0 && !t.sla.paused : tab === "Assigned" ? t.state === "Assigned" : t.state === tab;


function ApprovalsPage() {
  const { tab = "Assigned" } = Route.useSearch();
  const { role, entityId, approvalActor, setApprovalActor } = useApp();
  const approvals = useProcurement().approvals.filter((task) =>
    sameEntity(task.recordEntity, entityId) &&
    (role !== "manager" || task.stages.some((stage) =>
      stage.approvers.some((approver) => approver.name === approvalActor &&
        (task.state === "Completed" || (stage.current && approver.state === "Pending"))))) &&
    (role !== "buyer" || task.stages.some((stage) => stage.current && stage.name.includes("Procurement"))));
  const rows = approvals.filter((t) => inTab(t, tab));
  if (!["manager", "buyer", "proc_admin"].includes(role)) return <AppShell><RestrictedState /></AppShell>;
  return (
    <AppShell>
      <PageHeader eyebrow="Approvals" title="Tasks & approvals" description="Ordered by deadline. A breached deadline escalates to a person — nothing is approved automatically." />
      {role === "manager" ? <div className="mb-4 rounded-lg border bg-surface p-3 text-sm"><label htmlFor="approval-persona" className="font-medium">Acting as demo approver</label><select id="approval-persona" className="ml-3 h-9 max-w-full rounded-md border bg-background px-2" value={approvalActor} onChange={(event) => setApprovalActor(event.target.value)}>{demoApprovalActors(entityId).map((name) => <option key={name}>{name}</option>)}</select><p className="mt-1 text-xs text-muted-foreground">Select a named demo person to review their own assigned or delegated task. This switch does not grant production access.</p></div> : null}
      <nav aria-label="Task views" className="mb-4 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => {
          const n = approvals.filter((x) => inTab(x, t)).length;
          return (
            <Link key={t} to="/procurement/approvals" search={{ tab: t }} aria-current={tab === t ? "page" : undefined}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === t ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground"}`}>
              {t} <span className="ml-1 rounded-full border px-1.5 text-xs">{n}</span>
            </Link>
          );
        })}
      </nav>
      {rows.length ? (
        <ul className="space-y-2">
          {[...rows].sort((a, b) => a.sla.hoursLeft - b.sla.hoursLeft).map((t) => {
            const s = slaLabel(t);
            return (
              <li key={t.id}>
                <Link to="/procurement/approvals/$id" params={{ id: t.id }} className="grid gap-2 rounded-lg border bg-surface p-3 hover:border-border-strong sm:grid-cols-[minmax(0,1fr)_auto]">
                  <span className="min-w-0">
                    <span className="block font-medium">{t.subject} <span className="font-mono text-xs text-muted-foreground">{t.recordId}</span></span>
                    <span className="block text-xs text-muted-foreground">{t.recordType} · requested by {t.requester} · stage: {t.stages.find((x) => x.current)?.name ?? "—"}{t.delegatedFrom ? ` · on behalf of ${t.delegatedFrom.name}` : ""}</span>
                    <span className={`mt-1 block text-xs font-medium ${s.tone}`}>{s.text}</span>
                  </span>
                  <span className="flex items-center gap-3 sm:flex-col sm:items-end">
                    {t.amount ? <span className="tabular-nums font-medium">{money(t.amount.value, t.amount.currency)}</span> : null}
                    <StatusBadge status={t.state} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : <EmptyState title={`No ${tab.toLowerCase()} tasks`} body="When something needs your decision, it shows up here with its deadline." />}
    </AppShell>
  );
}
