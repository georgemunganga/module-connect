import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileMinus2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AppShell } from "@/platform/components/AppShell";
import { ListPage } from "@/platform/components/ListPage";
import { PageHeader } from "@/platform/components/PageHeader";
import { RestrictedState } from "@/platform/components/States";
import { useApp } from "@/platform/app-context";
import { downloadCsv } from "@/platform/data-transfer";
import { addCreditRef, invoiceTotal, usePayables } from "@/modules/procurement/payables/store";
import type { CreditRef } from "@/modules/procurement/payables/store";

export const Route = createFileRoute("/procurement/payables/credits")({
  head: () => ({ meta: [{ title: "Vendor credits — Meridian ERP Procurement" }] }),
  component: VendorCredits,
});

function VendorCredits() {
  const { role, entityId } = useApp();
  const state = usePayables();
  const [open, setOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [documentRef, setDocumentRef] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  if (!["ap_processor", "buyer", "proc_admin", "auditor"].includes(role)) return <AppShell><RestrictedState /></AppShell>;
  const canCreate = role === "ap_processor" || role === "proc_admin";
  const entityInvoices = state.invoices.filter((invoice) => invoice.entityId === entityId);
  const invoices = new Map(entityInvoices.map((invoice) => [invoice.id, invoice]));
  const credits = (state.credits ?? []).filter((credit) => invoices.has(credit.invoiceId));
  const selectedInvoice = invoices.get(invoiceId);
  const money = (value: number, currency: string) => new Intl.NumberFormat("en", { style: "currency", currency }).format(value);
  const reset = () => { setInvoiceId(""); setAmount(""); setReason(""); setDocumentRef(""); setError(""); };
  const submit = () => {
    if (!canCreate) return;
    const value = Number(amount);
    const document = documentRef.trim();
    if (!selectedInvoice || !Number.isFinite(value) || value <= 0 || value > invoiceTotal(selectedInvoice) || !reason.trim() || !document) {
      setError("Choose a bill, enter a positive amount no greater than its total, and add a reason and credit document reference.");
      return;
    }
    if (credits.some((credit) => credit.invoiceId === selectedInvoice.id && credit.documentRef?.toLocaleLowerCase() === document.toLocaleLowerCase())) {
      setError("This credit document reference is already recorded for this bill.");
      return;
    }
    const previousCredits = credits.filter((credit) => credit.invoiceId === selectedInvoice.id).reduce((sum, credit) => sum + credit.amount, 0);
    if (previousCredits + value > invoiceTotal(selectedInvoice)) {
      setError("This credit would exceed the bill total after existing credit references.");
      return;
    }
    const credit = addCreditRef(selectedInvoice, value, reason.trim(), role === "proc_admin" ? "Procurement admin" : "AP processor", document);
    setNotice(`${credit.id} added for commercial review. Finance has not posted a credit.`);
    setOpen(false);
    reset();
  };
  return <AppShell>
    <PageHeader eyebrow="Payables" title="Vendor credits" description="Track commercial credit requests linked to bills. Finance records the official credit and applies it to the supplier account." primaryAction={canCreate ? <Button onClick={() => { reset(); setOpen(true); }}><Plus className="mr-2 size-4" aria-hidden />Add credit reference</Button> : undefined} />
    {notice ? <p role="status" className="rounded-lg border border-primary/30 bg-primary-soft px-4 py-3 text-sm text-primary">{notice}</p> : null}
    <ListPage<CreditRef>
      rows={credits}
      searchPlaceholder="Search credit, vendor or bill"
      searchFields={(credit) => `${credit.id} ${credit.documentRef ?? ""} ${credit.reason} ${invoices.get(credit.invoiceId)?.supplier ?? ""} ${invoices.get(credit.invoiceId)?.number ?? ""}`}
      filters={[{ id: "status", label: "Status", options: [...new Set(credits.map((credit) => credit.status))], match: (credit, value) => credit.status === value }]}
      sortOptions={[{ id: "created", label: "Created", value: (credit) => credit.created }, { id: "amount", label: "Amount", value: (credit) => credit.amount }]}
      columns={[
        { id: "reference", header: "Reference", cell: (credit) => <><span className="font-medium">{credit.id}</span><span className="block text-xs text-muted-foreground">{credit.created.slice(0, 10)}</span></> },
        { id: "bill", header: "Vendor and bill", cell: (credit) => { const invoice = invoices.get(credit.invoiceId)!; return <>{invoice.supplier}<Link className="block text-primary hover:underline" to="/procurement/invoices/$id" params={{ id: invoice.id }}>{invoice.number}</Link></>; } },
        { id: "reason", header: "Reason", cell: (credit) => credit.reason },
        { id: "status", header: "Status", cell: (credit) => credit.status },
        { id: "amount", header: "Amount", cell: (credit) => money(credit.amount, credit.currency) },
        { id: "document", header: "Credit document", defaultVisible: false, cell: (credit) => credit.documentRef ?? "—" },
      ]}
      onExport={canCreate ? (scope, rows, columns) => downloadCsv(`vendor-credits-${scope}.csv`, columns.map((column) => ({ key: column.id, label: column.header })), rows.map((credit) => Object.fromEntries(columns.map((column) => [column.id, column.id === "reference" ? credit.id : column.id === "bill" ? invoices.get(credit.invoiceId)?.number ?? "" : column.id === "reason" ? credit.reason : column.id === "status" ? credit.status : column.id === "amount" ? String(credit.amount) : credit.documentRef ?? ""])))) : undefined}
      emptyState={{ title: "No vendor credits yet", body: "When a bill needs a credit, record its document here. Finance handles the accounting entry.", icon: <FileMinus2 className="size-10" aria-hidden />, action: canCreate ? <Button onClick={() => { reset(); setOpen(true); }}>Add credit reference</Button> : undefined }}
    />
    <p className="mt-4 text-xs text-muted-foreground">A credit marked “Sent to Finance” is a handoff reference, not confirmation that Finance posted or applied it.</p>
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}><DialogContent>
      <DialogHeader><DialogTitle>Add credit reference</DialogTitle><DialogDescription>Link the supplier credit document to an existing bill for review.</DialogDescription></DialogHeader>
      <div className="grid gap-4 py-2">
        <div className="space-y-2"><Label htmlFor="credit-bill">Bill</Label><Select value={invoiceId} onValueChange={(value) => { setInvoiceId(value); setError(""); }}><SelectTrigger id="credit-bill"><SelectValue placeholder="Choose a bill" /></SelectTrigger><SelectContent>{entityInvoices.map((invoice) => <SelectItem key={invoice.id} value={invoice.id}>{invoice.number} · {invoice.supplier}</SelectItem>)}</SelectContent></Select>{selectedInvoice ? <p className="text-xs text-muted-foreground">Bill total: {money(invoiceTotal(selectedInvoice), selectedInvoice.currency)}</p> : null}</div>
        <div className="space-y-2"><Label htmlFor="credit-amount">Credit amount</Label><Input id="credit-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="credit-document">Credit document reference</Label><Input id="credit-document" value={documentRef} onChange={(event) => setDocumentRef(event.target.value)} placeholder="Supplier credit note number" /></div>
        <div className="space-y-2"><Label htmlFor="credit-reason">Reason</Label><Textarea id="credit-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is the credit needed?" /></div>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      </div>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={submit}>Add reference</Button></DialogFooter>
    </DialogContent></Dialog>
  </AppShell>;
}
