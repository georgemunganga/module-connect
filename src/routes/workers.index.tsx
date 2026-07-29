import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { entities } from "@/mock/data";
import { api } from "@/mock/service";
import type { Worker } from "@/mock/types";
import { AppShell } from "@/platform/components/AppShell";
import { Async } from "@/platform/components/Async";
import { ListPage } from "@/platform/components/ListPage";
import type { ColumnDef } from "@/platform/components/ListPage";
import { PageHeader } from "@/platform/components/PageHeader";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { useMock } from "@/platform/use-mock";

export const Route = createFileRoute("/workers/")({
  head: () => ({
    meta: [
      { title: "Workers — Meridian ERP HRM" },
      { name: "description", content: "Filterable worker directory across entities, branches and worker types." },
      { property: "og:title", content: "Workers — Meridian ERP HRM" },
      { property: "og:description", content: "Filterable worker directory across entities, branches and worker types." },
    ],
  }),
  component: WorkersPage,
});

const views = [
  { id: "all", label: "All workers" },
  { id: "active", label: "Active only" },
  { id: "ending", label: "Contracts ending" },
  { id: "prehire", label: "Pre-hire" },
];

function WorkersPage() {
  const state = useMock(() => api.workers());
  const [view, setView] = useState("all");

  const columns: ColumnDef<Worker>[] = [
    {
      id: "name",
      header: "Worker",
      cell: (w) => (
        <div className="min-w-0 max-w-64">
          <Link to="/workers/$id" params={{ id: w.id }} className="block truncate font-medium text-primary underline-offset-2 hover:underline">
            {w.fullName}
          </Link>
          <span className="block truncate text-xs text-muted-foreground">{w.employeeNo}</span>
        </div>
      ),
    },
    { id: "title", header: "Job title", cell: (w) => <span className="block max-w-56 truncate">{w.jobTitle}</span> },
    { id: "dept", header: "Department", cell: (w) => w.department },
    { id: "entity", header: "Entity", cell: (w) => entities.find((e) => e.id === w.entityId)?.name.split(" ").slice(0, 2).join(" ") },
    { id: "branch", header: "Branch", cell: (w) => w.branch },
    { id: "type", header: "Type", cell: (w) => w.workerType },
    { id: "status", header: "Status", cell: (w) => <StatusBadge status={w.status} /> },
    { id: "grade", header: "Grade", defaultVisible: false, cell: (w) => w.grade },
    { id: "start", header: "Start date", defaultVisible: false, cell: (w) => w.startDate },
    { id: "email", header: "Work email", defaultVisible: false, cell: (w) => w.email ?? <span className="text-muted-foreground">Not recorded</span> },
  ];

  return (
    <AppShell>
      <PageHeader
        eyebrow="People"
        title="Workers"
        description="Everyone in scope for your entity and branch access. Select rows for bulk actions."
        primaryAction={<Button>Add worker</Button>}
      />
      <Async state={state} rows={6}>
        {(rows) => (
          <ListPage
            rows={rows.filter((w) =>
              view === "active" ? w.status === "Active" : view === "ending" ? Boolean(w.endDate) : view === "prehire" ? w.status === "Pre-hire" : true,
            )}
            columns={columns}
            savedViews={views}
            activeView={view}
            onViewChange={setView}
            searchPlaceholder="Search name, number or job title"
            searchFields={(w) => `${w.fullName} ${w.employeeNo} ${w.jobTitle} ${w.department}`}
            filters={[
              { id: "entity", label: "Entity", options: entities.map((e) => e.name), match: (w, v) => entities.find((e) => e.id === w.entityId)?.name === v },
              { id: "type", label: "Worker type", options: ["Permanent", "Fixed term", "Contractor", "Intern", "Part time"], match: (w, v) => w.workerType === v },
              { id: "status", label: "Status", options: ["Active", "On leave", "Notice period", "Pre-hire"], match: (w, v) => w.status === v },
            ]}
            bulkActions={[
              { label: "Export selection", onSelect: () => undefined },
              { label: "Assign to manager", onSelect: () => undefined },
            ]}
            rowHref={(w) => (
              <Link to="/workers/$id" params={{ id: w.id }} className="text-xs font-medium text-primary underline underline-offset-2">
                Open
              </Link>
            )}
          />
        )}
      </Async>
    </AppShell>
  );
}
