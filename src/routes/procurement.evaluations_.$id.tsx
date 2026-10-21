import { createFileRoute } from "@tanstack/react-router";
import { CommercialDetail, commercialSearch } from "@/modules/procurement/commercial/ui";

export const Route = createFileRoute("/procurement/evaluations_/$id")({ validateSearch: commercialSearch, component: DetailPage });

function DetailPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  return <CommercialDetail area="evaluations" id={id} search={search} />;
}
