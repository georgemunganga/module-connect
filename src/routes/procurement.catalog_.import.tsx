import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useApp } from "@/platform/app-context";
import { AppShell } from "@/platform/components/AppShell";
import { DataImportPanel } from "@/platform/components/DataTransfer";
import { PageHeader } from "@/platform/components/PageHeader";
import { RestrictedState } from "@/platform/components/States";
import { procurementEntityName } from "@/modules/procurement/access";
import { applyItemRows, itemFields, validateItemRows } from "@/modules/procurement/data-transfer";

export const Route = createFileRoute("/procurement/catalog_/import")({
  head: () => ({ meta: [{ title: "Import items — Meridian ERP Procurement" }, { name: "description", content: "Map and preview item data before adding it to the catalog for review." }] }),
  component: ItemImport,
});

function ItemImport() {
  const { role, entityId } = useApp();
  const entityName = procurementEntityName(entityId);
  if (role !== "buyer" && role !== "proc_admin") return <AppShell><RestrictedState /></AppShell>;
  return <AppShell>
    <PageHeader
      eyebrow="Items"
      title="Import items"
      description={`Add goods and services for ${entityName}. Imported items stay Inactive until reviewed, so employees cannot request them yet.`}
      primaryAction={<Button variant="outline" asChild><Link to="/procurement/catalog">Back to items</Link></Button>}
    />
    <div className="max-w-5xl">
      <DataImportPanel
        recordName="items"
        fields={itemFields}
        validate={(rows) => validateItemRows(rows, entityName)}
        apply={(rows) => applyItemRows(rows, entityName, role)}
      />
      <p className="mt-3 text-sm text-muted-foreground">After importing, open <strong>Manage items</strong> to review and activate each item.</p>
    </div>
  </AppShell>;
}
