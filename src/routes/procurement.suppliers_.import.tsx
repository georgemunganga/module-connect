import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useApp, useEntity } from "@/platform/app-context";
import { AppShell } from "@/platform/components/AppShell";
import { DataImportPanel } from "@/platform/components/DataTransfer";
import { PageHeader } from "@/platform/components/PageHeader";
import { RestrictedState } from "@/platform/components/States";
import { supplierRole } from "@/modules/procurement/access";
import { applyVendorRows, validateVendorRows, vendorFields } from "@/modules/procurement/data-transfer";

export const Route = createFileRoute("/procurement/suppliers_/import")({
  head: () => ({ meta: [{ title: "Import vendors — Meridian ERP Procurement" }, { name: "description", content: "Map and preview a vendor CSV before adding proposed vendors." }] }),
  component: VendorImport,
});

function VendorImport() {
  const { role } = useApp();
  const entity = useEntity();
  if (!supplierRole(role) || role === "auditor") return <AppShell><RestrictedState /></AppShell>;
  return <AppShell>
    <PageHeader
      eyebrow="Vendors"
      title="Import vendors"
      description={`Add vendors for ${entity.country}. Every imported vendor stays Proposed until the normal review is complete.`}
      primaryAction={<Button variant="outline" asChild><Link to="/procurement/suppliers">Back to vendors</Link></Button>}
    />
    <div className="max-w-5xl">
      <DataImportPanel
        recordName="vendors"
        fields={vendorFields}
        validate={(rows) => validateVendorRows(rows, entity.country)}
        apply={(rows) => applyVendorRows(rows, entity.country, role)}
      />
    </div>
  </AppShell>;
}
