import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useProcurement, saveProcurement } from "@/modules/procurement/store";
import { useApp } from "@/platform/app-context";
import { sourcingRole, sameEntity } from "@/modules/procurement/access";
import { RestrictedState } from "@/platform/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppShell } from "@/platform/components/AppShell";
import { GuidedFlow, NextSteps } from "@/platform/components/GuidedFlow";
import type { FlowStep } from "@/platform/components/GuidedFlow";
import { PageHeader } from "@/platform/components/PageHeader";
import { money } from "@/modules/procurement/catalog";
import { reqMeta, availableToAllocate } from "@/modules/procurement/requisition";
import { permittedMethods } from "@/modules/procurement/sourcing";
import { ensureEvaluation } from "@/modules/procurement/commercial/store";
import type { SourcingMethod } from "@/modules/procurement/sourcing";

export const Route = createFileRoute("/procurement/sourcing_/new")({
  validateSearch: (search: Record<string, unknown>) => ({ requestId: typeof search.requestId === "string" ? search.requestId : undefined, lineId: typeof search.lineId === "string" ? search.lineId : undefined }),
  head: () => ({
    meta: [
      { title: "Create sourcing event — Meridian ERP Procurement" },
      { name: "description", content: "Create an RFQ, RFP or tender from approved request lines, with deadlines, suppliers and fixed criteria." },
      { property: "og:title", content: "Create sourcing event — Meridian ERP Procurement" },
      { property: "og:description", content: "Build a sourcing event from approved request lines." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewEvent,
});

const getApprovedLines = (metadata: typeof reqMeta) => Object.entries(metadata).flatMap(([pr, m]) =>
  m.lines.filter((l) => l.approval === "Approved" && availableToAllocate(l) > 0).map((l) => ({ key: l.id, pr, label: l.description, qty: availableToAllocate(l), value: availableToAllocate(l) * l.unitPrice, ccy: m.entity.includes("Kenya") ? "KES" : "EUR" })),
);

function NewEvent() {
  const { requestId, lineId } = Route.useSearch();
  const { role, entityId } = useApp();
  const state = useProcurement();
  const suppliersPool = state.suppliers.filter((supplier) => supplier.status === "Active" && sameEntity(supplier.country, entityId)).map((supplier) => supplier.name);
  const approvedLines = getApprovedLines(state.metadata).filter((line) => sameEntity(state.metadata[line.pr]?.entity, entityId) && state.requests.find((request) => request.id === line.pr)?.status === "Approved");
  const [lines, setLines] = useState<string[]>(requestId && lineId ? [lineId] : []);
  const [method, setMethod] = useState<SourcingMethod | null>(null);
  const [justification, setJustification] = useState("");
  const [closes, setCloses] = useState("");
  const [tz, setTz] = useState("Europe/Amsterdam");
  const [invited, setInvited] = useState<string[]>([]);
  const [criteria, setCriteria] = useState([{ name: "Price", weight: 60 }, { name: "Delivery time", weight: 20 }, { name: "Quality", weight: 20 }]);
  const [done, setDone] = useState<string | null>(null);

  const chosen = approvedLines.filter((l) => lines.includes(l.key));
  const estEur = chosen.filter((l) => l.ccy === "EUR").reduce((s, l) => s + l.value, 0) + chosen.filter((l) => l.ccy === "KES").reduce((s, l) => s + l.value / 140, 0);
  const weightTotal = criteria.reduce((s, c) => s + c.weight, 0);
  const needsJustification = method === "Single source" || method === "Emergency";

  const steps: FlowStep[] = [
    { id: "lines", title: "What needs a quote?", purpose: "Choose approved items that still need to be bought.", render: () => (
      approvedLines.length ? <ul className="space-y-2">{approvedLines.map((l) => (
        <li key={l.key}><label className="flex items-start gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" className="mt-1" checked={lines.includes(l.key)} onChange={(e) => setLines(e.target.checked ? [...lines, l.key] : lines.filter((x) => x !== l.key))} /><span><span className="font-medium">{l.label}</span><span className="block text-xs text-muted-foreground">{l.pr} · {l.qty} remaining · {money(l.value, l.ccy)}</span></span></label></li>
      ))}</ul> : <p className="text-sm text-muted-foreground">No approved items need quotes right now.</p>) },
    { id: "method", title: "How will you buy?", purpose: "The choices depend on the estimated amount. These sample limits are for this demo only.", render: () => (
      <div className="space-y-2">
        {permittedMethods(estEur).map((m) => (
          <label key={m.method} className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${!m.allowed ? "opacity-60" : ""}`}>
            <input type="radio" name="method" className="mt-1" disabled={!m.allowed} checked={method === m.method} onChange={() => setMethod(m.method)} />
            <span><span className="font-medium">{m.method}</span><span className="block text-xs text-muted-foreground">{m.allowed ? m.why : `Not allowed for this value — ${m.why}`}</span></span>
          </label>
        ))}
        {needsJustification ? <div><Label htmlFor="just">Why is this method needed? *</Label><Input id="just" className="mt-1" value={justification} onChange={(e) => setJustification(e.target.value)} /></div> : null}
      </div>) },
    { id: "deadline", title: "Deadline", purpose: "Suppliers see the deadline in this time zone.", render: () => (
      <div className="grid max-w-md gap-4">
        <div><Label htmlFor="cl">Closes at</Label><Input id="cl" type="datetime-local" className="mt-1" value={closes} onChange={(e) => setCloses(e.target.value)} /></div>
        <div><Label htmlFor="tz">Time zone</Label><select id="tz" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" value={tz} onChange={(e) => setTz(e.target.value)}><option>Europe/Amsterdam</option><option>Europe/Berlin</option><option>Africa/Nairobi</option></select></div>
      </div>) },
    { id: "suppliers", title: "Invite vendors", purpose: "Only approved vendors can be invited.", render: () => (
      <ul className="space-y-2">{suppliersPool.map((s) => <li key={s}><label className="flex items-center gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" checked={invited.includes(s)} onChange={(e) => setInvited(e.target.checked ? [...invited, s] : invited.filter((x) => x !== s))} />{s}</label></li>)}</ul>) },
    { id: "criteria", title: "How will you compare replies?", purpose: "Choose how much price, delivery and quality matter. These percentages cannot change after the request is sent.", render: () => (
      <div className="space-y-2">
        {criteria.map((c, i) => (
          <div key={c.name} className="flex items-center gap-3 text-sm">
            <span className="w-40">{c.name}</span>
            <Label htmlFor={`w-${i}`} className="sr-only">{c.name} weight</Label>
            <Input id={`w-${i}`} type="number" className="w-24" value={c.weight} onChange={(e) => setCriteria(criteria.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))} />%
          </div>
        ))}
        <p className={`text-sm ${weightTotal === 100 ? "text-success" : "text-danger"}`}>Total {weightTotal}% {weightTotal === 100 ? "" : "— must be 100%"}</p>
      </div>) },
    { id: "review", title: "Review", purpose: "Another purchasing lead must approve this before vendors receive it.", render: () => {
      const problems = [!chosen.length && "choose at least one line", !method && "choose a method", needsJustification && !justification.trim() && "add a justification", !closes && "set a deadline", !invited.length && "invite at least one supplier", weightTotal !== 100 && "weights must total 100%"].filter(Boolean);
      return <div className="space-y-2 text-sm">{problems.length ? <p role="alert" className="rounded-md border border-danger/40 bg-danger-soft p-3">Still needed: {problems.join(", ")}.</p> : <p className="rounded-md border border-success/40 bg-success-soft p-3">Ready to send for approval.</p>}<p>{chosen.length} line(s) · {method ?? "—"} · closes {closes || "—"} ({tz}) · {invited.length} supplier(s)</p></div>;
    } },
  ];

  if (!sourcingRole(role) || role === "auditor") return <AppShell><RestrictedState /></AppShell>;
  return (
    <AppShell>
      <PageHeader eyebrow="Quotes" title="New quote request" description="Choose what you need and which vendors to ask. Nothing goes to vendors until it is approved and sent." />
      <GuidedFlow flowId="proc-sourcing-new" steps={steps} submitLabel="Send for approval"
        onSubmit={async () => {
          if (!chosen.length || !method || !closes || !invited.length || weightTotal !== 100 || (needsJustification && !justification.trim())) return;
          const ref = `RFQ-DEMO-${Date.now()}`;
          saveProcurement((store) => ({
            ...store,
            metadata: Object.fromEntries(Object.entries(store.metadata).map(([pr, meta]) => [pr, { ...meta, lines: meta.lines.map((line) => {
              const selected = chosen.find((item) => item.pr === pr && item.key === line.id);
              return selected ? { ...line, route: "RFQ / tender" as const, allocatedQty: line.allocatedQty + selected.qty, related: [...line.related, { kind: "RFQ" as const, ref }] } : line;
            }) }])),
            sourcing: [{ id: ref, title: chosen.map((x) => x.label).join(", "), method, state: "Pending approval", buyer: "You (demo)", entity: store.metadata[chosen[0].pr].entity, sourceLines: chosen.map((x) => `${x.pr} / ${x.key}`), items: chosen.map((x) => ({ description: x.label, qty: x.qty, unit: "each" })), opensAt: "", closesAt: closes, timeZone: tz, opened: false, eligibility: justification || "Active eligible suppliers", terms: "Demo terms", responseDocuments: [], criteria, invitations: invited.map((supplier) => ({ supplier, delivery: "Not delivered" as const, note: "Pending publication" })), qa: [], bids: [], amendments: [], nextAction: "Procurement lead approval", dueDate: closes.slice(0, 10) }, ...store.sourcing],
          }));
          ensureEvaluation(ref);
          setDone(ref);
          sessionStorage.removeItem("flow:proc-sourcing-new");
        }}
        submitted={done ? <NextSteps reference={done} title="Sent for approval (demo)" steps={["A purchasing lead checks the buying method, vendors and scoring.", "Once approved, vendor invitations can be sent. This demo does not actually send them.", "Replies stay private until the closing time."]} actions={<Button asChild><Link to="/procurement/sourcing">Back to quote requests</Link></Button>} /> : undefined}
      />
    </AppShell>
  );
}
