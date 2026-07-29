import { createFileRoute } from "@tanstack/react-router";
import { workers } from "@/mock/data";
import { api } from "@/mock/service";
import { AppShell } from "@/platform/components/AppShell";
import { Async } from "@/platform/components/Async";
import { ApprovalPanel } from "@/platform/components/ApprovalPanel";
import { RecordDetail } from "@/platform/components/RecordDetail";
import { RestrictedState } from "@/platform/components/States";
import { StatusTimeline } from "@/platform/components/StatusTimeline";
import { useMock } from "@/platform/use-mock";

export const Route = createFileRoute("/leave/$id")({
  head: () => ({
    meta: [
      { title: "Leave decision — Meridian ERP HRM" },
      { name: "description", content: "Approve, return, reject or delegate a leave request with full policy context." },
      { property: "og:title", content: "Leave decision — Meridian ERP HRM" },
      { property: "og:description", content: "Approve, return, reject or delegate a leave request with full policy context." },
    ],
  }),
  component: LeaveDetail,
});

function LeaveDetail() {
  const { id } = Route.useParams();
  const state = useMock(() => api.leaveRequest(id), [id]);

  return (
    <AppShell>
      <Async state={state} rows={3}>
        {(r) => {
          if (!r) return <RestrictedState />;
          const w = workers.find((x) => x.id === r.workerId);
          return (
            <RecordDetail
              reference={r.id}
              title={`${r.type} leave — ${w?.fullName ?? "Unknown worker"}`}
              subtitle={`${r.from} → ${r.to} · ${r.days} days`}
              status={r.status}
              owner={r.owner}
              nextAction={`${r.nextAction} · due ${r.dueDate}`}
              summary={[
                { label: "Worker", value: w?.fullName },
                { label: "Job title", value: w?.jobTitle },
                { label: "Leave type", value: r.type },
                { label: "Days", value: r.days },
                { label: "Balance after", value: `${(w?.leaveBalance ?? 0) - r.days} days` },
                { label: "Reason", value: r.reason ?? "Not given" },
              ]}
              timeline={<StatusTimeline title="History" events={r.timeline} />}
            >
              <ApprovalPanel
                decisionSummary={`Approve ${r.days} days of ${r.type.toLowerCase()} leave for ${w?.fullName ?? "this worker"}.`}
                policy={r.policy}
                conflicts={r.conflicts}
                onDecision={() => undefined}
              />
            </RecordDetail>
          );
        }}
      </Async>
    </AppShell>
  );
}
