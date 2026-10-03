import { createFileRoute } from "@tanstack/react-router";
import { CommercialList } from "@/modules/procurement/commercial/ui";
export const Route = createFileRoute("/procurement/orders")({ component: () => <CommercialList area="orders"/> });
