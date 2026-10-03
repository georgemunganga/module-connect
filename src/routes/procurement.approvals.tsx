import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { EmptyState } from "@/platform/components/States";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { approvalTasks } from "@/modules/procurement/approvals";
import type { ApprovalTask, TaskState } from "@/modules/procurement/approvals";
import { money } from "@/modules/procurement/catalog";

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

export function slaLabel(t: ApprovalTask) {
  if (t.state === "Completed") return { text: "Done", tone: "text-muted-foreground" };
  if (t.sla.paused) return { text: `Paused — ${t.sla.paused}`, tone: "text-muted-foreground" };
  if (t.sla.hoursLeft < 0) return { text: `Breached ${-t.sla.hoursLeft} h ago (due ${t.sla.due})`, tone: "text-danger" };
  return { text: `${t.sla.hoursLeft} h left (due ${t.sla.due})`, tone: t.sla.hoursLeft < 8 ? "text-warning" : "text-muted-foreground" };
}

function ApprovalsPage() {
  const { tab = "Assigned" } = Route.useSearch();
  const rows = approvalTasks.filter((t) => inTab(t, tab));
  return (
    <AppShell>
      <PageHeader eyebrow="Approvals" title="Tasks & approvals" description="Ordered by deadline. A breached deadline escalates to a person — nothing is approved automatically." />
      <nav aria-label="Task views" className="mb-4 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => {
          const n = approvalTasks.filter((x) => inTab(x, t)).length;
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
