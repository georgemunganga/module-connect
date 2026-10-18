import { FormSelect } from "@/components/ui/form-select";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/platform/app-context";
import { useProcurement, saveProcurement } from "@/modules/procurement/store";
import { audit, updateCommercial, useCommercial, type Order } from "@/modules/procurement/commercial/store";
import { procurementEntityName } from "@/modules/procurement/access";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { statusLabel } from "@/platform/components/StatusBadge";
import {
  addComment,
  addCreditRef,
  addInvoice,
  invoiceTotal,
  updatePayables,
  usePayables,
  type Invoice,
  type PolicyDraft,
} from "./store";

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-surface p-5">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}
function Block({ text }: { text: string }) {
  return (
    <div role="status" className="rounded-lg border bg-surface p-4 text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function SupplierInvoiceSubmission({ orders, invoices }: { orders: Order[]; invoices: Invoice[] }) {
  const [number, setNumber] = useState("");
  const [po, setPo] = useState("PO-2026-1042");
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [attachment, setAttachment] = useState("");
  const [correctionOf, setCorrectionOf] = useState("");
  const [result, setResult] = useState("");
  return (
    <Box title="Submit an invoice reference">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const order = orders.find((candidate) => candidate.id === po);
          if (!order || !["Issued", "Acknowledged"].includes(order.status)) {
            setResult("Choose an issued PO shared with this supplier.");
            return;
          }
          const original = invoices.find((invoice) => invoice.id === correctionOf);
          if (correctionOf && (!original || original.po !== order.id || original.status !== "Exception")) { setResult("Choose the original exception invoice and its purchase order."); return; }
          if (!number.trim() || Number(amount) <= 0 || Number(quantity) <= 0 || !attachment.trim()) {
            setResult("Invoice number, quantity, positive total, and document reference are required.");
            return;
          }
          const response = addInvoice({
            number: number.trim(),
            supplierId: "sup-001",
            supplier: "Northwind Devices B.V.",
            entityId: "ent-nl",
            po: order.id,
            source: "Supplier portal",
            currency: order.currency,
            date: new Date().toISOString().slice(0, 10),
            due: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
            tax: 0,
            matchType: order.line.type === "Goods" ? "3-way" : "2-way",
            lines: [
              {
                description: order.line.description,
                quantity: Number(quantity),
                unitPrice: Number(amount) / Number(quantity),
                acceptedQuantity: order.line.received,
                poUnitPrice: order.line.price,
              },
            ],
            owner: "AP processor",
            attachment,
            exception: undefined,
            apKey: undefined,
            financeAt: undefined,
            correctionOf: original?.id,
          });
          setResult(
            response.ok
              ? `${response.id} saved locally. AP validation and matching are pending; no invoice was sent externally.`
              : response.message,
          );
          if (response.ok) {
            if (original) updatePayables((current) => ({ ...current, invoices: current.invoices.map((invoice) => invoice.id === original.id ? { ...invoice, timeline: [...invoice.timeline, { at: new Date().toISOString(), actor: "Supplier portal", action: "Linked corrected invoice received", reason: response.id }] } : invoice) }));
            setNumber("");
            setAmount("");
            setQuantity("1");
            setAttachment("");
            setCorrectionOf("");
          }
        }}
      >
        <div>
          <Label htmlFor="portal-invoice">Invoice number</Label>
          <Input id="portal-invoice" value={number} onChange={(e) => setNumber(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="portal-po">PO reference</Label>
          <FormSelect id="portal-po" className="h-10 w-full rounded-md border bg-background px-3" value={po} onChange={(e) => setPo(e.target.value)}>{orders.filter((order) => ["Issued", "Acknowledged"].includes(order.status)).map((order) => <option key={order.id} value={order.id}>{order.id} · {order.line.description}</option>)}</FormSelect>
        </div>
        <div><Label htmlFor="portal-correction">Corrects earlier invoice (optional)</Label><FormSelect id="portal-correction" className="h-10 w-full rounded-md border bg-background px-3" value={correctionOf} onChange={(event) => { setCorrectionOf(event.target.value); const original = invoices.find((invoice) => invoice.id === event.target.value); if (original) setPo(original.po); }}><option value="">New invoice</option>{invoices.filter((invoice) => invoice.status === "Exception").map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.number} · {invoice.id}</option>)}</FormSelect></div>
        <div><Label htmlFor="portal-quantity">Invoiced quantity</Label><Input id="portal-quantity" type="number" min="0.01" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
        <div>
          <Label htmlFor="portal-amount">Amount, EUR (illustrative)</Label>
          <Input
            id="portal-amount"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="portal-attachment">Document filename/reference</Label>
          <Input
            id="portal-attachment"
            value={attachment}
            onChange={(e) => setAttachment(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit">Save demo invoice</Button>
        </div>
      </form>
      {result && (
        <p role="status" className="mt-3 text-sm">
          {result}
        </p>
      )}
    </Box>
  );
}

export function SupplierPortal() {
  const { role, setRole } = useApp();
  const state = usePayables();
  const commercial = useCommercial();
  const procurement = useProcurement();
  const sourcing = procurement.sourcing;
  const [tab, setTab] = useState("Home");
  const [message, setMessage] = useState("");
  const [comment, setComment] = useState("");
  const [bidAmount, setBidAmount] = useState("");
  const [bidLead, setBidLead] = useState("5");
  const [bidNote, setBidNote] = useState("");
  const [orderReason, setOrderReason] = useState("");
  const [messageRecord, setMessageRecord] = useState("PO-2026-1042");
  const [profileEmail, setProfileEmail] = useState("");
  const [qualificationName, setQualificationName] = useState("Insurance certificate");
  const [qualificationRef, setQualificationRef] = useState("");
  const [qualificationValidTo, setQualificationValidTo] = useState("");
  const [creditInvoice, setCreditInvoice] = useState("INV-1042");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [creditDocument, setCreditDocument] = useState("");
  // The demo identity is pinned to sup-001. Switching ERP entity or URL cannot change supplier scope.
  const supplierId = "sup-001";
  const supplierName = "Northwind Devices B.V.";
  const supplierRecord = procurement.suppliers.find((supplier) => supplier.id === supplierId);
  const submitPortalUpdate = (kind: "Contact email" | "Qualification evidence", value: string, validTo?: string) => {
    if (!supplierRecord) return setMessage("Supplier profile is unavailable.");
    if (!value.trim() || (kind === "Contact email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) || (kind === "Qualification evidence" && (!validTo || validTo < new Date().toISOString().slice(0, 10)))) return setMessage("Enter a valid contact email or a document reference with a future validity date.");
    if (supplierRecord.portalUpdates?.some((update) => update.kind === kind && update.status === "Pending")) return setMessage("A change of this type is already awaiting Procurement review.");
    saveProcurement((current) => ({ ...current, suppliers: current.suppliers.map((supplier) => supplier.id === supplierId ? { ...supplier, portalUpdates: [...(supplier.portalUpdates ?? []), { id: crypto.randomUUID(), kind, value: value.trim(), qualification: kind === "Qualification evidence" ? qualificationName : undefined, validTo, status: "Pending" as const, at: new Date().toISOString() }], nextAction: `Review supplier portal ${kind.toLowerCase()} submission`, timeline: [{ id: crypto.randomUUID(), at: new Date().toISOString(), actor: supplierName, event: `${kind} submitted for review`, reason: value.trim() }, ...supplier.timeline] } : supplier) }));
    setMessage(`${kind} reference submitted to Procurement for review. No file was uploaded.`);
    setProfileEmail(""); setQualificationRef(""); setQualificationValidTo("");
  };
  const orders = commercial.orders.filter((order) => order.supplier === supplierName && !["Draft", "Pending approval", "Approved"].includes(order.status));
  const orderAction = (order: Order, kind: "Acknowledge" | "Change" | "Rejection" | "Delivery") => {
    const reason = orderReason.trim();
    if (kind !== "Acknowledge" && !reason) return setMessage("Enter a reason or delivery reference before sending this response.");
    if (kind === "Acknowledge" && order.status !== "Issued") return setMessage("This PO is no longer awaiting acknowledgment.");
    if (["Change", "Rejection"].includes(kind) && !["Issued", "Acknowledged"].includes(order.status)) return setMessage("This PO cannot receive a new response in its current state.");
    if (kind === "Delivery" && order.status !== "Acknowledged") return setMessage("Acknowledge this PO before giving a delivery notice.");
    const at = new Date().toISOString();
    updateCommercial((current) => ({ ...current, orders: current.orders.map((candidate) => candidate.id !== order.id ? candidate : {
      ...candidate,
      status: kind === "Acknowledge" ? "Acknowledged" : ["Change", "Rejection"].includes(kind) ? "On hold" : candidate.status,
      acknowledgedAt: kind === "Acknowledge" ? at : candidate.acknowledgedAt,
      supplierRequest: kind === "Change" || kind === "Rejection" ? { kind, reason, at } : candidate.supplierRequest,
      deliveryNotice: kind === "Delivery" ? { reference: reason, at } : candidate.deliveryNotice,
      audit: [...candidate.audit, audit(supplierName, kind === "Acknowledge" ? "Acknowledged PO" : kind === "Delivery" ? "Delivery notice" : `Supplier ${kind.toLowerCase()} request`, reason || `Version ${order.version} acknowledged`)],
    }) }));
    setOrderReason("");
    setMessage(`${order.id}: ${kind.toLowerCase()} saved on the commercial PO (demo).`);
  };
  const submitBid = (reference: string) => {
    const event = sourcing.find((item) => item.id === reference);
    if (!event || event.state !== "Published" || !event.invitations.some((invite) => invite.supplier === supplierName && ["Delivered", "Opened"].includes(invite.delivery)) || new Date(event.closesAt).getTime() < Date.now()) return setMessage("This invitation is closed or unavailable to this supplier.");
    if (Number(bidAmount) <= 0 || Number(bidLead) <= 0 || !bidNote.trim()) return setMessage("Enter a positive total, lead time, and proposal note.");
    const version = 1 + Math.max(0, ...event.bids.filter((bid) => bid.supplier === "Northwind Devices B.V.").map((bid) => bid.version));
    const bid = { id: crypto.randomUUID(), supplier: "Northwind Devices B.V.", version, receivedAt: new Date().toISOString(), channel: "Supplier portal" as const, late: false, sealedContent: { total: Number(bidAmount), currency: "EUR", leadTimeDays: Number(bidLead), notes: bidNote.trim() } };
    saveProcurement((current) => ({ ...current, sourcing: current.sourcing.map((item) => item.id === reference ? { ...item, bids: [...item.bids, bid] } : item) }));
    updateCommercial((current) => ({ ...current, evaluations: current.evaluations.map((evaluation) => evaluation.eventId === reference ? { ...evaluation, bids: [...evaluation.bids, { id: bid.id, supplier: bid.supplier, compliant: null, reason: "", score: null, conflict: false, deliveryCost: 0, tax: 0 }] } : evaluation) }));
    setMessage(`${reference} quotation v${version} submitted and sealed. Receipt ${bid.id}.`);
    setBidAmount(""); setBidNote("");
  };
  if (role !== "supplier_user")
    return (
      <main className="min-h-screen bg-background p-6">
        <div className="mx-auto max-w-xl">
          <h1 className="text-2xl font-semibold">Supplier portal</h1>
          <Block text="Supplier identity is required. The internal ERP role cannot open supplier records." />
          <Button className="mt-4" onClick={() => setRole("supplier_user")}>
            Switch to supplier demo role
          </Button>
        </div>
      </main>
    );
  const items = state.supplierItems.filter((i) => i.supplierId === supplierId);
  const opportunities = sourcing.filter((event) => event.invitations.some((invite) => invite.supplier === supplierName && ["Delivered", "Opened"].includes(invite.delivery)) && ["Published", "Closed"].includes(event.state)).map((event) => ({ id: event.id, supplierId, kind: "Opportunity" as const, reference: event.id, title: event.title, status: event.state === "Closed" ? "Closed" : event.bids.some((bid) => bid.supplier === supplierName) ? "Submitted" : event.invitations.some((invite) => invite.supplier === supplierName && invite.note?.startsWith("Interest recorded")) ? "Interested" : "Open", due: event.closesAt || "To be set" }));
  const invoices = state.invoices.filter((i) => i.supplierId === supplierId);
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Meridian supplier portal · Demo data
            </p>
            <h1 className="text-xl font-semibold">Northwind Devices B.V.</h1>
          </div>
          <Button variant="outline" asChild>
            <Link to="/procurement">ERP home</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-7">
        <nav aria-label="Supplier portal" className="mb-6 flex flex-wrap gap-2">
          {[
            "Home",
            "Opportunities",
            "Orders",
            "Invoices & credits",
            "Documents",
            "Messages",
            "Company profile",
          ].map((name) => (
            <Button
              key={name}
              type="button"
              variant={tab === name ? "default" : "outline"}
              onClick={() => setTab(name)}
            >
              {name}
            </Button>
          ))}
        </nav>
        {tab === "Home" && (
          <div className="grid gap-4 md:grid-cols-3">
            <Box title="Your next actions">
              <ul className="space-y-2 text-sm">
                {([...items.filter((item) => item.kind !== "Opportunity" && item.kind !== "Document"), ...opportunities])
                  .filter(
                    (i) =>
                      i.kind !== "Order" && (i.status === "Open" || i.status === "Expiring"),
                  )
                  .map((i) => (
                    <li key={i.id}>
                      {i.title} · {i.status} · due {i.due}
                    </li>
                  ))}
                {supplierRecord?.qualifications.filter((qualification) => ["Expiring", "Expired", "Missing"].includes(qualification.status)).map((qualification) => <li key={qualification.name}>{qualification.name} · {qualification.status} · valid to {qualification.validTo ?? "not recorded"}</li>)}
                {orders.filter((order) => order.status === "Issued").map((order) => <li key={order.id}>{order.id} · Acknowledge purchase order · due {order.due}</li>)}
              </ul>
            </Box>
            <Box title="Orders">
              {orders.length} issued orders shared with your company
            </Box>
            <Box title="Invoice visibility">
              {invoices.length} invoices · payment shown only after Finance confirmation
            </Box>
          </div>
        )}
        {tab === "Opportunities" && (
          <div className="space-y-3">
            {opportunities
              .map((i) => (
                <Box key={i.id} title={`${i.reference} · ${i.title}`}>
                  <p className="text-sm">
                    {i.status} · due {i.due}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">Quotations remain sealed until Procurement authorises opening. This submission is retained in this browser.</p>
                  <Button
                    className="mt-3"
                    disabled={i.status !== "Open"}
                    onClick={() => {
                      saveProcurement((current) => ({ ...current, sourcing: current.sourcing.map((event) => event.id === i.reference ? { ...event, invitations: event.invitations.map((invite) => invite.supplier === supplierName ? { ...invite, delivery: "Opened", note: `Interest recorded ${new Date().toISOString()}` } : invite) } : event) }));
                      setMessage(`Interest in ${i.reference} saved on the sourcing event; no bid was submitted.`);
                    }}
                  >
                    Record interest
                  </Button>
                  {sourcing.some((event) => event.id === i.reference && event.state === "Published" && event.invitations.some((invite) => invite.supplier === "Northwind Devices B.V.")) ? <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
                    <div><Label htmlFor={`bid-amount-${i.id}`}>Quoted total (EUR)</Label><Input id={`bid-amount-${i.id}`} type="number" min="0.01" value={bidAmount} onChange={(event) => setBidAmount(event.target.value)} /></div>
                    <div><Label htmlFor={`bid-lead-${i.id}`}>Delivery lead time (days)</Label><Input id={`bid-lead-${i.id}`} type="number" min="1" value={bidLead} onChange={(event) => setBidLead(event.target.value)} /></div>
                    <div className="sm:col-span-2"><Label htmlFor={`bid-note-${i.id}`}>Proposal note / document reference</Label><Textarea id={`bid-note-${i.id}`} value={bidNote} onChange={(event) => setBidNote(event.target.value)} /></div>
                    <Button className="sm:col-span-2" onClick={() => submitBid(i.reference)}>Submit sealed quotation</Button>
                  </div> : null}
                </Box>
              ))}
          </div>
        )}
        {tab === "Orders" && (
          <div className="space-y-3">
            {orders.map((order) => (
                <Box key={order.id} title={`${order.id} · ${order.line.description}`}>
                  <p className="text-sm">{order.status} · v{order.version} · due {order.due} · {order.line.qty} {order.line.unit}</p>
                  {order.supplierRequest ? <p className="mt-2 text-sm">{order.supplierRequest.kind} request: {order.supplierRequest.reason} · awaiting buyer review</p> : null}
                  {order.deliveryNotice ? <p className="mt-2 text-sm">Delivery notice: {order.deliveryNotice.reference} · {new Date(order.deliveryNotice.at).toLocaleString()}</p> : null}
                  <div className="mt-3 max-w-md"><Label htmlFor={`portal-order-reason-${order.id}`}>Change reason, rejection reason, or delivery reference</Label><Input id={`portal-order-reason-${order.id}`} value={orderReason} onChange={(event) => setOrderReason(event.target.value)} /></div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      disabled={order.status !== "Issued"}
                      onClick={() => orderAction(order, "Acknowledge")}
                    >
                      Acknowledge
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!(["Issued", "Acknowledged"].includes(order.status))}
                      onClick={() => orderAction(order, "Change")}
                    >
                      Request change
                    </Button>
                    <Button variant="outline" disabled={!(["Issued", "Acknowledged"].includes(order.status))} onClick={() => orderAction(order, "Rejection")}>Reject PO</Button>
                    <Button
                      variant="outline"
                      disabled={order.status !== "Acknowledged"}
                      onClick={() => orderAction(order, "Delivery")}
                    >
                      Send delivery notice
                    </Button>
                  </div>
                </Box>
              ))}
          </div>
        )}
        {tab === "Invoices & credits" && (
          <div className="space-y-3">
            <SupplierInvoiceSubmission orders={orders} invoices={invoices} />
            <Box title="Submit a commercial credit reference">
              <p className="text-xs text-muted-foreground">Procurement reviews the commercial reason. Finance owns any accounting credit or refund.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2"><div><Label htmlFor="credit-invoice">Original invoice</Label><FormSelect id="credit-invoice" className="h-10 w-full rounded-md border bg-background px-3" value={creditInvoice} onChange={(event) => setCreditInvoice(event.target.value)}>{invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.number} · {invoice.id}</option>)}</FormSelect></div><div><Label htmlFor="credit-amount">Credit amount</Label><Input id="credit-amount" type="number" min="0.01" step="0.01" value={creditAmount} onChange={(event) => setCreditAmount(event.target.value)} /></div><div><Label htmlFor="credit-reason">Commercial reason</Label><Input id="credit-reason" value={creditReason} onChange={(event) => setCreditReason(event.target.value)} /></div><div><Label htmlFor="credit-document">Credit note document reference</Label><Input id="credit-document" value={creditDocument} onChange={(event) => setCreditDocument(event.target.value)} /></div></div>
              <Button className="mt-3" onClick={() => { const original = invoices.find((invoice) => invoice.id === creditInvoice); const amount = Number(creditAmount); if (!original || amount <= 0 || amount > invoiceTotal(original) || !creditReason.trim() || !creditDocument.trim()) return setMessage("Select your invoice, enter a positive credit no greater than its total, and provide a reason and document reference."); if ((state.credits ?? []).some((credit) => credit.invoiceId === original.id && credit.documentRef === creditDocument.trim())) return setMessage("This credit document reference is already recorded for the invoice."); const credit = addCreditRef(original, amount, creditReason.trim(), supplierName, creditDocument.trim()); setMessage(`${credit.id} submitted for commercial review. No Finance credit was posted.`); setCreditAmount(""); setCreditReason(""); setCreditDocument(""); }}>Submit credit reference</Button>
            </Box>
            {invoices.map((i) => (
              <Box key={i.id} title={`${i.number} · ${i.po}`}>
                <p className="text-sm">
                  {i.status} ·{" "}
                  {new Intl.NumberFormat("en", { style: "currency", currency: i.currency }).format(
                    invoiceTotal(i),
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {i.financeAt
                    ? `Finance demo last confirmed ${new Date(i.financeAt).toLocaleString()}`
                    : "No Finance payment confirmation yet."}
                </p>
                {i.status === "Exception" && (
                  <p className="mt-2 text-sm">Correction requested: {i.exception?.reason}</p>
                )}
              </Box>
            ))}
            {(state.credits ?? [])
              .filter((credit) => credit.supplierId === supplierId)
              .map((credit) => (
                <Box key={credit.id} title={`Credit ${credit.id}`}>
                  <p className="text-sm">
                    Original invoice {credit.invoiceId} · {credit.status} ·{" "}
                    {new Intl.NumberFormat("en", {
                      style: "currency",
                      currency: credit.currency,
                    }).format(credit.amount)}
                  </p>
                  {credit.documentRef ? <p className="mt-1 text-xs text-muted-foreground">Document reference {credit.documentRef} · submitted by {credit.submittedBy}</p> : null}
                </Box>
              ))}
          </div>
        )}
        {tab === "Documents" && (
          <div className="space-y-3">
            <Box title="Qualifications and expiry">
              {supplierRecord?.qualifications.map((qualification) => <p key={qualification.name} className="text-sm">{qualification.name} · {qualification.status} · valid to {qualification.validTo ?? "not recorded"}</p>)}
              <div className="mt-3 grid gap-3 sm:grid-cols-3"><div><Label htmlFor="portal-qualification">Qualification</Label><FormSelect id="portal-qualification" className="h-10 w-full rounded-md border bg-background px-3" value={qualificationName} onChange={(event) => setQualificationName(event.target.value)}>{supplierRecord?.qualifications.map((qualification) => <option key={qualification.name}>{qualification.name}</option>)}</FormSelect></div><div><Label htmlFor="portal-document-ref">Replacement document reference</Label><Input id="portal-document-ref" value={qualificationRef} onChange={(event) => setQualificationRef(event.target.value)} /></div><div><Label htmlFor="portal-document-valid">Valid until</Label><Input id="portal-document-valid" type="date" value={qualificationValidTo} onChange={(event) => setQualificationValidTo(event.target.value)} /></div></div>
              <Button className="mt-3" onClick={() => submitPortalUpdate("Qualification evidence", qualificationRef, qualificationValidTo)}>Submit evidence reference</Button>
              <p className="mt-2 text-xs text-muted-foreground">The reference enters a Procurement review queue. This demo does not upload a file.</p>
            </Box>
            {supplierRecord?.portalUpdates?.filter((update) => update.kind === "Qualification evidence").map((update) => <Box key={update.id} title={`${update.qualification} · ${update.status}`}><p className="text-sm">{update.value} · submitted {update.at}</p>{update.decisionReason ? <p className="text-sm">Review: {update.decisionReason}</p> : null}</Box>)}
          </div>
        )}
        {tab === "Messages" && (
          <Box title="Messages shared with your company">
            <div className="space-y-2">
              {Object.entries(state.comments).flatMap(([record, entries]) =>
                entries
                  .filter(
                    (entry) =>
                      entry.audience === "Supplier" &&
                      (invoices.some((i) => i.id === record) ||
                        items.some((i) => i.reference === record) || orders.some((order) => order.id === record)),
                  )
                  .map((entry, idx) => (
                    <p key={`${record}-${idx}`} className="rounded border p-2 text-sm">
                      {record}: {entry.reason}
                    </p>
                  )),
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!comment.trim()) return;
                if (!orders.some((order) => order.id === messageRecord)) { setMessage("Choose one of your shared orders."); return; }
                addComment(messageRecord, supplierName, comment.trim(), "Supplier");
                setComment("");
                setMessage("Message saved locally.");
              }}
              className="mt-4 space-y-2"
            >
              <Label htmlFor="supplier-message-record">Transaction</Label>
              <FormSelect id="supplier-message-record" className="h-10 w-full rounded-md border bg-background px-3" value={messageRecord} onChange={(event) => setMessageRecord(event.target.value)}>{orders.map((order) => <option key={order.id} value={order.id}>{order.id}</option>)}</FormSelect>
              <Label htmlFor="supplier-message">Message to Procurement</Label>
              <Textarea
                id="supplier-message"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <Button type="submit">Send demo message</Button>
            </form>
          </Box>
        )}
        {tab === "Company profile" && (
          <Box title="Company profile">
            <p className="text-sm">{supplierRecord?.legalName ?? supplierName} · Supplier ID {supplierId} · {supplierRecord?.status ?? "Unavailable"}</p>
            <p className="mt-2 text-sm">Primary contact: {supplierRecord?.contacts[0]?.name ?? "—"} · {supplierRecord?.contacts[0]?.email ?? "—"}</p>
            <div className="mt-3 max-w-md"><Label htmlFor="portal-profile-email">Proposed contact email</Label><Input id="portal-profile-email" type="email" value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} /></div>
            <Button className="mt-3" onClick={() => submitPortalUpdate("Contact email", profileEmail)}>Submit profile change</Button>
            {supplierRecord?.portalUpdates?.filter((update) => update.kind === "Contact email").map((update) => <p key={update.id} className="mt-2 text-sm">{update.value} · {update.status}{update.decisionReason ? ` · ${update.decisionReason}` : ""}</p>)}
            <p className="mt-2 text-xs text-muted-foreground">
              Payment instructions and internal risk notes are intentionally absent. Profile changes
              require a verified onboarding workflow.
            </p>
          </Box>
        )}
        {message && (
          <p role="status" className="mt-4 rounded-lg border bg-surface p-3 text-sm">
            {message}
          </p>
        )}
      </main>
    </div>
  );
}

const reportLabels: Record<string, string> = {
  "Request backlog": "Requests still open",
  "Sourcing coverage": "Purchases with quotes",
  "Supplier delivery": "Deliveries on time",
  "Open PO commitments": "Open order value",
  "Contract utilization": "Contract spending",
  "Invoice first-pass match": "Bills matched first time",
  "Exception aging": "Bills needing review",
  "AP handoff": "Bills sent to Finance",
  "Emergency / sole-source": "Special purchases",
  "Budget vs actual": "Budget vs spending",
};

export function ProcurementReports() {
  const { role, entityId } = useApp();
  const state = usePayables();
  const procurement = useProcurement();
  const commercial = useCommercial();
  const [metric, setMetric] = useState("Invoice first-pass match");
  const [reportQuery, setReportQuery] = useState("");
  const [period, setPeriod] = useState("2026-10");
  const [notice, setNotice] = useState("");
  if (
    !["buyer", "supplier_steward", "receiver", "ap_processor", "proc_admin", "auditor"].includes(
      role,
    )
  )
    return (
      <AppShell>
        <PageHeader eyebrow="Procurement" title="Reports restricted" />
        <Block text="Your demo role cannot read this report." />
      </AppShell>
    );
  const rows = state.invoices.filter((i) => i.entityId === entityId && i.date.startsWith(period));
  const entityName = procurementEntityName(entityId);
  const requests = procurement.requests.filter((request) => procurement.metadata[request.id]?.entity === entityName && request.submittedAt.startsWith(period));
  const events = procurement.sourcing.filter((event) => event.entity === entityName && event.opensAt.startsWith(period));
  const orders = commercial.orders.filter((order) => order.entity === entityName && order.due.startsWith(period));
  const receipts = commercial.receipts.filter((receipt) => receipt.date.startsWith(period) && commercial.orders.some((order) => order.id === receipt.poId && order.entity === entityName));
  const contracts = commercial.contracts.filter((contract) => contract.entity === entityName && contract.start <= `${period}-31` && contract.end >= `${period}-01`);
  const matched = rows.filter(
    (i) =>
      ["Validated", "Handoff pending", "Handed to AP", "Posted", "Partially paid", "Paid"].includes(
        i.status,
      ) && !i.timeline.some((event) => event.action.toLowerCase().includes("exception")),
  ).length;
  const currency = entityId === "ent-ke" ? "KES" : "EUR";
  const money = (amount: number) => new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  const paidStatuses = ["Handoff pending", "Handed to AP", "AP rejected", "Posted", "Partially paid", "Paid"];
  const values: Record<string, string> = {
    "Request backlog": `${requests.filter((request) => !["Closed", "Cancelled", "Rejected"].includes(request.status)).length} / ${requests.length} open`,
    "Sourcing coverage": `${events.filter((event) => ["RFQ", "RFP", "Tender"].includes(event.method)).length} / ${events.length} competitive events`,
    "Supplier delivery": `${receipts.filter((receipt) => { const order = commercial.orders.find((candidate) => candidate.id === receipt.poId); return order && receipt.date <= order.due && ["Accepted", "Partially accepted"].includes(receipt.status); }).length} / ${receipts.length} on time`,
    "Open PO commitments": money(orders.filter((order) => !["Closed", "Cancelled"].includes(order.status) && order.currency === currency).reduce((sum, order) => sum + Math.max(0, order.line.qty * order.line.price - order.line.invoiced * order.line.price), 0)),
    "Contract utilization": `${money(contracts.filter((contract) => contract.currency === currency).reduce((sum, contract) => sum + contract.committed, 0))} / ${money(contracts.filter((contract) => contract.currency === currency).reduce((sum, contract) => sum + contract.ceiling, 0))}`,
    "Invoice first-pass match": `${matched} / ${rows.length}`,
    "Exception aging": `${rows.filter((invoice) => invoice.status === "Exception").length} open`,
    "AP handoff": `${rows.filter((invoice) => paidStatuses.includes(invoice.status)).length} records`,
    "Emergency / sole-source": `${events.filter((event) => ["Emergency", "Single source"].includes(event.method)).length} / ${events.length} events`,
    "Budget vs actual": "Finance data unavailable",
  };
  const value = values[metric];
  const definitions: Record<string, string> = {
    "Request backlog": "Requests submitted in the selected month that are not closed, cancelled or rejected, divided by requests submitted in that month.",
    "Sourcing coverage": "RFQ, RFP and tender events opened in the selected month, divided by all sourcing events opened in that month. Direct and exception routes remain in the denominator.",
    "Open PO commitments": "Uninvoiced line value on non-closed purchase orders due in the selected month, in the entity currency. This is an illustrative commercial balance, not a Finance encumbrance.",
    "Contract utilization": "Committed value divided by ceiling on contracts whose term overlaps the selected month, in the entity currency. This is a value comparison, not an FX-converted total.",
    "Invoice first-pass match":
      "Invoices without a recorded match exception divided by invoices received in the selected period. Demo approximation; later corrections do not rewrite original first-pass evidence.",
    "Exception aging":
      "Open invoice exceptions created in the selected period; aging begins at first mismatch timestamp.",
    "AP handoff":
      "Invoices queued, accepted, rejected or posted by AP in the selected period. Local demo events only.",
    "Supplier delivery": "Accepted or partly accepted receipt records dated in the selected month and recorded on or before their PO due date, divided by all receipt records dated in that month.",
    "Emergency / sole-source": "Emergency and single-source events opened in the selected month, divided by all sourcing events opened in that month.",
    "Budget vs actual":
      "Finance commitments and actuals are required. This view intentionally does not invent balances.",
  };
  const exportReport = () => {
    if (role !== "auditor" && role !== "proc_admin") return setNotice("Export permission denied for this role.");
    const rowsForExport = [
      ["metric", "entity", "period", "value", "definition", "source"],
      [metric, entityName, period, value, definitions[metric], "Browser-local procurement demo records"],
    ];
    const csv = rowsForExport.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `procurement-report-${period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("A summary CSV was downloaded from this browser. No sensitive supplier fields were included.");
  };
  return (
    <AppShell>
      <PageHeader
        eyebrow="Procurement"
        title="Reports"
        description="Choose a report to see what is happening with requests, orders, vendors, and bills."
      />
      <div className="mt-5 grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="h-fit rounded-lg border bg-surface p-4" aria-label="Choose a report">
          <label htmlFor="report-search" className="text-sm font-semibold">Find a report</label>
          <Input id="report-search" className="mt-2" placeholder="Search reports" value={reportQuery} onChange={(event) => setReportQuery(event.target.value)} />
          <nav aria-label="Reports" className="mt-4 space-y-1">
            {Object.keys(definitions).filter((key) => reportLabels[key].toLowerCase().includes(reportQuery.toLowerCase())).map((key) => <button key={key} type="button" aria-current={metric === key ? "page" : undefined} onClick={() => setMetric(key)} className={`w-full rounded-md px-3 py-2 text-left text-sm ${metric === key ? "bg-primary-soft font-medium text-primary" : "hover:bg-surface-muted"}`}>{reportLabels[key]}</button>)}
            {!Object.keys(definitions).some((key) => reportLabels[key].toLowerCase().includes(reportQuery.toLowerCase())) ? <p className="px-3 py-2 text-sm text-muted-foreground">No reports match. Try another word.</p> : null}
          </nav>
        </aside>
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-sm text-muted-foreground">Showing results for</p><h2 className="text-xl font-semibold">{reportLabels[metric]}</h2></div>
            <div className="flex flex-wrap gap-2"><FormSelect aria-label="Reporting period" className="rounded-md border bg-surface p-2 text-sm" value={period} onChange={(e) => setPeriod(e.target.value)}><option value="2026-10">October 2026</option><option value="2026-09">September 2026</option></FormSelect><Button variant="outline" onClick={exportReport}>Export CSV</Button></div>
          </div>
          <div className="rounded-lg border bg-surface p-6">
            <p className="text-3xl font-semibold">{value}</p>
            <p className="mt-2 text-sm text-muted-foreground">{entityName} · {period} · Demo data saved in this browser</p>
            {value.includes("/ 0") ? <p className="mt-3 text-sm text-muted-foreground">There are no matching records for this period yet.</p> : null}
          </div>
          <details className="rounded-lg border bg-surface p-4 text-sm"><summary className="cursor-pointer font-medium">How this report is calculated</summary><p className="mt-3">{definitions[metric]}</p><p className="mt-2 text-muted-foreground">Amounts in different currencies are kept separate. Finance payment information may change after confirmation.</p></details>
          {notice ? <p role="status" className="rounded-md border bg-surface p-3 text-sm">{notice}</p> : null}
      <Box title="Records in this report">
        <div className="space-y-2">
          {metric === "Request backlog" && requests.map((request) => <Link to="/procurement/requests/$id" params={{ id: request.id }} key={request.id} className="block rounded-lg border p-3 text-sm hover:border-primary">{request.id} · {statusLabel(request.status)}</Link>)}
          {["Sourcing coverage", "Emergency / sole-source"].includes(metric) && events.map((event) => <Link to="/procurement/sourcing/$id" params={{ id: event.id }} key={event.id} className="block rounded-lg border p-3 text-sm hover:border-primary">{event.id} · {event.method} · {event.state}</Link>)}
          {metric === "Supplier delivery" && receipts.map((receipt) => <Link to="/procurement/receiving/$id" params={{ id: receipt.poId }} key={receipt.id} className="block rounded-lg border p-3 text-sm hover:border-primary">{receipt.id} · {statusLabel(receipt.status)} · {receipt.date}</Link>)}
          {metric === "Open PO commitments" && orders.map((order) => <Link to="/procurement/orders/$id" params={{ id: order.id }} key={order.id} className="block rounded-lg border p-3 text-sm hover:border-primary">{order.id} · {statusLabel(order.status)} · {order.currency}</Link>)}
          {metric === "Contract utilization" && contracts.map((contract) => <Link to="/procurement/contracts/$id" params={{ id: contract.id }} key={contract.id} className="block rounded-lg border p-3 text-sm hover:border-primary">{contract.id} · {contract.state} · v{contract.version}</Link>)}
          {["Invoice first-pass match", "Exception aging", "AP handoff"].includes(metric) &&
            rows.map((i) => (
              <Link
                to="/procurement/invoices/$id"
                params={{ id: i.id }}
                key={i.id}
                className="block rounded-lg border p-3 text-sm hover:border-primary"
              >
                {i.id} · {i.supplier} · {statusLabel(i.status)}
              </Link>
            ))}
          {metric === "Budget vs actual" && <Block text="Finance has not supplied confirmed commitments and actuals for this demo." />}
        </div>
      </Box>
        </div>
      </div>
    </AppShell>
  );
}

const groups = [
  "Purchasing preferences",
  "Methods & categories",
  "Thresholds & approvals",
  "Budget & tolerances",
  "Numbering",
  "Calendars & SLAs",
  "Supplier rules",
  "Document templates",
  "Portal preferences",
  "Validation",
  "Notifications",
  "Integrations & status",
];
export function ProcurementPolicy() {
  const { role, entityId } = useApp();
  const state = usePayables();
  const [section, setSection] = useState(groups[2]);
  const [amount, setAmount] = useState("12000");
  const [category, setCategory] = useState("IT equipment");
  const [supplierRisk, setSupplierRisk] = useState("Standard");
  const [route, setRoute] = useState("Direct");
  const [draft, setDraft] = useState<PolicyDraft>(state.policy);
  const [notice, setNotice] = useState("");
  const canEdit = role === "proc_admin";
  if (!["proc_admin", "auditor", "buyer"].includes(role))
    return (
      <AppShell>
        <PageHeader eyebrow="Procurement" title="Configuration restricted" />
        <Block text="Only Procurement administrators and authorised readers can access configuration." />
      </AppShell>
    );
  const invalid =
    draft.threshold <= 0 ||
    draft.tolerance < 0 ||
    draft.tolerance > 100 ||
    !draft.reason.trim() ||
    !draft.effective;
  const threshold = state.policy.threshold;
  const over = Number(amount) >= threshold;
  return (
    <AppShell>
      <PageHeader
        eyebrow="Procurement / Configuration"
        title="Policies & setup"
        description="Versioned procurement rules with illustrative values. Shared currency, tax, identity and workflow settings remain in ERP Core."
      />
      <div className="grid gap-5 lg:grid-cols-[250px_1fr]">
        <nav aria-label="Configuration sections" className="flex flex-col gap-1">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              className={`rounded-md px-3 py-2 text-left text-sm ${section === g ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => setSection(g)}
            >
              {g}
            </button>
          ))}
        </nav>
        <div className="space-y-4">
          <Box title={section}>
            <p className="text-sm">
              Published policy v{state.policy.version} · effective {state.policy.effective} ·{" "}
              {state.policy.status}.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              This demo only edits the illustrative threshold/tolerance package. Other settings
              require approved backend contracts.
            </p>
            {section === "Thresholds & approvals" || section === "Budget & tolerances" ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="threshold">
                    Competitive sourcing threshold (EUR, illustrative)
                  </Label>
                  <Input
                    id="threshold"
                    type="number"
                    value={draft.threshold}
                    onChange={(e) =>
                      setDraft({ ...draft, threshold: Number(e.target.value), status: "Draft" })
                    }
                    readOnly={!canEdit}
                  />
                </div>
                <div>
                  <Label htmlFor="tolerance">Price tolerance % (illustrative)</Label>
                  <Input
                    id="tolerance"
                    type="number"
                    value={draft.tolerance}
                    onChange={(e) =>
                      setDraft({ ...draft, tolerance: Number(e.target.value), status: "Draft" })
                    }
                    readOnly={!canEdit}
                  />
                </div>
                <div>
                  <Label htmlFor="effective">Effective from</Label>
                  <Input
                    id="effective"
                    type="date"
                    value={draft.effective}
                    onChange={(e) =>
                      setDraft({ ...draft, effective: e.target.value, status: "Draft" })
                    }
                    readOnly={!canEdit}
                  />
                </div>
                <div>
                  <Label htmlFor="reason">Change reason</Label>
                  <Input
                    id="reason"
                    value={draft.reason}
                    onChange={(e) =>
                      setDraft({ ...draft, reason: e.target.value, status: "Draft" })
                    }
                    readOnly={!canEdit}
                  />
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Linked to shared ERP configuration or pending a dedicated policy contract.
              </p>
            )}
            {canEdit && (
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    setNotice(
                      invalid
                        ? "Validation failed: positive threshold, 0–100% tolerance, date and reason required."
                        : "Draft validation passed. Check scope and independent sign-off before publication.",
                    )
                  }
                >
                  Validate draft
                </Button>
                <Button
                  onClick={() => {
                    if (invalid) {
                      setNotice("Draft has invalid fields and cannot enter review.");
                      return;
                    }
                    updatePayables((s) => ({
                      ...s,
                      candidate: {
                        ...draft,
                        version: s.policy.version + 1,
                        status: "Pending review",
                      },
                    }));
                    setNotice(
                      "Candidate submitted for independent review. Publication is blocked in this demo until governance approvals exist.",
                    );
                  }}
                >
                  Submit for review
                </Button>
              </div>
            )}
          </Box>
          <Box title="Policy simulator">
            <p className="mb-3 text-sm text-muted-foreground">
              Synthetic inputs only. Simulation does not update any transaction.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="sim-amount">Amount (EUR)</Label>
                <Input
                  id="sim-amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="sim-category">Category</Label>
                <Input
                  id="sim-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="sim-risk">Supplier risk</Label>
                <FormSelect
                  id="sim-risk"
                  className="block w-full rounded-md border bg-surface p-2"
                  value={supplierRisk}
                  onChange={(e) => setSupplierRisk(e.target.value)}
                >
                  <option>Standard</option>
                  <option>High</option>
                  <option>Suspended</option>
                </FormSelect>
              </div>
              <div>
                <Label htmlFor="sim-route">Requested route</Label>
                <FormSelect
                  id="sim-route"
                  className="block w-full rounded-md border bg-surface p-2"
                  value={route}
                  onChange={(e) => setRoute(e.target.value)}
                >
                  <option>Direct</option>
                  <option>RFQ</option>
                  <option>Contract</option>
                  <option>Emergency</option>
                </FormSelect>
              </div>
            </div>
            <div role="status" className="mt-4 rounded-lg border bg-muted p-3 text-sm">
              <strong>
                Result for {entityId} · policy v{state.policy.version}:
              </strong>{" "}
              {supplierRisk === "Suspended"
                ? "Blocked: supplier suspension requires review."
                : !Number.isFinite(Number(amount)) || Number(amount) <= 0
                  ? "Enter a positive amount."
                  : over && route === "Direct"
                    ? "Direct purchase blocked: competitive sourcing and manager + Procurement approval expected."
                    : supplierRisk === "High"
                      ? "Enhanced supplier review and Procurement approval expected."
                      : "Manager approval expected; budget decision remains Finance-owned."}
            </div>
          </Box>
          <Box title="Version history & publication controls">
            <p className="text-sm">
              Version {state.policy.version}: {state.policy.status}, {state.policy.reason}.
              Effective {state.policy.effective}.
            </p>
            {state.candidate && (
              <p className="mt-2 text-sm">
                Candidate v{state.candidate.version}: {state.candidate.status}; effective{" "}
                {state.candidate.effective}. It does not affect transaction decisions.
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Conflicting rules, missing authority, effective-date collisions and Finance sign-off
              must be checked by a backend resolver before publication. Historical decisions retain
              their original policy version.
            </p>
          </Box>
          {notice && (
            <p role="status" className="rounded border p-3 text-sm">
              {notice}
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
