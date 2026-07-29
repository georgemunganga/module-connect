import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  primaryAction,
  meta,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  /** Exactly one primary action per screen. */
  primaryAction?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 border-b pb-5 sm:flex sm:flex-wrap sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
        {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {primaryAction ? <div className="shrink-0">{primaryAction}</div> : null}
    </header>
  );
}