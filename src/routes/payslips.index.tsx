import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { EmptyState } from "@/platform/components/States";

export const Route = createFileRoute("/payslips/")({
  head: () => ({
    meta: [
      { title: "Payslips — Meridian ERP HRM" },
      { name: "description", content: "Your pay history, each with a full explanation of how it was calculated." },
      { property: "og:title", content: "Payslips — Meridian ERP HRM" },
      { property: "og:description", content: "Your pay history, each with a full explanation of how it was calculated." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <AppShell>
      <PageHeader eyebrow="HRM" title="Payslips" description="Your pay history, each with a full explanation of how it was calculated." />
      <EmptyState title="Nothing here yet" body="This screen is part of the next build slice. The shell, navigation and component library it will use are already in place." />
    </AppShell>
  );
}
