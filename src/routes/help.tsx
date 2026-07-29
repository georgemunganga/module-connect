import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { EmptyState } from "@/platform/components/States";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help — Meridian ERP HRM" },
      { name: "description", content: "Guidance, contact routes and service status." },
      { property: "og:title", content: "Help — Meridian ERP HRM" },
      { property: "og:description", content: "Guidance, contact routes and service status." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <AppShell>
      <PageHeader eyebrow="HRM" title="Help" description="Guidance, contact routes and service status." />
      <EmptyState title="Nothing here yet" body="This screen is part of the next build slice. The shell, navigation and component library it will use are already in place." />
    </AppShell>
  );
}
