import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApprovalDecisionDialog } from "../components/approvals/ApprovalDecisionDialog";
import { Badge, Button, EmptyState, PageHeader, Panel } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { claimUnitReviewPending, clearUnitReviewPending, readUnitReviewPending, type UnitReviewPending } from "../lib/invoice-unit-review-command";
import { decideUnitReview, downloadPinnedReviewDocument, getPinnedReviewDocuments, getUnitReviewDetail,
  listUnitReviewTasks, recoverUnitReview, UnitReviewError, type PinnedReviewDocument, type UnitReviewAction,
  type UnitReviewDetail, type UnitReviewPage } from "../../../src/platform/procurement-invoice-unit-review-api";

const message = (cause: unknown) => cause instanceof Error ? cause.message : "Original invoice review is unavailable.";
const blockerText = (code: string) => code === "InvoiceMappingSuperseded" ? "The invoice links changed. This review is now history."
  : code === "InvoiceOriginalChanged" ? "The original invoice changed. Request a new review for the current version."
    : "The current invoice or document evidence needs another check.";
function useContext() { const context = useLiveReadiness(); if (!context) throw new Error("Review needs ERP context."); return context; }
export function InvoiceUnitReviewQueue() {
  const context = useContext(), { selection } = useErpShell();
  if (selection.entityId && selection.entityId !== context.legalEntityId) return <p role="status">Checking the selected company…</p>;
  return <Queue key={JSON.stringify([context.tenantId, context.legalEntityId, selection.entityId ?? "", selection.branch ?? "", context.workerId, context.permissions, context.capabilities])} />;
}
function Queue() {
  const context = useContext(), canReview = !context.adminViewOnly && context.capabilities.invoiceOriginalUnitReview
    && context.permissions.includes("procurement-invoice-unit-review");
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [data, setData] = useState<UnitReviewPage | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => {
    if (!canReview) return;
    const abort = new AbortController(); setLoading(true); setData(null); setError("");
    listUnitReviewTasks(context.legalEntityId, page, abort.signal).then((value) => { if (!abort.signal.aborted) setData(value); })
      .catch((cause) => { if (!abort.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [canReview, context.legalEntityId, page, revision]);
  if (!canReview) return <p role="alert">You do not have access to original invoice unit reviews.</p>;
  return <div className="p-5 sm:p-8"><PageHeader title="Original invoice units" subtitle="Reviews assigned to you. These decisions do not approve an invoice or payment."
    actions={<Button variant="secondary" onClick={() => setRevision((x) => x + 1)}>Refresh</Button>} />
    <Panel><div className="p-5">{error && <p role="alert" className="mb-4 text-destructive">{error}</p>}
      {loading ? <p role="status">Loading assigned reviews…</p> : data?.items.length ? <div className="overflow-x-auto"><RecordTable>
        <thead><tr><th>Review</th><th>Invoice</th><th>Started</th><th>Action</th></tr></thead><tbody>{data.items.map((item) =>
          <tr key={item.reviewId}><td>{item.reviewId}</td><td>{item.invoiceId}</td><td>{new Date(item.openedAt).toLocaleString()}</td>
            <td><Link className="text-primary underline" to={`/approvals/unit-review/${item.reviewId}`}>Check original</Link></td></tr>)}</tbody>
      </RecordTable></div> : data && <EmptyState title="No invoice units to check" description="Assigned reviews appear here when an invoice owner requests a check." />}
      {data && data.total > data.pageSize && <div className="mt-4 flex gap-3"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <span>Page {page}</span><Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</Button></div>}
    </div></Panel>
  </div>;
}
type DecisionDraft = { action: UnitReviewAction; reason: string; attested: boolean; assignmentId: string; assignmentVersion: number };
export function InvoiceUnitReviewDetail() {
  const context = useContext(), { selection } = useErpShell(), { id } = useParams();
  if (selection.entityId && selection.entityId !== context.legalEntityId) return <p role="status">Checking the selected company…</p>;
  return <Detail key={JSON.stringify([context.tenantId, context.legalEntityId, selection.entityId ?? "", selection.branch ?? "",
    context.workerId, context.permissions, context.capabilities, id])} reviewId={id ?? ""} />;
}
function Detail({ reviewId }: { reviewId: string }) {
  const context = useContext(), { selection } = useErpShell();
  const eligible = !context.adminViewOnly && context.capabilities.invoiceOriginalUnitReview && (
    context.permissions.includes("procurement-invoice-unit-review")
    || context.permissions.includes("procurement-invoice-unit-review-request") && context.permissions.includes("procurement-invoice-read")
    || context.permissions.includes("procurement-invoice-unit-review-read") && context.permissions.includes("procurement-invoice-read"));
  const scope = JSON.stringify([context.tenantId, context.legalEntityId, selection.entityId ?? "", selection.branch ?? "", context.workerId, reviewId, "Decision"]);
  const [data, setData] = useState<UnitReviewDetail | null>(null), [documents, setDocuments] = useState<PinnedReviewDocument[] | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [pending, setPending] = useState(() => readUnitReviewPending(scope));
  const [decision, setDecision] = useState<DecisionDraft | null>(null), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!eligible) return;
    const abort = new AbortController(); setData(null); setDocuments(null); setError(""); setLoading(true); setDecision(null);
    getUnitReviewDetail(context.legalEntityId, reviewId, abort.signal).then(async (value) => {
      if (abort.signal.aborted) return;
      setData(value);
      if (value.currentMapping && value.originalDigestCurrent && value.actionCandidates.length > 0) {
        try {
          const pins = await getPinnedReviewDocuments(context.legalEntityId, reviewId, abort.signal);
          const required = new Map(value.originalDocumentLines.map((line) => [line.documentVersionId, line.documentSha256.toLowerCase()]));
          if (!pins.length || pins.length !== required.size || new Set(pins.map((doc) => doc.versionId)).size !== required.size
            || pins.some((doc) => required.get(doc.versionId) !== doc.sha256.toLowerCase() || !doc.canDownload))
            throw new Error("The pinned original documents could not be verified for this review.");
          if (!abort.signal.aborted) setDocuments(pins);
        } catch (cause) { if (!abort.signal.aborted) setError(message(cause)); }
      }
    }).catch((cause) => { if (!abort.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [eligible, context.legalEntityId, reviewId, revision]);
  if (!eligible) return <div className="p-5 sm:p-8" role="alert">Original invoice review is not available for your account.</div>;
  async function download(doc: PinnedReviewDocument) {
    if (!documents?.some((item) => item.versionId === doc.versionId && item.sha256 === doc.sha256)) return;
    setBusy(true); setError("");
    try { const blob = await downloadPinnedReviewDocument(context.legalEntityId, reviewId, doc.versionId);
      if (!alive.current) return;
      const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = doc.fileName; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (cause) { if (alive.current) setError(message(cause)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function decide() {
    if (!data || !decision || busy || pending.blocked || !documents || !data.currentMapping || !data.originalDigestCurrent
      || !context.permissions.includes("procurement-invoice-unit-review") || !data.actionCandidates.includes(decision.action)) return;
    if (decision.action === "Approve" && !decision.attested || decision.action !== "Approve" && !decision.reason.trim()) return;
    const marker: UnitReviewPending = { operation: "Decision", invoiceId: data.invoiceId, reviewId, key: crypto.randomUUID() };
    if (!claimUnitReviewPending(scope, marker)) { setPending(readUnitReviewPending(scope)); setError("Check the previous decision before making another one."); return; }
    setPending(readUnitReviewPending(scope)); setBusy(true); setError("");
    try {
      const result = await decideUnitReview(context.legalEntityId, data, decision.assignmentId, decision.assignmentVersion,
        decision.action, decision.reason.trim() || null, decision.attested, marker.key);
      clearUnitReviewPending(scope, marker);
      if (alive.current) { setPending(readUnitReviewPending(scope)); setDecision(null); setData(null); setDocuments(null);
        setNotice(`Decision recorded: ${result.reviewState}. This does not approve the invoice.`);
        setRevision((value) => value + 1); }
    } catch (cause) {
      if (cause instanceof UnitReviewError && [400, 422].includes(cause.status)) clearUnitReviewPending(scope, marker);
      if (alive.current) { setPending(readUnitReviewPending(scope)); setError(message(cause)); setDecision(null); }
    } finally { if (alive.current) setBusy(false); }
  }
  async function recover() {
    const marker = pending.pending;
    if (!marker || busy || marker.operation !== "Decision" || marker.reviewId !== reviewId) return;
    setBusy(true); setError("");
    try {
      const result = await recoverUnitReview(context.legalEntityId, reviewId, marker.key, "Decision", marker.invoiceId);
      clearUnitReviewPending(scope, marker);
      if (alive.current) { setPending(readUnitReviewPending(scope)); setData(null); setDocuments(null);
        setNotice(`Saved decision found: ${result.reviewState}. This does not approve the invoice.`);
        setRevision((value) => value + 1); }
    } catch (cause) { if (alive.current) setError(message(cause)); }
    finally { if (alive.current) setBusy(false); }
  }
  const canDecide = !!data && !!documents && !pending.blocked && !busy && data.currentMapping && data.originalDigestCurrent
    && context.permissions.includes("procurement-invoice-unit-review") && data.assignments.length > 0;
  return <div className="p-5 sm:p-8"><PageHeader title="Check original invoice units" subtitle="Compare the original document with this invoice. Finance and payment are separate." actions={<Badge>{data?.reviewState ?? "Review"}</Badge>} />
    {error && <p role="alert" className="mb-4 text-destructive">{error}</p>}{notice && <p role="status" className="mb-4">{notice}</p>}
    {loading ? <p role="status">Loading original invoice review…</p> : !data ? <p role="alert">Review details are unavailable. Refresh before continuing.</p> : <>
      <Panel title="Original invoice"><div className="space-y-3 p-5 text-sm">
        {data.original ? <><p className="font-medium">{data.original.invoiceNumber} · {data.original.invoiceDate}</p>
          <p>{data.original.currencyCode} {data.original.grossAmount} total · Net {data.original.netAmount} · Tax {data.original.taxAmount}</p>
          <div className="overflow-x-auto"><RecordTable><thead><tr><th>Line</th><th>Description</th><th>Quantity</th><th>Unit price</th><th>Tax</th></tr></thead>
            <tbody>{data.original.lines.map((line) => <tr key={line.id}><td>{line.lineNumber}</td><td>{line.description}</td><td>{line.quantity}</td><td>{line.unitPrice}</td><td>{line.taxAmount}</td></tr>)}</tbody>
          </RecordTable></div></> : <p>The original invoice changed. This review is read-only until a new review is requested.</p>}
        {data.blockers.length > 0 && <ul className="list-disc pl-5">{data.blockers.map((code) => <li key={code}>{blockerText(code)}</li>)}</ul>}
      </div></Panel>
      <Panel title="Pinned original documents" className="mt-5"><div className="space-y-3 p-5 text-sm">
        {data.actionCandidates.length === 0 ? <p>No current document check is assigned to you. Saved document references remain in the review history.</p>
          : !documents ? <p role="alert">Pinned documents could not be verified. Decisions are unavailable.</p> : documents.map((doc) =>
          <div key={doc.versionId} className="flex flex-wrap items-center justify-between gap-2"><span>{doc.fileName} · Version {doc.versionNumber}</span>
            <Button variant="secondary" disabled={busy} onClick={() => void download(doc)}>Download original</Button></div>)}
        <div className="overflow-x-auto"><RecordTable><thead><tr><th>Invoice line</th><th>Unit on original</th><th>Where to find it</th></tr></thead>
          <tbody>{data.originalDocumentLines.map((line) => <tr key={line.invoiceLineId}><td>{data.original?.lines.find((row) => row.id === line.invoiceLineId)?.lineNumber ?? "—"}</td>
            <td>{line.unitCode}</td><td>{line.documentLineReference}</td></tr>)}</tbody></RecordTable></div>
      </div></Panel>
      <Panel title="Your decision" className="mt-5"><div className="space-y-3 p-5 text-sm"><p>The assignment and original evidence are checked again when you decide.</p>
        {pending.blocked ? <><p role="alert">A previous decision has an unconfirmed response. A second decision is blocked.</p>
          {pending.pending ? <Button variant="secondary" disabled={busy} onClick={() => void recover()}>Check saved decision</Button>
            : <p>Recovery information is unavailable in this browser tab. Ask an administrator to inspect the review history.</p>}</>
          : canDecide ? data.actionCandidates.map((action) => <Button key={action} variant={action === "Approve" ? "primary" : "secondary"}
            onClick={() => setDecision({ action, reason: "", attested: false, assignmentId: data.assignments[0].assignmentId,
              assignmentVersion: data.assignments[0].assignmentVersion })}>{action === "Approve" ? "Confirm original units" : action === "Return" ? "Return for changes" : "Reject"}</Button>)
            : <p>No current decision is available for your assignment.</p>}
      </div></Panel>
    </>}
    <Link className="mt-5 inline-block text-primary underline" to="/approvals">Back to approvals</Link>
    {decision && !pending.blocked && <ApprovalDecisionDialog action={decision.action} recordLabel="original invoice units" reason={decision.reason}
      busy={busy} error={error} attestationRequired attested={decision.attested} onAttestation={(checked) => setDecision({ ...decision, attested: checked })}
      onReason={(reason) => setDecision({ ...decision, reason })} onConfirm={() => void decide()} onCancel={() => setDecision(null)} />}
  </div>;
}
