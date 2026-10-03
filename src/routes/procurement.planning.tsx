import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Info, Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useApp } from "@/platform/app-context";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { EmptyState } from "@/platform/components/States";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { money } from "@/modules/procurement/catalog";
import { PLANNING_ENABLED, plans } from "@/modules/procurement/planning";

type Search = { plan?: string; status?: string; category?: string };

export const Route = createFileRoute("/procurement/planning")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    plan: typeof s.plan === "string" ? s.plan : undefined,
    status: typeof s.status === "string" ? s.status : undefined,
    category: typeof s.category === "string" ? s.category : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Planning — Meridian ERP Procurement" },
      { name: "description", content: "Department procurement plans by period: requirements, estimates, methods, versions and linked requests." },
      { property: "og:title", content: "Planning — Meridian ERP Procurement" },
      { property: "og:description", content: "Plan purchasing per department and period. Estimates, not budget reservations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlanningPage,
});

function PlanningPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { role } = useApp();
  const [view, setView] = useState<"department" | "procurement">(role === "buyer" || role === "proc_admin" ? "procurement" : "department");
  const [versionShown, setVersionShown] = useState<number | null>(null);
  const plan = plans.find((p) => p.id === search.plan) ?? plans[0];
  const setS = (p: Partial<Search>) => navigate({ search: (s: Search) => ({ ...s, ...p }), replace: true });

  const lines = useMemo(
    () => plan.lines.filter((l) => (!search.status || l.status === search.status) && (!search.category || l.category === search.category)),
    [plan, search],
  );
  const categories = [...new Set(plan.lines.map((l) => l.category))];
  const ccy = plan.lines[0]?.currency ?? "EUR";
  const live = plan.lines.filter((l) => l.status !== "Cancelled");
  const total = live.reduce((s, l) => s + l.estimate, 0);
  const requested = live.reduce((s, l) => s + (l.actual ?? 0), 0);
  const current = plan.versions[0];
  const shown = plan.versions.find((v) => v.version === versionShown) ?? current;
  const readOnly = shown.locked || role === "auditor";

  if (!PLANNING_ENABLED) {
    return <AppShell><EmptyState title="Planning isn't switched on" body="A Procurement admin can turn it on in Configuration → Process design." /></AppShell>;
  }

  const primary = readOnly ? undefined
    : view === "procurement" && ["Submitted", "Revised"].includes(plan.state) ? <Button>Mark reviewed</Button>
    : plan.state === "Approved" || plan.state === "Active" ? <Button asChild><Link to="/procurement/requests/new">Create request from plan</Link></Button>
    : <Button>Submit plan</Button>;

  return (
    <AppShell>
      <PageHeader eyebrow={`Planning · ${plan.period}`} title={`${plan.department} plan`} description={`${plan.entity} · version ${current.version}`} primaryAction={primary} />

      <p role="note" className="mb-4 flex gap-2 rounded-md border border-info/40 bg-info-soft p-3 text-sm">
        <Info className="size-4 shrink-0" aria-hidden />Planning estimate, not a budget reservation. An approved plan can start a request but never issues an order itself.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="plan">Plan</Label>
          <select id="plan" className="mt-1 h-9 rounded-md border bg-background px-3 text-sm" value={plan.id} onChange={(e) => { setVersionShown(null); setS({ plan: e.target.value }); }}>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.department} · {p.period}</option>)}
          </select>
        </div>
        <div role="tablist" aria-label="Review view" className="inline-flex rounded-md border p-1">
          {(["department", "procurement"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded px-3 py-1.5 text-sm ${view === v ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground"}`}>
              {v === "department" ? "Department view" : "Procurement review"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <StatusBadge status={plan.state} />
          <span>Owner <strong>{plan.owner}</strong></span>
          <span>Next: <strong>{plan.nextAction}</strong></span>
          <span>Due <strong>{plan.dueDate}</strong></span>
        </div>
      </div>

      <dl className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat k={`Planned total (${ccy})`} v={money(total, ccy)} hint="Excludes cancelled lines" />
        <Stat k={`Requested so far (${ccy})`} v={money(requested, ccy)} hint={`${live.filter((l) => l.linkedRequest).length} linked request(s)`} />
        <Stat k={`Remaining to request (${ccy})`} v={money(total - requested, ccy)} hint="Estimate only" />
      </dl>

      {shown.locked ? (
        <p className="mb-3 flex items-center gap-2 rounded-md border bg-surface-muted p-3 text-sm"><Lock className="size-4" aria-hidden />Viewing locked version {shown.version} ({shown.state}, {shown.date}). It can't be edited.
          <Button size="sm" variant="outline" onClick={() => setVersionShown(null)}>Back to current</Button></p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-labelledby="lines-h">
          <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
            <h2 id="lines-h" className="text-sm font-semibold">Plan lines</h2>
            <div className="flex gap-2">
              <label className="sr-only" htmlFor="fs">Status</label>
              <select id="fs" className="h-9 rounded-md border bg-background px-2 text-sm" value={search.status ?? ""} onChange={(e) => setS({ status: e.target.value || undefined })}>
                <option value="">All statuses</option>{["Planned", "Changed", "Requested", "Cancelled"].map((s) => <option key={s}>{s}</option>)}
              </select>
              <label className="sr-only" htmlFor="fc">Category</label>
              <select id="fc" className="h-9 rounded-md border bg-background px-2 text-sm" value={search.category ?? ""} onChange={(e) => setS({ category: e.target.value || undefined })}>
                <option value="">All categories</option>{categories.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr><th className="p-3">Requirement</th><th className="p-3">Estimate</th><th className="p-3">Expected</th><th className="p-3">Method</th><th className="p-3">Funding</th><th className="p-3">{view === "procurement" ? "Variance / request" : "Owner"}</th><th className="p-3">Status</th></tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((l) => (
                  <tr key={l.id} className={l.status === "Cancelled" ? "text-muted-foreground line-through decoration-1" : ""}>
                    <td className="p-3"><span className="font-medium">{l.requirement}</span><span className="block text-xs text-muted-foreground no-underline">{l.category}{l.notes ? ` · ${l.notes}` : ""}</span></td>
                    <td className="p-3 tabular-nums">{money(l.estimate, l.currency)}{l.previousEstimate ? <span className="block text-xs text-warning">was {money(l.previousEstimate, l.currency)}</span> : null}</td>
                    <td className="p-3">{l.expected}</td>
                    <td className="p-3">{l.method}</td>
                    <td className="p-3">{l.funding ?? <span className="flex items-center gap-1 text-warning"><AlertTriangle className="size-3.5" aria-hidden />No budget link</span>}</td>
                    <td className="p-3">
                      {view === "procurement" ? (
                        l.linkedRequest ? <><Link to="/procurement/requests/$id" params={{ id: l.linkedRequest }} className="text-primary hover:underline">{l.linkedRequest}</Link><span className="block text-xs text-muted-foreground">{money((l.actual ?? 0) - l.estimate, l.currency)} vs plan</span></> : "Not requested"
                      ) : l.owner}
                    </td>
                    <td className="p-3"><StatusBadge status={l.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!lines.length ? <p className="p-4 text-sm text-muted-foreground">No lines match these filters.</p> : null}
          </div>
        </section>

        <aside aria-labelledby="ver-h" className="h-fit rounded-lg border bg-surface p-4 text-sm">
          <h2 id="ver-h" className="font-semibold">Revision history</h2>
          <ol className="mt-3 space-y-3">
            {plan.versions.map((v) => (
              <li key={v.version}>
                <button onClick={() => setVersionShown(v.version)} className="w-full rounded-md p-2 text-left hover:bg-surface-muted" aria-current={shown.version === v.version ? "true" : undefined}>
                  <span className="flex items-center gap-2 font-medium">v{v.version} · {v.state}{v.locked ? <Lock className="size-3.5" aria-label="Locked" /> : null}</span>
                  <span className="block text-xs text-muted-foreground">{v.by} · {v.date}</span>
                  <span className="block text-xs">{v.note}</span>
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </AppShell>
  );
}

function Stat({ k, v, hint }: { k: string; v: string; hint: string }) {
  return <div className="rounded-lg border bg-surface p-4"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{v}</dd><dd className="text-xs text-muted-foreground">{hint}</dd></div>;
}
