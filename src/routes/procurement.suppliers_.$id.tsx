import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Lock } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/platform/app-context";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { EmptyState } from "@/platform/components/States";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { StatusTimeline } from "@/platform/components/StatusTimeline";
import { } from "@/modules/procurement/suppliers";
import { useProcurement, saveProcurement } from "@/modules/procurement/store";
import { supplierRole, sameEntity } from "@/modules/procurement/access";
import { RestrictedState } from "@/platform/components/States";
import type { Decision, SupplierRecord } from "@/modules/procurement/suppliers";

export const Route = createFileRoute("/procurement/suppliers_/$id")({
  head: () => ({ meta: [{ title: "Supplier profile — Meridian ERP" }, { name: "description", content: "Restricted supplier profile" }] }),
  component: SupplierProfile,
});

const tabs = ["Overview", "Sites & contacts", "Categories", "Qualifications", "Risk & performance", "Documents", "Related orders", "Activity"] as const;

function SupplierProfile() {
  const { id } = Route.useParams();
  const { role, entityId } = useApp();
  const s = useProcurement().suppliers.find((x) => x.id === id);
  const setS = (value: SupplierRecord) => saveProcurement((state) => ({ ...state, suppliers: state.suppliers.map((item) => item.id === id ? value : item) }));
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [suspending, setSuspending] = useState(false);
  const readOnly = role === "auditor";
  const canDecide = ["supplier_steward", "proc_admin"].includes(role);

  if (!s || !supplierRole(role) || !sameEntity(s.country, entityId)) return <AppShell><RestrictedState /></AppShell>;
  if (!s) return <AppShell><EmptyState title="Supplier not found" body="Check the link or search the supplier queue." action={<Button variant="outline" asChild><Link to="/procurement/suppliers">Back to suppliers</Link></Button>} /></AppShell>;

  const missingEvidence = s.qualifications.filter((q) => q.status === "Missing").map((q) => q.name);
  const financeOk = s.bank?.verification.state === "Approved";
  const procOk = s.procurementDecision.state === "Approved";
  const activationBlockers = [...missingEvidence.map((m) => `${m} missing`), !procOk && "Procurement approval", !financeOk && "Finance verification of payment details"].filter(Boolean) as string[];

  const primary = readOnly ? undefined
    : s.status === "Active" && canDecide ? <Button variant="outline" onClick={() => setSuspending(true)}>Suspend supplier</Button>
    : ["Conditional", "Under diligence", "More information required"].includes(s.status) && canDecide ? (
      <Button disabled={activationBlockers.length > 0} title={activationBlockers.length ? `Blocked: ${activationBlockers.join(", ")}` : undefined}
        onClick={() => setS({ ...s, status: "Active", nextAction: "Annual review", timeline: [{ id: crypto.randomUUID(), at: new Date().toISOString().slice(0, 16).replace("T", " "), actor: "You (demo)", event: "Activated", before: s.status, after: "Active" }, ...s.timeline] })}>
        Activate supplier
      </Button>
    ) : undefined;

  return (
    <AppShell>
      <PageHeader eyebrow={`Supplier · review v${s.reviewVersion}`} title={s.name} description={`${s.legalName} · ${s.country} · ${s.registration}`} primaryAction={primary} />
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge status={s.status} />
        <span>Owner <strong>{s.owner}</strong></span>
        <span>Next: <strong>{s.nextAction}</strong></span>
        <span>Due <strong>{s.dueDate}</strong></span>
        {readOnly ? <span className="flex items-center gap-1 text-muted-foreground"><Lock className="size-3.5" aria-hidden />Read-only (auditor)</span> : null}
      </div>

      {suspending ? <SuspendForm s={s} onCancel={() => setSuspending(false)} onDone={(reason, date) => { setSuspending(false); setS({ ...s, status: "Suspended", nextAction: `Review ${s.openPOs} open PO(s) and ${s.openInvoices} invoice(s)`, timeline: [{ id: crypto.randomUUID(), at: new Date().toISOString().slice(0, 16).replace("T", " "), actor: "You (demo)", event: "Suspended", reason, before: "Active", after: `Suspended (effective ${date})` }, ...s.timeline] }); }} /> : null}

      <div role="tablist" aria-label="Supplier sections" className="mb-4 flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === t ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground"}`}>{t}</button>
        ))}
      </div>

      <div role="tabpanel" aria-label={tab}>
        {tab === "Overview" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <DecisionCard title="Procurement approval" d={s.procurementDecision} />
            <DecisionCard title="Finance verification of payment details" d={s.bank?.verification ?? { state: "Not started" }} />
            {s.bank ? (
              <div className="rounded-lg border bg-surface p-4">
                <h2 className="text-sm font-semibold">Payment details</h2>
                <div className="mt-2"><p className="text-sm">{s.bank.masked}</p></div>
                <p className="mt-2 text-xs text-muted-foreground">Changing payment details creates a new review version and needs Finance verification again.</p>
              </div>
            ) : null}
            {activationBlockers.length && s.status !== "Active" && s.status !== "Rejected" ? (
              <div className="rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm">
                <p className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4 text-warning" aria-hidden />Activation blocked</p>
                <ul className="mt-1 list-disc pl-5">{activationBlockers.map((b) => <li key={b}>{b}</li>)}</ul>
              </div>
            ) : null}
            {s.duplicates?.length ? (
              <div className="rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm lg:col-span-2">
                <p className="font-medium">Possible duplicate</p>
                {s.duplicates.map((d) => <p key={d.name}>{d.name} — {d.reason}</p>)}
                {!readOnly ? <div className="mt-2 flex gap-2"><Button size="sm" variant="outline" disabled title="Review action is preview-only">Not a duplicate (preview)</Button><Button size="sm" variant="outline" disabled title="Merge review is preview-only">Merge review (preview)</Button></div> : null}
              </div>
            ) : null}
          </div>
        ) : tab === "Sites & contacts" ? (
          <List empty="No sites or contacts yet." items={[...s.sites.map((x) => `${x.name} — ${x.address}`), ...s.contacts.map((c) => `${c.name}, ${c.role} — ${c.email}`)]} />
        ) : tab === "Categories" ? (
          <List empty="No categories." items={s.categories} />
        ) : tab === "Qualifications" ? (
          <ul className="space-y-2">{s.qualifications.length ? s.qualifications.map((q) => <li key={q.name} className="flex justify-between rounded-lg border bg-surface p-3 text-sm"><span>{q.name}{q.validTo ? <span className="block text-xs text-muted-foreground">Valid to {q.validTo}</span> : null}</span><StatusBadge status={q.status} /></li>) : <p className="text-sm text-muted-foreground">No qualifications required.</p>}</ul>
        ) : tab === "Risk & performance" ? (
          s.performance ? (
            <div className="rounded-lg border bg-surface p-4 text-sm">
              <p className="text-xs text-muted-foreground">{s.performance.period} · source: {s.performance.source}</p>
              <dl className="mt-3 grid gap-3 sm:grid-cols-4">
                {[["On-time delivery", `${s.performance.delivery}%`], ["Quality accepted", `${s.performance.quality}%`], ["Responsiveness", `${s.performance.responsiveness}%`], ["Disputes", String(s.performance.disputes)]].map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="text-lg font-semibold">{v}</dd></div>)}
              </dl>
            </div>
          ) : <EmptyState title="Not enough data yet" body="Scores appear after at least 5 receipts or invoices in the period." />
        ) : tab === "Documents" ? (
          <List empty="No documents uploaded." items={s.documents.map((d) => `${d.name} — uploaded ${d.uploaded}`)} />
        ) : tab === "Related orders" ? (
          <p className="text-sm">{s.openPOs} open purchase order(s) · {s.openInvoices} open invoice(s). Order details arrive in Milestone 11.</p>
        ) : (
          <StatusTimeline events={s.timeline} />
        )}
      </div>
    </AppShell>
  );
}

function DecisionCard({ title, d }: { title: string; d: Decision }) {
  return (
    <div className="rounded-lg border bg-surface p-4 text-sm">
      <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{title}</h2><StatusBadge status={d.state} /></div>
      <p className="mt-2 text-muted-foreground">{d.by ? `${d.by} · ${d.at}` : "No decision yet"}{d.reference ? ` · ref ${d.reference}` : ""}</p>
      {d.note ? <p className="mt-1">{d.note}</p> : null}
    </div>
  );
}

function List({ items, empty }: { items: string[]; empty: string }) {
  return items.length ? <ul className="space-y-2">{items.map((i) => <li key={i} className="rounded-lg border bg-surface p-3 text-sm">{i}</li>)}</ul> : <p className="text-sm text-muted-foreground">{empty}</p>;
}

function SuspendForm({ s, onCancel, onDone }: { s: SupplierRecord; onCancel: () => void; onDone: (reason: string, date: string) => void }) {
  const [reason, setReason] = useState("");
  const [date, setDate] = useState("");
  return (
    <section aria-labelledby="susp-h" className="mb-4 rounded-lg border border-danger/40 bg-danger-soft p-4 text-sm">
      <h2 id="susp-h" className="font-semibold">Suspend {s.name}</h2>
      <p className="mt-1">This affects {s.openPOs} open purchase order(s) and {s.openInvoices} open invoice(s). They'll be flagged for review — nothing is cancelled automatically.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="sr">Reason (required)</Label><Textarea id="sr" className="mt-1 bg-background" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <div><Label htmlFor="sd">Effective date (required)</Label><Input id="sd" type="date" className="mt-1 bg-background" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      <div className="mt-3 flex gap-2"><Button variant="destructive" disabled={!reason.trim() || !date} onClick={() => onDone(reason, date)}>Confirm suspension</Button><Button variant="outline" onClick={onCancel}>Cancel</Button></div>
    </section>
  );
}
