import { FormSelect } from "@/components/ui/form-select";
import { RecordTable } from "@/platform/components/RecordTable";
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
import { RecordTabs, RecordTabPanel } from "@/platform/components/RecordTabs";
import { useProcurement, saveProcurement } from "@/modules/procurement/store";
import { useCommercial } from "@/modules/procurement/commercial/store";
import { invoiceTotal, usePayables } from "@/modules/procurement/payables/store";
import type { Invoice, CreditRef } from "@/modules/procurement/payables/store";
import { supplierRole, sameEntity } from "@/modules/procurement/access";
import { RestrictedState } from "@/platform/components/States";
import type { Decision, SupplierRecord } from "@/modules/procurement/suppliers";

export const Route = createFileRoute("/procurement/suppliers_/$id")({
  head: () => ({ meta: [{ title: "Supplier profile — Meridian ERP" }, { name: "description", content: "Restricted supplier profile" }] }),
  component: SupplierProfile,
});

const tabs = ["Overview", "Contacts", "Checks & documents", "Performance", "Orders & bills", "Notes", "Messages", "Statement", "Activity"] as const;

function SupplierProfile() {
  const { id } = Route.useParams();
  const { role, entityId } = useApp();
  const s = useProcurement().suppliers.find((x) => x.id === id);
  const orders = useCommercial().orders.filter((order) => order.supplierId === s?.id && sameEntity(order.entity, entityId));
  const payables = usePayables();
  const invoices = payables.invoices.filter((invoice) => invoice.supplierId === s?.id && invoice.entityId === entityId);
  const visibleInvoiceIds = new Set(invoices.map((invoice) => invoice.id));
  const credits = (payables.credits ?? []).filter((credit) => credit.supplierId === s?.id && visibleInvoiceIds.has(credit.invoiceId));
  const openOrders = orders.filter((order) => !["Closed", "Cancelled"].includes(order.status));
  const openInvoices = invoices.filter((invoice) => !["Paid", "Voided", "Cancelled"].includes(invoice.status));
  const setS = (value: SupplierRecord) => saveProcurement((state) => ({ ...state, suppliers: state.suppliers.map((item) => item.id === id ? value : item) }));
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [suspending, setSuspending] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const readOnly = role === "auditor";
  const canDecide = ["supplier_steward", "proc_admin"].includes(role);

  if (!s || !supplierRole(role) || !sameEntity(s.country, entityId)) return <AppShell><RestrictedState /></AppShell>;
  const missingEvidence = s.qualifications.filter((q) => q.status === "Missing" || q.status === "Expired" || Boolean(q.validTo && q.validTo < new Date().toISOString().slice(0, 10))).map((q) => q.name);
  const financeOk = s.bank?.verification.state === "Approved";
  const procOk = s.procurementDecision.state === "Approved";
  const activationBlockers = [...missingEvidence.map((m) => `${m} missing`), s.duplicates?.length && s.duplicateReview?.state !== "Cleared" && "Check possible duplicate vendors", !procOk && "Buying team approval needed", !financeOk && "Finance must check payment details"].filter(Boolean) as string[];

  const primary = readOnly ? undefined
    : s.status === "Active" && canDecide ? <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setSuspending(true)}>Put on hold</Button><Button variant="outline" onClick={() => setDeactivating(true)}>Deactivate vendor</Button></div>
    : ["Conditional", "Under diligence", "More information required"].includes(s.status) && canDecide ? (
      <Button disabled={activationBlockers.length > 0} title={activationBlockers.length ? `Blocked: ${activationBlockers.join(", ")}` : undefined}
        onClick={() => setS({ ...s, status: "Active", nextAction: "Annual review", timeline: [{ id: crypto.randomUUID(), at: new Date().toISOString().slice(0, 16).replace("T", " "), actor: "You (demo)", event: "Activated", before: s.status, after: "Active" }, ...s.timeline] })}>
        Activate vendor
      </Button>
    ) : undefined;

  return (
    <AppShell>
      <PageHeader eyebrow="Vendor" title={s.name} description={`${s.legalName} · ${s.country} · ${s.registration}`} primaryAction={primary} />
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge status={s.status} />
        <span>Owner <strong>{s.owner}</strong></span>
        <span>Next: <strong>{s.nextAction}</strong></span>
        <span>Due <strong>{s.dueDate}</strong></span>
        {canDecide && !["Rejected", "Suspended", "Inactive", "Expired"].includes(s.status) ? <Button variant="outline" size="sm" asChild><Link to="/procurement/suppliers/new" search={{ edit: s.id }}>Edit vendor details</Link></Button> : null}
        {readOnly ? <span className="flex items-center gap-1 text-muted-foreground"><Lock className="size-3.5" aria-hidden />You can view but cannot change this vendor</span> : null}
      </div>

      {suspending ? <SuspendForm s={s} openOrders={openOrders.length} openInvoices={openInvoices.length} onCancel={() => setSuspending(false)} onDone={(reason, date) => { setSuspending(false); setS({ ...s, status: "Suspended", nextAction: `Review ${openOrders.length} open PO(s) and ${openInvoices.length} invoice(s)`, timeline: [{ id: crypto.randomUUID(), at: new Date().toISOString().slice(0, 16).replace("T", " "), actor: "You (demo)", event: "Suspended", reason, before: "Active", after: `Suspended (effective ${date})` }, ...s.timeline] }); }} /> : null}
      {deactivating ? <DeactivateForm openOrders={openOrders.length} openInvoices={openInvoices.length} onCancel={() => setDeactivating(false)} onDone={(reason) => { setDeactivating(false); setS({ ...s, status: "Inactive", nextAction: "No new purchase orders", timeline: [{ id: crypto.randomUUID(), at: new Date().toISOString(), actor: `${role} (demo)`, event: "Deactivated", reason, before: s.status, after: "Inactive" }, ...s.timeline] }); }} /> : null}

      <RecordTabs label="Supplier sections" idPrefix="supplier-detail" tabs={tabs} value={tab} onChange={setTab} />

      <RecordTabPanel idPrefix="supplier-detail" tab={tab}>
        {tab === "Overview" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-primary/30 bg-primary-soft p-5 text-sm lg:col-span-2">
              <h2 className="font-semibold">What happens next?</h2>
              <p className="mt-1">{s.nextAction}</p>
              <p className="mt-2 text-muted-foreground">{openOrders.length} open order{openOrders.length === 1 ? "" : "s"} · {openInvoices.length} open bill{openInvoices.length === 1 ? "" : "s"}</p>
              {(orders.length || invoices.length) ? <button type="button" className="mt-2 font-medium text-primary underline" onClick={() => setTab("Orders & bills")}>View orders and bills</button> : null}
            </section>
            <section className="rounded-lg border bg-surface p-5 text-sm lg:col-span-2">
              <h2 className="font-semibold">At a glance</h2>
              <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div><dt className="text-muted-foreground">Main contact</dt><dd className="mt-1 font-medium">{s.contacts[0]?.name || [s.onboarding?.firstName, s.onboarding?.lastName].filter(Boolean).join(" ") || "Not added"}</dd></div>
                <div><dt className="text-muted-foreground">Email</dt><dd className="mt-1 break-all font-medium">{s.contacts[0]?.email || "Not added"}</dd></div>
                <div><dt className="text-muted-foreground">Country</dt><dd className="mt-1 font-medium">{s.country}</dd></div>
                <div><dt className="text-muted-foreground">Managed by</dt><dd className="mt-1 font-medium">{s.owner}</dd></div>
              </dl>
            </section>
            {s.status === "Active" ? <details className="rounded-lg border bg-surface p-4 text-sm lg:col-span-2"><summary className="cursor-pointer font-medium">See approval checks</summary><div className="mt-3 grid gap-4 lg:grid-cols-2"><DecisionCard title="Buying team approval" d={s.procurementDecision} /><DecisionCard title="Finance payment details check" d={s.bank?.verification ?? { state: "Not started" }} /></div></details> : <><DecisionCard title="Buying team approval" d={s.procurementDecision} /><DecisionCard title="Finance payment details check" d={s.bank?.verification ?? { state: "Not started" }} /></>}
            {s.onboarding ? <section className="rounded-lg border bg-surface p-4 text-sm lg:col-span-2"><h2 className="font-semibold">Vendor details</h2><dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><div><dt className="text-xs text-muted-foreground">Display name</dt><dd>{s.onboarding.displayName}</dd></div><div><dt className="text-xs text-muted-foreground">Company ID</dt><dd>{s.registration}</dd></div><div><dt className="text-xs text-muted-foreground">Primary contact</dt><dd>{[s.onboarding.salutation, s.onboarding.firstName, s.onboarding.lastName].filter(Boolean).join(" ") || "—"}</dd></div><div><dt className="text-xs text-muted-foreground">Work phone / mobile</dt><dd>{[s.onboarding.workPhone, s.onboarding.mobile].filter(Boolean).join(" · ") || "—"}</dd></div><div><dt className="text-xs text-muted-foreground">Language</dt><dd>{s.onboarding.language || "—"}</dd></div><div><dt className="text-xs text-muted-foreground">Currency / payment terms</dt><dd>{[s.onboarding.currency, s.onboarding.paymentTerms].filter(Boolean).join(" · ") || "—"}</dd></div><div><dt className="text-xs text-muted-foreground">Tax rate reference</dt><dd>{s.onboarding.taxRateRef || "—"}</dd></div><div><dt className="text-xs text-muted-foreground">Portal access</dt><dd>{s.onboarding.portalAccessRequested ? "Requested; pending approval" : "Not requested"}</dd></div><div><dt className="text-xs text-muted-foreground">Bank name</dt><dd>{s.onboarding.bankName || "—"}</dd></div></dl>{s.onboarding.customFields?.length ? <div className="mt-4"><h3 className="text-xs font-semibold uppercase text-muted-foreground">Custom fields</h3><p className="mt-1">{s.onboarding.customFields.map((item) => `${item.name}: ${item.value}`).join(" · ")}</p></div> : null}{s.onboarding.reportingTags?.length ? <div className="mt-4"><h3 className="text-xs font-semibold uppercase text-muted-foreground">Reporting tags</h3><p className="mt-1">{s.onboarding.reportingTags.map((item) => `${item.name}: ${item.value}`).join(" · ")}</p></div> : null}{s.onboarding.remarks ? <div className="mt-4"><h3 className="text-xs font-semibold uppercase text-muted-foreground">Remarks</h3><p className="mt-1 whitespace-pre-wrap">{s.onboarding.remarks}</p></div> : null}</section> : null}
            {s.bank ? (
              <div className="rounded-lg border bg-surface p-4">
                <h2 className="text-sm font-semibold">Payment details</h2>
                <div className="mt-2"><p className="text-sm">{s.bank.masked}</p></div>
                <p className="mt-2 text-xs text-muted-foreground">If payment details change, Finance must check them again.</p>
              </div>
            ) : null}
            {activationBlockers.length && s.status !== "Active" && s.status !== "Rejected" ? (
              <div className="rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm">
                <p className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4 text-warning" aria-hidden />This vendor cannot be used yet</p>
                <ul className="mt-1 list-disc pl-5">{activationBlockers.map((b) => <li key={b}>{b}</li>)}</ul>
              </div>
            ) : null}
            {s.duplicates?.length ? (
              <div className="rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm lg:col-span-2">
                <p className="font-medium">Possible duplicate</p>
                {s.duplicates.map((d) => <p key={d.name}>{d.name} — {d.reason}</p>)}
                <p className="mt-2">Review: {s.duplicateReview ? `${s.duplicateReview.state} · ${s.duplicateReview.reason}` : "Pending human review"}. Records are never merged automatically.</p>
              </div>
            ) : null}
            {canDecide && s.status === "Active" ? <details className="rounded-lg border bg-surface p-4 lg:col-span-2"><summary className="cursor-pointer text-sm font-medium">Manage vendor review</summary><div className="mt-3"><SupplierReviewActions s={s} onChange={setS} role={role} /></div></details> : canDecide ? <SupplierReviewActions s={s} onChange={setS} role={role} /> : null}
            {s.portalUpdates?.length ? <PortalUpdateReview s={s} onChange={setS} canDecide={canDecide} /> : null}
          </div>
        ) : tab === "Contacts" ? (
          <div className="space-y-5"><section><h2 className="mb-2 font-semibold">Addresses</h2><List empty="No addresses yet." items={s.sites.map((x) => `${x.name} — ${x.address}`)} /></section><ContactManager s={s} canEdit={canDecide} role={role} onChange={setS} /><section><h2 className="mb-2 font-semibold">What this vendor supplies</h2><List empty="No categories yet." items={s.categories} /></section></div>
        ) : tab === "Checks & documents" ? (
          <div className="space-y-6"><section><h2 className="mb-2 font-semibold">Required checks</h2><ul className="space-y-2">{s.qualifications.length ? s.qualifications.map((q) => <li key={q.name} className="flex justify-between rounded-lg border bg-surface p-3 text-sm"><span>{q.name}{q.validTo ? <span className="block text-xs text-muted-foreground">Valid to {q.validTo}</span> : null}</span><StatusBadge status={q.status} /></li>) : <p className="text-sm text-muted-foreground">No extra checks needed.</p>}</ul>{canDecide && s.qualifications.length ? <QualificationReview s={s} onChange={setS} /> : null}</section><section><h2 className="mb-2 font-semibold">Documents</h2><List empty="No documents recorded." items={s.documents.map((d) => `${d.name}${d.kind ? ` · ${d.kind}` : ""} — recorded ${d.uploaded}`)} />{s.onboarding ? <p className="mt-3 text-xs text-muted-foreground">This demo stores document names only. Files are not uploaded.</p> : null}{s.portalUpdates?.length ? <PortalUpdateReview s={s} onChange={setS} canDecide={canDecide} /> : null}</section></div>
        ) : tab === "Performance" ? (
          s.performance ? (
            <div className="rounded-lg border bg-surface p-4 text-sm">
              <p className="text-xs text-muted-foreground">{s.performance.period} · source: {s.performance.source}</p>
              <dl className="mt-3 grid gap-3 sm:grid-cols-4">
                {[["On-time delivery", `${s.performance.delivery}%`], ["Quality accepted", `${s.performance.quality}%`], ["Responsiveness", `${s.performance.responsiveness}%`], ["Disputes", String(s.performance.disputes)]].map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="text-lg font-semibold">{v}</dd></div>)}
              </dl>
            </div>
          ) : <EmptyState title="Not enough data yet" body="Scores appear after at least 5 receipts or invoices in the period." />
        ) : tab === "Orders & bills" ? (
          <div className="space-y-6 text-sm">
            <p className="text-muted-foreground">{openOrders.length} open purchase order(s) · {openInvoices.length} open bill(s). Records appear here when linked to this vendor ID.</p>
            <section aria-labelledby="vendor-orders-title">
              <h2 id="vendor-orders-title" className="mb-3 font-semibold">Purchase orders</h2>
              {orders.length ? <div className="space-y-2">{orders.map((order) => <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-surface p-4"><div><Link className="font-medium text-primary underline" to="/procurement/orders/$id" params={{ id: order.id }}>{order.id}</Link><p className="mt-1 text-muted-foreground">{order.line.description} · due {order.due}</p></div><div className="flex items-center gap-4"><span>{new Intl.NumberFormat("en", { style: "currency", currency: order.currency }).format(order.line.qty * order.line.price)}</span><StatusBadge status={order.status} /></div></div>)}</div> : <EmptyState title="No linked purchase orders" body="Purchase orders linked to this vendor will appear here." />}
            </section>
            <section aria-labelledby="vendor-bills-title">
              <h2 id="vendor-bills-title" className="mb-3 font-semibold">Bills</h2>
              {invoices.length ? <div className="space-y-2">{invoices.map((invoice) => <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-surface p-4"><div><Link className="font-medium text-primary underline" to="/procurement/invoices/$id" params={{ id: invoice.id }}>{invoice.number}</Link><p className="mt-1 text-muted-foreground">{invoice.date} · {invoice.po}</p></div><div className="flex items-center gap-4"><span>{new Intl.NumberFormat("en", { style: "currency", currency: invoice.currency }).format(invoiceTotal(invoice))}</span><StatusBadge status={invoice.status} /></div></div>)}</div> : <EmptyState title="No linked bills" body="Bills linked to this vendor will appear here." />}
            </section>
          </div>
        ) : tab === "Notes" ? (
          <SupplierNotes supplier={s} onChange={setS} role={role} readOnly={readOnly} />
        ) : tab === "Messages" ? (
          <SupplierMessages supplier={s} onChange={setS} role={role} readOnly={readOnly} />
        ) : tab === "Statement" ? (
          <SupplierStatement invoices={invoices} credits={credits} currency={s.onboarding?.currency} />
        ) : (
          <StatusTimeline events={s.timeline} />
        )}
      </RecordTabPanel>
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

function SupplierNotes({ supplier, onChange, role, readOnly }: { supplier: SupplierRecord; onChange: (value: SupplierRecord) => void; role: string; readOnly: boolean }) {
  const [text, setText] = useState("");
  const [audience, setAudience] = useState<"Internal" | "Supplier">("Internal");
  const add = () => {
    if (!text.trim()) return;
    const at = new Date().toISOString();
    onChange({ ...supplier,
      comments: [{ id: crypto.randomUUID(), at, actor: `${role} (demo)`, text: text.trim(), audience }, ...(supplier.comments ?? [])],
      timeline: [{ id: crypto.randomUUID(), at, actor: `${role} (demo)`, event: `${audience} vendor note recorded` }, ...supplier.timeline],
    });
    setText("");
  };
  return <section className="rounded-lg border bg-surface p-5 text-sm">
    <h2 className="font-semibold">Notes about this vendor</h2>
    <p className="mt-1 text-muted-foreground">Notes stay in this browser demo. A supplier-visible label does not send a message or grant portal access.</p>
    {!readOnly ? <div className="mt-4 space-y-3"><div><Label htmlFor="vendor-note">Note</Label><Textarea id="vendor-note" className="mt-1" value={text} onChange={(event) => setText(event.target.value)} /></div><div><Label htmlFor="vendor-note-audience">Who could see this after approval?</Label><FormSelect id="vendor-note-audience" className="mt-1 h-10 rounded-md border bg-background px-3" value={audience} onChange={(event) => setAudience(event.target.value as "Internal" | "Supplier")}><option>Internal</option><option>Supplier</option></FormSelect></div><Button onClick={add} disabled={!text.trim()}>Save note</Button></div> : null}
    {(supplier.comments ?? []).length ? <ol className="mt-5 space-y-3 border-t pt-4">{supplier.comments?.map((comment) => <li key={comment.id} className="rounded-md bg-surface-muted p-3"><p>{comment.text}</p><p className="mt-2 text-xs text-muted-foreground">{comment.actor} · {comment.at} · {comment.audience}</p></li>)}</ol> : <p className="mt-4 text-muted-foreground">No notes yet.</p>}
  </section>;
}

function SupplierMessages({ supplier, onChange, role, readOnly }: { supplier: SupplierRecord; onChange: (value: SupplierRecord) => void; role: string; readOnly: boolean }) {
  const [to, setTo] = useState(supplier.contacts[0]?.email ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const save = () => {
    if (!supplier.contacts.some((contact) => contact.email === to) || !subject.trim() || !body.trim()) return setError("Choose a vendor contact and enter a subject and message.");
    const at = new Date().toISOString();
    onChange({ ...supplier,
      mailDrafts: [{ id: crypto.randomUUID(), at, actor: `${role} (demo)`, to, subject: subject.trim(), body: body.trim() }, ...(supplier.mailDrafts ?? [])],
      timeline: [{ id: crypto.randomUUID(), at, actor: `${role} (demo)`, event: "Vendor message draft saved", reason: subject.trim() }, ...supplier.timeline],
    });
    setSubject(""); setBody(""); setError("");
  };
  return <section className="rounded-lg border bg-surface p-5 text-sm">
    <h2 className="font-semibold">Vendor messages</h2><p className="mt-1 text-muted-foreground">Prepare a draft here. This demo never sends email or a portal message.</p>
    {!readOnly ? <div className="mt-4 grid gap-3"><div><Label htmlFor="vendor-message-to">Vendor contact</Label><FormSelect id="vendor-message-to" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={to} onChange={(event) => setTo(event.target.value)}><option value="">Choose contact</option>{supplier.contacts.map((contact) => <option key={contact.email} value={contact.email}>{contact.name} · {contact.email}</option>)}</FormSelect></div><div><Label htmlFor="vendor-message-subject">Subject</Label><Input id="vendor-message-subject" value={subject} onChange={(event) => setSubject(event.target.value)} /></div><div><Label htmlFor="vendor-message-body">Message</Label><Textarea id="vendor-message-body" value={body} onChange={(event) => setBody(event.target.value)} /></div>{error ? <p role="alert" className="text-danger">{error}</p> : null}<Button className="w-fit" onClick={save}>Save draft</Button></div> : null}
    {(supplier.mailDrafts ?? []).length ? <ol className="mt-5 space-y-3 border-t pt-4">{supplier.mailDrafts?.map((draft) => <li key={draft.id} className="rounded-md bg-surface-muted p-3"><p className="font-medium">Draft · {draft.subject}</p><p className="mt-1 whitespace-pre-wrap">{draft.body}</p><p className="mt-2 text-xs text-muted-foreground">To {draft.to} · {draft.actor} · {draft.at}</p></li>)}</ol> : <p className="mt-4 text-muted-foreground">No message drafts yet.</p>}
  </section>;
}

function SupplierStatement({ invoices, credits, currency }: { invoices: Invoice[]; credits: CreditRef[]; currency?: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const visibleInvoices = invoices.filter((invoice) => (!from || invoice.date >= from) && (!to || invoice.date <= to));
  const visibleCredits = credits.filter((credit) => (!from || credit.created.slice(0, 10) >= from) && (!to || credit.created.slice(0, 10) <= to));
  const format = (value: number, code: string) => new Intl.NumberFormat("en", { style: "currency", currency: code }).format(value);
  return <section className="rounded-lg border bg-surface p-5 text-sm">
    <h2 className="font-semibold">Statement preview</h2><p className="mt-1 text-muted-foreground">Purchase-side bills and credit references only. Finance owns the supplier ledger, payments and official statement.</p>
    <div className="mt-4 flex flex-wrap gap-3"><div><Label htmlFor="statement-from">From</Label><Input id="statement-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div><div><Label htmlFor="statement-to">To</Label><Input id="statement-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div></div>
    <div className="mt-4 overflow-x-auto"><RecordTable className="w-full min-w-[35rem] text-left"><thead className="border-b bg-surface-muted"><tr><th className="p-2">Date</th><th className="p-2">Record</th><th className="p-2">Status</th><th className="p-2 text-right">Amount</th></tr></thead><tbody>{visibleInvoices.map((invoice) => <tr key={invoice.id} className="border-b"><td className="p-2">{invoice.date}</td><td className="p-2"><Link className="text-primary underline" to="/procurement/invoices/$id" params={{ id: invoice.id }}>{invoice.number}</Link></td><td className="p-2">{invoice.status}</td><td className="p-2 text-right">{format(invoiceTotal(invoice), invoice.currency)}</td></tr>)}{visibleCredits.map((credit) => <tr key={credit.id} className="border-b"><td className="p-2">{credit.created.slice(0, 10)}</td><td className="p-2">Credit {credit.id}</td><td className="p-2">{credit.status}</td><td className="p-2 text-right">{format(credit.amount, credit.currency || currency || "EUR")}</td></tr>)}</tbody></RecordTable></div>
    {!visibleInvoices.length && !visibleCredits.length ? <p className="mt-4 text-muted-foreground">No bills or credit references in this period.</p> : null}
  </section>;
}

function ContactManager({ s, canEdit, role, onChange }: { s: SupplierRecord; canEdit: boolean; role: string; onChange: (value: SupplierRecord) => void }) {
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [name, setName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const start = (index: number | "new") => {
    const contact = typeof index === "number" ? s.contacts[index] : undefined;
    setEditing(index); setName(contact?.name ?? ""); setContactRole(contact?.role ?? ""); setEmail(contact?.email ?? ""); setError("");
  };
  const update = (contacts: SupplierRecord["contacts"], event: string, reason: string) => onChange({ ...s, contacts,
    timeline: [{ id: crypto.randomUUID(), at: new Date().toISOString(), actor: `${role} (demo)`, event, reason }, ...s.timeline] });
  const save = () => {
    if (!name.trim() || !contactRole.trim() || !email.trim()) return setError("Name, role and email are required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter a valid email address.");
    if (s.contacts.some((contact, index) => index !== editing && contact.email.toLowerCase() === email.trim().toLowerCase())) return setError("This email is already on the vendor.");
    const contact = { name: name.trim(), role: contactRole.trim(), email: email.trim() };
    const contacts = editing === "new" ? [...s.contacts, contact] : s.contacts.map((current, index) => index === editing ? contact : current);
    update(contacts, editing === "new" ? "Contact added" : "Contact updated", `${contact.name} · ${contact.email}`);
    setEditing(null); setError("");
  };
  const remove = (index: number) => {
    const contact = s.contacts[index];
    if (!contact) return;
    update(s.contacts.filter((_, current) => current !== index), "Contact removed", `${contact.name} · ${contact.email}`);
    if (editing === index) setEditing(null);
  };
  return <section aria-labelledby="vendor-contacts" className="space-y-3">
    <div className="flex items-center justify-between gap-3"><h2 id="vendor-contacts" className="font-semibold">Contact persons</h2>{canEdit ? <Button size="sm" onClick={() => start("new")}>Add contact</Button> : null}</div>
    {s.contacts.length ? <ul className="space-y-2">{s.contacts.map((contact, index) => <li key={`${contact.email}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-surface p-3 text-sm"><div><strong>{contact.name}</strong><p className="text-muted-foreground">{contact.role} · {contact.email}</p></div>{canEdit ? <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => start(index)}>Edit</Button><Button size="sm" variant="outline" onClick={() => remove(index)}>Remove</Button></div> : null}</li>)}</ul> : <EmptyState title="No contacts yet" body="Add the people who handle quotes, orders and delivery for this vendor." action={canEdit ? <Button onClick={() => start("new")}>Add contact</Button> : undefined} />}
    {editing !== null ? <div className="rounded-lg border bg-surface p-4"><h3 className="font-medium">{editing === "new" ? "Add contact" : "Edit contact"}</h3><div className="mt-3 grid gap-3 sm:grid-cols-3"><div><Label htmlFor="contact-name">Name</Label><Input id="contact-name" value={name} onChange={(event) => setName(event.target.value)} /></div><div><Label htmlFor="contact-role">Role</Label><Input id="contact-role" value={contactRole} onChange={(event) => setContactRole(event.target.value)} /></div><div><Label htmlFor="contact-email">Email</Label><Input id="contact-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div></div>{error ? <p role="alert" className="mt-2 text-sm text-destructive">{error}</p> : null}<div className="mt-3 flex gap-2"><Button onClick={save}>Save contact</Button><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button></div></div> : null}
  </section>;
}

function DeactivateForm({ openOrders, openInvoices, onCancel, onDone }: { openOrders: number; openInvoices: number; onCancel: () => void; onDone: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const blocked = openOrders > 0 || openInvoices > 0;
  return <section className="mb-4 rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm"><h2 className="font-semibold">Deactivate vendor</h2><p className="mt-1">{blocked ? `Resolve ${openOrders} open purchase order(s) and ${openInvoices} open invoice(s) before deactivation.` : "The vendor stays in history and cannot be used for new orders. Record the reason below."}</p><div className="mt-3 max-w-xl"><Label htmlFor="deactivation-reason">Reason</Label><Textarea id="deactivation-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></div><div className="mt-3 flex gap-2"><Button variant="destructive" disabled={blocked || !reason.trim()} onClick={() => onDone(reason.trim())}>Confirm deactivation</Button><Button variant="outline" onClick={onCancel}>Cancel</Button></div></section>;
}

function SuspendForm({ s, openOrders, openInvoices, onCancel, onDone }: { s: SupplierRecord; openOrders: number; openInvoices: number; onCancel: () => void; onDone: (reason: string, date: string) => void }) {
  const [reason, setReason] = useState("");
  const [date, setDate] = useState("");
  return (
    <section aria-labelledby="susp-h" className="mb-4 rounded-lg border border-danger/40 bg-danger-soft p-4 text-sm">
      <h2 id="susp-h" className="font-semibold">Suspend {s.name}</h2>
      <p className="mt-1">This affects {openOrders} open purchase order(s) and {openInvoices} open invoice(s). They'll be flagged for review — nothing is cancelled automatically.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="sr">Reason (required)</Label><Textarea id="sr" className="mt-1 bg-background" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <div><Label htmlFor="sd">Effective date (required)</Label><Input id="sd" type="date" className="mt-1 bg-background" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      <div className="mt-3 flex gap-2"><Button variant="destructive" disabled={!reason.trim() || !date} onClick={() => onDone(reason, date)}>Confirm suspension</Button><Button variant="outline" onClick={onCancel}>Cancel</Button></div>
    </section>
  );
}

function SupplierReviewActions({ s, onChange, role }: { s: SupplierRecord; onChange: (supplier: SupplierRecord) => void; role: string }) {
  const [reason, setReason] = useState("");
  const [financeBy, setFinanceBy] = useState("");
  const [financeRef, setFinanceRef] = useState("");
  const [maskedRef, setMaskedRef] = useState(s.bank?.masked ?? "");
  const [legalName, setLegalName] = useState(s.legalName);
  const [registration, setRegistration] = useState(s.registration);
  const [taxRef, setTaxRef] = useState(s.taxRef ?? "");
  const [error, setError] = useState("");
  const timestamp = () => new Date().toISOString();
  const event = (action: string, detail: string, before?: string, after?: string) => ({ id: crypto.randomUUID(), at: timestamp(), actor: `${role} (demo)`, event: action, reason: detail, before, after });
  const decide = (state: "Approved" | "Returned" | "Rejected") => {
    if (!reason.trim()) return setError("Record the decision rationale.");
    if (state === "Approved" && (s.qualifications.some((q) => q.status === "Missing" || q.status === "Expired" || Boolean(q.validTo && q.validTo < new Date().toISOString().slice(0, 10))) || (s.duplicates?.length && s.duplicateReview?.state !== "Cleared"))) return setError("Check missing or expired documents and possible duplicate vendors before approval.");
    const status = state === "Approved" ? "Conditional" : state === "Returned" ? "More information required" : "Rejected";
    onChange({ ...s, status, procurementDecision: { state, by: `${role} (demo)`, at: timestamp(), note: reason.trim() }, nextAction: state === "Approved" ? "Finance verification and activation" : state === "Returned" ? "Supplier to provide corrected information" : "None — application rejected", timeline: [event(`Procurement ${state.toLowerCase()}`, reason.trim(), s.status, status), ...s.timeline] });
    setReason(""); setError("");
  };
  const recordFinance = () => {
    if (!financeBy.trim() || !financeRef.trim() || !maskedRef.trim()) return setError("Enter the independent Finance verifier, reference, and masked payment reference.");
    if (maskedRef.replace(/[^0-9]/g, "").length > 4) return setError("Only a masked payment reference is allowed here; use the secure Finance channel for full details.");
    onChange({ ...s, bank: { masked: maskedRef.trim(), verification: { state: "Approved", by: financeBy.trim(), at: timestamp(), reference: financeRef.trim(), note: "Independent verification reference recorded in demo" } }, nextAction: s.procurementDecision.state === "Approved" ? "Activate supplier" : s.nextAction, timeline: [event("Finance verification reference recorded", financeRef.trim()), ...s.timeline] });
    setFinanceBy(""); setFinanceRef(""); setError("");
  };
  const bankChange = () => {
    if (!reason.trim() || !maskedRef.trim()) return setError("Enter a reason and masked reference for Finance re-verification.");
    onChange({ ...s, bank: { masked: maskedRef.trim(), verification: { state: "Pending", note: "Secure Finance re-verification required" } }, status: "Conditional", reviewVersion: s.reviewVersion + 1, nextAction: "Finance to verify changed payment details", timeline: [event("Payment instruction change requested", reason.trim(), `review v${s.reviewVersion}`, `review v${s.reviewVersion + 1}`), ...s.timeline] });
    setReason(""); setError("");
  };
  const legalChange = () => {
    if (!reason.trim() || !legalName.trim() || !registration.trim()) return setError("Legal identity and a change reason are required.");
    onChange({ ...s, legalName: legalName.trim(), registration: registration.trim(), taxRef: taxRef.trim(), status: "Under diligence", reviewVersion: s.reviewVersion + 1, procurementDecision: { state: "Pending", note: "Legal profile change requires re-review" }, bank: s.bank ? { ...s.bank, verification: { state: "Pending", note: "Finance must review legal profile change" } } : undefined, nextAction: "Revalidate legal identity and payment instructions", timeline: [event("Legal profile revised", `${reason.trim()}; ${s.legalName} / ${s.registration} → ${legalName.trim()} / ${registration.trim()}`, `review v${s.reviewVersion}`, `review v${s.reviewVersion + 1}`), ...s.timeline] });
    setReason(""); setError("");
  };
  const resolveDuplicate = (state: "Cleared" | "Confirmed") => {
    if (!reason.trim()) return setError("Record the duplicate review evidence and reason.");
    onChange({ ...s, duplicateReview: { state, reason: reason.trim(), by: `${role} (demo)`, at: timestamp() }, status: state === "Confirmed" ? "Rejected" : s.status, procurementDecision: state === "Confirmed" ? { state: "Rejected", by: `${role} (demo)`, at: timestamp(), note: "Confirmed duplicate" } : s.procurementDecision, timeline: [event(`Duplicate ${state.toLowerCase()}`, reason.trim()), ...s.timeline] });
    setReason(""); setError("");
  };
  return <section className="rounded-lg border bg-surface p-4 text-sm lg:col-span-2">
    <h2 className="font-semibold">Controlled supplier review</h2>
    <p className="mt-1 text-xs text-muted-foreground">Demo decisions are recorded locally. Finance verification must arrive from an independent secure process; this form records its reference only.</p>
    {error ? <p role="alert" className="mt-2 text-destructive">{error}</p> : null}
    <div className="mt-3"><Label htmlFor="supplier-review-reason">Decision or change reason</Label><Textarea id="supplier-review-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
    <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => decide("Approved")} disabled={s.status === "Active" || s.status === "Rejected"}>Approve Procurement review</Button><Button size="sm" variant="outline" onClick={() => decide("Returned")} disabled={s.status === "Rejected"}>Return for information</Button><Button size="sm" variant="outline" onClick={() => decide("Rejected")} disabled={s.status === "Rejected"}>Reject application</Button></div>
    {s.duplicates?.length && s.duplicateReview?.state !== "Cleared" ? <div className="mt-4 border-t pt-3"><h3 className="font-medium">Duplicate candidate decision</h3><p className="text-xs text-muted-foreground">Review supporting identity evidence; no automatic merge occurs.</p><div className="mt-2 flex gap-2"><Button size="sm" variant="outline" onClick={() => resolveDuplicate("Cleared")}>Clear candidate</Button><Button size="sm" variant="outline" onClick={() => resolveDuplicate("Confirmed")}>Confirm duplicate and reject</Button></div></div> : null}
    {role === "proc_admin" ? <div className="mt-4 border-t pt-3"><h3 className="font-medium">Record independent Finance verification</h3><div className="mt-2 grid gap-2 sm:grid-cols-3"><div><Label htmlFor="finance-by">Finance verifier</Label><Input id="finance-by" value={financeBy} onChange={(e) => setFinanceBy(e.target.value)} /></div><div><Label htmlFor="finance-ref">Verification reference</Label><Input id="finance-ref" value={financeRef} onChange={(e) => setFinanceRef(e.target.value)} /></div><div><Label htmlFor="bank-masked">Masked payment reference</Label><Input id="bank-masked" value={maskedRef} onChange={(e) => setMaskedRef(e.target.value)} /></div></div><div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={recordFinance}>Record Finance approval reference</Button><Button size="sm" variant="outline" onClick={bankChange}>Request bank-change review</Button></div></div> : null}
    <div className="mt-4 border-t pt-3"><h3 className="font-medium">Legal profile change</h3><div className="mt-2 grid gap-2 sm:grid-cols-3"><div><Label htmlFor="legal-name">Legal name</Label><Input id="legal-name" value={legalName} onChange={(e) => setLegalName(e.target.value)} /></div><div><Label htmlFor="legal-registration">Registration</Label><Input id="legal-registration" value={registration} onChange={(e) => setRegistration(e.target.value)} /></div><div><Label htmlFor="legal-tax">Tax reference</Label><Input id="legal-tax" value={taxRef} onChange={(e) => setTaxRef(e.target.value)} /></div></div><Button className="mt-2" size="sm" variant="outline" onClick={legalChange}>Submit new review version</Button></div>
  </section>;
}

function QualificationReview({ s, onChange }: { s: SupplierRecord; onChange: (supplier: SupplierRecord) => void }) {
  const [name, setName] = useState(s.qualifications[0]?.name ?? "");
  const [reference, setReference] = useState("");
  const [validTo, setValidTo] = useState("");
  const [error, setError] = useState("");
  return <section className="mt-4 rounded-lg border bg-surface p-4 text-sm"><h2 className="font-semibold">Record a required document</h2><p className="mt-1 text-xs text-muted-foreground">Only the document reference is saved here. No file is uploaded or checked outside this demo.</p>{error ? <p role="alert" className="mt-2 text-destructive">{error}</p> : null}<div className="mt-3 grid gap-2 sm:grid-cols-3"><div><Label htmlFor="qualification-name">Document</Label><FormSelect id="qualification-name" className="h-10 w-full rounded-md border bg-background px-3" value={name} onChange={(e) => setName(e.target.value)}>{s.qualifications.map((q) => <option key={q.name}>{q.name}</option>)}</FormSelect></div><div><Label htmlFor="qualification-ref">Document reference</Label><Input id="qualification-ref" value={reference} onChange={(e) => setReference(e.target.value)} /></div><div><Label htmlFor="qualification-valid">Valid until</Label><Input id="qualification-valid" type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} /></div></div><Button className="mt-3" size="sm" onClick={() => { if (!reference.trim() || !validTo || validTo < new Date().toISOString().slice(0, 10)) return setError("Enter a reference and a future validity date."); const qualifications = s.qualifications.map((q) => q.name === name ? { ...q, status: "Valid" as const, validTo } : q); onChange({ ...s, qualifications, documents: [...s.documents, { name: `${name}: ${reference.trim()}`, uploaded: new Date().toISOString().slice(0, 10) }], status: s.status === "More information required" ? "Under diligence" : s.status, nextAction: "Review qualification evidence and approvals", timeline: [{ id: crypto.randomUUID(), at: new Date().toISOString(), actor: "Supplier steward (demo)", event: `Qualification evidence recorded: ${name}`, reason: reference.trim() }, ...s.timeline] }); setReference(""); setValidTo(""); setError(""); }}>Save document reference</Button></section>;
}

function PortalUpdateReview({ s, onChange, canDecide }: { s: SupplierRecord; onChange: (supplier: SupplierRecord) => void; canDecide: boolean }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const decide = (id: string, status: "Accepted" | "Returned") => {
    if (!reason.trim()) return setError("Record the review reason before deciding.");
    const update = s.portalUpdates?.find((item) => item.id === id);
    if (!update || update.status !== "Pending") return setError("This submission was already reviewed.");
    const contacts = status === "Accepted" && update.kind === "Contact email" ? s.contacts.map((contact, index) => index === 0 ? { ...contact, email: update.value } : contact) : s.contacts;
    const qualifications = status === "Accepted" && update.kind === "Qualification evidence" ? s.qualifications.map((qualification) => qualification.name === update.qualification ? { ...qualification, status: "Valid" as const, validTo: update.validTo } : qualification) : s.qualifications;
    const documents = status === "Accepted" && update.kind === "Qualification evidence" ? [...s.documents, { name: `${update.qualification}: ${update.value}`, uploaded: new Date().toISOString().slice(0, 10) }] : s.documents;
    onChange({ ...s, contacts, qualifications, documents, reviewVersion: status === "Accepted" ? s.reviewVersion + 1 : s.reviewVersion, portalUpdates: s.portalUpdates?.map((item) => item.id === id ? { ...item, status, decisionReason: reason.trim() } : item), timeline: [{ id: crypto.randomUUID(), at: new Date().toISOString(), actor: "Supplier steward (demo)", event: `Portal ${update.kind.toLowerCase()} ${status.toLowerCase()}`, reason: reason.trim() }, ...s.timeline] });
    setReason(""); setError("");
  };
  return <section className="rounded-lg border bg-surface p-4 text-sm lg:col-span-2"><h2 className="font-semibold">Supplier portal submissions</h2><p className="mt-1 text-xs text-muted-foreground">A supplier reference is not an uploaded or verified document until reviewed.</p>{error ? <p role="alert" className="mt-2 text-destructive">{error}</p> : null}<div className="mt-3 space-y-3">{s.portalUpdates?.map((update) => <div key={update.id} className="rounded-md border p-3"><p><strong>{update.kind}</strong> · {update.status} · {update.at}</p><p className="mt-1">{update.qualification ? `${update.qualification} · ` : ""}{update.value}{update.validTo ? ` · valid to ${update.validTo}` : ""}</p>{update.decisionReason ? <p className="mt-1 text-muted-foreground">Review: {update.decisionReason}</p> : null}{canDecide && update.status === "Pending" ? <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" onClick={() => decide(update.id, "Accepted")}>Accept</Button><Button size="sm" variant="outline" onClick={() => decide(update.id, "Returned")}>Return</Button></div> : null}</div>)}</div>{canDecide && s.portalUpdates?.some((update) => update.status === "Pending") ? <div className="mt-3"><Label htmlFor="portal-review-reason">Review reason</Label><Textarea id="portal-review-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></div> : null}</section>;
}
