import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Info, Lock } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/platform/app-context";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { EmptyState, RestrictedState } from "@/platform/components/States";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { money } from "@/modules/procurement/catalog";
import { PLANNING_ENABLED, usePlans, availablePlanTransitions, transitionPlan, updatePlanLine, addPlanLine, linkPlanRequest, resetPlans } from "@/modules/procurement/planning";
import type { PlanLine, PlanState } from "@/modules/procurement/planning";
import { sameEntity } from "@/modules/procurement/access";
import { submitRequest } from "@/modules/procurement/store";

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
  const { role, entityId } = useApp();
  const [view, setView] = useState<"department" | "procurement">(role === "buyer" || role === "proc_admin" ? "procurement" : "department");
  const [versionShown, setVersionShown] = useState<number | null>(null);
  const [pending, setPending] = useState<PlanState | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlanLine | null>(null);
  const allPlans = usePlans();
  const visiblePlans = allPlans.filter((candidate) => sameEntity(candidate.entity, entityId));
  const plan = search.plan ? visiblePlans.find((candidate) => candidate.id === search.plan) : visiblePlans[0];
  const setS = (p: Partial<Search>) => navigate({ search: (s: Search) => ({ ...s, ...p }), replace: true });

  if (!PLANNING_ENABLED) return <AppShell><EmptyState title="Planning isn't switched on" body="A Procurement admin can turn it on in Configuration → Process design." /></AppShell>;
  if (!["manager", "buyer", "proc_admin", "auditor"].includes(role) || !plan) return <AppShell><RestrictedState /></AppShell>;

  const current = plan.versions[0];
  const shown = plan.versions.find((version) => version.version === versionShown) ?? current;
  const displayLines = shown.version === current.version ? plan.lines : shown.snapshot ?? [];
  const readOnly = shown.locked || role === "auditor";
  const editable = !readOnly && ["Draft", "Revised"].includes(plan.state) && ["manager", "proc_admin"].includes(role);
  const transitions = readOnly ? [] : availablePlanTransitions(plan, role);
  const act = (next: PlanState) => { setPending(next); setReason(""); setNotice(null); };
  const confirm = () => {
    if (!pending) return;
    try { transitionPlan(plan.id, pending, role, reason); setNotice(`${pending} recorded for ${plan.id}. No budget was reserved.`); setPending(null); setVersionShown(null); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not update the plan."); }
  };
  const createRequest = (line: PlanLine) => {
    if (!["Approved", "Active"].includes(plan.state) || line.status === "Cancelled" || line.linkedRequest || line.estimate <= 0) return;
    if (!line.funding) { setNotice("This requirement has no funding source. Revise the plan and link funding before creating a request."); return; }
    const ref = submitRequest({ title: line.requirement, requester: plan.owner, department: plan.department, entity: plan.entity, currency: line.currency, neededBy: line.expected, deliverTo: plan.entity.includes("Kenya") ? "Nairobi Office" : "Rotterdam HQ", costCentre: line.funding, lines: [{ description: line.requirement, qty: 1, unitPrice: line.estimate }] });
    linkPlanRequest(plan.id, line.id, ref, line.estimate);
    setNotice(`${ref} submitted for approval from ${plan.id}. Planning remains an estimate; no budget was reserved.`);
  };

  const lines = displayLines.filter((l) => (!search.status || l.status === search.status) && (!search.category || l.category === search.category));
  const categories = [...new Set(displayLines.map((l) => l.category))];
  const ccy = displayLines[0]?.currency ?? "EUR";
  const live = displayLines.filter((l) => l.status !== "Cancelled");
  const total = live.reduce((s, l) => s + l.estimate, 0);
  const requested = live.reduce((s, l) => s + (l.actual ?? 0), 0);
  const primary = transitions[0] ? <Button onClick={() => act(transitions[0])}>{transitions[0] === "Revised" ? "Start revision" : transitions[0] === "Reviewed" ? "Mark reviewed" : `${transitions[0]} plan`}</Button> : undefined;

  return (
    <AppShell>
      <PageHeader eyebrow={`Planning · ${plan.period}`} title={`${plan.department} plan`} description={`${plan.entity} · version ${current.version}`} primaryAction={primary} />

      <p role="note" className="mb-4 flex gap-2 rounded-md border border-info/40 bg-info-soft p-3 text-sm">
        <Info className="size-4 shrink-0" aria-hidden />Planning estimate, not a budget reservation. An approved plan can start a request but never issues an order itself.
      </p>
      {role === "proc_admin" ? <Button size="sm" variant="outline" className="mb-4" onClick={() => { if (window.confirm("Reset all Procurement planning demo changes?")) { resetPlans(); setVersionShown(null); setNotice("Planning demo reset."); } }}>Reset planning demo</Button> : null}
      {notice ? <p role="status" className="mb-4 rounded-md border bg-surface p-3 text-sm">{notice}</p> : null}
      {pending ? (
        <section className="mb-4 rounded-lg border bg-surface p-4 text-sm">
          <h2 className="font-semibold">{pending} {plan.id}?</h2>
          <p className="mt-1 text-muted-foreground">Current state: {plan.state}. This records a demo workflow decision and retains the revision history.</p>
          <Label htmlFor="plan-reason" className="mt-3 block">Reason {pending === "Revised" || pending === "Closed" ? "(required)" : "(optional)"}</Label>
          <Textarea id="plan-reason" className="mt-1" value={reason} onChange={(event) => setReason(event.target.value)} />
          <div className="mt-3 flex gap-2"><Button onClick={confirm} disabled={(["Revised", "Closed"].includes(pending) && !reason.trim())}>Confirm {pending.toLowerCase()}</Button><Button variant="outline" onClick={() => setPending(null)}>Cancel</Button></div>
        </section>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="plan">Plan</Label>
          <select id="plan" className="mt-1 h-9 rounded-md border bg-background px-3 text-sm" value={plan.id} onChange={(e) => { setVersionShown(null); setS({ plan: e.target.value }); }}>
            {visiblePlans.map((p) => <option key={p.id} value={p.id}>{p.department} · {p.period}</option>)}
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

      {transitions.length > 1 ? <div className="mb-4 flex flex-wrap gap-2">{transitions.slice(1).map((next) => <Button key={next} variant="outline" onClick={() => act(next)}>{next === "Revised" ? "Start revision" : `${next} plan`}</Button>)}</div> : null}

      <dl className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat k={`Planned total (${ccy})`} v={money(total, ccy)} hint="Excludes cancelled lines" />
        <Stat k={`Requested so far (${ccy})`} v={money(requested, ccy)} hint={`${live.filter((l) => l.linkedRequest).length} linked request(s)`} />
        <Stat k={`Remaining to request (${ccy})`} v={money(total - requested, ccy)} hint="Estimate only" />
      </dl>

      {shown.locked ? (
        <p className="mb-3 flex items-center gap-2 rounded-md border bg-surface-muted p-3 text-sm"><Lock className="size-4" aria-hidden />Viewing locked version {shown.version} ({shown.state}, {shown.date}). It can't be edited.
          <Button size="sm" variant="outline" onClick={() => setVersionShown(null)}>Back to current</Button></p>
      ) : null}
      {shown.locked && !shown.snapshot ? <p role="note" className="mb-3 rounded-md border border-warning/40 bg-warning-soft p-3 text-sm">Line snapshot was not provided for this imported demo version. Its decision record remains locked; current lines are not shown as history.</p> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-labelledby="lines-h" className="min-w-0">
          <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
            <h2 id="lines-h" className="text-sm font-semibold">Plan lines</h2>
            {editable ? <Button size="sm" variant="outline" onClick={() => { try { const id = addPlanLine(plan.id, role); setEditing({ id, requirement: "", category: "", estimate: 0, currency: ccy, expected: "", funding: "", method: "Catalog", owner: plan.owner, status: "Planned" }); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not add a line."); } }}>Add requirement</Button> : null}
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
          <div className="overflow-x-auto rounded-lg border bg-surface" style={{ contain: "paint" }}>
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr><th className="p-3">Requirement</th><th className="p-3">Estimate</th><th className="p-3">Expected</th><th className="p-3">Method</th><th className="p-3">Funding</th><th className="p-3">{view === "procurement" ? "Variance / request" : "Owner"}</th><th className="p-3">Status / action</th></tr>
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
                    <td className="p-3"><StatusBadge status={l.status} />
                      {editable ? <Button size="sm" variant="ghost" className="ml-2" onClick={() => setEditing({ ...l })}>Edit</Button> : null}
                      {!readOnly && ["Approved", "Active"].includes(plan.state) && !l.linkedRequest && l.status !== "Cancelled" ? <Button size="sm" variant="outline" className="ml-2" onClick={() => createRequest(l)}>Create request</Button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!lines.length ? <p className="p-4 text-sm text-muted-foreground">No lines match these filters.</p> : null}
          </div>
          {editing && editable ? <LineEditor line={editing} setLine={setEditing} onCancel={() => setEditing(null)} onSave={() => { try { updatePlanLine(plan.id, editing.id, editing, role); setEditing(null); setNotice("Plan line saved in the current version."); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save line."); } }} /> : null}
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
          {plan.history?.length ? <div className="mt-4 border-t pt-3"><h3 className="font-semibold">Decisions</h3><ul className="mt-2 space-y-2 text-xs">{plan.history.map((event) => <li key={`${event.at}-${event.to}`}>v{event.version} · {event.from} → {event.to} · {event.actor}<span className="block text-muted-foreground">{event.at} · {event.reason}</span></li>)}</ul></div> : null}
        </aside>
      </div>
    </AppShell>
  );
}

function Stat({ k, v, hint }: { k: string; v: string; hint: string }) {
  return <div className="rounded-lg border bg-surface p-4"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{v}</dd><dd className="text-xs text-muted-foreground">{hint}</dd></div>;
}

function LineEditor({ line, setLine, onCancel, onSave }: { line: PlanLine; setLine: (line: PlanLine) => void; onCancel: () => void; onSave: () => void }) {
  const set = (change: Partial<PlanLine>) => setLine({ ...line, ...change });
  const valid = line.requirement.trim() && line.category.trim() && line.owner.trim() && line.expected && line.estimate > 0;
  return (
    <section className="mt-4 rounded-lg border bg-surface p-4 text-sm" aria-labelledby="edit-plan-line">
      <h3 id="edit-plan-line" className="font-semibold">Edit requirement</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label htmlFor="pl-requirement">Requirement</Label><Input id="pl-requirement" className="mt-1" value={line.requirement} onChange={(event) => set({ requirement: event.target.value })} /></div>
        <div><Label htmlFor="pl-category">Category</Label><Input id="pl-category" className="mt-1" value={line.category} onChange={(event) => set({ category: event.target.value })} /></div>
        <div><Label htmlFor="pl-estimate">Estimated value ({line.currency})</Label><Input id="pl-estimate" className="mt-1" type="number" min="0.01" step="0.01" value={line.estimate} onChange={(event) => set({ estimate: Number(event.target.value) })} /></div>
        <div><Label htmlFor="pl-expected">Expected date</Label><Input id="pl-expected" className="mt-1" type="date" value={line.expected} onChange={(event) => set({ expected: event.target.value })} /></div>
        <div><Label htmlFor="pl-funding">Funding source</Label><Input id="pl-funding" className="mt-1" value={line.funding ?? ""} onChange={(event) => set({ funding: event.target.value })} placeholder="Leave blank if not linked yet" /></div>
        <div><Label htmlFor="pl-method">Proposed method</Label><select id="pl-method" className="mt-1 h-9 w-full rounded-md border bg-background px-3" value={line.method} onChange={(event) => set({ method: event.target.value as PlanLine["method"] })}>{["Catalog", "Direct PO", "RFQ", "Tender", "Framework call-off"].map((method) => <option key={method}>{method}</option>)}</select></div>
        <div><Label htmlFor="pl-owner">Owner</Label><Input id="pl-owner" className="mt-1" value={line.owner} onChange={(event) => set({ owner: event.target.value })} /></div>
        <div><Label htmlFor="pl-status">Requirement state</Label><select id="pl-status" className="mt-1 h-9 w-full rounded-md border bg-background px-3" value={line.status === "Cancelled" ? "Cancelled" : "Planned"} onChange={(event) => set({ status: event.target.value as "Planned" | "Cancelled" })}><option>Planned</option><option>Cancelled</option></select></div>
        <div className="sm:col-span-2"><Label htmlFor="pl-notes">Notes</Label><Textarea id="pl-notes" className="mt-1" value={line.notes ?? ""} onChange={(event) => set({ notes: event.target.value })} /></div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">A missing funding source remains visible for review. It does not reserve budget.</p>
      <div className="mt-3 flex gap-2"><Button disabled={!valid} onClick={onSave}>Save requirement</Button><Button variant="outline" onClick={onCancel}>Cancel</Button></div>
    </section>
  );
}
