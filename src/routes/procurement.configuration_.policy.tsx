import { createFileRoute } from "@tanstack/react-router";
import { ProcurementPolicyScreen } from "@/modules/procurement/payables/policy-screen";
export const Route = createFileRoute("/procurement/configuration_/policy")({
  component: ProcurementPolicyScreen,
});
