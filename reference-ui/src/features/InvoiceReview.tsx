import { useEffect, useState } from "react";
import { Badge, Button, Panel } from "../components/ui";
import { InvoiceMatchingPanel } from "./InvoiceMatching";
import { RecordTable } from "../components/data/RecordTable";
import type { PrincipalHistoryState } from "../lib/invoice-principal-history-lock";
import { getInvoiceFinanceReadiness, getInvoiceMatchingHistory, InvoiceReviewError,
  type InvoiceFinanceReadiness, type InvoiceMatchingHistory, type InvoiceReviewSummary } from "../../../src/platform/procurement-invoice-review-api";

const errorText = (cause: unknown) => cause instanceof Error ? cause.message : "Invoice review could not be loaded.";
const issueLabels: Record<string, string> = { OwnerHistoryUnavailable: "Finance history is not connected.",
  OriginalUnitUnavailable: "The units on the original document need review.", InvoiceUnitReviewUnavailable: "The original document lines need verified review.",
  MatchPolicyUnavailable: "The invoice comparison rules need review.", InvoiceMappingEvidenceChanged: "The invoice line links need review." };
const issueText = (code: string) => issueLabels[code] ?? "Review the invoice and its linked source evidence.";
function Summary({ value, currency, lineLabel }: { value: InvoiceReviewSummary; currency: string; lineLabel: (id: string | null) => string }) {
  return <div className="space-y-3">
    <Badge>{value.outcome === "Compared" ? "Comparison recorded" : "Review needed"}</Badge>
    {value.discrepancies.length > 0 && <ul className="space-y-2 text-sm">{value.discrepancies.map((issue, at) =>
      <li key={`${issue.invoiceLineId}:${issue.code}:${at}`}><span className="font-medium">{lineLabel(issue.invoiceLineId)}:</span> {issueText(issue.code)}</li>)}</ul>}
    {value.lines.length > 0 && <div className="overflow-x-auto"><RecordTable><thead><tr><th>Line</th><th>Check</th><th>Quantity</th><th>Net</th><th>Tax</th><th>Expected unit price</th></tr></thead>
      <tbody>{value.lines.map((line) => <tr key={line.invoiceLineId}><td>{lineLabel(line.invoiceLineId)}</td><td>{line.method === "ThreeWay" ? "Order, receipt and invoice" : "Order and invoice"}</td>
        <td>{line.quantity}</td><td>{currency} {line.netAmount}</td><td>{currency} {line.taxAmount}</td><td>{currency} {line.expectedUnitPrice}</td></tr>)}</tbody></RecordTable></div>}
  </div>;
}
export function InvoiceReviewPanel({ company, invoiceId, invoiceVersion, currency, lines, comparisonAvailable, refresh, onPrincipalHistory }: {
  company: string; invoiceId: string; invoiceVersion: number; currency: string;
  lines: { id: string; lineNumber: number; description: string }[]; comparisonAvailable: boolean; refresh: (message?: string) => void;
  onPrincipalHistory: (state: PrincipalHistoryState | null) => void;
}) {
  const [readiness, setReadiness] = useState<InvoiceFinanceReadiness | null>(null);
  const [history, setHistory] = useState<InvoiceMatchingHistory | null>(null);
  const [errors, setErrors] = useState<string[]>([]), [loading, setLoading] = useState(true);
  const lineKey = lines.map((line) => line.id).join(":");
  useEffect(() => {
    const controller = new AbortController(); setReadiness(null); setHistory(null); setErrors([]); setLoading(true); onPrincipalHistory(null);
    const ownLines = new Set(lines.map((line) => line.id));
    const tasks = [getInvoiceFinanceReadiness(company, invoiceId, invoiceVersion, ownLines, controller.signal),
      comparisonAvailable ? getInvoiceMatchingHistory(company, invoiceId, invoiceVersion, ownLines, controller.signal) : Promise.resolve(null)];
    Promise.allSettled(tasks).then(([ready, compared]) => {
      if (controller.signal.aborted) return;
      const failures = [ready, compared].filter((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failures.some((failure) => failure.reason instanceof InvoiceReviewError && [401, 403, 404, 409].includes(failure.reason.status))) {
        setReadiness(null); setHistory(null); onPrincipalHistory(null); setErrors([...new Set(failures.map((failure) => errorText(failure.reason)))]);
      } else {
        if (ready.status === "fulfilled") setReadiness(ready.value as InvoiceFinanceReadiness);
        if (compared.status === "fulfilled") {
          const nextHistory = compared.value as InvoiceMatchingHistory | null;
          setHistory(nextHistory);
          onPrincipalHistory(nextHistory ? { locked: nextHistory.principalNewWorkLocked,
            currentMappingSchema: nextHistory.mappings.find(mapping => mapping.id === nextHistory.currentMappingVersionId)?.sourceSchemaVersion ?? null } : null);
        }
        setErrors(failures.map((failure) => errorText(failure.reason)));
      }
      setLoading(false);
    });
    return () => controller.abort();
  }, [company, invoiceId, invoiceVersion, comparisonAvailable, lineKey, onPrincipalHistory]);
  const lineLabel = (id: string | null) => id ? `Line ${lines.find((line) => line.id === id)?.lineNumber ?? "—"}` : "Invoice";
  return <section className="mt-5 space-y-5" aria-label="Invoice review and Finance">
    <Panel title="Review and Finance" action={<Button variant="secondary" onClick={() => refresh()} disabled={loading}>Refresh invoice</Button>}>
      <div className="space-y-4 p-5">
        {loading ? <p role="status">Loading invoice review…</p> : <>
          {errors.map((message) => <p key={message} role="alert" className="text-sm text-red-700">{message}</p>)}
          {readiness && <><Badge>Not ready for Finance</Badge>
            <p className="text-sm">This review does not approve the invoice or confirm a payment.</p>
            <ul className="space-y-2 text-sm">{readiness.blockers.map((blocker) => <li key={blocker.code}>{blocker.message}</li>)}</ul>
            <div><h3 className="font-medium">Next steps</h3><ul className="mt-2 space-y-2 text-sm">{readiness.nextSteps.map((step) => <li key={step.code}>{step.message}</li>)}</ul></div>
            <dl className="grid gap-2 text-sm sm:grid-cols-2"><dt>Line links</dt><dd>{readiness.evidence.mappingState === "Unavailable" ? "Not available yet"
              : readiness.evidence.mappingState === "NotMapped" ? "Not linked" : readiness.evidence.mappingState === "RecordedVerified" ? "Review recorded" : "Needs review"}</dd>
              <dt>Open review issues</dt><dd>{readiness.evidence.unresolvedExceptionCount ?? "Not available yet"}</dd></dl>
          </>}
        </>}
      </div>
    </Panel>
    {!loading && comparisonAvailable && (readiness || history) && <InvoiceMatchingPanel invoiceId={invoiceId} invoiceVersion={invoiceVersion}
      lines={lines} readiness={readiness}
      currentMappingId={history?.currentMappingVersionId ?? null}
      currentMappingOriginalCurrent={history?.mappings.find((mapping) => mapping.id === history.currentMappingVersionId)?.originalDigestCurrent === true}
      currentMappingSchema={history === null ? undefined : history.currentMappingVersionId === null ? null
        : history.mappings.find((mapping) => mapping.id === history.currentMappingVersionId)?.sourceSchemaVersion}
      principalNewWorkLocked={history?.principalNewWorkLocked ?? true}
      refresh={refresh} />}
    {!loading && history && <Panel title="Recorded review history"><div className="space-y-5 p-5">
      <p className="text-sm text-muted-foreground">Saved results are history. They are not a current invoice approval or permission to pay.</p>
      {history.mappings.length > 0 && <div><h3 className="mb-2 font-medium">Invoice line links</h3><ul className="space-y-2 text-sm">{history.mappings.map((mapping) =>
        <li key={mapping.id}>Version {mapping.mappingRevision} · {mapping.verificationState === "Verified" ? "Review recorded" : "Review needed"}{!mapping.originalDigestCurrent && " · Original invoice changed"}</li>)}</ul></div>}
      {history.comparisons.length === 0 ? <p className="text-sm">No comparison recorded yet.</p> : history.comparisons.map((comparison, at) =>
        <div key={comparison.id} className="space-y-3 border-t border-border pt-4"><h3 className="font-medium">Comparison {at + 1}</h3>
          <Summary value={comparison.comparison} currency={currency} lineLabel={lineLabel} />
          {comparison.hasHeldCapacityClaim && <p className="text-sm text-muted-foreground">A purchasing quantity hold was recorded. Finance approval and payment are separate.</p>}
        </div>)}
      {history.exceptions.length > 0 && <div><h3 className="mb-2 font-medium">Review issues</h3><ul className="space-y-2 text-sm">{history.exceptions.map((issue) =>
        <li key={issue.id}>{lineLabel(issue.invoiceLineId)} · {issueText(issue.type)} <Badge>{issue.status}</Badge>{issue.resolution && <p>{issue.resolution}</p>}</li>)}</ul></div>}
    </div></Panel>}
    {!loading && !history && readiness?.evidence.recordedComparison && <Panel title="Latest recorded comparison"><div className="space-y-3 p-5">
      <p className="text-sm text-muted-foreground">This is a saved result. Current source and Finance authority have not been checked again.</p>
      <Summary value={readiness.evidence.recordedComparison} currency={currency} lineLabel={lineLabel} />
    </div></Panel>}
  </section>;
}
