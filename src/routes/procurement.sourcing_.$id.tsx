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
import { money } from "@/modules/procurement/catalog";
import { useProcurement, saveProcurement } from "@/modules/procurement/store";
import { useCommercial, ensureEvaluation, updateCommercial } from "@/modules/procurement/commercial/store";
import { sourcingRole, sameEntity } from "@/modules/procurement/access";
import { RestrictedState } from "@/platform/components/States";
import type { BidReceipt, SourcingEvent } from "@/modules/procurement/sourcing";

export const Route = createFileRoute("/procurement/sourcing_/$id")({
  head: () => ({ meta: [{ title: "Sourcing event — Meridian ERP" }, { name: "description", content: "Restricted sourcing event" }] }),
  component: EventDetail,
});

const TABS = ["Overview", "Invitations", "Q&A", "Responses", "Publication preview", "Amendments"] as const;
const nowStr = () => new Date().toISOString().slice(0, 16).replace("T", " ");

function EventDetail() {
  const { id } = Route.useParams();
  const { role, entityId } = useApp();
  const procurement = useProcurement();
  const e = procurement.sourcing.find((x) => x.id === id);
  const evaluation = useCommercial().evaluations.find((item) => item.eventId === id);
  const setE = (value: SourcingEvent) => saveProcurement((state) => ({ ...state, sourcing: state.sourcing.map((item) => item.id === id ? value : item) }));
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [amending, setAmending] = useState(false);
  const [surrogate, setSurrogate] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const isBuyer = role === "buyer" || role === "proc_admin";

  if (!e || !sourcingRole(role) || !sameEntity(e.entity, entityId)) return <AppShell><RestrictedState /></AppShell>;
  if (!e) return <AppShell><EmptyState title="Quote request not found" body="Check the number or open the quote request list." action={<Button variant="outline" asChild><Link to="/procurement/sourcing">Back to quote requests</Link></Button>} /></AppShell>;

  const primary = !isBuyer ? undefined
    : e.state === "Draft" ? <Button onClick={() => setE({ ...e, state: "Pending approval", nextAction: "Procurement lead to approve publication" })}>Send for approval</Button>
    : e.state === "Pending approval" ? <Button onClick={() => { setE({ ...e, state: "Published", opensAt: e.opensAt || nowStr(), nextAction: "Collect responses until closing", invitations: e.invitations.map((invitation) => ({ ...invitation, delivery: "Delivered", at: nowStr(), note: "Visible in local supplier portal demo; no external message sent" })) }); ensureEvaluation(e.id); }}>Approve and send (demo)</Button>
    : e.state === "Published" ? <Button variant="outline" onClick={() => setAmending(true)}>Change quote request</Button>
    : e.state === "Closed" && !e.opened ? <Button onClick={() => setE({ ...e, opened: true, openingAuthorisedBy: `You (demo) · ${nowStr()}` })}>Open vendor replies</Button>
    : e.state === "Cancelled" ? <Button variant="outline" onClick={() => setE({ ...e, state: "Reopened", nextAction: "Review dates and re-publish" })}>Reopen quote request</Button>
    : undefined;

  return (
    <AppShell>
      <Link to="/procurement/sourcing" className="mb-3 inline-block text-sm text-primary underline">← Back to quote requests</Link>
      <PageHeader eyebrow={`Quotes · ${e.method}`} title={e.title} description={`${e.id} · ${e.entity} · handled by ${e.buyer}`} primaryAction={primary} />
      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <StatusBadge status={e.state} />
        <span>Closes <strong>{e.closesAt || "not set"}</strong> ({e.timeZone})</span>
        <span>Next: <strong>{e.nextAction}</strong> · due {e.dueDate}</span>
        {evaluation ? <Link to="/procurement/evaluations/$id" params={{ id: evaluation.id }} className="font-medium text-primary underline">Open evaluation {evaluation.id}</Link> : null}
      </div>
      {e.state === "Published" && isBuyer ? <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border bg-surface p-3">
        <div><Label htmlFor="close-reason">Early closing reason (required before deadline)</Label><Input id="close-reason" value={closeReason} onChange={(event) => setCloseReason(event.target.value)} placeholder="Committee decision reference" /></div>
        <Button variant="outline" disabled={new Date(e.closesAt).getTime() > Date.now() && (role !== "proc_admin" || !closeReason.trim())} onClick={() => { if (new Date(e.closesAt).getTime() > Date.now() && (!closeReason.trim() || role !== "proc_admin")) return; setE({ ...e, state: "Closed", nextAction: "Authorise sealed bid opening", dueDate: new Date().toISOString().slice(0, 10), amendments: new Date(e.closesAt).getTime() > Date.now() ? [...e.amendments, { no: e.amendments.length + 1, at: nowStr(), change: `Closed early by ${role}: ${closeReason}`, notified: false }] : e.amendments }); }}>Close quote request</Button>
        {new Date(e.closesAt).getTime() > Date.now() ? <span className="text-xs text-muted-foreground">Before the deadline, only Procurement admin may close with a reason. Supplier notification remains pending in this demo.</span> : null}
      </div> : null}
      {e.portalOutage ? <Banner>{e.portalOutage}</Banner> : null}
      {amending ? <AmendForm onCancel={() => setAmending(false)} onDone={(change) => { setAmending(false); setE({ ...e, amendments: [...e.amendments, { no: e.amendments.length + 1, at: nowStr(), change, notified: false }] }); }} /> : null}

      <div role="tablist" aria-label="Event sections" className="mb-4 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === t ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground"}`}>{t}</button>)}
      </div>

      <div role="tabpanel" aria-label={tab}>
        {tab === "Overview" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Requirement">
              {e.description ? <p className="mb-3 whitespace-pre-wrap text-muted-foreground">{e.description}</p> : null}
              <ul className="list-disc pl-5">{e.items.map((i) => <li key={i.description}>{i.qty} {i.unit} — {i.description}</li>)}</ul>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">From: {e.sourceLines.map((source) => {
                const requestId = source.match(/^PR-\d{4}-\d+/)?.[0];
                const request = procurement.requests.find((item) => item.id === requestId);
                return request && sameEntity(procurement.metadata[request.id]?.entity, entityId)
                  ? <Link key={source} to="/procurement/requests/$id" params={{ id: request.id }} className="text-primary underline">{source}</Link>
                  : <span key={source}>{source}</span>;
              })}</div>
            </Card>
            <Card title="Evaluation criteria (fixed once published)">
              {e.criteria.length ? <ul>{e.criteria.map((c) => <li key={c.name} className="flex justify-between"><span>{c.name}</span><span className="tabular-nums">{c.weight}%</span></li>)}</ul> : <p className="text-muted-foreground">Not set yet.</p>}
            </Card>
            <Card title="Eligibility and terms"><p>{e.eligibility || "Not set yet."}</p><p className="mt-1 text-muted-foreground">{e.terms}</p></Card>
            <Card title="Response documents required">{e.responseDocuments.length ? <ul className="list-disc pl-5">{e.responseDocuments.map((d) => <li key={d}>{d}</li>)}</ul> : <p className="text-muted-foreground">None set.</p>}</Card>
          </div>
        ) : tab === "Invitations" ? (
          e.invitations.length ? (
            <ul className="space-y-2">{e.invitations.map((i) => (
              <li key={i.supplier} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-surface p-3 text-sm">
                <span><span className="font-medium">{i.supplier}</span>{i.note ? <span className="block text-xs text-danger">{i.note}</span> : null}</span>
                <span className="flex items-center gap-2"><StatusBadge status={i.delivery} />{i.delivery === "Not delivered" && isBuyer ? <Button size="sm" variant="outline" onClick={() => setE({ ...e, invitations: e.invitations.map((invitation) => invitation.supplier === i.supplier ? { ...invitation, delivery: "Resend pending", at: nowStr(), note: "Demo resend queued locally; external delivery is unconfirmed" } : invitation) })}>Queue resend</Button> : null}</span>
              </li>))}</ul>
          ) : <EmptyState title="No invitations sent" body="Invitations go out when the event is published." />
        ) : tab === "Q&A" ? (
          e.qa.length ? <ul className="space-y-2">{e.qa.map((q) => <li key={q.q} className="rounded-lg border bg-surface p-3 text-sm"><p className="font-medium">Q: {q.q}</p><p className="mt-1">{q.a ? `A: ${q.a}` : <span className="text-warning">Unanswered</span>}</p><p className="mt-1 text-xs text-muted-foreground">{q.askedBy} · {q.publishedToAll ? "Answer shared with all invited suppliers" : "Not yet shared"}</p></li>)}</ul>
            : <EmptyState title="No questions yet" body="Supplier questions and the shared answers appear here." />
        ) : tab === "Responses" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm">{e.opened && isBuyer ? <>Opened — {e.openingAuthorisedBy}</> : <><Lock className="size-4" aria-hidden />Sealed. Only receipt details are visible until the authorised opening.</>}</p>
              {isBuyer && ["Published", "Closed"].includes(e.state) ? <Button size="sm" variant="outline" onClick={() => setSurrogate(true)}>Record offline response</Button> : null}
            </div>
            {surrogate ? <SurrogateForm e={e} onCancel={() => setSurrogate(false)} onDone={(b) => { setSurrogate(false); setE({ ...e, bids: [...e.bids, b] }); ensureEvaluation(e.id); updateCommercial((state) => ({ ...state, evaluations: state.evaluations.map((evaluation) => evaluation.eventId === e.id ? { ...evaluation, bids: [...evaluation.bids, { id: b.id, supplier: b.supplier, compliant: null, reason: "", score: null, conflict: false, deliveryCost: 0, tax: 0 }] } : evaluation) })); }} /> : null}
            {e.bids.length ? (
              <div className="overflow-x-auto rounded-lg border bg-surface">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs text-muted-foreground"><tr><th className="p-3">Supplier</th><th className="p-3">Received</th><th className="p-3">Channel</th><th className="p-3">Version</th><th className="p-3">Content</th></tr></thead>
                  <tbody className="divide-y">
                    {e.bids.map((b) => (
                      <tr key={b.id} className="align-top">
                        <td className="p-3 font-medium">{b.supplier}{b.late ? <span className="ml-2 rounded-full bg-danger-soft px-2 text-xs text-danger">Late</span> : null}</td>
                        <td className="p-3">{b.receivedAt}</td>
                        <td className="p-3">{b.channel}{b.enteredBy ? <span className="block text-xs text-muted-foreground">Entered by {b.enteredBy} at {b.enteredAt} · evidence: {b.evidence}</span> : null}</td>
                        <td className="p-3"><span className="flex items-center gap-1"><Lock className="size-3.5" aria-label="Locked" />v{b.version}</span></td>
                        <td className="p-3">{e.opened && isBuyer ? <>{money(b.sealedContent.total, b.sealedContent.currency)} · {b.sealedContent.leadTimeDays} days<span className="block text-xs text-muted-foreground">{b.sealedContent.notes}</span></> : <span className="text-muted-foreground">Sealed</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState title={e.state === "Closed" ? "No responses received" : "No responses yet"} body={e.state === "Closed" ? "Re-invite suppliers with a new event, or use a direct purchase with a recorded reason." : "Responses appear here as they arrive, sealed until opening."} />}
            <p className="text-xs text-muted-foreground">Submitted responses are locked. A supplier can submit a new version before closing; earlier versions are kept.</p>
          </div>
        ) : tab === "Publication preview" ? (
          <div className="rounded-lg border bg-surface p-5 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">What invited suppliers receive</p>
            <h2 className="mt-1 text-lg font-semibold">{e.method}: {e.title}</h2>
            {e.description ? <p className="mt-2 whitespace-pre-wrap">{e.description}</p> : null}
            <p className="mt-1">Issued by {e.entity}. Submit by <strong>{e.closesAt || "[deadline not set]"}</strong> ({e.timeZone}).</p>
            <h3 className="mt-4 font-medium">Items</h3><ul className="list-disc pl-5">{e.items.map((i) => <li key={i.description}>{i.qty} {i.unit} — {i.description}</li>)}</ul>
            <h3 className="mt-4 font-medium">How responses are evaluated</h3><ul className="list-disc pl-5">{e.criteria.map((c) => <li key={c.name}>{c.name} — {c.weight}%</li>)}</ul>
            <h3 className="mt-4 font-medium">Include with your response</h3><ul className="list-disc pl-5">{e.responseDocuments.map((d) => <li key={d}>{d}</li>)}</ul>
            <p className="mt-4 text-muted-foreground">Terms: {e.terms}. Internal budget, requester and other suppliers are never shown.</p>
          </div>
        ) : (
          e.amendments.length ? <ul className="space-y-2">{e.amendments.map((a) => <li key={a.no} className="rounded-lg border bg-surface p-3 text-sm"><span className="font-medium">Amendment {a.no}</span> · {a.at}<p>{a.change}</p><p className="text-xs text-muted-foreground">{a.notified ? "All invited suppliers notified (demo — nothing actually sent)" : "Not yet notified"}</p></li>)}</ul>
            : <EmptyState title="No amendments" body="After publication, any change must go through an amendment that notifies suppliers." />
        )}
      </div>
    </AppShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-lg border bg-surface p-4 text-sm"><h2 className="mb-2 font-semibold">{title}</h2>{children}</section>;
}
function Banner({ children }: { children: React.ReactNode }) {
  return <p role="status" className="mb-4 flex gap-2 rounded-md border border-warning/40 bg-warning-soft p-3 text-sm"><AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />{children}</p>;
}

function AmendForm({ onCancel, onDone }: { onCancel: () => void; onDone: (c: string) => void }) {
  const [c, setC] = useState("");
  return (
    <section className="mb-4 rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm">
      <h2 className="font-semibold">Change this quote request</h2>
      <p className="mt-1">Published events can't be edited directly. Describe the change; supplier notification is pending integration.</p>
      <Label htmlFor="am" className="mt-3 block">Change (required)</Label>
      <Textarea id="am" className="mt-1 bg-background" value={c} onChange={(ev) => setC(ev.target.value)} />
      <div className="mt-3 flex gap-2"><Button disabled={!c.trim()} onClick={() => onDone(c)}>Save change</Button><Button variant="outline" onClick={onCancel}>Cancel</Button></div>
    </section>
  );
}

function SurrogateForm({ e, onCancel, onDone }: { e: SourcingEvent; onCancel: () => void; onDone: (b: BidReceipt) => void }) {
  const [f, setF] = useState({ supplier: "", channel: "Email (surrogate)" as BidReceipt["channel"], receivedAt: "", evidence: "", total: "" });
  const late = !!f.receivedAt && f.receivedAt.replace("T", " ") > e.closesAt;
  const ok = f.supplier && f.receivedAt && f.evidence && Number(f.total) > 0;
  return (
    <section className="rounded-lg border bg-surface p-4 text-sm">
      <h2 className="font-semibold">Record an offline response</h2>
      <p className="mt-1 text-muted-foreground">For responses received outside the portal. Your name and the entry time are recorded; the response is locked once saved.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="sg-s">Supplier</Label><Input id="sg-s" className="mt-1" value={f.supplier} onChange={(x) => setF({ ...f, supplier: x.target.value })} /></div>
        <div><Label htmlFor="sg-c">Received via</Label><select id="sg-c" className="mt-1 h-9 w-full rounded-md border bg-background px-3" value={f.channel} onChange={(x) => setF({ ...f, channel: x.target.value as BidReceipt["channel"] })}><option>Email (surrogate)</option><option>Post (surrogate)</option><option>Hand delivery (surrogate)</option></select></div>
        <div><Label htmlFor="sg-r">Received at ({e.timeZone})</Label><Input id="sg-r" type="datetime-local" className="mt-1" value={f.receivedAt} onChange={(x) => setF({ ...f, receivedAt: x.target.value })} /></div>
        <div><Label htmlFor="sg-e">Where is the original reply?</Label><Input id="sg-e" className="mt-1" placeholder="e.g. original email or scanned letter" value={f.evidence} onChange={(x) => setF({ ...f, evidence: x.target.value })} /></div>
        <div><Label htmlFor="sg-t">Total offered (sealed)</Label><Input id="sg-t" type="number" className="mt-1" value={f.total} onChange={(x) => setF({ ...f, total: x.target.value })} /></div>
      </div>
      {late ? <p className="mt-2 text-danger">Received after closing — it will be marked late and held for a committee decision.</p> : null}
      <div className="mt-3 flex gap-2">
        <Button disabled={!ok} onClick={() => onDone({ id: crypto.randomUUID(), supplier: f.supplier, version: 1, receivedAt: f.receivedAt.replace("T", " "), channel: f.channel, late, enteredBy: "You (demo)", enteredAt: nowStr(), evidence: f.evidence, sealedContent: { total: Number(f.total), currency: e.entity.includes("Kenya") ? "KES" : "EUR", leadTimeDays: 0, notes: "Entered by buyer" } })}>Save reply privately</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </section>
  );
}
