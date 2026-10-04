import { createFileRoute, Link } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { useApp } from "@/platform/app-context";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { EmptyState, RestrictedState } from "@/platform/components/States";
import { useProcurement } from "@/modules/procurement/store";
import { demoManagerForEntity, sameEntity } from "@/modules/procurement/access";
import { money } from "@/modules/procurement/catalog";

export const Route = createFileRoute("/procurement/budgets")({
  head: () => ({ meta: [
    { title: "Budget visibility — Meridian ERP Procurement" },
    { name: "description", content: "Procurement budget check results and exceptions; Finance owns balances and reservations." },
  ] }),
  component: BudgetVisibility,
});

function BudgetVisibility() {
  const { role, entityId } = useApp();
  const tasks = useProcurement().approvals.filter((task) => sameEntity(task.recordEntity, entityId) && (role !== "manager" || task.assignee === demoManagerForEntity(task.recordEntity)));
  if (!["manager", "buyer", "proc_admin", "auditor"].includes(role)) return <AppShell><RestrictedState /></AppShell>;
  const failures = tasks.filter((task) => task.budget.kind === "hard-fail" && !task.exception).length;
  const reservations = tasks.filter((task) => task.budget.kind === "reservation").length;
  return <AppShell>
    <PageHeader eyebrow="Purchasing / Finance" title="Budgets" description="See whether Finance found money available for each purchase request." />
    <p role="note" className="mt-5 flex gap-2 rounded-lg border border-info/40 bg-info-soft p-4 text-sm"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />Finance manages the budget. This page shows the answers Finance has sent; it does not show a live balance or set money aside.</p>
    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      <Summary label="Requests checked" value={tasks.length} />
      <Summary label="Requests with no budget" value={failures} />
      <Summary label="Amounts set aside by Finance" value={reservations} />
    </div>
    <section className="mt-6" aria-labelledby="budget-checks-h"><h2 id="budget-checks-h" className="mb-3 text-sm font-semibold">Budget checks</h2>
      {tasks.length ? <ul className="space-y-3">{tasks.map((task) => <li key={task.id} className="rounded-lg border bg-surface p-4 text-sm"><div className="flex flex-wrap items-start justify-between gap-2"><div><Link to="/procurement/approvals/$id" params={{ id: task.id }} className="font-medium text-primary hover:underline">{task.subject} · {task.recordId}</Link><p className="mt-1 text-muted-foreground">{task.amount ? money(task.amount.value, task.amount.currency) : "Amount unavailable"}</p></div><span className="rounded-full border px-2 py-1 text-xs font-medium">{task.budget.kind === "hard-fail" ? "Not enough budget" : task.budget.kind === "reservation" ? "Money set aside" : task.budget.kind === "unavailable" ? "Could not check" : "Estimate only"}</span></div><p className="mt-3">{task.budget.detail}</p>{task.exception ? <p className="mt-2 text-xs">Approved despite issue: {task.exception.approver} · {task.exception.evidence}</p> : null}<details className="mt-3 border-t pt-3 text-xs text-muted-foreground"><summary className="cursor-pointer font-medium">See check details</summary><p className="mt-2">Checked {task.budget.at} by {task.budget.source} · rules {task.policyVersion}{task.budget.kind === "reservation" ? ` · reference ${task.budget.reference}` : ""}</p></details></li>)}</ul> : <EmptyState title="No budget checks here yet" body="Budget checks will appear when a purchase request needs approval." />}
    </section>
  </AppShell>;
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border bg-surface p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></div>;
}
