import { Link } from "@tanstack/react-router";
import { AlertOctagon, CalendarClock, CheckSquare, ChevronRight, ListChecks } from "lucide-react";
import type { WorkItem } from "@/mock/types";
import { EmptyState } from "./States";

const bands = [
  { id: "exception", label: "Urgent exceptions", help: "Blocked or breaching — handle first.", icon: AlertOctagon, tone: "border-danger/40 bg-danger-soft" },
  { id: "approval", label: "Approvals due", help: "Someone is waiting on your decision.", icon: CheckSquare, tone: "border-warning/40 bg-warning-soft" },
  { id: "task", label: "Tasks", help: "Work assigned to you.", icon: ListChecks, tone: "border-border bg-surface" },
  { id: "deadline", label: "Deadlines", help: "Dated commitments coming up.", icon: CalendarClock, tone: "border-info/40 bg-info-soft" },
] as const;

/** Prioritised work queue: exceptions > approvals > tasks > deadlines > metrics. */
export function WorkQueue({ items, metrics }: { items: WorkItem[]; metrics?: { label: string; value: string; hint: string }[] }) {
  if (items.length === 0) {
    return <EmptyState title="Nothing needs you right now" body="New exceptions, approvals and tasks for this workspace will appear here." />;
  }

  return (
    <div className="space-y-8">
      {bands.map((band) => {
        const list = items.filter((i) => i.band === band.id);
        if (!list.length) return null;
        const Icon = band.icon;
        return (
          <section key={band.id} aria-labelledby={`band-${band.id}`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 id={`band-${band.id}`} className="flex items-center gap-2 text-sm font-semibold">
                <Icon className="size-4" aria-hidden />
                {band.label}
                <span className="rounded-full border bg-surface px-2 text-xs font-medium text-muted-foreground">{list.length}</span>
              </h2>
              <p className="text-xs text-muted-foreground">{band.help}</p>
            </div>
            <ul className="mt-3 space-y-2">
              {list.map((i) => (
                <li key={i.id}>
                  <Link
                    to={i.to}
                    params={i.params as never}
                    className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border p-3 transition-colors hover:border-border-strong ${band.tone}`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">{i.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{i.context}</span>
                      <span className={`mt-1 block text-xs font-medium ${i.overdue ? "text-danger" : "text-muted-foreground"}`}>
                        {i.overdue ? "Overdue · " : ""}
                        {i.due}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {metrics?.length ? (
        <section aria-labelledby="band-metrics">
          <h2 id="band-metrics" className="text-sm font-semibold">
            Metrics
          </h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((m) => (
              <div key={m.label} className="rounded-lg border bg-surface p-4">
                <dt className="text-xs text-muted-foreground">{m.label}</dt>
                <dd className="tabular mt-1 text-2xl font-semibold">{m.value}</dd>
                <p className="mt-1 text-xs text-muted-foreground">{m.hint}</p>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}