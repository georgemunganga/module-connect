import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { EmptyState } from "@/platform/components/States";

export const Route = createFileRoute("/speak-up")({
  head: () => ({
    meta: [
      { title: "Protected disclosure — Meridian ERP HRM" },
      { name: "description", content: "Raise a concern anonymously. No account required and minimal metadata is stored." },
      { property: "og:title", content: "Protected disclosure — Meridian ERP HRM" },
      { property: "og:description", content: "Raise a concern anonymously. No account required and minimal metadata is stored." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <AppShell>
      <PageHeader eyebrow="HRM" title="Protected disclosure" description="Raise a concern anonymously. No account required and minimal metadata is stored." />
      <EmptyState title="Nothing here yet" body="This screen is part of the next build slice. The shell, navigation and component library it will use are already in place." />
    </AppShell>
  );
}
