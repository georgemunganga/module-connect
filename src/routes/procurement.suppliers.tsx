import { createFileRoute } from "@tanstack/react-router";
import { procApi } from "@/modules/procurement/data";
import type { Supplier } from "@/modules/procurement/types";
import { AppShell } from "@/platform/components/AppShell";
import { Async } from "@/platform/components/Async";
import { ListPage } from "@/platform/components/ListPage";
import { PageHeader } from "@/platform/components/PageHeader";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { useMock } from "@/platform/use-mock";

export const Route = createFileRoute("/procurement/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers — Meridian ERP Procurement" },
      { name: "description", content: "Every supplier with onboarding status, terms and category." },
      { property: "og:title", content: "Suppliers — Meridian ERP Procurement" },
      { property: "og:description", content: "Every supplier with onboarding status, terms and category." },
    ],
  }),
  component: SupplierList,
});

function SupplierList() {
  const state = useMock(() => procApi.suppliers());

  return (
    <AppShell>
      <PageHeader
        eyebrow="Purchasing"
        title="Suppliers"
        description="Onboarding status is always visible — a request against an incomplete supplier cannot be approved."
      />
      <Async state={state}>
        {(rows) => (
          <ListPage<Supplier>
            rows={rows}
            searchPlaceholder="Search supplier or category"
            searchFields={(s) => `${s.name} ${s.category} ${s.country}`}
            filters={[
              { id: "status", label: "Status", options: ["Active", "On hold", "Pending onboarding"], match: (s, v) => s.status === v },
              { id: "country", label: "Country", options: ["Netherlands", "Kenya", "Germany"], match: (s, v) => s.country === v },
            ]}
            columns={[
              { id: "name", header: "Supplier", cell: (s) => <span className="block max-w-64 truncate font-medium">{s.name}</span> },
              { id: "category", header: "Category", cell: (s) => s.category },
              { id: "country", header: "Country", cell: (s) => s.country },
              { id: "terms", header: "Terms", cell: (s) => s.paymentTerms },
              { id: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
              { id: "tax", header: "Tax ID", defaultVisible: false, cell: (s) => s.taxId ?? "Not on file" },
            ]}
          />
        )}
      </Async>
    </AppShell>
  );
}
