import { AlertTriangle, Ban, CheckCircle2, Clock, FileEdit, RotateCcw, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const map: Record<string, { tone: Tone; icon: typeof Clock }> = {
  Draft: { tone: "neutral", icon: FileEdit },
  Submitted: { tone: "info", icon: Clock },
  "In review": { tone: "info", icon: Clock },
  Approved: { tone: "success", icon: CheckCircle2 },
  Returned: { tone: "warning", icon: RotateCcw },
  Rejected: { tone: "danger", icon: XCircle },
  Cancelled: { tone: "neutral", icon: Ban },
  Active: { tone: "success", icon: CheckCircle2 },
  "On leave": { tone: "info", icon: Clock },
  "Notice period": { tone: "warning", icon: AlertTriangle },
  "Pre-hire": { tone: "neutral", icon: Clock },
  Terminated: { tone: "neutral", icon: Ban },
};

const toneClass: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-info-soft text-info border-info/30",
  success: "bg-success-soft text-success border-success/30",
  warning: "bg-warning-soft text-warning border-warning/40",
  danger: "bg-danger-soft text-danger border-danger/30",
};

/** Status is never colour-only: every badge carries an icon and a text label. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const conf = map[status] ?? { tone: "neutral" as Tone, icon: Clock };
  const Icon = conf.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        toneClass[conf.tone],
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {status}
    </span>
  );
}