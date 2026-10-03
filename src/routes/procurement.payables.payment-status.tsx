import { createFileRoute } from "@tanstack/react-router";
import { InvoiceQueue } from "@/modules/procurement/payables/screens";

export const Route = createFileRoute("/procurement/payables/payment-status")({
  head: () => ({ meta: [{ title: "Payment status — Meridian ERP Procurement" }] }),
  component: () => <InvoiceQueue view="payments" />,
});
