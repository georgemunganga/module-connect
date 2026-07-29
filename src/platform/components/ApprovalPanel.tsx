import { AlertTriangle, CheckCircle2, Paperclip, XCircle } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PolicyResult } from "@/mock/types";

type Decision = "approve" | "return" | "reject" | "delegate";

const negative: Decision[] = ["return", "reject", "delegate"];

const outcomeMeta = {
  pass: { icon: CheckCircle2, cls: "text-success", label: "Pass" },
  warn: { icon: AlertTriangle, cls: "text-warning", label: "Check" },
  fail: { icon: XCircle, cls: "text-danger", label: "Fail" },
} as const;

export function ApprovalPanel({
  decisionSummary,
  policy,
  conflicts,
  evidence,
  delegates = [],
  onDecision,
  disabled,
}: {
  decisionSummary: ReactNode;
  policy: PolicyResult[];
  conflicts: string[];
  evidence?: { label: string; href: string }[];
  delegates?: string[];
  onDecision: (d: Decision, reason: string, delegate?: string) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [delegate, setDelegate] = useState("");
  const [busy, setBusy] = useState(false);

  const reasonRequired = decision !== null && negative.includes(decision);
  const blocked = reasonRequired && reason.trim().length < 5;

  return (
    <section aria-label="Decision" className="rounded-lg border bg-surface p-5">
      <h2 className="text-sm font-semibold">Decision</h2>
      <div className="mt-3 rounded-md border bg-surface-muted p-3 text-sm">{decisionSummary}</div>

      <h3 className="mt-5 text-sm font-semibold">Policy and rule results</h3>
      <ul className="mt-2 space-y-2">
        {policy.map((p) => {
          const m = outcomeMeta[p.outcome];
          const Icon = m.icon;
          return (
            <li key={p.id} className="flex gap-2 text-sm">
              <Icon className={`mt-0.5 size-4 shrink-0 ${m.cls}`} aria-hidden />
              <span className="min-w-0">
                <span className="font-medium">
                  {p.label} — {m.label}
                </span>
                <span className="block text-muted-foreground">{p.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>

      {conflicts.length ? (
        <div className="mt-5 rounded-md border border-warning/40 bg-warning-soft p-3">
          <h3 className="text-sm font-semibold text-warning">Conflicts</h3>
          <ul className="mt-1 list-inside list-disc text-sm">
            {conflicts.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {evidence?.length ? (
        <div className="mt-5">
          <h3 className="text-sm font-semibold">Evidence</h3>
          <ul className="mt-1 space-y-1">
            {evidence.map((e) => (
              <li key={e.label}>
                <a href={e.href} className="inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-2">
                  <Paperclip className="size-3.5" aria-hidden />
                  {e.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <fieldset className="mt-5" disabled={disabled}>
        <legend className="text-sm font-semibold">Your decision</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["approve", "return", "reject", "delegate"] as Decision[]).map((d) => (
            <Button
              key={d}
              type="button"
              variant={decision === d ? "default" : "outline"}
              aria-pressed={decision === d}
              onClick={() => setDecision(d)}
              className="capitalize"
            >
              {d}
            </Button>
          ))}
        </div>

        {decision === "delegate" ? (
          <div className="mt-4">
            <Label htmlFor="delegate-to">Delegate to</Label>
            <Select value={delegate} onValueChange={setDelegate}>
              <SelectTrigger id="delegate-to" className="mt-1 w-full sm:max-w-sm">
                <SelectValue placeholder="Choose a colleague" />
              </SelectTrigger>
              <SelectContent>
                {delegates.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {decision ? (
          <div className="mt-4">
            <Label htmlFor="decision-reason">
              Reason {reasonRequired ? <span className="text-danger">(required)</span> : "(optional)"}
            </Label>
            <Textarea
              id="decision-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-describedby="decision-reason-help"
              className="mt-1"
              rows={3}
              placeholder={reasonRequired ? "Explain what the requester must do next" : "Add context for the record"}
            />
            <p id="decision-reason-help" className="mt-1 text-xs text-muted-foreground">
              The reason is shown to the requester and stored in the timeline.
            </p>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={!decision || blocked || busy}
            onClick={async () => {
              if (!decision) return;
              setBusy(true);
              await onDecision(decision, reason, delegate || undefined);
              setBusy(false);
            }}
          >
            {busy ? "Recording…" : "Record decision"}
          </Button>
          {blocked ? (
            <span className="text-xs text-danger">A reason of at least 5 characters is required for this decision.</span>
          ) : null}
        </div>
      </fieldset>
    </section>
  );
}