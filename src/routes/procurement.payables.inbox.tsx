import { createFileRoute } from "@tanstack/react-router";
import { InvoiceQueue } from "@/modules/procurement/payables/screens";

export const Route = createFileRoute("/procurement/payables/inbox")({
  head: () => ({ meta: [{ title: "Invoice inbox — Meridian ERP Procurement" }] }),
  component: () => <InvoiceQueue view="inbox" />,
});
