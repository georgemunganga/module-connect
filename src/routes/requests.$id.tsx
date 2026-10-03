import { createFileRoute } from "@tanstack/react-router";
import { workers } from "@/mock/data";
import { api } from "@/mock/service";
import { AppShell } from "@/platform/components/AppShell";
import { Async } from "@/platform/components/Async";
import { RecordDetail } from "@/platform/components/RecordDetail";
import { RestrictedState } from "@/platform/components/States";
import { StatusTimeline } from "@/platform/components/StatusTimeline";
import { useMock } from "@/platform/use-mock";

export const Route = createFileRoute("/requests/$id")({
  head: () => ({
    meta: [
      { title: "HR request — Meridian ERP HRM" },
      { name: "description", content: "Track an HR case: status, owner, next action and full history." },
      { property: "og:title", content: "HR request — Meridian ERP HRM" },
      { property: "og:description", content: "Track an HR case: status, owner, next action and full history." },
    ],
  }),
  component: CaseDetail,
});

function CaseDetail() {
  const { id } = Route.useParams();
  const state = useMock(() => api.caseItem(id), [id]);

  return (
    <AppShell>
      <Async state={state} rows={3}>
        {(c) => {
          if (!c) return <RestrictedState />;
          const w = workers.find((x) => x.id === c.workerId);
          return (
            <RecordDetail
              reference={c.id}
              title={`${c.category} — ${c.subject}`}
              subtitle={w?.fullName ?? "Unknown worker"}
              status={c.status}
              owner={c.owner}
              nextAction={`${c.nextAction} · due ${c.dueDate}`}
              summary={[
                { label: "Worker", value: w?.fullName },
                { label: "Category", value: c.category },
                { label: "Priority", value: c.priority },
                { label: "Detail", value: c.detail },
              ]}
              timeline={<StatusTimeline title="History" events={c.timeline} />}
            />
          );
        }}
      </Async>
    </AppShell>
  );
}
