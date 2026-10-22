import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Field, Panel, Textarea } from "../components/ui";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { claimUnitReviewPending, clearUnitReviewPending, readUnitReviewPending, type UnitReviewPending } from "../lib/invoice-unit-review-command";
import { getUnitReviewReadiness, openUnitReview, recoverUnitReview, UnitReviewError, type UnitReviewReadiness } from "../../../src/platform/procurement-invoice-unit-review-api";

const message = (cause: unknown) => cause instanceof Error ? cause.message : "Original invoice review is unavailable.";
const blockerText = (code: string) => (code === "OriginalUnitReviewAlreadyOpened" || code === "OriginalUnitReviewAlreadyOpen") ? "A review has already started for these invoice links."
  : code === "OriginalUnitReviewExecutionDisabled" ? "Original document review is not available for this company yet."
    : "The invoice links or original document need another check before review can start.";
/** Maker entry in the existing bill detail. Opening creates a review case, not invoice approval. */
export function InvoiceUnitReviewOwner({ invoiceId, invoiceVersion }: { invoiceId: string; invoiceVersion: number }) {
  const context = useLiveReadiness()!, { selection } = useErpShell();
  const scope = JSON.stringify([context.tenantId, context.legalEntityId, selection.entityId ?? "", selection.branch ?? "", context.principalId, invoiceId, "Open"]);
  const canOpen = context.capabilities.invoiceOriginalUnitReview
    && context.permissions.includes("procurement-invoice-unit-review-request") && context.permissions.includes("procurement-invoice-read");
  const [readiness, setReadiness] = useState<UnitReviewReadiness | null>(null);
  const [pending, setPending] = useState(() => readUnitReviewPending(scope));
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const alive = useRef(true), operationInFlight = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!canOpen) return;
    const abort = new AbortController(); setLoading(true); setReadiness(null); setError("");
    getUnitReviewReadiness(context.legalEntityId, invoiceId, abort.signal)
      .then((value) => { if (!abort.signal.aborted) setReadiness(value); })
      .catch((cause) => { if (!abort.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [canOpen, context.legalEntityId, invoiceId]);
  if (!canOpen) return null;
  async function request() {
    if (operationInFlight.current || busy || pending.blocked || !readiness || !readiness.canRequestReview || readiness.invoiceVersion !== invoiceVersion) return;
    operationInFlight.current = true;
    const marker: UnitReviewPending = { operation: "Open", invoiceId, reviewId: null, key: crypto.randomUUID() };
    if (!claimUnitReviewPending(scope, marker)) { operationInFlight.current = false; setPending(readUnitReviewPending(scope)); setError("Check the previous review action before opening another one."); return; }
    setPending(readUnitReviewPending(scope)); setBusy(true); setError("");
    try {
      const receipt = await openUnitReview(context.legalEntityId, invoiceId, readiness.invoiceVersion, readiness.mappingRevision, reason.trim() || null, marker.key, context.principalId);
      clearUnitReviewPending(scope, marker);
      if (alive.current) { setPending(readUnitReviewPending(scope)); setNotice(`Review started. ${receipt.reviewState}.`); setReadiness(null);
        const latest = await getUnitReviewReadiness(context.legalEntityId, invoiceId); if (alive.current) setReadiness(latest); }
    } catch (cause) {
      if (cause instanceof UnitReviewError && [400, 422].includes(cause.status)) clearUnitReviewPending(scope, marker);
      if (alive.current) { setPending(readUnitReviewPending(scope)); setError(message(cause)); }
    } finally { operationInFlight.current = false; if (alive.current) setBusy(false); }
  }
  async function recover() {
    const marker = pending.pending;
    if (!marker || busy || operationInFlight.current || marker.operation !== "Open") return;
    operationInFlight.current = true;
    setBusy(true); setError("");
    try {
      const latest = await getUnitReviewReadiness(context.legalEntityId, invoiceId);
      // A retained review ID is only a route to the original-key receipt. It is
      // never itself proof that this particular interrupted POST succeeded.
      if (!latest.existingReviewId) throw new Error("No saved review command was found yet. Check again later or ask an administrator to inspect the history.");
      const receipt = await recoverUnitReview(context.legalEntityId, latest.existingReviewId, marker.key, "Open", invoiceId, context.principalId);
      clearUnitReviewPending(scope, marker);
      if (alive.current) { setPending(readUnitReviewPending(scope)); setReadiness(latest); setNotice(`Saved review action found. ${receipt.reviewState}.`); }
    } catch (cause) { if (alive.current) setError(message(cause)); }
    finally { operationInFlight.current = false; if (alive.current) setBusy(false); }
  }
  return <Panel title="Check original invoice units" className="mt-5"><div className="space-y-3 p-5 text-sm">
    <p>This asks an independent person to check the units on the original invoice document. It does not approve the invoice or send it to Finance.</p>
    {loading ? <p role="status">Checking review availability…</p> : null}
    {error && <p role="alert" className="text-destructive">{error}</p>}{notice && <p role="status">{notice}</p>}
    {readiness?.existingReviewId && <p>Review <Badge>Recorded</Badge> <Link className="text-primary underline" to={`/approvals/unit-review/${readiness.existingReviewId}`}>Open review details</Link></p>}
    {readiness && readiness.invoiceVersion !== invoiceVersion && <p role="alert">The invoice changed. Refresh its details before requesting review.</p>}
    {readiness?.blockers.length ? <ul className="list-disc pl-5">{readiness.blockers.map((blocker) => <li key={blocker}>{blockerText(blocker)}</li>)}</ul> : null}
    {pending.blocked ? <div className="space-y-2"><p role="alert">A prior review request has an unconfirmed result. A second request is blocked.</p>
      {pending.pending ? <Button variant="secondary" disabled={busy} onClick={() => void recover()}>Check saved review action</Button>
        : <p>Saved recovery information is unavailable in this browser tab. Ask an administrator to inspect the review history.</p>}</div>
      : readiness?.canRequestReview && readiness.invoiceVersion === invoiceVersion && <><Field label="Review note (optional)"><Textarea maxLength={2000} value={reason} disabled={busy}
        onChange={(event) => setReason(event.target.value)} /></Field><Button disabled={busy} onClick={() => void request()}>Request original unit review</Button></>}
  </div></Panel>;
}
