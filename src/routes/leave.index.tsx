import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { workers } from "@/mock/data";
import { api } from "@/mock/service";
import type { LeaveRequest } from "@/mock/types";
import { AppShell } from "@/platform/components/AppShell";
import { Async } from "@/platform/components/Async";
import { ListPage } from "@/platform/components/ListPage";
import { PageHeader } from "@/platform/components/PageHeader";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { useMock } from "@/platform/use-mock";

export const Route = createFileRoute("/leave/")({
  head: () => ({
    meta: [
      { title: "Leave requests — Meridian ERP HRM" },
      { name: "description", content: "Every leave request with status, owner, next action and due date." },
      { property: "og:title", content: "Leave requests — Meridian ERP HRM" },
      { property: "og:description", content: "Every leave request with status, owner, next action and due date." },
    ],
  }),
  component: LeaveList,
});

const name = (id: string) => workers.find((w) => w.id === id)?.fullName ?? "Unknown worker";

function LeaveList() {
  const state = useMock(() => api.leaveRequests());
  const [view, setView] = useState("all");

  return (
    <AppShell>
      <PageHeader
        eyebrow="Leave"
        title="Leave requests"
        description="Nothing here is a bare status: each row shows who owns it, what happens next and when it's due."
        primaryAction={
          <Button asChild>
            <Link to="/leave/new">Request leave</Link>
          </Button>
        }
      />
      <Async state={state}>
        {(rows) => (
          <ListPage<LeaveRequest>
            rows={rows.filter((r) => (view === "open" ? !["Approved", "Rejected", "Cancelled"].includes(r.status) : view === "mine" ? r.workerId === "w-1001" : true))}
            savedViews={[
              { id: "all", label: "All requests" },
              { id: "open", label: "Awaiting action" },
              { id: "mine", label: "My requests" },
            ]}
            activeView={view}
            onViewChange={setView}
            searchPlaceholder="Search reference or worker"
            searchFields={(r) => `${r.id} ${name(r.workerId)} ${r.type}`}
            filters={[
              { id: "type", label: "Type", options: ["Annual", "Sick", "Parental", "Unpaid", "Study"], match: (r, v) => r.type === v },
              { id: "status", label: "Status", options: ["Submitted", "In review", "Approved", "Returned"], match: (r, v) => r.status === v },
            ]}
            bulkActions={[{ label: "Export selection", onSelect: () => undefined }]}
            columns={[
              { id: "ref", header: "Reference", cell: (r) => <Link to="/leave/$id" params={{ id: r.id }} className="font-mono text-xs text-primary underline underline-offset-2">{r.id}</Link> },
              { id: "worker", header: "Worker", cell: (r) => <span className="block max-w-56 truncate">{name(r.workerId)}</span> },
              { id: "type", header: "Type", cell: (r) => r.type },
              { id: "dates", header: "Dates", cell: (r) => `${r.from} → ${r.to}` },
              { id: "days", header: "Days", cell: (r) => <span className="tabular">{r.days}</span> },
              { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
              { id: "next", header: "Next action", cell: (r) => <span className="block max-w-56 truncate text-xs">{r.nextAction} · due {r.dueDate}</span> },
              { id: "owner", header: "Owner", defaultVisible: false, cell: (r) => r.owner },
            ]}
          />
        )}
      </Async>
    </AppShell>
  );
}
