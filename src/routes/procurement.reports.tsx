import { createFileRoute } from "@tanstack/react-router";
import { ProcurementReports } from "@/modules/procurement/payables/other-screens";
export const Route = createFileRoute("/procurement/reports")({ component: ProcurementReports });
