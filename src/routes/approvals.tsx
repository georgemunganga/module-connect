import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { EmptyState } from "@/platform/components/States";

export const Route = createFileRoute("/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals — Meridian ERP HRM" },
      { name: "description", content: "Everything waiting on your decision, oldest and highest risk first." },
      { property: "og:title", content: "Approvals — Meridian ERP HRM" },
      { property: "og:description", content: "Everything waiting on your decision, oldest and highest risk first." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <AppShell>
      <PageHeader eyebrow="HRM" title="Approvals" description="Everything waiting on your decision, oldest and highest risk first." />
      <EmptyState title="Nothing here yet" description="This screen is part of the next build slice. The shell, navigation and component library it will use are already in place." />
    </AppShell>
  );
}
