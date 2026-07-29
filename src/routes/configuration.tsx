import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { EmptyState } from "@/platform/components/States";

export const Route = createFileRoute("/configuration")({
  head: () => ({
    meta: [
      { title: "Configuration — Meridian ERP HRM" },
      { name: "description", content: "The single entry point for business setup, process design, security and technical settings." },
      { property: "og:title", content: "Configuration — Meridian ERP HRM" },
      { property: "og:description", content: "The single entry point for business setup, process design, security and technical settings." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <AppShell>
      <PageHeader eyebrow="HRM" title="Configuration" description="The single entry point for business setup, process design, security and technical settings." />
      <EmptyState title="Nothing here yet" body="This screen is part of the next build slice. The shell, navigation and component library it will use are already in place." />
    </AppShell>
  );
}
