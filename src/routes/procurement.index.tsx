import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { workspaces } from "@/mock/data";
import { procApi } from "@/modules/procurement/data";
import { useApp } from "@/platform/app-context";
import { AppShell } from "@/platform/components/AppShell";
import { Async } from "@/platform/components/Async";
import { PageHeader } from "@/platform/components/PageHeader";
import { WorkQueue } from "@/platform/components/WorkQueue";
import { useMock } from "@/platform/use-mock";

export const Route = createFileRoute("/procurement/")({
  head: () => ({
    meta: [
      { title: "Home — Meridian ERP Procurement" },
      { name: "description", content: "Your prioritised procurement work queue: exceptions, approvals, tasks and deadlines." },
      { property: "og:title", content: "Home — Meridian ERP Procurement" },
      { property: "og:description", content: "Your prioritised procurement work queue: exceptions, approvals, tasks and deadlines." },
    ],
  }),
  component: ProcHome,
});

const metrics = [
  { label: "Open purchase requests", value: "4", hint: "1 returned, urgent" },
  { label: "Awaiting budget decision", value: "1", hint: "€18,450" },
  { label: "Suppliers on hold", value: "1", hint: "Review 12 Oct" },
  { label: "Spend this quarter", value: "€27.8k", hint: "3 entities" },
];

function ProcHome() {
  const { role } = useApp();
  const queue = useMock(() => procApi.workQueue(role), [role]);
  const ws = workspaces.find((w) => w.id === role)!;

  return (
    <AppShell>
      <PageHeader
        eyebrow={`${ws.label} workspace`}
        title="Procurement home"
        description={`${ws.description}. Items are ordered by urgency — deal with exceptions first.`}
        primaryAction={
          <Button asChild>
            <Link to="/procurement/requests">New purchase request</Link>
          </Button>
        }
      />
      <Async state={queue}>{(items) => <WorkQueue items={items} metrics={metrics} />}</Async>
    </AppShell>
  );
}
