import { AlertTriangle, Inbox, Lock, PlugZap, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function Frame({
  icon,
  title,
  body,
  action,
  tone = "neutral",
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
  tone?: "neutral" | "warning" | "danger";
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed bg-surface px-6 py-12 text-center",
        tone === "warning" && "border-warning/40 bg-warning-soft",
        tone === "danger" && "border-danger/40 bg-danger-soft",
      )}
    >
      <div className="mb-3 text-muted-foreground">{icon}</div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export const EmptyState = (p: { title: string; body: string; action?: ReactNode }) => (
  <Frame icon={<Inbox className="size-8" aria-hidden />} {...p} />
);

export const NoResultsState = (p: { title: string; body: string; action?: ReactNode }) => (
  <Frame icon={<SearchX className="size-8" aria-hidden />} {...p} />
);

export const RestrictedState = ({
  title = "You don't have access to this record",
  body = "This record exists outside your permissions, or it doesn't exist. Ask your HR administrator if you believe this is wrong.",
}: {
  title?: string;
  body?: string;
}) => <Frame icon={<Lock className="size-8" aria-hidden />} title={title} body={body} />;

export const DegradedState = ({ service, onRetry }: { service: string; onRetry?: () => void }) => (
  <Frame
    tone="warning"
    icon={<PlugZap className="size-8" aria-hidden />}
    title={`${service} is temporarily unavailable`}
    body="You're seeing a reduced view. Submitted work is safe — nothing has been lost. Try again in a moment."
    action={
      onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      ) : undefined
    }
  />
);

export const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <Frame
    tone="danger"
    icon={<AlertTriangle className="size-8" aria-hidden />}
    title="This didn't load"
    body={message}
    action={
      onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      ) : undefined
    }
  />
);

export const LoadingState = ({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) => (
  <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">{label}</span>
    {Array.from({ length: rows }).map((_, i) => (
      <Skeleton key={i} className="h-14 w-full rounded-lg" />
    ))}
  </div>
);