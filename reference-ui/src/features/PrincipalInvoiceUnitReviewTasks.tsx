import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApprovalDecisionDialog } from "../components/approvals/ApprovalDecisionDialog";
import { Badge, Button, EmptyState, PageHeader, Panel } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { claimPrincipalInvoicePending, clearPrincipalInvoicePending, readPrincipalInvoicePending } from "../lib/principal-invoice-command-memory";
import { decidePrincipalReview, downloadPrincipalReviewDocument, getPrincipalReviewDetail,
  listPrincipalReviewDocuments, listPrincipalReviewTasks, recoverPrincipalReviewDecision, PrincipalInvoiceError,
  type PrincipalInvoiceLocator, type PrincipalPinnedDocument, type PrincipalReviewDetail,
  type PrincipalReviewPage } from "../../../src/platform/procurement-principal-invoice-api";

const errorText = (cause: unknown) => cause instanceof Error ? cause.message : "The original bill check is unavailable.";
function context() { const value = useLiveReadiness(); if (!value) throw new Error("Choose an ERP company."); return value; }
export function PrincipalInvoiceReviewQueue() {
  const value = context(), { selection, authEpoch } = useErpShell();
  if (selection.entityId && selection.entityId !== value.legalEntityId) return <p role="status">Checking selected company…</p>;
  return <Queue key={JSON.stringify([authEpoch, value.tenantId, value.legalEntityId, selection.branch ?? "",
    value.principalId, value.permissions, value.capabilities])} />;
}
function Queue() {
  const value = context(), allowed = value.capabilities.principalInvoiceMatching
    && value.permissions.includes("procurement-invoice-unit-review");
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [data, setData] = useState<PrincipalReviewPage | null>(null), [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!allowed) return;
    const abort = new AbortController(); setData(null); setError(""); setLoading(true);
    listPrincipalReviewTasks(value.legalEntityId, page, abort.signal)
      .then(result => { if (!abort.signal.aborted) setData(result); })
      .catch(cause => { if (!abort.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [allowed, value.legalEntityId, page, revision]);
  if (!allowed) return <p role="alert">You do not have an assigned original bill check.</p>;
  return <div className="p-5 sm:p-8"><PageHeader title="Original bill units" subtitle="Checks assigned to you. These decisions do not approve a bill or payment."
    actions={<Button variant="secondary" onClick={() => setRevision(n => n + 1)}>Refresh</Button>} />
    <Panel><div className="p-5">{error && <p role="alert" className="mb-4 text-destructive">{error}</p>}
      {loading ? <p role="status">Loading assigned checks…</p> : data?.items.length ? <div className="overflow-x-auto"><RecordTable>
        <thead><tr><th>Review</th><th>Bill</th><th>Started</th><th>Action</th></tr></thead>
        <tbody>{data.items.map(item => <tr key={item.reviewId}><td>{item.reviewId}</td><td>{item.invoiceId}</td>
          <td>{new Date(item.openedAt).toLocaleString()}</td><td><Link className="text-primary underline" to={`/approvals/principal-unit-review/${item.reviewId}`}>Check original</Link></td></tr>)}</tbody>
      </RecordTable></div> : data && <EmptyState title="No original bill checks" description="Assigned checks appear here when a bill owner requests one." />}
      {data && data.total > data.pageSize && <div className="mt-4 flex gap-3"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <span>Page {page}</span><Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</Button></div>}
    </div></Panel></div>;
}
type Draft = { action: "Approve" | "Return" | "Reject"; reason: string; attested: boolean;
  assignmentId: string; assignmentVersion: number };
export function PrincipalInvoiceReviewDetail() {
  const value = context(), { selection, authEpoch } = useErpShell(), { id } = useParams();
  if (selection.entityId && selection.entityId !== value.legalEntityId) return <p role="status">Checking selected company…</p>;
  return <Detail key={JSON.stringify([authEpoch, value.tenantId, value.legalEntityId, selection.branch ?? "",
    value.principalId, value.permissions, value.capabilities, id])} reviewId={id ?? ""} />;
}
function Detail({ reviewId }: { reviewId: string }) {
  const value = context(), { selection } = useErpShell();
  const allowed = value.capabilities.principalInvoiceMatching && value.permissions.includes("procurement-invoice-unit-review");
  const scope = JSON.stringify([value.tenantId, value.legalEntityId, selection.entityId ?? "", selection.branch ?? "",
    value.principalId, reviewId, "principal-decision"]);
  const [pending, setPending] = useState(() => readPrincipalInvoicePending(scope));
  const [data, setData] = useState<PrincipalReviewDetail | null>(null);
  const [documents, setDocuments] = useState<PrincipalPinnedDocument[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [revision, setRevision] = useState(0), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const alive = useRef(true), inFlight = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!allowed) return;
    const abort = new AbortController(); setData(null); setDocuments(null); setDraft(null); setError(""); setLoading(true);
    getPrincipalReviewDetail(value.legalEntityId, reviewId, abort.signal).then(async detail => {
      if (abort.signal.aborted) return;
      setData(detail);
      if (detail.currentMapping && detail.originalDigestCurrent && detail.actionCandidates.length) {
        const originals = await listPrincipalReviewDocuments(value.legalEntityId, detail, abort.signal);
        if (!abort.signal.aborted) setDocuments(originals);
      }
    }).catch(cause => { if (!abort.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [allowed, value.legalEntityId, reviewId, revision]);
  if (!allowed) return <div className="p-5 sm:p-8" role="alert">This assigned original bill check is not available for your account.</div>;
  async function download(document: PrincipalPinnedDocument) {
    if (!data || !documents?.some(item => item.versionId === document.versionId && item.sha256 === document.sha256)) return;
    setBusy(true); setError("");
    try { const blob = await downloadPrincipalReviewDocument(value.legalEntityId, data, document.versionId);
      if (!alive.current) return;
      const url = URL.createObjectURL(blob), link = window.document.createElement("a");
      link.href = url; link.download = document.fileName; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (cause) { if (alive.current) setError(errorText(cause)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function decide() {
    if (!data || !draft || !documents || busy || inFlight.current || pending.blocked
      || !data.currentMapping || !data.originalDigestCurrent || !data.actionCandidates.includes(draft.action)
      || draft.action === "Approve" && !draft.attested || draft.action !== "Approve" && !draft.reason.trim()) return;
    const locator: PrincipalInvoiceLocator = { operation: "DecideReview", invoiceId: data.invoiceId,
      invoiceVersion: data.invoiceVersion, key: crypto.randomUUID(), mappingRevision: 0,
      mappingVersionId: data.mappingVersionId, reviewId: data.reviewId, reviewOutcomeId: null,
      orderId: null, issuedVersionId: null, expectedCaseVersion: data.caseVersion };
    inFlight.current = true;
    if (!claimPrincipalInvoicePending(scope, locator)) { inFlight.current = false; setPending(readPrincipalInvoicePending(scope));
      setError("Check the previous decision before making another one."); return; }
    setPending(readPrincipalInvoicePending(scope)); setBusy(true); setError("");
    try { const receipt = await decidePrincipalReview(value.legalEntityId, data, draft.assignmentId,
      draft.assignmentVersion, draft.action, draft.reason.trim() || null, draft.attested, locator.key);
      if (!clearPrincipalInvoicePending(scope, locator)) throw new Error("The decision was confirmed but browser recovery remains locked.");
      if (alive.current) { setPending(readPrincipalInvoicePending(scope)); setDraft(null);
        setNotice(`Original unit decision recorded: ${String(receipt.reviewState)}. Bill approval remains separate.`);
        setRevision(n => n + 1); }
    } catch (cause) { if (cause instanceof PrincipalInvoiceError && [400, 422].includes(cause.status)) clearPrincipalInvoicePending(scope, locator);
      if (alive.current) { setPending(readPrincipalInvoicePending(scope)); setError(errorText(cause)); setDraft(null); } }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  async function recover() {
    const locator = pending.locator;
    if (!locator || locator.operation !== "DecideReview" || busy || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try { const receipt = await recoverPrincipalReviewDecision(value.legalEntityId, locator);
      if (!clearPrincipalInvoicePending(scope, locator)) throw new Error("The decision was found, but browser recovery remains locked.");
      if (alive.current) { setPending(readPrincipalInvoicePending(scope)); setNotice(`Saved ${String(receipt.reviewState)} decision found.`); setRevision(n => n + 1); }
    } catch (cause) { if (alive.current) setError(errorText(cause)); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  const canDecide = !!data && !!documents && !pending.blocked && !busy && data.currentMapping
    && data.originalDigestCurrent && data.blockers.length === 0 && data.assignments.length > 0;
  return <div className="p-5 sm:p-8"><PageHeader title="Check original bill units" subtitle="Inspect the original document and its lines. This is not bill approval or payment."
    actions={<Badge>{data?.reviewState ?? "Review"}</Badge>} />
    {error && <p role="alert" className="mb-4 text-destructive">{error}</p>}
    {notice && <p role="status" className="mb-4">{notice}</p>}
    {loading ? <p role="status">Loading assigned original bill check…</p> : !data ? <p role="alert">Review details are unavailable. Refresh before continuing.</p> : <>
      <Panel title="Original bill"><div className="space-y-3 p-5 text-sm">
        {data.original ? <><p className="font-medium">{data.original.invoiceNumber} · {data.original.invoiceDate}</p>
          <p>{data.original.currencyCode} {data.original.grossAmount} total · Net {data.original.netAmount} · Tax {data.original.taxAmount}</p>
          <div className="overflow-x-auto"><RecordTable><thead><tr><th>Line</th><th>Description</th><th>Quantity</th><th>Unit price</th><th>Tax</th></tr></thead>
            <tbody>{data.original.lines.map(line => <tr key={line.id}><td>{line.lineNumber}</td><td>{line.description}</td><td>{line.quantity}</td><td>{line.unitPrice}</td><td>{line.taxAmount}</td></tr>)}</tbody>
          </RecordTable></div></> : <p>The original bill has changed. This assignment cannot be decided.</p>}
        {data.blockers.length > 0 && <ul className="list-disc pl-5">{data.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul>}
      </div></Panel>
      <Panel title="Pinned original documents" className="mt-5"><div className="space-y-3 p-5 text-sm">
        <p>Only document versions retained for this assignment are available here.</p>
        {documents?.map(item => <div key={item.versionId} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
          <span>{item.fileName} · Version {item.versionNumber}</span><Button variant="secondary" disabled={busy} onClick={() => void download(item)}>Open original</Button>
        </div>)}
        {!documents && <p>Original documents are unavailable. A decision cannot be recorded.</p>}
        {data.originalDocumentLines.length > 0 && <div className="overflow-x-auto"><RecordTable><thead><tr><th>Bill line</th><th>Document line or page</th><th>Unit</th></tr></thead>
          <tbody>{data.originalDocumentLines.map(line => <tr key={line.invoiceLineId}><td>{data.original?.lines.find(item => item.id === line.invoiceLineId)?.lineNumber ?? "—"}</td>
            <td>{line.documentLineReference}</td><td>{line.unitCode}</td></tr>)}</tbody></RecordTable></div>}
      </div></Panel>
      <Panel title="Decision" className="mt-5"><div className="space-y-3 p-5 text-sm">
        {pending.blocked ? <><p role="alert">A previous decision has an unconfirmed result. No second decision can be sent.</p>
          {pending.locator ? <Button variant="secondary" disabled={busy} onClick={() => void recover()}>Check saved decision</Button>
            : <p>Recovery information is unavailable in this tab. Ask an administrator to inspect the history.</p>}</>
          : canDecide ? data.actionCandidates.map(action => <Button key={action} variant={action === "Approve" ? "primary" : "secondary"}
            onClick={() => setDraft({ action, reason: "", attested: false, assignmentId: data.assignments[0].assignmentId,
              assignmentVersion: data.assignments[0].assignmentVersion })}>{action === "Approve" ? "Confirm original units" : action === "Return" ? "Return for changes" : "Reject"}</Button>)
            : <p>No current decision is available for this assignment.</p>}
      </div></Panel>
    </>}
    <Link className="mt-5 inline-block text-primary underline" to="/approvals">Back to approvals</Link>
    {draft && !pending.blocked && <ApprovalDecisionDialog action={draft.action} recordLabel="original invoice units" reason={draft.reason}
      busy={busy} error={error} attestationRequired attested={draft.attested} onAttestation={attested => setDraft({ ...draft, attested })}
      onReason={reason => setDraft({ ...draft, reason })} onConfirm={() => void decide()} onCancel={() => setDraft(null)} />}
  </div>;
}
