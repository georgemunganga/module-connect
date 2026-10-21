import { createFileRoute } from "@tanstack/react-router";
import { CommercialList, commercialSearch } from "@/modules/procurement/commercial/ui";
import type { CommercialSearch } from "@/modules/procurement/commercial/ui";

export const Route = createFileRoute("/procurement/orders")({
  validateSearch: commercialSearch,
  component: Page,
});

function Page() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const setSearch = (change: Partial<CommercialSearch>) =>
    navigate({ search: (current) => ({ ...current, ...change }), replace: true });
  return <CommercialList area="orders" search={search} setSearch={setSearch} />;
}
