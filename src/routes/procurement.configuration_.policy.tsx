import { createFileRoute } from "@tanstack/react-router";
import { ProcurementPolicy } from "@/modules/procurement/payables/other-screens";
export const Route = createFileRoute("/procurement/configuration_/policy")({
  component: ProcurementPolicy,
});
