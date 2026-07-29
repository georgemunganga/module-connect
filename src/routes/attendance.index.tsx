import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { EmptyState } from "@/platform/components/States";

export const Route = createFileRoute("/attendance/")({
  head: () => ({
    meta: [
      { title: "Attendance corrections — Meridian ERP HRM" },
      { name: "description", content: "Review and correct clocking exceptions with a full audit trail." },
      { property: "og:title", content: "Attendance corrections — Meridian ERP HRM" },
      { property: "og:description", content: "Review and correct clocking exceptions with a full audit trail." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <AppShell>
      <PageHeader eyebrow="HRM" title="Attendance corrections" description="Review and correct clocking exceptions with a full audit trail." />
      <EmptyState title="Nothing here yet" description="This screen is part of the next build slice. The shell, navigation and component library it will use are already in place." />
    </AppShell>
  );
}
