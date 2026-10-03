import { createFileRoute } from "@tanstack/react-router";
import { InvoiceQueue } from "@/modules/procurement/payables/screens";
export const Route = createFileRoute("/procurement/invoices")({
  head: () => ({ meta: [{ title: "Bills — Meridian ERP Procurement" }] }),
  component: InvoiceQueue,
});
