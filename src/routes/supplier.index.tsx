import { createFileRoute } from "@tanstack/react-router";
import { SupplierPortal } from "@/modules/procurement/payables/other-screens";
export const Route = createFileRoute("/supplier/")({ component: SupplierPortal });
