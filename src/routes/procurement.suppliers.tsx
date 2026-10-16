import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/platform/app-context";
import { AppShell } from "@/platform/components/AppShell";
import { ListPage } from "@/platform/components/ListPage";
import { PageHeader } from "@/platform/components/PageHeader";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { DataExportButton } from "@/platform/components/DataTransfer";
import { downloadCsv } from "@/platform/data-transfer";
import { lifecycleFilters } from "@/modules/procurement/suppliers";
import { vendorExportRows, vendorFields } from "@/modules/procurement/data-transfer";
import { useProcurement } from "@/modules/procurement/store";
import { procurementEntity, supplierRole, sameEntity } from "@/modules/procurement/access";
import { RestrictedState } from "@/platform/components/States";
import type { SupplierRecord } from "@/modules/procurement/suppliers";

export const Route = createFileRoute("/procurement/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers — Meridian ERP Procurement" },
      { name: "description", content: "Supplier queue by lifecycle status, with owner, next action and due date." },
      { property: "og:title", content: "Suppliers — Meridian ERP Procurement" },
      { property: "og:description", content: "Supplier onboarding, diligence and status in one queue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupplierList,
});

function SupplierList() {
  const { role, entityId } = useApp();
  const canPropose = ["buyer", "supplier_steward", "proc_admin"].includes(role);
  const rows = useProcurement().suppliers.filter((supplier) => sameEntity(supplier.country, entityId));
  const actions = canPropose ? <div className="flex flex-wrap gap-2"><Button asChild><Link to="/procurement/suppliers/new" search={{ edit: undefined }}>Add vendor</Link></Button><Button variant="outline" asChild><Link to="/procurement/suppliers/import"><Upload className="mr-2 size-4" aria-hidden />Import vendors</Link></Button><DataExportButton fileName="vendors.csv" fields={vendorFields} rows={vendorExportRows(procurementEntity(entityId))} label="Export vendors CSV" /></div> : undefined;
  if (!supplierRole(role)) return <AppShell><RestrictedState /></AppShell>;
  return (
    <AppShell>
      <PageHeader
        eyebrow="Suppliers"
        title="Vendors"
        description="Add vendors, keep their contact details, and see what needs to happen next."
        primaryAction={actions}
      />
      <ListPage<SupplierRecord>
        rows={rows}
        emptyState={{ title: "Every purchase starts with a vendor", body: "Create and manage your vendors and their contact persons, all in one place.", icon: <Building2 className="size-10" aria-hidden />, action: actions }}
        searchPlaceholder="Search vendor name, company ID or category"
        searchFields={(s) => `${s.name} ${s.legalName} ${s.registration} ${s.status} ${s.categories.join(" ")} ${s.contacts.map((contact) => `${contact.name} ${contact.email}`).join(" ")} ${s.sites.map((site) => site.address).join(" ")} ${s.onboarding?.remarks ?? ""}`}
        sortOptions={[
          { id: "name", label: "Display name", value: (s) => s.name },
          { id: "company", label: "Company name", value: (s) => s.legalName },
          { id: "status", label: "Status", value: (s) => s.status },
          { id: "owner", label: "Owner", value: (s) => s.owner },
        ]}
        onExport={canPropose ? (scope, selectedRows, visibleColumns) => downloadCsv(
          `vendors-${scope}.csv`,
          visibleColumns.map((column) => ({ key: column.id, label: column.header })),
          selectedRows.map((supplier) => ({
            name: supplier.name,
            status: supplier.status,
            owner: supplier.owner,
            next: supplier.nextAction,
            due: supplier.dueDate,
            country: supplier.country,
            cat: supplier.categories.join(", "),
          })),
        ) : undefined}
        filters={[
          { id: "status", label: "Status", options: lifecycleFilters, match: (s, v) => s.status === v },
          { id: "country", label: "Country", options: ["Netherlands", "Kenya", "Germany"], match: (s, v) => s.country === v },
        ]}
        columns={[
          { id: "name", header: "Supplier", cell: (s) => <span className="block max-w-64 truncate font-medium">{s.name}</span> },
          { id: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
          { id: "owner", header: "Owner", cell: (s) => s.owner },
          { id: "next", header: "What happens next", cell: (s) => <span className="block max-w-72 truncate">{s.nextAction}</span> },
          { id: "due", header: "Due", cell: (s) => s.dueDate },
          { id: "country", header: "Country", cell: (s) => s.country },
          { id: "cat", header: "Categories", defaultVisible: false, cell: (s) => s.categories.join(", ") },
        ]}
        rowHref={(s) => <div className="flex flex-wrap gap-3"><Link to="/procurement/suppliers/$id" params={{ id: s.id }} className="text-sm font-medium text-primary hover:underline">Open<span className="sr-only"> {s.name}</span></Link>{["supplier_steward", "proc_admin"].includes(role) && !["Rejected", "Suspended", "Inactive", "Expired"].includes(s.status) ? <Link to="/procurement/suppliers/new" search={{ edit: s.id }} className="text-sm font-medium text-primary hover:underline">Edit<span className="sr-only"> {s.name}</span></Link> : null}</div>}
      />
    </AppShell>
  );
}
