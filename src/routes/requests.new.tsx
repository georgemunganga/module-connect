import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { EmptyState } from "@/platform/components/States";

export const Route = createFileRoute("/requests/new")({
  head: () => ({
    meta: [
      { title: "Raise an HR request — Meridian ERP HRM" },
      { name: "description", content: "Guided case submission with purpose, details, evidence and next steps." },
      { property: "og:title", content: "Raise an HR request — Meridian ERP HRM" },
      { property: "og:description", content: "Guided case submission with purpose, details, evidence and next steps." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <AppShell>
      <PageHeader eyebrow="HRM" title="Raise an HR request" description="Guided case submission with purpose, details, evidence and next steps." />
      <EmptyState title="Nothing here yet" description="This screen is part of the next build slice. The shell, navigation and component library it will use are already in place." />
    </AppShell>
  );
}
