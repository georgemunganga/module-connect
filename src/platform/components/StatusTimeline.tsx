import { ArrowRight, Paperclip } from "lucide-react";
import type { TimelineEvent } from "@/mock/types";

function when(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StatusTimeline({ events, title = "History" }: { events: TimelineEvent[]; title?: string }) {
  return (
    <section aria-label={title}>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <ol className="mt-3 space-y-4">
        {events.map((e) => (
          <li key={e.id} className="relative pl-6">
            <span
              aria-hidden
              className="absolute left-0 top-1.5 size-2.5 rounded-full border-2 border-primary bg-surface"
            />
            <span aria-hidden className="absolute left-[4px] top-5 h-[calc(100%-0.25rem)] w-px bg-border last:hidden" />
            <p className="text-sm font-medium text-foreground">{e.event}</p>
            <p className="text-xs text-muted-foreground">
              {e.actor} · <time dateTime={e.at}>{when(e.at)}</time>
            </p>
            {e.reason ? <p className="mt-1 text-sm text-muted-foreground">Reason: {e.reason}</p> : null}
            {e.before || e.after ? (
              <p className="mt-1 inline-flex items-center gap-1.5 rounded border bg-surface-muted px-2 py-0.5 text-xs">
                <span>{e.before ?? "—"}</span>
                <ArrowRight className="size-3" aria-hidden />
                <span className="font-medium">{e.after ?? "—"}</span>
              </p>
            ) : null}
            {e.evidence ? (
              <a
                href={e.evidence.href}
                className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-primary underline underline-offset-2"
              >
                <Paperclip className="size-3" aria-hidden />
                {e.evidence.label}
              </a>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}