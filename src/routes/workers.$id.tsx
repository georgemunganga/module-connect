import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { entities } from "@/mock/data";
import { api } from "@/mock/service";
import { AppShell } from "@/platform/components/AppShell";
import { Async } from "@/platform/components/Async";
import { DetailSection, RecordDetail } from "@/platform/components/RecordDetail";
import { RestrictedState } from "@/platform/components/States";
import { MaskedValue } from "@/platform/components/Sensitive";
import { StatusTimeline } from "@/platform/components/StatusTimeline";
import { useMock } from "@/platform/use-mock";

export const Route = createFileRoute("/workers/$id")({
  head: () => ({
    meta: [
      { title: "Employee profile — Meridian ERP HRM" },
      { name: "description", content: "Employment record: identity, contract, pay context, history and related records." },
      { property: "og:title", content: "Employee profile — Meridian ERP HRM" },
      { property: "og:description", content: "Employment record: identity, contract, pay context, history and related records." },
    ],
  }),
  component: WorkerPage,
});

function WorkerPage() {
  const { id } = Route.useParams();
  const state = useMock(() => api.worker(id), [id]);

  return (
    <AppShell>
      <Async state={state} rows={3}>
        {(w) =>
          !w ? (
            <RestrictedState />
          ) : (
            <RecordDetail
              reference={w.employeeNo}
              title={w.fullName}
              subtitle={`${w.jobTitle} · ${w.department}`}
              status={w.status}
              owner={w.managerId ? "Joost Meijer (Manager)" : "HR operations"}
              nextAction={
                w.status === "Pre-hire"
                  ? `Complete onboarding before ${w.startDate}`
                  : w.endDate
                    ? `Confirm contract intention before ${w.endDate}`
                    : "No action required"
              }
              primaryAction={<Button>Start a change</Button>}
              secondaryActions={
                <>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/leave/new">Request leave</Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/requests/new">Raise HR request</Link>
                  </Button>
                </>
              }
              summary={[
                { label: "Employee number", value: w.employeeNo },
                { label: "Worker type", value: w.workerType },
                { label: "Legal entity", value: entities.find((e) => e.id === w.entityId)?.name },
                { label: "Branch", value: w.branch },
                { label: "Location", value: w.location },
                { label: "Start date", value: w.startDate },
                { label: "End date", value: w.endDate ?? <span className="text-muted-foreground">Not applicable</span> },
                { label: "Grade", value: w.grade },
                { label: "Work email", value: w.email ?? <span className="text-muted-foreground">Not recorded</span> },
                { label: "Phone", value: w.phone ?? <span className="text-muted-foreground">Not recorded</span> },
                { label: "Leave balance", value: `${w.leaveBalance} days` },
                {
                  label: "Future-effective change",
                  value: w.futureEffective ? `${w.futureEffective.change} from ${w.futureEffective.effectiveFrom}` : <span className="text-muted-foreground">None scheduled</span>,
                },
              ]}
              timeline={
                <StatusTimeline
                  title="Employment history"
                  events={[
                    { id: "e1", at: `${w.startDate}T09:00:00Z`, actor: "HR operations", event: "Hired", after: w.jobTitle },
                    { id: "e2", at: "2025-01-01T09:00:00Z", actor: "System", event: "Annual salary review applied", before: "Grade " + w.grade, after: "Grade " + w.grade, evidence: { label: "Review letter", href: "#" } },
                    ...(w.futureEffective
                      ? [{ id: "e3", at: `${w.futureEffective.effectiveFrom}T09:00:00Z`, actor: "Joost Meijer", event: "Scheduled change (future-effective)", after: w.futureEffective.change }]
                      : []),
                  ]}
                />
              }
              related={
                <>
                  <Link to="/leave" className="block text-primary underline underline-offset-2">Leave requests</Link>
                  <Link to="/attendance" className="block text-primary underline underline-offset-2">Attendance corrections</Link>
                  <Link to="/payslips" className="block text-primary underline underline-offset-2">Payslips</Link>
                </>
              }
            >
              <DetailSection
                title="Sensitive details"
                description="Masked by default. Revealing a value is a deliberate, recorded action."
              >
                <dl className="grid gap-4 sm:grid-cols-2">
                  <MaskedValue label="National identifier" value={w.nationalId} />
                  <MaskedValue label="Bank account" value={w.bankAccount} />
                </dl>
              </DetailSection>
            </RecordDetail>
          )
        }
      </Async>
    </AppShell>
  );
}
