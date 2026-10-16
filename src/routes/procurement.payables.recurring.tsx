import { createFileRoute, Link } from "@tanstack/react-router";
import { Repeat2 } from "lucide-react";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { EmptyState, RestrictedState } from "@/platform/components/States";
import { useApp } from "@/platform/app-context";
import { useCommercial } from "@/modules/procurement/commercial/store";
import { sameEntity } from "@/modules/procurement/access";

export const Route = createFileRoute("/procurement/payables/recurring")({
  head: () => ({ meta: [{ title: "Recurring purchases — Meridian ERP Procurement" }] }),
  component: RecurringPurchases,
});

function RecurringPurchases() {
  const { role, entityId } = useApp();
  const commercial = useCommercial();
  if (!["ap_processor", "buyer", "proc_admin", "auditor"].includes(role)) return <AppShell><RestrictedState /></AppShell>;
  const contracts = commercial.contracts.filter((contract) => contract.kind === "Recurring" && sameEntity(contract.entity, entityId));
  return <AppShell>
    <PageHeader eyebrow="Payables" title="Recurring purchases" description="See the agreements behind repeating vendor bills. Finance owns the bill schedule, payable balance and payment." />
    {contracts.length ? <div className="grid gap-3">{contracts.map((contract) => <Link key={contract.id} to="/procurement/contracts/$id" params={{ id: contract.id }} className="grid gap-3 rounded-xl border bg-surface p-4 hover:border-primary sm:grid-cols-[1fr_auto]">
      <div><p className="font-medium">{contract.supplier} · {contract.category}</p><p className="mt-1 text-sm text-muted-foreground">{contract.id} · {contract.frequency ?? "Frequency to confirm"} · {contract.start} to {contract.end}</p><p className="mt-2 text-sm">{contract.rate}</p></div>
      <div className="sm:text-right"><p className="text-sm font-medium">{contract.state}</p><p className="mt-1 text-xs text-muted-foreground">Ceiling {new Intl.NumberFormat("en", { style: "currency", currency: contract.currency }).format(contract.ceiling)}</p></div>
    </Link>)}</div> : <EmptyState title="No recurring purchases yet" body="Recurring services and subscriptions appear here when they are linked to a recurring procurement agreement." icon={<Repeat2 className="size-10" aria-hidden />} />}
    <p className="mt-4 text-xs text-muted-foreground">This view shows contract commitments. It does not create recurring bills or release payments.</p>
  </AppShell>;
}
