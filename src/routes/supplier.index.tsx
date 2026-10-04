import { createFileRoute } from "@tanstack/react-router";
import { SupplierPortal } from "@/modules/procurement/payables/other-screens";
import { useProcurementSession } from "@/platform/procurement-session";

export const Route = createFileRoute("/supplier/")({ component: SupplierEntry });

function SupplierEntry() {
  const session = useProcurementSession();
  if (session.mode === "demo") return <SupplierPortal />;
  return (
    <main className="min-h-screen bg-background px-5 py-12">
      <div className="mx-auto max-w-xl rounded-lg border bg-surface p-8">
        <h1 className="text-xl font-semibold">Supplier portal is not connected yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The supplier screens still use demonstration records. They will open here after supplier access and live records are connected.
        </p>
        <a className="mt-4 inline-block text-sm font-medium text-primary underline" href="/procurement">Return to Procurement</a>
      </div>
    </main>
  );
}
