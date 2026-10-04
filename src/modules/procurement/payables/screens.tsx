import { useState } from "react";
import { Inbox } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/platform/app-context";
import { useCommercial } from "@/modules/procurement/commercial/store";
import { sameEntity } from "@/modules/procurement/access";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { statusLabel } from "@/platform/components/StatusBadge";
import { EmptyState, NoResultsState } from "@/platform/components/States";
import {
  addComment,
  addCreditRef,
  addInvoice,
  invoiceTotal,
  matchInvoice,
  reviseInvoice,
  updatePayables,
  usePayables,
  type Invoice,
  type IntakeSource,
} from "./store";

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en", { style: "currency", currency }).format(amount);
const invoiceRoles = ["ap_processor", "buyer", "proc_admin", "auditor"];
function Notice({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "error" | "success";
}) {
  return (
    <p
      role="status"
      className={`rounded-lg border px-4 py-3 text-sm ${tone === "error" ? "border-red-300 bg-red-50 text-red-900" : tone === "success" ? "border-green-300 bg-green-50 text-green-900" : "bg-surface text-muted-foreground"}`}
    >
      {children}
    </p>
  );
}
function Gate({ children, allowed }: { children: React.ReactNode; allowed: string[] }) {
  const { role } = useApp();
  return allowed.includes(role) ? (
    <>{children}</>
  ) : (
    <AppShell>
      <PageHeader
        eyebrow="Procurement"
        title="Access restricted"
        description="Switch to a demo role that can use this page."
      />
      <Notice>This role cannot access this record.</Notice>
    </AppShell>
  );
}
function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  type?: string;
  required?: boolean;
}) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && " *"}
      </Label>
      <Input
        id={id}
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function InvoiceQueue({ view = "all" }: { view?: "all" | "inbox" | "payments" }) {
  const state = usePayables();
  const { entityId, role } = useApp();
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const statusInView = (status: Invoice["status"]) => view === "inbox" ? !["Posted", "Partially paid", "Paid", "Voided", "Cancelled"].includes(status) : view === "payments" ? ["Handed to AP", "AP rejected", "Posted", "Partially paid", "Paid"].includes(status) : true;
  const rows = state.invoices.filter(
    (i) =>
      i.entityId === entityId &&
      statusInView(i.status) &&
      (filter === "All" || i.status === filter) &&
      `${i.number} ${i.supplier} ${i.po}`.toLowerCase().includes(search.toLowerCase()),
  );
  const viewRows = state.invoices.filter((invoice) => invoice.entityId === entityId && statusInView(invoice.status));
  const summary = view === "inbox"
    ? [{ label: "Awaiting review", value: rows.filter((i) => i.status === "Received").length }, { label: "Needs resolution", value: rows.filter((i) => i.status === "Exception" || i.status === "AP rejected").length }, { label: "Ready for AP", value: rows.filter((i) => i.status === "Validated").length }]
    : view === "payments"
      ? [{ label: "Handed to AP", value: rows.filter((i) => i.status === "Handed to AP").length }, { label: "AP rejected", value: rows.filter((i) => i.status === "AP rejected").length }, { label: "Finance confirmed paid", value: rows.filter((i) => i.status === "Paid").length }]
      : [{ label: "Bills", value: rows.length }, { label: "Needs resolution", value: rows.filter((i) => i.status === "Exception").length }, { label: "Finance confirmed paid", value: rows.filter((i) => i.status === "Paid").length }];
  return (
    <Gate allowed={invoiceRoles}>
      <AppShell>
        <PageHeader
          eyebrow="Payables"
          title={view === "inbox" ? "Bills to check" : view === "payments" ? "Payment updates" : "Bills"}
          description={view === "payments" ? "See updates sent by Finance. Payments cannot be made here." : view === "inbox" ? "Check new bills against orders and deliveries, then send them to Finance." : "See every vendor bill and what happened to it."}
          primaryAction={
            role === "auditor" || view === "payments" ? undefined : (
              <Button asChild>
                <Link to="/procurement/invoices/new">Add bill</Link>
              </Button>
            )
          }
        />
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {summary.map((card) => <div key={card.label} className="rounded-lg border bg-surface p-4"><p className="text-xs text-muted-foreground">{card.label}</p><p className="text-2xl font-semibold">{card.value}</p></div>)}
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <Input
            aria-label="Search invoices"
            placeholder="Search invoice, supplier or PO"
            className="max-w-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label="Filter by invoice status"
            className="rounded-md border bg-surface px-3 text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {[
              "All",
              "Received",
              "Exception",
              "Validated",
              "Handoff pending",
              "Handed to AP",
              "AP rejected",
              "Posted",
              "Partially paid",
              "Paid",
            ].filter((status) => status === "All" || statusInView(status as Invoice["status"])).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        {rows.length ? (
          <div className="grid gap-3">
            {rows.map((i) => (
              <Link
                key={i.id}
                to="/procurement/invoices/$id"
                params={{ id: i.id }}
                className="grid gap-2 rounded-xl border bg-surface p-4 hover:border-primary sm:grid-cols-[1fr_auto]"
              >
                <div>
                  <p className="font-medium">
                    {i.number} · {i.supplier}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {i.id} · {i.po} · Due {i.due}
                  </p>
                  <p className="mt-1 text-xs">
                    Next:{" "}
                    {i.exception
                      ? `${i.exception.owner} resolves ${i.exception.type.toLowerCase()} exception`
                      : i.status === "Validated"
                        ? "AP processor hands off"
                        : i.status === "Paid"
                          ? "Finance confirmation recorded"
                          : "Review invoice"}
                  </p>
                </div>
                <div className="sm:text-right">
                  <StatusBadge status={i.status} />
                  <p className="mt-1 font-semibold">{money(invoiceTotal(i), i.currency)}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : !viewRows.length ? (
          <EmptyState title={view === "payments" ? "No payment updates yet" : view === "inbox" ? "No bills to check" : "No bills yet"} body={view === "payments" ? "Finance updates will appear after a bill is sent there." : "Add a vendor bill to compare it with the order and delivery."} icon={<Inbox className="size-10" aria-hidden />} action={view !== "payments" && role !== "auditor" ? <Button asChild><Link to="/procurement/invoices/new">Add bill</Link></Button> : undefined} />
        ) : (
          <NoResultsState title="No matching invoices" body="Try a different search or status." action={<Button variant="outline" onClick={() => { setSearch(""); setFilter("All"); }}>Clear search and filter</Button>} />
        )}
        <p className="mt-5 text-xs text-muted-foreground">
          Payment and posting statuses appear only when confirmed by the Finance demo adapter.
          Procurement cannot execute payment.
        </p>
      </AppShell>
    </Gate>
  );
}

export function InvoiceCreate() {
  const { role, entityId } = useApp();
  const commercial = useCommercial();
  const navigate = useNavigate();
  const [supplierId, setSupplierId] = useState("sup-001");
  const [number, setNumber] = useState("");
  const [po, setPo] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [tax, setTax] = useState("0");
  const [attachment, setAttachment] = useState("");
  const [source, setSource] = useState<IntakeSource>("Manual");
  const [error, setError] = useState("");
  const order = commercial.orders.find((item) => item.id === po.trim());
  const acceptedQuantity = order ? commercial.receipts.filter((receipt) => receipt.poId === order.id && ["Accepted", "Partially accepted"].includes(receipt.status)).reduce((sum, receipt) => sum + receipt.qty, 0) : 0;
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || !sameEntity(order.entity, entityId) || order.supplier !== (supplierId === "sup-001" ? "Northwind Devices B.V." : "Studio Zit") || !["Issued", "Acknowledged"].includes(order.status)) {
      setError("Choose an issued PO for this entity and supplier. The PO must be available before invoice capture.");
      return;
    }
    if (
      !po.trim() ||
      !attachment.trim() ||
      Number(quantity) <= 0 ||
      Number(unitPrice) <= 0 ||
      Number(tax) < 0
    ) {
      setError(
        "Enter a PO reference, attachment reference, positive quantity and price, and nonnegative tax.",
      );
      return;
    }
    const result = addInvoice({
      number: number.trim(),
      supplierId,
      supplier: supplierId === "sup-001" ? "Northwind Devices B.V." : "Studio Zit",
      entityId,
      po: po.trim(),
      source,
      currency: order.currency,
      date: new Date().toISOString().slice(0, 10),
      due: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      tax: Number(tax),
      matchType: order.line.type === "Goods" ? "3-way" : "2-way",
      lines: [
        {
          description: order.line.description,
          quantity: Number(quantity),
          unitPrice: Number(unitPrice),
          acceptedQuantity,
          poUnitPrice: order.line.price,
        },
      ],
      owner: "AP processor",
      attachment,
      exception: undefined,
      apKey: undefined,
      financeAt: undefined,
      correctionOf: undefined,
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    navigate({ to: "/procurement/invoices/$id", params: { id: result.id! } });
  };
  return (
    <Gate allowed={["ap_processor", "buyer", "proc_admin"]}>
      <AppShell>
        <PageHeader
          eyebrow="Invoice inbox"
          title="Add a bill"
          description="Enter a vendor bill to check it against an order. This demo saves it in your browser."
        />
        <form onSubmit={save} className="max-w-3xl space-y-5">
          <div className="grid gap-4 rounded-xl border bg-surface p-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="source">How did the bill arrive?</Label>
              <select
                id="source"
                className="h-10 w-full rounded-md border bg-background px-3"
                value={source}
                onChange={(e) => setSource(e.target.value as IntakeSource)}
              >
                {["Manual", "Supplier portal", "Email placeholder", "API placeholder"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier">Vendor</Label>
              <select
                id="supplier"
                className="h-10 w-full rounded-md border bg-background px-3"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="sup-001">Northwind Devices B.V. · Active</option>
                <option value="sup-003" disabled>
                  Studio Zit · Suspended
                </option>
              </select>
            </div>
            <Field label="Invoice number" value={number} onChange={setNumber} required />
            <Field label="Purchase order number" value={po} onChange={setPo} required />
            <Field
              label="Quantity"
              type="number"
              value={quantity}
              onChange={setQuantity}
              required
            />
            <Field
              label="Unit price (EUR, illustrative)"
              type="number"
              value={unitPrice}
              onChange={setUnitPrice}
              required
            />
            <div className="rounded-md border bg-muted p-3 text-sm">
              <p className="font-medium">What was ordered and delivered</p>
              <p className="mt-1 text-muted-foreground">{order ? `${order.line.qty} ordered · ${acceptedQuantity} accepted · ${money(order.line.price, order.currency)} per item on the order` : "Enter a sent purchase order number to see its price and delivered quantity."}</p>
            </div>
            <Field label="Tax total (EUR)" type="number" value={tax} onChange={setTax} required />
            <div className="sm:col-span-2">
              <Field
                label="Bill document name"
                value={attachment}
                onChange={setAttachment}
                required
              />
            </div>
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex gap-2">
            <Button type="submit">Save bill</Button>
            <Button type="button" variant="outline" asChild>
              <Link to="/procurement/invoices">Cancel</Link>
            </Button>
          </div>
          <Notice>
            We check for another bill with the same vendor and invoice number. This demo does not upload the document.
          </Notice>
        </form>
      </AppShell>
    </Gate>
  );
}

function Timeline({ invoice }: { invoice: Invoice }) {
  return (
    <section className="min-w-0 rounded-xl border bg-surface p-5">
      <h2 className="mb-3 font-semibold">Activity & audit</h2>
      <ol className="space-y-3">
        {invoice.timeline
          .slice()
          .reverse()
          .map((event, idx) => (
            <li key={`${event.at}-${idx}`} className="border-l-2 pl-3 text-sm">
              <p className="font-medium">{event.action}</p>
              <p className="text-muted-foreground">
                {event.actor} · {new Date(event.at).toLocaleString()} ·{" "}
                {event.audience ?? "Internal"}
              </p>
              {event.reason && <p>{event.reason}</p>}
            </li>
          ))}
      </ol>
    </section>
  );
}
export function InvoiceDetail({ id }: { id: string }) {
  const state = usePayables();
  const commercial = useCommercial();
  const { role, entityId } = useApp();
  const invoice = state.invoices.find((i) => i.id === id && i.entityId === entityId);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [comment, setComment] = useState("");
  const [audience, setAudience] = useState<"Internal" | "Supplier">("Internal");
  const canAct = role === "ap_processor" || role === "proc_admin";
  const issues = invoice ? matchInvoice(invoice, state.policy.tolerance) : [];
  const duplicate = invoice
    ? state.invoices.some(
        (i) =>
          i.id !== invoice.id &&
          i.supplierId === invoice.supplierId &&
          i.entityId === invoice.entityId &&
          i.currency === invoice.currency &&
          i.number.toLowerCase() === invoice.number.toLowerCase(),
      )
    : false;
  function match() {
    if (!invoice) return;
    if (!["Received", "Exception", "AP rejected", "Validated"].includes(invoice.status)) {
      setMessage("This invoice has already entered Finance processing; matching is locked.");
      return;
    }
    if (duplicate) {
      setMessage("Duplicate invoice key. This invoice cannot be validated.");
      return;
    }
    reviseInvoice(id, (i) => ({
      ...i,
      status: issues.length ? "Exception" : "Validated",
      exception: issues.length
        ? { type: "Match", reason: issues.join("; "), owner: "AP processor", due: "2026-10-08" }
        : undefined,
      timeline: [
        ...i.timeline,
        {
          at: new Date().toISOString(),
          actor: "AP processor",
          action: issues.length ? "Match exception" : "Matched and validated",
          reason: issues.join("; ") || `Policy v${state.policy.version}: ${invoice.matchType}`,
        },
      ],
    }));
    setMessage(
      issues.length
        ? "Exception created. Resolve source evidence and rerun match."
        : "Validated in demo. Ready for AP handoff.",
    );
  }
  function correct() {
    if (!invoice || !reason.trim()) {
      setMessage("A correction reason is required.");
      return;
    }
    if (!["Received", "Exception", "AP rejected"].includes(invoice.status)) {
      setMessage("A corrected invoice requires Finance return or an active exception.");
      return;
    }
    reviseInvoice(id, (i) => ({
      ...i,
      status: "Exception",
      exception: { type: "Supplier correction", reason, owner: i.supplier, due: i.due },
      timeline: [...i.timeline, { at: new Date().toISOString(), actor: "AP processor", action: "Supplier correction requested", reason }],
    }));
    addComment(id, "AP processor", `Please submit a corrected invoice: ${reason}`, "Supplier");
    setReason("");
    setMessage("Correction requested from supplier. The original invoice remains unchanged; a linked replacement must be submitted.");
  }
  function handoff() {
    if (!invoice || invoice.status !== "Validated") {
      setMessage("Only a validated invoice can be handed to AP.");
      return;
    }
    reviseInvoice(id, (i) => ({
      ...i,
      status: "Handoff pending",
      apKey: i.apKey ?? `AP-${i.id}-v${i.version}`,
      apAttempts: i.apAttempts + 1,
      timeline: [
        ...i.timeline,
        {
          at: new Date().toISOString(),
          actor: "AP processor",
          action: "Demo AP handoff queued",
          reason: `Idempotency key AP-${i.id}-v${i.version}; no external transmission`,
        },
      ],
    }));
    setMessage("Handoff pending in demo. No Finance system was contacted.");
  }
  function finance(status: "Handed to AP" | "AP rejected" | "Posted" | "Paid") {
    if (!invoice) return;
    const allowed =
      status === "Handed to AP"
        ? invoice.status === "Handoff pending"
        : status === "AP rejected"
          ? ["Handoff pending", "Handed to AP"].includes(invoice.status)
          : status === "Posted"
            ? invoice.status === "Handed to AP"
            : invoice.status === "Posted";
    if (!allowed) {
      setMessage("Finance callback is out of order for this invoice.");
      return;
    }
    if (status === "AP rejected" && !reason.trim()) {
      setMessage("Enter a rejection reason.");
      return;
    }
    reviseInvoice(id, (i) => ({
      ...i,
      status,
      financeAt: new Date().toISOString(),
      timeline: [
        ...i.timeline,
        {
          at: new Date().toISOString(),
          actor: "Finance demo callback",
          action: status,
          reason: status === "AP rejected" ? reason : `Correlation ${i.apKey}`,
        },
      ],
    }));
    setReason("");
    setMessage(`${status} recorded as a simulated Finance callback.`);
  }
  if (!invoice)
    return (
      <AppShell>
        <PageHeader
          eyebrow="Invoices"
          title="Invoice unavailable"
          description="This reference does not exist in the selected entity, or your role cannot see it."
        />
        <Notice>
          No access or no record.{" "}
          <Link className="underline" to="/procurement/invoices">
            Back to inbox
          </Link>
        </Notice>
      </AppShell>
    );
  return (
    <Gate allowed={invoiceRoles}>
      <AppShell>
        <PageHeader
          eyebrow="Procurement / Invoices"
          title={`${invoice.number} · ${invoice.supplier}`}
          description={`${invoice.id} · ${invoice.po} · ${invoice.currency} · version ${invoice.version}`}
          primaryAction={
            <Button variant="outline" asChild>
              <Link to="/procurement/invoices">Back to inbox</Link>
            </Button>
          }
        />
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <StatusBadge status={invoice.status} />
          <span className="text-sm text-muted-foreground">
            Owner: {invoice.exception?.owner ?? invoice.owner}
          </span>
          <span className="text-sm text-muted-foreground">Source: {invoice.source}</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-xl border bg-surface p-5">
            <h2 className="font-semibold">Vendor bill</h2>
            <p className="mt-3 text-sm">
              Invoice {invoice.number} · {invoice.date}
            </p>
            <p className="text-sm">Due {invoice.due}</p>
            {invoice.correctionOf ? <p className="text-sm">Corrects <Link to="/procurement/invoices/$id" params={{ id: invoice.correctionOf }} className="text-primary underline">{invoice.correctionOf}</Link></p> : null}
            {state.invoices.filter((candidate) => candidate.correctionOf === invoice.id).map((candidate) => <p key={candidate.id} className="text-sm">Replacement <Link to="/procurement/invoices/$id" params={{ id: candidate.id }} className="text-primary underline">{candidate.id}</Link></p>)}
            <p className="text-sm">Attachment: {invoice.attachment}</p>
            <p className="mt-3 text-xl font-semibold">
              {money(invoiceTotal(invoice), invoice.currency)}
            </p>
            <p className="text-xs text-muted-foreground">
              Includes tax {money(invoice.tax, invoice.currency)}
            </p>
          </section>
          <section className="rounded-xl border bg-surface p-5">
            <h2 className="font-semibold">Purchase order</h2>
            <p className="mt-3 text-sm">{invoice.po}</p>
            {commercial.orders.some((order) => order.id === invoice.po && sameEntity(order.entity, entityId)) ? <Link to="/procurement/orders/$id" params={{ id: invoice.po }} className="text-sm text-primary underline">Open purchase order</Link> : null}
            {invoice.lines.map((line, idx) => (
              <p key={idx} className="mt-2 text-sm">
                {line.description}: {line.quantity} invoiced ×{" "}
                {money(line.unitPrice, invoice.currency)}; PO price{" "}
                {money(line.poUnitPrice, invoice.currency)}
              </p>
            ))}
            <p className="mt-3 text-xs text-muted-foreground">Order and delivery details in this demo come from this browser.</p>
          </section>
          <section className="rounded-xl border bg-surface p-5">
            <h2 className="font-semibold">What was accepted</h2>
            {invoice.lines.map((line, idx) => (
              <p key={idx} className="mt-3 text-sm">
                {line.description}: {line.acceptedQuantity} accepted;{" "}
                {Math.max(0, line.quantity - line.acceptedQuantity)} unmatched
              </p>
            ))}
            <p className="mt-3 text-xs text-muted-foreground">
              {invoice.matchType === "3-way" ? "Compared with the order and delivery" : "Compared with the order"} · allowed difference in this demo: {state.policy.tolerance}%
            </p>
          </section>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-xl border bg-surface p-5">
            <h2 className="font-semibold">Check the bill</h2>
            {duplicate && <Notice tone="error">This bill may already be recorded.</Notice>}
            {issues.length ? (
              <ul className="mt-3 list-inside list-disc text-sm text-red-800">
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : (
              <Notice tone="success">
                The quantity and price look right. Finance still needs to check the tax.
              </Notice>
            )}
            {invoice.exception && (
              <p className="mt-3 text-sm">
                {invoice.exception.type}: {invoice.exception.reason}. Owner{" "}
                {invoice.exception.owner}; due {invoice.exception.due}.
              </p>
            )}
            {canAct && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={match}>Check against order</Button>
                <Button variant="outline" onClick={correct} disabled={!issues.length}>
                  Ask vendor to correct bill
                </Button>
              </div>
            )}
            <div className="mt-3">
              <Label htmlFor="reason">Why does this need a change?</Label>
              <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              The original bill stays in the history. A corrected bill is saved separately.
            </p>
          </section>
          <section className="rounded-xl border bg-surface p-5">
            <h2 className="font-semibold">Finance and payment updates</h2>
            <p className="mt-2 text-sm">
              Status: {statusLabel(invoice.status)}.{" "}
              {invoice.financeAt
                ? `Last Finance demo confirmation ${new Date(invoice.financeAt).toLocaleString()}`
                : "No Finance confirmation yet."}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Finance reference: {invoice.apKey ?? "Not assigned"} · send attempts: {invoice.apAttempts}
            </p>
            {canAct && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={handoff} disabled={invoice.status !== "Validated"}>
                  Send to Finance
                </Button>
                <Button variant="outline" onClick={() => finance("Handed to AP")}>
                  Demo: Finance accepts
                </Button>
                <Button variant="outline" onClick={() => finance("AP rejected")}>
                  Demo: Finance sends back
                </Button>
                <Button variant="outline" onClick={() => finance("Posted")}>
                  Demo: Finance records bill
                </Button>
                <Button variant="outline" onClick={() => finance("Paid")}>
                  Demo: Finance marks paid
                </Button>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              These buttons show sample Finance updates. They do not make a payment.
            </p>
          </section>
        </div>
        {message && (
          <div className="mt-4">
            <Notice
              tone={
                message.includes("cannot") || message.includes("required") ? "error" : "neutral"
              }
            >
              {message}
            </Notice>
          </div>
        )}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Timeline invoice={invoice} />
          <section className="min-w-0 rounded-xl border bg-surface p-5">
            <h2 className="font-semibold">Vendor credits</h2>
            {(state.credits ?? [])
              .filter((credit) => credit.invoiceId === id)
              .map((credit) => (
                <div key={credit.id} className="mt-2 rounded-lg border p-3 text-sm"><p>{credit.id} · {money(credit.amount, credit.currency)} · {credit.status}</p><p>{credit.reason}</p>{credit.documentRef ? <p className="text-xs text-muted-foreground">Document {credit.documentRef} · submitted by {credit.submittedBy}</p> : null}{credit.status === "Commercial review" && ["buyer", "proc_admin"].includes(role) ? <Button size="sm" variant="outline" className="mt-2" onClick={() => { if (!reason.trim()) return setMessage("A commercial review reason is required before handoff."); updatePayables((current) => ({ ...current, credits: (current.credits ?? []).map((entry) => entry.id === credit.id ? { ...entry, status: "Sent to Finance" as const } : entry), invoices: current.invoices.map((entry) => entry.id === id ? { ...entry, timeline: [...entry.timeline, { at: new Date().toISOString(), actor: "Procurement reviewer", action: `Credit ${credit.id} reviewed for Finance`, reason: reason.trim() }] } : entry) })); setMessage(`${credit.id} marked for Finance review. No accounting entry was posted.`); setReason(""); }}>Approve commercial handoff</Button> : null}</div>
              ))}
            {canAct && (
              <Button
                variant="outline"
                className="mt-3 h-auto max-w-full whitespace-normal text-left"
                onClick={() => {
                  const amount = invoice.lines.reduce(
                    (sum, line) =>
                      sum + Math.max(0, line.quantity - line.acceptedQuantity) * line.unitPrice,
                    0,
                  );
                  if (!reason.trim() || amount <= 0) {
                    setMessage(
                      "A reason and positive unaccepted value are required for a credit reference.",
                    );
                    return;
                  }
                  const credit = addCreditRef(invoice, amount, reason.trim());
                  setMessage(
                    `${credit.id} saved as a commercial credit reference. Finance must separately post or apply it.`,
                  );
                  setReason("");
                }}
              >
                Create credit reference for unaccepted quantity
              </Button>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Finance owns supplier balances, posting, refunds and cash application.
            </p>
          </section>
          <section className="min-w-0 rounded-xl border bg-surface p-5">
            <h2 className="font-semibold">Messages about this bill</h2>
            <div className="mt-3 space-y-2">
              {(state.comments[id] ?? []).map((c, n) => (
                <p key={n} className="rounded-lg border p-2 text-sm">
                  <strong>{c.actor}</strong> · {c.audience}
                  <br />
                  {c.reason}
                </p>
              ))}
            </div>
            {role !== "auditor" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!comment.trim()) return;
                  if (
                    audience === "Supplier" &&
                    !window.confirm("Share this message with the supplier?")
                  )
                    return;
                  addComment(id, role, comment.trim(), audience);
                  setComment("");
                }}
                className="mt-4 space-y-2"
              >
                <Label htmlFor="comment">Message</Label>
                <Textarea
                  id="comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <Label htmlFor="audience">Audience</Label>
                <select
                  id="audience"
                  className="block rounded-md border p-2"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value as "Internal" | "Supplier")}
                >
                  <option>Internal</option>
                  <option>Supplier</option>
                </select>
                <Button type="submit">Add demo message</Button>
              </form>
            )}
          </section>
        </div>
      </AppShell>
    </Gate>
  );
}
