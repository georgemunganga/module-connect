import { createFileRoute } from "@tanstack/react-router";
import { CommercialDetail } from "@/modules/procurement/commercial/ui";
export const Route = createFileRoute("/procurement/contracts_/$id")({ component: () => { const {id}=Route.useParams(); return <CommercialDetail area="contracts" id={id}/>; } });
