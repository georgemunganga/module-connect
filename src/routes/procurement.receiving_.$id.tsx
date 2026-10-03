import { createFileRoute } from "@tanstack/react-router";
import { CommercialDetail } from "@/modules/procurement/commercial/ui";

export const Route = createFileRoute("/procurement/receiving_/$id")({ component: DetailPage });

function DetailPage() {
  const { id } = Route.useParams();
  return <CommercialDetail area="receiving" id={id} />;
}
