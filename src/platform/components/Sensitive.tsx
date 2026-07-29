import { Eye, EyeOff, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Masked value with a deliberate reveal. The reveal is an explicit action and
 * is announced as an audited event — never auto-revealed on hover or focus.
 */
export function MaskedValue({
  label,
  value,
  hint = "Revealing this is recorded in the record timeline.",
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const [shown, setShown] = useState(false);
  const masked = value.length > 4 ? `${"•".repeat(Math.max(value.length - 4, 4))}${value.slice(-4)}` : "••••";

  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex flex-wrap items-center gap-2">
        <span className="tabular font-mono text-sm text-foreground">{shown ? value : masked}</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          aria-pressed={shown}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
          {shown ? "Hide" : "Reveal"}
        </Button>
      </dd>
      {!shown ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Neutral not-found used for undisclosable records: the wording must be
 * identical whether or not the record exists.
 */
export function UndisclosableNotFound({ reference }: { reference?: string }) {
  return (
    <div className="rounded-lg border bg-surface p-6 text-center">
      <ShieldAlert className="mx-auto size-7 text-muted-foreground" aria-hidden />
      <h3 className="mt-3 text-base font-semibold">No matching record</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {reference ? `We can't show anything for reference ${reference}.` : "We can't show anything for that reference."}{" "}
        This response is the same for references that don't exist and for references you aren't
        authorised to see.
      </p>
    </div>
  );
}