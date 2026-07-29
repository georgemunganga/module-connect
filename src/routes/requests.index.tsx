import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { EmptyState } from "@/platform/components/States";

export const Route = createFileRoute("/requests/")({
  head: () => ({
    meta: [
      { title: "HR requests — Meridian ERP HRM" },
      { name: "description", content: "Raise and track HR cases: letters, data changes and queries." },
      { property: "og:title", content: "HR requests — Meridian ERP HRM" },
      { property: "og:description", content: "Raise and track HR cases: letters, data changes and queries." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <AppShell>
      <PageHeader eyebrow="HRM" title="HR requests" description="Raise and track HR cases: letters, data changes and queries." />
      <EmptyState title="Nothing here yet" body="This screen is part of the next build slice. The shell, navigation and component library it will use are already in place." />
    </AppShell>
  );
}
