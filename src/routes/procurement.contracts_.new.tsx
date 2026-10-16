import { createFileRoute } from "@tanstack/react-router";
import { ContractNew } from "@/modules/procurement/commercial/ui";

export const Route = createFileRoute("/procurement/contracts_/new")({ component: ContractNew });
