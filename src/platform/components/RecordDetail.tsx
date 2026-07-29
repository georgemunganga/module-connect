import type { ReactNode } from "react";
import { StatusBadge } from "./StatusBadge";

export interface RecordSummaryItem {
  label: string;
  value: ReactNode;
}

/**
 * Record detail scaffold: identity/status header, exactly one primary action,
 * summary facts, disclosed sections, timeline and related records.
 */
export function RecordDetail({
  reference,
  title,
  subtitle,
  status,
  owner,
  nextAction,
  dueDate,
  primaryAction,
  secondaryActions,
  summary,
  children,
  timeline,
  related,
}: {
  reference: string;
  title: string;
  subtitle?: string;
  status: string;
  owner: string;
  nextAction: string;
  dueDate?: string;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  summary: RecordSummaryItem[];
  children?: ReactNode;
  timeline?: ReactNode;
  related?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <header className="rounded-lg border bg-surface p-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-xs text-muted-foreground">{reference}</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={status} />
              <span className="text-xs text-muted-foreground">Owner: {owner}</span>
              {dueDate ? <span className="text-xs text-muted-foreground">Due: {dueDate}</span> : null}
            </div>
          </div>
          {primaryAction ? <div className="shrink-0">{primaryAction}</div> : null}
        </div>
        <p className="mt-4 rounded-md border border-info/30 bg-info-soft px-3 py-2 text-sm text-info">
          Next action: {nextAction}
        </p>
        {secondaryActions ? <div className="mt-3 flex flex-wrap gap-2">{secondaryActions}</div> : null}
      </header>

      <section aria-label="Summary" className="rounded-lg border bg-surface p-5">
        <h2 className="text-sm font-semibold">Summary</h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summary.map((s) => (
            <div key={s.label} className="min-w-0">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</dt>
              <dd className="mt-1 text-sm text-foreground">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {children}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {timeline ? <div className="rounded-lg border bg-surface p-5">{timeline}</div> : <div />}
        {related ? (
          <aside className="rounded-lg border bg-surface p-5">
            <h2 className="text-sm font-semibold">Related records</h2>
            <div className="mt-3 space-y-2 text-sm">{related}</div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export function DetailSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="rounded-lg border bg-surface p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}