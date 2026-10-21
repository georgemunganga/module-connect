import { createFileRoute } from "@tanstack/react-router";
import { CommercialDetail, commercialSearch } from "@/modules/procurement/commercial/ui";

export const Route = createFileRoute("/procurement/receiving_/$id")({ validateSearch: commercialSearch, component: DetailPage });

function DetailPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  return <CommercialDetail area="receiving" id={id} search={search} />;
}
