import { Info } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export interface CalculationLine {
  code: string;
  label: string;
  amount: number;
  inputs: { label: string; value: string }[];
  ruleVersion: string;
  effectiveFrom: string;
  explanation: string;
  priorAmount?: number;
}

function money(v: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(v);
}

/**
 * Module-agnostic "why is this number what it is" component. Used for pay, but
 * equally for tax lines, landed cost, depreciation, or any computed figure.
 */
export function CalculationExplainer({
  lines,
  currency,
  caption,
}: {
  lines: CalculationLine[];
  currency: string;
  caption?: string;
}) {
  return (
    <div className="rounded-lg border bg-surface">
      {caption ? (
        <p className="flex items-start gap-2 border-b px-4 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {caption}
        </p>
      ) : null}
      <Accordion type="multiple" className="divide-y">
        {lines.map((l) => {
          const diff = l.priorAmount === undefined ? null : l.amount - l.priorAmount;
          return (
            <AccordionItem key={l.code} value={l.code} className="border-b-0 px-4">
              <AccordionTrigger className="py-3 hover:no-underline">
                <span className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 pr-2 text-left">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{l.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {l.code} · {l.ruleVersion}
                    </span>
                  </span>
                  <span className="tabular text-sm font-semibold">{money(l.amount, currency)}</span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <dl className="grid gap-2 sm:grid-cols-2">
                  {l.inputs.map((i) => (
                    <div key={i.label} className="rounded border bg-surface-muted px-3 py-2">
                      <dt className="text-xs text-muted-foreground">{i.label}</dt>
                      <dd className="tabular text-sm font-medium">{i.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-sm text-muted-foreground">{l.explanation}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Rule {l.ruleVersion}, effective from {l.effectiveFrom}.
                </p>
                {diff !== null ? (
                  <p className="mt-2 text-xs font-medium">
                    {diff === 0
                      ? "No change from the previous period."
                      : `${diff > 0 ? "Increase" : "Decrease"} of ${money(Math.abs(diff), currency)} versus the previous period.`}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">No comparable prior period figure.</p>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}