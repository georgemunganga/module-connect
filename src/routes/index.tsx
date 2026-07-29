import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { workspaces } from "@/mock/data";
import { api } from "@/mock/service";
import { useApp } from "@/platform/app-context";
import { AppShell } from "@/platform/components/AppShell";
import { Async } from "@/platform/components/Async";
import { PageHeader } from "@/platform/components/PageHeader";
import { WorkQueue } from "@/platform/components/WorkQueue";
import { useMock } from "@/platform/use-mock";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home — Meridian ERP HRM" },
      { name: "description", content: "Your prioritised HR work queue: exceptions, approvals, tasks and deadlines." },
      { property: "og:title", content: "Home — Meridian ERP HRM" },
      { property: "og:description", content: "Your prioritised HR work queue: exceptions, approvals, tasks and deadlines." },
    ],
  }),
  component: Home,
});

const metrics = [
  { label: "Open leave requests", value: "4", hint: "1 breaching policy" },
  { label: "Attendance exceptions", value: "2", hint: "Oldest 6 days" },
  { label: "HR cases open", value: "1", hint: "SLA 4 Aug" },
  { label: "Workers in scope", value: "8", hint: "3 entities" },
];

function Home() {
  const { role, setupComplete, hydrated } = useApp();
  const queue = useMock(() => api.workQueue(role), [role]);
  const ws = workspaces.find((w) => w.id === role)!;

  return (
    <AppShell>
      {hydrated && !setupComplete ? (
        <div className="rounded-lg border border-primary/40 bg-primary-soft p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-primary">
            <Rocket className="size-4" aria-hidden />
            Finish setting up HR before going live
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-foreground">
            This workspace is still in setup. Home switches to your normal work queue once the guide
            is complete. It takes about ten minutes and you can stop and resume at any point.
          </p>
          <Button asChild className="mt-4">
            <Link to="/setup">
              Continue setup
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      ) : null}

      <PageHeader
        eyebrow={`${ws.label} workspace`}
        title="Home"
        description={`${ws.description}. Items are ordered by urgency — deal with exceptions first.`}
        primaryAction={
          <Button asChild>
            <Link to="/leave/new">Request leave</Link>
          </Button>
        }
      />

      <Async state={queue}>{(items) => <WorkQueue items={items} metrics={metrics} />}</Async>
    </AppShell>
  );
}
