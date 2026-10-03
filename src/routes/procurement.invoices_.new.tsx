import { createFileRoute } from "@tanstack/react-router";
import { InvoiceCreate } from "@/modules/procurement/payables/screens";
export const Route = createFileRoute("/procurement/invoices_/new")({ component: InvoiceCreate });
