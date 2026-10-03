import { createFileRoute } from "@tanstack/react-router";
import { InvoiceDetail } from "@/modules/procurement/payables/screens";
export const Route = createFileRoute("/procurement/invoices_/$id")({
  component: InvoiceRoute,
});

function InvoiceRoute() {
  const { id } = Route.useParams();
  return <InvoiceDetail id={id} />;
}
