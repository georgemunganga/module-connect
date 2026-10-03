import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { workspaces } from "@/mock/data";
import type { Role } from "@/mock/types";
import { procApi } from "@/modules/procurement/data";
import { useApp } from "@/platform/app-context";
import { AppShell } from "@/platform/components/AppShell";
import { Async } from "@/platform/components/Async";
import { PageHeader } from "@/platform/components/PageHeader";
import { EmptyState, RestrictedState } from "@/platform/components/States";
import { WorkQueue } from "@/platform/components/WorkQueue";
import { useMock } from "@/platform/use-mock";

export const Route = createFileRoute("/procurement/")({
  head: () => ({
    meta: [
      { title: "Home — Meridian ERP Procurement" },
      { name: "description", content: "Your next procurement action: requests, approvals, deliveries and exceptions for your role." },
      { property: "og:title", content: "Home — Meridian ERP Procurement" },
      { property: "og:description", content: "Your next procurement action: requests, approvals, deliveries and exceptions for your role." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProcHome,
});

type Card = { label: string; value: string; hint: string; to: string; params?: Record<string, string> };

/** Amounts are always shown per currency — never summed across currencies. */
const cardsByView: Record<string, Card[]> = {
  requester: [
    { label: "My open requests", value: "3", hint: "1 returned to you", to: "/procurement/requests" },
    { label: "Deliveries to confirm", value: "1", hint: "Office chairs, Amsterdam", to: "/procurement/area/$area", params: { area: "deliveries" } },
    { label: "Drafts", value: "1", hint: "Welcome packs, saved 2 Oct", to: "/procurement/requests" },
  ],
  approver: [
    { label: "Decisions pending", value: "2", hint: "Earliest due 8 Oct", to: "/procurement/requests" },
    { label: "Value awaiting you (EUR)", value: "€18,450", hint: "1 request", to: "/procurement/requests" },
    { label: "Value awaiting you (KES)", value: "KES 386,000", hint: "1 request", to: "/procurement/requests" },
  ],
  buyer: [
    { label: "Approved lines to process", value: "2", hint: "Not yet sourced or ordered", to: "/procurement/requests" },
    { label: "Sourcing deadlines", value: "1", hint: "RFQ closes 9 Oct", to: "/procurement/area/$area", params: { area: "sourcing" } },
    { label: "POs awaiting issue", value: "1", hint: "Chairs, €7,200", to: "/procurement/area/$area", params: { area: "purchasing" } },
    { label: "Invoice exceptions", value: "2", hint: "Price variance above tolerance", to: "/procurement/area/$area", params: { area: "invoices" } },
    { label: "Supplier onboarding", value: "1", hint: "Missing tax ID and bank letter", to: "/procurement/suppliers" },
  ],
  steward: [
    { label: "Onboarding in progress", value: "1", hint: "More information required", to: "/procurement/suppliers" },
    { label: "Suppliers on hold", value: "1", hint: "Review 12 Oct", to: "/procurement/suppliers" },
  ],
  receiver: [
    { label: "Deliveries expected", value: "2", hint: "This week", to: "/procurement/area/$area", params: { area: "purchasing" } },
  ],
  ap: [
    { label: "Invoice exceptions", value: "2", hint: "Awaiting match decision", to: "/procurement/area/$area", params: { area: "invoices" } },
  ],
};

function viewFor(role: Role): keyof typeof cardsByView | "auditor" | "supplier" {
  switch (role) {
    case "buyer":
    case "proc_admin":
      return "buyer";
    case "manager":
      return "approver";
    case "supplier_steward":
      return "steward";
    case "receiver":
      return "receiver";
    case "ap_processor":
      return "ap";
    case "auditor":
      return "auditor";
    case "supplier_user":
      return "supplier";
    default:
      return "requester";
  }
}

const activity = [
  { when: "3 Oct, 16:12", who: "Grace Wanjiru", what: "Returned PR-2026-1035 — supplier not onboarded" },
  { when: "2 Oct, 10:40", who: "Lukas Brandt", what: "Approved PR-2026-1038 (€7,200)" },
  { when: "1 Oct, 09:05", who: "Sanne de Vries", what: "Submitted PR-2026-1042 (€18,450)" },
];

function ProcHome() {
  const { role } = useApp();
  const view = viewFor(role);
  const queue = useMock(() => procApi.workQueue(role), [role]);
  const ws = workspaces.find((w) => w.id === role)!;
  const canRequest = view !== "auditor" && view !== "supplier";

  if (view === "supplier") {
    return (
      <AppShell>
        <PageHeader eyebrow={`${ws.label} workspace`} title="Procurement home" />
        <RestrictedState
          title="Suppliers use the supplier portal"
          body="This internal workspace isn't available to supplier accounts. The supplier portal, with its own navigation, arrives in Milestone 15."
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow={`${ws.label} workspace`}
        title="Procurement home"
        description={view === "auditor" ? "Read-only. Search records and review recent activity." : `${ws.description}. Exceptions first, then decisions, then tasks.`}
        primaryAction={
          canRequest ? (
            <Button asChild>
              <Link to="/procurement/requests">Create request</Link>
            </Button>
          ) : undefined
        }
      />

      {view === "auditor" ? (
        <AuditorHome />
      ) : (
        <div className="space-y-8">
          <section aria-labelledby="summary-h">
            <h2 id="summary-h" className="sr-only">Summary</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cardsByView[view].map((c) => (
                <li key={c.label}>
                  <Link
                    to={c.to}
                    params={c.params as never}
                    className="flex h-full items-start justify-between gap-3 rounded-lg border bg-surface p-4 transition-colors hover:border-border-strong"
                  >
                    <span>
                      <span className="block text-xs text-muted-foreground">{c.label}</span>
                      <span className="mt-1 block text-xl font-semibold tabular-nums">{c.value}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{c.hint}</span>
                    </span>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <Async state={queue}>
            {(items) =>
              items.length ? (
                <WorkQueue items={items} />
              ) : (
                <EmptyState
                  title={view === "requester" ? "You haven't asked for anything yet" : "Nothing needs you right now"}
                  body={view === "requester" ? "Start a request for goods, a service or a subscription. You'll see its status and next step here." : "New exceptions, approvals and tasks will appear here."}
                />
              )
            }
          </Async>
        </div>
      )}
    </AppShell>
  );
}

function AuditorHome() {
  const [q, setQ] = useState("");
  const rows = activity.filter((a) => (a.what + a.who).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <label htmlFor="audit-q" className="sr-only">Search activity</label>
        <Input id="audit-q" className="pl-9" placeholder="Search by reference, person or action" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <section aria-labelledby="act-h" className="rounded-lg border bg-surface">
        <h2 id="act-h" className="border-b px-4 py-3 text-sm font-semibold">Recent activity</h2>
        {rows.length ? (
          <ul className="divide-y">
            {rows.map((a) => (
              <li key={a.when} className="px-4 py-3 text-sm">
                <span className="font-medium">{a.what}</span>
                <span className="block text-xs text-muted-foreground">{a.who} · {a.when}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-sm text-muted-foreground">No activity matches “{q}”.</p>
        )}
      </section>
    </div>
  );
}
