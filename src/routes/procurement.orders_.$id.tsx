import { createFileRoute } from "@tanstack/react-router";
import { CommercialDetail } from "@/modules/procurement/commercial/ui";
export const Route = createFileRoute("/procurement/orders_/$id")({ component: () => { const {id}=Route.useParams(); return <CommercialDetail area="orders" id={id}/>; } });
