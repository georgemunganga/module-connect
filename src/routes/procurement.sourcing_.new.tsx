import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getProcurement, useProcurement, saveProcurement } from "@/modules/procurement/store";
import { useApp } from "@/platform/app-context";
import { sourcingRole, sameEntity } from "@/modules/procurement/access";
import { RestrictedState } from "@/platform/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [candidateId, setCandidateId] = useState("");
  const [candidateQuantity, setCandidateQuantity] = useState("");
  const [method, setMethod] = useState<SourcingMethod | null>(null);
  const [justification, setJustification] = useState("");
  const [closes, setCloses] = useState("");
  const [terms, setTerms] = useState("");
  const [requiredDocuments, setRequiredDocuments] = useState("");
  const [tz, setTz] = useState("Europe/Amsterdam");
  const [invited, setInvited] = useState<string[]>([]);
  const [criteria, setCriteria] = useState([{ name: "Price", weight: 60 }, { name: "Delivery time", weight: 20 }, { name: "Quality", weight: 20 }]);
  const [done, setDone] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const draftKey = `proc:quote-draft:${entityId}`;

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(draftKey) || "null");
      if (saved) {
        setLines([...new Set([...(Array.isArray(saved.lines) ? saved.lines : []), ...(lineId ? [lineId] : [])])]);
        setQuantities(saved.quantities && typeof saved.quantities === "object" ? saved.quantities : {});
        setMethod(saved.method ?? null);
        setJustification(saved.justification ?? "");
        setCloses(saved.closes ?? "");
        setTerms(saved.terms ?? "");
        setRequiredDocuments(saved.requiredDocuments ?? "");
        setTz(saved.tz ?? "Europe/Amsterdam");
        setInvited(Array.isArray(saved.invited) ? saved.invited : []);
        setCriteria(Array.isArray(saved.criteria) && saved.criteria.length ? saved.criteria : [{ name: "Price", weight: 60 }, { name: "Delivery time", weight: 20 }, { name: "Quality", weight: 20 }]);
      }
    } catch { /* An invalid draft can be replaced by a new one. */ }
    setDraftLoaded(true);
  }, [draftKey, lineId]);

  useEffect(() => {
    if (draftLoaded && !done) sessionStorage.setItem(draftKey, JSON.stringify({ lines, quantities, method, justification, closes, terms, requiredDocuments, tz, invited, criteria }));
  }, [draftLoaded, done, draftKey, lines, quantities, method, justification, closes, terms, requiredDocuments, tz, invited, criteria]);

  const chosen = approvedLines.filter((l) => lines.includes(l.key)).map((line) => ({ ...line, selectedQty: quantities[line.key] ?? line.qty }));
  const candidate = approvedLines.find((line) => line.key === candidateId);
  const candidateQty = Number(candidateQuantity);
  const candidateValid = Boolean(candidate && Number.isInteger(candidateQty) && candidateQty > 0 && candidateQty <= candidate.qty);
  const returnToRequest = requestId && state.requests.some((request) => request.id === requestId && sameEntity(state.metadata[requestId]?.entity, entityId));
  function addApprovedItem() {
    if (!candidate || !candidateValid) return;
    setLines((current) => current.includes(candidate.key) ? current : [...current, candidate.key]);
    setQuantities((current) => ({ ...current, [candidate.key]: candidateQty }));
    setItemPickerOpen(false);
    setCandidateId(""); setCandidateQuantity("");
  }
  const estEur = chosen.filter((l) => l.ccy === "EUR").reduce((s, l) => s + l.selectedQty * (l.value / l.qty), 0) + chosen.filter((l) => l.ccy === "KES").reduce((s, l) => s + l.selectedQty * (l.value / l.qty) / 140, 0);
  const weightTotal = criteria.reduce((s, c) => s + c.weight, 0);
  const needsJustification = method === "Single source" || method === "Emergency";
  const problems = [!chosen.length && "choose at least one item", chosen.length !== lines.length && "remove items that are no longer approved", chosen.some((line) => !Number.isInteger(line.selectedQty) || line.selectedQty < 1 || line.selectedQty > line.qty) && "check item quantities", !method && "choose how to buy", method && !permittedMethods(estEur).find((choice) => choice.method === method)?.allowed && "choose a buying method allowed for this value", needsJustification && !justification.trim() && "explain why", !terms.trim() && "add the buying terms", !closes && "set a deadline", !invited.length && "invite at least one vendor", invited.some((supplier) => !suppliersPool.includes(supplier)) && "remove vendors that are no longer approved", weightTotal !== 100 && "comparison percentages must total 100%"].filter(Boolean) as string[];

  const steps: FlowStep[] = [
    { id: "lines", title: "What needs a quote?", purpose: "Choose approved request items and how many to quote. You can split the remaining quantity across later purchases.", render: () => (
      approvedLines.length ? <div className="space-y-3">
        {lines.filter((id) => !approvedLines.some((line) => line.key === id)).map((id) => <div key={id} className="flex items-center justify-between gap-2 rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm"><span>Request item {id} is no longer available.</span><Button variant="outline" size="sm" onClick={() => setLines((current) => current.filter((value) => value !== id))}>Remove</Button></div>)}
        {chosen.length ? <ul className="space-y-2">{chosen.map((line) => <li key={line.key} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"><div><span className="font-medium">{line.label}</span><span className="block text-xs text-muted-foreground">{line.pr} · {line.selectedQty} of {line.qty} remaining · {money(line.selectedQty * line.value / line.qty, line.ccy)}</span></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => { setCandidateId(line.key); setCandidateQuantity(String(line.selectedQty)); setItemPickerOpen(true); }}>Change</Button><Button variant="outline" size="sm" onClick={() => { setLines((current) => current.filter((id) => id !== line.key)); setQuantities((current) => { const next = { ...current }; delete next[line.key]; return next; }); }}>Remove</Button></div></li>)}</ul> : <p className="text-sm text-muted-foreground">No items selected yet.</p>}
        <Button variant="outline" onClick={() => { setCandidateId(approvedLines.find((line) => !lines.includes(line.key))?.key ?? approvedLines[0].key); setCandidateQuantity(""); setItemPickerOpen(true); }}>Add approved item</Button>
      </div> : <div className="space-y-2 text-sm"><p>No approved items need quotes right now.</p>{lines.length ? <Button variant="outline" onClick={() => { setLines([]); setQuantities({}); }}>Clear unavailable items</Button> : null}</div>) },
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
    { id: "deadline", title: "Terms and deadline", purpose: "Set the buying terms, required response documents and deadline that vendors will see.", render: () => (
      <div className="grid max-w-xl gap-4">
        <div><Label htmlFor="terms">Buying terms *</Label><Textarea id="terms" className="mt-1" rows={4} placeholder="Describe the terms vendors must accept" value={terms} onChange={(e) => setTerms(e.target.value)} /></div>
        <div><Label htmlFor="required-docs">Documents vendors must include</Label><Input id="required-docs" className="mt-1" placeholder="For example: price schedule, certification" value={requiredDocuments} onChange={(e) => setRequiredDocuments(e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">Separate document names with commas. Actual file upload is not connected in this demo.</p></div>
        <div><Label htmlFor="cl">Closes at</Label><Input id="cl" type="datetime-local" className="mt-1" value={closes} onChange={(e) => setCloses(e.target.value)} /></div>
        <div><Label htmlFor="tz">Time zone</Label><select id="tz" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" value={tz} onChange={(e) => setTz(e.target.value)}><option>Europe/Amsterdam</option><option>Europe/Berlin</option><option>Africa/Nairobi</option></select></div>
      </div>) },
    { id: "suppliers", title: "Invite vendors", purpose: "Only approved vendors can be invited.", render: () => (
      suppliersPool.length ? <div className="space-y-2">{invited.filter((name) => !suppliersPool.includes(name)).map((name) => <div key={name} className="flex items-center justify-between gap-2 rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm"><span>{name} is no longer approved.</span><Button variant="outline" size="sm" onClick={() => setInvited((current) => current.filter((value) => value !== name))}>Remove</Button></div>)}<ul className="space-y-2">{suppliersPool.map((s) => <li key={s}><label className="flex items-center gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" checked={invited.includes(s)} onChange={(e) => setInvited(e.target.checked ? [...invited, s] : invited.filter((x) => x !== s))} />{s}</label></li>)}</ul></div> : <div className="space-y-2 text-sm"><p>No approved vendors are available for this company.</p><Button variant="outline" asChild><Link to="/procurement/suppliers/new">Propose a vendor for review</Link></Button><p className="text-xs text-muted-foreground">A new vendor cannot be invited until its review is complete. Your quote draft is saved in this browser.</p></div>) },
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
      return <div className="space-y-2 text-sm">{problems.length ? <p role="alert" className="rounded-md border border-danger/40 bg-danger-soft p-3">Still needed: {problems.join(", ")}.</p> : <p className="rounded-md border border-success/40 bg-success-soft p-3">Ready to send for approval.</p>}<p>{chosen.length} line(s) · {method ?? "—"} · closes {closes || "—"} ({tz}) · {invited.length} supplier(s)</p></div>;
    } },
  ];

  if (!sourcingRole(role) || role === "auditor") return <AppShell><RestrictedState /></AppShell>;
  return (
    <AppShell>
      <PageHeader eyebrow="Quotes" title="New quote request" description="Choose what you need and which vendors to ask. Nothing goes to vendors until it is approved and sent." primaryAction={<Button variant="outline" asChild>{returnToRequest ? <Link to="/procurement/requests/$id" params={{ id: requestId! }}>Save draft and return to request</Link> : <Link to="/procurement/sourcing">Save draft and return to quotes</Link>}</Button>} />
      {submitError ? <p role="alert" className="mb-4 rounded-md border border-danger/40 bg-danger-soft p-3 text-sm text-danger">{submitError}</p> : null}
      <GuidedFlow flowId={`proc-sourcing-new:${entityId}`} steps={steps} submitLabel="Send for approval" submitDisabled={problems.length > 0}
        onSubmit={async () => {
          if (problems.length || !method) return;
          const latest = getProcurement();
          const staleLine = chosen.find((selected) => {
            const request = latest.requests.find((item) => item.id === selected.pr);
            const meta = latest.metadata[selected.pr];
            const line = meta?.lines.find((item) => item.id === selected.key);
            return !request || request.status !== "Approved" || !meta || !sameEntity(meta.entity, entityId) || !line || line.approval !== "Approved" || availableToAllocate(line) < selected.selectedQty;
          });
          const staleVendor = invited.find((name) => !latest.suppliers.some((supplier) => supplier.name === name && supplier.status === "Active" && sameEntity(supplier.country, entityId)));
          if (staleLine || staleVendor) { setSubmitError(staleLine ? "An item's approved quantity changed. Review the request before sending it for approval." : "A vendor is no longer approved. Review the invited vendors."); return; }
          setSubmitError("");
          const ref = `RFQ-DEMO-${Date.now()}`;
          saveProcurement((store) => ({
            ...store,
            metadata: Object.fromEntries(Object.entries(store.metadata).map(([pr, meta]) => [pr, { ...meta, lines: meta.lines.map((line) => {
              const selected = chosen.find((item) => item.pr === pr && item.key === line.id);
          return selected ? { ...line, route: "RFQ / tender" as const, allocatedQty: line.allocatedQty + selected.selectedQty, related: [...line.related, { kind: "RFQ" as const, ref }] } : line;
            }) }])),
            sourcing: [{ id: ref, title: chosen.map((x) => x.label).join(", "), method, state: "Pending approval", buyer: "You (demo)", entity: store.metadata[chosen[0].pr].entity, sourceLines: chosen.map((x) => `${x.pr} / ${x.key}`), items: chosen.map((x) => ({ description: x.label, qty: x.selectedQty, unit: "each" })), opensAt: "", closesAt: closes, timeZone: tz, opened: false, eligibility: justification || "Active eligible suppliers", terms: terms.trim(), responseDocuments: requiredDocuments.split(",").map((entry) => entry.trim()).filter(Boolean), criteria, invitations: invited.map((supplier) => ({ supplier, delivery: "Not delivered" as const, note: "Pending publication" })), qa: [], bids: [], amendments: [], nextAction: "Procurement lead approval", dueDate: closes.slice(0, 10) }, ...store.sourcing],
          }));
          ensureEvaluation(ref);
          setDone(ref);
          sessionStorage.removeItem(`flow:proc-sourcing-new:${entityId}`);
          sessionStorage.removeItem(draftKey);
        }}
        submitted={done ? <NextSteps reference={done} title="Sent for approval (demo)" steps={["A purchasing lead checks the buying method, vendors and scoring.", "Once approved, vendor invitations can be sent. This demo does not actually send them.", "Replies stay private until the closing time."]} actions={<Button asChild><Link to="/procurement/sourcing">Back to quote requests</Link></Button>} /> : undefined}
      />
      <Dialog open={itemPickerOpen} onOpenChange={setItemPickerOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add an approved item</DialogTitle><DialogDescription>Only approved, unallocated request quantities from this company are available.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label htmlFor="quote-line">Request item</Label><select id="quote-line" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" value={candidateId} onChange={(event) => { setCandidateId(event.target.value); setCandidateQuantity(""); }}><option value="">Choose an item</option>{approvedLines.map((line) => <option value={line.key} key={line.key}>{line.pr} · {line.label} ({line.qty} left)</option>)}</select></div>
            <div><Label htmlFor="quote-qty">Quantity to quote</Label><Input id="quote-qty" className="mt-1" type="number" min="1" max={candidate?.qty} step="1" value={candidateQuantity} onChange={(event) => setCandidateQuantity(event.target.value)} />{candidate ? <p className="mt-1 text-xs text-muted-foreground">Up to {candidate.qty} available from {candidate.pr}.</p> : null}{candidateQuantity && !candidateValid ? <p role="alert" className="mt-1 text-xs text-danger">Enter a whole number within the available quantity.</p> : null}</div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setItemPickerOpen(false)}>Cancel</Button><Button disabled={!candidateValid} onClick={addApprovedItem}>Use this item</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
