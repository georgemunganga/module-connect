import { createFileRoute, Link } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/platform/app-context";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { EmptyState, RestrictedState } from "@/platform/components/States";
import { useProcurement } from "@/modules/procurement/store";
import { sameEntity } from "@/modules/procurement/access";
import { money } from "@/modules/procurement/catalog";
import {
  decideBudgetException,
  requestBudgetException,
  useBudgetExceptions,
} from "@/modules/procurement/budget-exceptions";
import type { ApprovalTask } from "@/modules/procurement/approvals";
import type { BudgetException } from "@/modules/procurement/budget-exceptions";

export const Route = createFileRoute("/procurement/budgets")({
  head: () => ({
    meta: [
      { title: "Budget visibility — Meridian ERP Procurement" },
      {
        name: "description",
        content:
          "Procurement budget check results and exceptions; Finance owns balances and reservations.",
      },
    ],
  }),
  component: BudgetVisibility,
});

function BudgetVisibility() {
  const { role, entityId, approvalActor } = useApp();
  const tasks = useProcurement().approvals.filter((task) =>
    sameEntity(task.recordEntity, entityId) &&
    (role !== "manager" || task.assignee === approvalActor || budgetOwner(task.recordEntity) === approvalActor),
  );
  const exceptions = useBudgetExceptions();
  if (!["manager", "buyer", "proc_admin", "auditor"].includes(role))
    return (
      <AppShell>
        <RestrictedState />
      </AppShell>
    );
  const failures = tasks.filter(
    (task) => task.budget.kind === "hard-fail" && !task.exception,
  ).length;
  const reservations = tasks.filter((task) => task.budget.kind === "reservation").length;
  const pending = exceptions.filter(
    (record) =>
      tasks.some((task) => task.id === record.taskId) && record.status === "Pending budget owner",
  ).length;
  return (
    <AppShell>
      <PageHeader
        eyebrow="Purchasing / Finance"
        title="Budgets"
        description="See each request's budget check and ask the right person to review an exception."
      />
      <p
        role="note"
        className="mt-5 flex gap-2 rounded-lg border border-info/40 bg-info-soft p-4 text-sm"
      >
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        This page uses demo data. Exception reviews here do not change Finance balances, reserve
        money, clear a failed check, or approve a purchase. Only Finance can confirm funding.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <Summary label="Requests checked" value={tasks.length} />
        <Summary label="Blocked by budget" value={failures} />
        <Summary label="Review requested" value={pending} />
        <Summary label="Finance reservations in sample data" value={reservations} />
      </div>
      {!tasks.some((task) => task.budget.kind === "unavailable") ? (
        <p className="mt-4 rounded-md border bg-surface-muted p-3 text-xs text-muted-foreground">
          If a Finance budget check is unavailable, the request shows “Finance check unavailable”
          and stays blocked until an authorized check returns. No funds are assumed.
        </p>
      ) : null}
      <section className="mt-6" aria-labelledby="budget-checks-h">
        <h2 id="budget-checks-h" className="mb-3 text-sm font-semibold">
          Budget checks
        </h2>
        {tasks.length ? (
          <ul className="space-y-3">
            {tasks.map((task) => (
              <li key={task.id} className="rounded-lg border bg-surface p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      to="/procurement/approvals/$id"
                      params={{ id: task.id }}
                      className="font-medium text-primary hover:underline"
                    >
                      {task.subject} · {task.recordId}
                    </Link>
                    <p className="mt-1 text-muted-foreground">
                      {task.amount
                        ? money(task.amount.value, task.amount.currency)
                        : "Amount unavailable"}{" "}
                      · {task.recordEntity}
                    </p>
                  </div>
                  <span className="rounded-full border px-2 py-1 text-xs font-medium">
                    {task.budget.kind === "hard-fail"
                      ? "Budget check failed"
                      : task.budget.kind === "reservation"
                        ? "Finance reservation recorded"
                        : task.budget.kind === "unavailable"
                          ? "Finance check unavailable"
                          : "Estimate only"}
                  </span>
                </div>
                <p className="mt-3">{task.budget.detail}</p>
                {task.budget.kind === "hard-fail" ? (
                  <p className="mt-2 text-xs text-danger">
                    Approval and ordering stay blocked until Finance confirms funding. A local
                    review does not unblock them.
                  </p>
                ) : null}
                {task.budget.kind === "unavailable" ? (
                  <p className="mt-2 rounded-md bg-warning-soft p-3 text-xs">
                    Finance has not returned a result. Retry through the authorized Finance process;
                    no reservation is assumed.
                  </p>
                ) : null}
                {task.exception ? (
                  <p className="mt-2 text-xs">
                    Earlier approved exception in sample data: {task.exception.approver} ·{" "}
                    {task.exception.evidence}. Finance funding status must still be checked
                    separately.
                  </p>
                ) : null}
                <ExceptionReview
                  task={task}
                  history={exceptions.filter((record) => record.taskId === task.id)}
                  role={role}
                  approvalActor={approvalActor}
                />
                <details className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-medium">See check details</summary>
                  <p className="mt-2">
                    Checked {task.budget.at} by {task.budget.source} · rules {task.policyVersion}
                    {task.budget.kind === "reservation"
                      ? ` · reference ${task.budget.reference}`
                      : ""}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No budget checks here yet"
            body="Budget checks will appear when a purchase request needs approval."
          />
        )}
      </section>
    </AppShell>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

const budgetOwner = (entity: string) =>
  entity.includes("Kenya")
    ? "Grace Wanjiru"
    : entity.includes("Germany")
      ? "Joost Meijer"
      : "Marieke Hoek";

function ExceptionReview({
  task,
  history,
  role,
  approvalActor,
}: {
  task: ApprovalTask;
  history: BudgetException[];
  role: string;
  approvalActor: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [decisionReason, setDecisionReason] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const owner = budgetOwner(task.recordEntity);
  const pending = history.some((record) => record.status === "Pending budget owner");
  const canRequest =
    ["manager", "buyer", "proc_admin"].includes(role) &&
    !(role === "manager" && approvalActor === owner) &&
    task.budget.kind === "hard-fail" &&
    !task.exception &&
    !pending;
  const submit = () => {
    try {
      requestBudgetException({
        taskId: task.id,
        requestId: task.recordId,
        policyVersion: task.policyVersion,
        requestedBy: role === "manager" ? approvalActor : "Procurement buyer (demo)",
        owner,
        reason,
        evidenceReference: evidence,
      });
      setNotice("Review requested. The failed budget check still blocks approval and ordering.");
      setOpen(false);
      setReason("");
      setEvidence("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not request a budget review.");
    }
  };
  const decide = (
    record: BudgetException,
    result: "Denied" | "Supported — Finance review needed",
  ) => {
    try {
      decideBudgetException(record.id, approvalActor, result, decisionReason[record.id] ?? "");
      setNotice(
        result === "Denied"
          ? "Budget owner declined the exception. The request stays blocked."
          : "Budget owner supported Finance review. The request stays blocked until Finance confirms funding.",
      );
      setDecisionReason((current) => ({ ...current, [record.id]: "" }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not record the decision.");
    }
  };
  return (
    <div className="mt-4">
      {notice ? (
        <p role="alert" className="mb-3 rounded-md border p-3 text-xs">
          {notice}
        </p>
      ) : null}
      {history.length ? (
        <div className="border-t pt-3">
          <h3 className="font-medium">Exception review history</h3>
          <ol className="mt-2 space-y-2">
            {history.map((record) => (
              <li key={record.id} className="rounded-md bg-surface-muted p-3 text-xs">
                <strong>{record.status}</strong> · requested {record.requestedAt} by{" "}
                {record.requestedBy} · owner {record.owner}
                <p className="mt-1">Reason: {record.reason}</p>
                <p>
                  Evidence reference: {record.evidenceReference} (reference only; no file uploaded)
                </p>
                <p>Policy: {record.policyVersion}</p>
                {record.decidedBy ? (
                  <p className="mt-1">
                    Decision: {record.decidedBy} · {record.decidedAt} · {record.decisionReason}
                  </p>
                ) : null}
                {record.status === "Pending budget owner" &&
                role === "manager" &&
                approvalActor === record.owner &&
                approvalActor !== record.requestedBy ? (
                  <div className="mt-3">
                    <Label htmlFor={`decision-${record.id}`}>Decision reason</Label>
                    <Textarea
                      id={`decision-${record.id}`}
                      value={decisionReason[record.id] ?? ""}
                      onChange={(event) =>
                        setDecisionReason((current) => ({
                          ...current,
                          [record.id]: event.target.value,
                        }))
                      }
                      className="mt-1 bg-surface"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!decisionReason[record.id]?.trim()}
                        onClick={() => decide(record, "Denied")}
                      >
                        Decline
                      </Button>
                      <Button
                        size="sm"
                        disabled={!decisionReason[record.id]?.trim()}
                        onClick={() => decide(record, "Supported — Finance review needed")}
                      >
                        Support for Finance review
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {canRequest ? (
        open ? (
          <div className="mt-3 rounded-md border p-3">
            <h3 className="font-medium">Ask for budget review</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Send to {owner}. This creates only a demo review record.
            </p>
            <div className="mt-3">
              <Label htmlFor={`reason-${task.id}`}>Why is an exception needed?</Label>
              <Textarea
                id={`reason-${task.id}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-1"
              />
            </div>
            <div className="mt-3">
              <Label htmlFor={`evidence-${task.id}`}>Evidence reference</Label>
              <Input
                id={`evidence-${task.id}`}
                value={evidence}
                onChange={(event) => setEvidence(event.target.value)}
                placeholder="Document or case reference"
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">This demo does not upload files.</p>
            </div>
            <div className="mt-3 flex gap-2">
              <Button disabled={!reason.trim() || !evidence.trim()} onClick={submit}>
                Request review
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setOpen(true);
              setNotice("");
            }}
          >
            Ask for budget review
          </Button>
        )
      ) : null}
    </div>
  );
}
