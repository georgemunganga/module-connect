import { createFileRoute, Link } from "@tanstack/react-router";
import { FileMinus2 } from "lucide-react";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { EmptyState, RestrictedState } from "@/platform/components/States";
import { useApp } from "@/platform/app-context";
import { usePayables } from "@/modules/procurement/payables/store";

export const Route = createFileRoute("/procurement/payables/credits")({
  head: () => ({ meta: [{ title: "Vendor credits — Meridian ERP Procurement" }] }),
  component: VendorCredits,
});

function VendorCredits() {
  const { role, entityId } = useApp();
  const state = usePayables();
  if (!["ap_processor", "buyer", "proc_admin", "auditor"].includes(role)) return <AppShell><RestrictedState /></AppShell>;
  const invoices = new Map(state.invoices.filter((invoice) => invoice.entityId === entityId).map((invoice) => [invoice.id, invoice]));
  const credits = (state.credits ?? []).filter((credit) => invoices.has(credit.invoiceId));
  return <AppShell>
    <PageHeader eyebrow="Payables" title="Vendor credits" description="Track commercial credit requests linked to bills. Finance records the official credit and applies it to the supplier account." />
    {credits.length ? <div className="overflow-x-auto rounded-xl border bg-surface">
      <table className="w-full min-w-[42rem] text-left text-sm">
        <thead className="border-b bg-surface-muted text-xs"><tr><th className="p-3">Reference</th><th className="p-3">Vendor and bill</th><th className="p-3">Reason</th><th className="p-3">Status</th><th className="p-3 text-right">Amount</th></tr></thead>
        <tbody className="divide-y">{credits.map((credit) => {
          const invoice = invoices.get(credit.invoiceId)!;
          return <tr key={credit.id}>
            <td className="p-3 font-medium">{credit.id}<span className="block text-xs font-normal text-muted-foreground">{credit.created.slice(0, 10)}</span></td>
            <td className="p-3">{invoice.supplier}<Link className="block text-primary hover:underline" to="/procurement/invoices/$id" params={{ id: invoice.id }}>{invoice.number}</Link></td>
            <td className="p-3">{credit.reason}</td>
            <td className="p-3">{credit.status}</td>
            <td className="p-3 text-right tabular-nums">{new Intl.NumberFormat("en", { style: "currency", currency: credit.currency }).format(credit.amount)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div> : <EmptyState title="No vendor credits yet" body="When a bill needs a commercial credit, create its reference from the bill detail page. Finance handles the accounting entry." icon={<FileMinus2 className="size-10" aria-hidden />} />}
    <p className="mt-4 text-xs text-muted-foreground">A credit marked “Sent to Finance” is a handoff reference, not confirmation that Finance posted or applied it.</p>
  </AppShell>;
}
