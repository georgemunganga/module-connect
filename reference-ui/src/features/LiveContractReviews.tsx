import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, EmptyState, Field, PageHeader, Panel, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { useErpShell } from "../lib/erpShell";
import { ContractApiError } from "../../../src/platform/procurement-contracts-api";
import { decideContractReview, getAssignedContractReview, listAssignedContractReviews,
  recoverContractReview, type AssignedContractReviewDetail, type AssignedContractReviews,
  type ContractReviewAck, type ContractReviewAction } from "../../../src/platform/procurement-contract-review-api";
import { clearContractReviewPending, readContractReviewPending, saveContractReviewPending,
  type ContractReviewPending } from "../../../src/platform/contract-review-journal";

const explain = (cause: unknown) => cause instanceof Error ? cause.message : "The review is unavailable.";
function scope() {
  const readiness = useLiveReadiness();
  if (!readiness) throw new Error("Contract review requires an ERP company.");
  return readiness;
}

/** A scoped list of this Core account's currently assigned reviews. */
export function LiveContractReviewWorklist() {
  const { tenantId, legalEntityId, principalId, effectiveBranchId, permissions, capabilities } = scope();
  const { authEpoch } = useErpShell();
  const viewScope = `${authEpoch}:${tenantId}:${legalEntityId}:${principalId}:${effectiveBranchId ?? ""}`;
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AssignedContractReviews | null>(null);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const enabled = capabilities.contractInternalReview === true
    && permissions.includes("procurement-contract-review-read");
  useEffect(() => { setPage(1); setData(null); setLoadedScope(null); }, [viewScope]);
  useEffect(() => {
    setData(null); setLoadedScope(null); setError("");
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true);
    listAssignedContractReviews(legalEntityId,page,controller.signal)
      .then((value) => { if (!controller.signal.aborted) { setData(value); setLoadedScope(viewScope); } })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(explain(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [legalEntityId,authEpoch,effectiveBranchId,page,enabled,viewScope]);
  return <div className="p-5 sm:p-8">
    <PageHeader title="Assigned contract reviews" subtitle="Internal review tasks assigned to your ERP account." />
    <Panel><div className="p-5">
      {!enabled ? <p role="status">Internal contract review is not available for this company yet.</p> : <>
        {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
        {loading || loadedScope !== viewScope ? <p role="status">Loading assigned reviews…</p> : data?.items.length ? <div className="overflow-x-auto"><RecordTable>
          <thead><tr><th>Contract</th><th>Review</th><th>Submitted</th><th>State</th><th>Action</th></tr></thead>
          <tbody>{data.items.map((item) => <tr key={item.Id}>
            <td>{item.Number} · {item.Title}</td><td>Submission {item.SubmissionNumber}</td>
            <td>{item.SubmittedAt.slice(0,10)}</td><td><Badge>Pending</Badge></td>
            <td>{item.AssignmentId
              ? <Link className="text-sm text-primary hover:underline" to={`/contracts/internal-review/${item.ContractId}/assignments/${item.AssignmentId}`}>Open review</Link>
              : <span className="text-sm text-muted-foreground">Assignment link unavailable</span>}</td>
          </tr>)}</tbody>
        </RecordTable></div> : <EmptyState title="No assigned reviews" description="New review tasks will appear here when they are assigned to you." />}
        {loadedScope === viewScope && data && data.total > data.pageSize && <div className="mt-4 flex items-center gap-3 text-sm">
          <Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span>Page {page} of {Math.ceil(data.total / data.pageSize)}</span>
          <Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</Button>
        </div>}
      </>}
    </div></Panel>
  </div>;
}

export function LiveContractReviewDetail() {
  const { id, assignmentId } = useParams();
  const navigate = useNavigate();
  const { tenantId, legalEntityId, principalId, effectiveBranchId, permissions, capabilities } = scope();
  const { authEpoch } = useErpShell();
  const key = `${authEpoch}:${tenantId}:${legalEntityId}:${principalId}:${effectiveBranchId ?? ""}:${id ?? ""}:${assignmentId ?? ""}`;
  const current = useRef(key); current.current = key;
  const [record, setRecord] = useState<AssignedContractReviewDetail | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [pending, setPending] = useState<ContractReviewPending | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const enabled = capabilities.contractInternalReview === true
    && permissions.includes("procurement-contract-review-read");
  useEffect(() => {
    setRecord(null); setLoadedKey(null); setPending(null); setError(""); setReason(""); setBlocked(false); setBusy(false);
    if (!enabled || !id || !assignmentId) return;
    try {
      const saved = readContractReviewPending(window.sessionStorage,
        { companyId: legalEntityId, principalId, contractId: id, assignmentId });
      if (saved) { setPending(saved); setBlocked(true); }
    } catch (cause) { setError(explain(cause)); setBlocked(true); }
    const controller = new AbortController();
    setLoading(true);
    getAssignedContractReview(legalEntityId,id,assignmentId,controller.signal)
      .then((value) => { if (!controller.signal.aborted && current.current === key) { setRecord(value); setLoadedKey(key); } })
      .catch((cause: unknown) => { if (!controller.signal.aborted && current.current === key) setError(explain(cause)); })
      .finally(() => { if (!controller.signal.aborted && current.current === key) setLoading(false); });
    return () => { if (current.current === key) current.current = ""; controller.abort(); };
  }, [key,enabled,legalEntityId,principalId,id,assignmentId]);
  const actual = record !== null && record.ContractId === id && record.assignmentId === assignmentId && loadedKey === key && !loading ? record : null;
  const canDecide = enabled && permissions.includes("procurement-contract-review")
    && Boolean(actual) && !blocked && !pending && !busy;

  function confirmed(value: ContractReviewAck, original: ContractReviewPending, captured: string) {
    if (current.current !== captured) return;
    if (value.ActorPrincipalId !== principalId || actual && value.ReviewBranchId !== actual.ReviewBranchId)
      throw new ContractApiError(0, "The saved decision does not match this ERP review assignment.");
    clearContractReviewPending(window.sessionStorage,original);
    setPending(null); setBlocked(false); navigate("/contracts/internal-review");
  }
  async function decide(action: ContractReviewAction) {
    if (!canDecide || !actual || !id || !assignmentId) return;
    if (action !== "Approve" && !reason.trim()) { setError("Give a reason for Return or Reject."); return; }
    const original: ContractReviewPending = { schemaVersion: 1, companyId: legalEntityId,
      principalId, contractId: id, assignmentId, operation: "Decide", key: crypto.randomUUID() };
    const captured = key;
    try { saveContractReviewPending(window.sessionStorage,original); }
    catch (cause) { setError(explain(cause)); setBlocked(true); return; }
    setPending(original); setBusy(true); setError("");
    try {
      const value = await decideContractReview(legalEntityId,id,assignmentId,original.key,
        { expectedContractVersion: actual.contractVersion, expectedCaseVersion: actual.caseVersion,
          expectedAssignmentVersion: actual.assignmentVersion, action, reason });
      confirmed(value,original,captured);
    } catch (cause) {
      if (current.current === captured) {
        setError(explain(cause)); setBlocked(true);
        if (cause instanceof ContractApiError && cause.status === 422) {
          clearContractReviewPending(window.sessionStorage,original); setPending(null); setBlocked(false);
        }
      }
    } finally { if (current.current === captured) setBusy(false); }
  }
  async function recover() {
    if (!pending || !id || busy || !enabled) return;
    const captured = key;
    setBusy(true); setError("");
    try { confirmed(await recoverContractReview(legalEntityId,id,pending.key,"Decide"),pending,captured); }
    catch (cause) { if (current.current === captured) setError(explain(cause)); }
    finally { if (current.current === captured) setBusy(false); }
  }

  return <div className="p-5 sm:p-8">
    <PageHeader title={actual?.Title ?? "Contract review"} subtitle="Independent internal review of the submitted agreement." />
    {!enabled ? <Panel><p className="p-5 text-sm">Internal contract review is not available for this company yet.</p></Panel> : <>
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      {pending && <Panel title="Check saved decision" className="mb-5"><div className="space-y-3 p-5">
        <p role="status" className="text-sm">A prior decision needs confirmation. No second decision will be sent.</p>
        <Button variant="secondary" disabled={busy} onClick={() => void recover()}>{busy ? "Checking…" : "Check saved decision"}</Button>
      </div></Panel>}
      {loading ? <p role="status">Loading review…</p> : actual ? <>
        <Panel title="Submitted terms"><dl className="grid gap-4 p-5 text-sm sm:grid-cols-2">
          <div><dt>Reference</dt><dd>{actual.Number}</dd></div>
          <div><dt>Submission</dt><dd>{actual.SubmissionNumber}</dd></div>
          <div><dt>Supplier</dt><dd><Link className="text-primary hover:underline" to={`/vendors/${actual.SupplierId}`}>Open supplier</Link></dd></div>
          <div><dt>Type</dt><dd>{actual.terms.ContractType}</dd></div>
          <div><dt>Spending limit</dt><dd>{actual.CurrencyCode} {actual.terms.ceilingAmountExact}</dd></div>
          <div><dt>Dates</dt><dd>{actual.terms.EffectiveFrom || "—"} to {actual.terms.ExpiresOn || "—"}</dd></div>
        </dl></Panel>
        <Panel title="Submitted rate schedule" className="mt-5"><div className="overflow-x-auto p-5"><RecordTable>
          <thead><tr><th>Line</th><th>Description</th><th>Unit</th><th>Unit price</th><th>Maximum quantity</th><th>Status</th></tr></thead>
          <tbody>{actual.terms.rates.map((rate) => <tr key={rate.Id}><td>{rate.LineNumber}</td>
            <td>{rate.Description}</td><td>{rate.UnitCode}</td><td>{actual.CurrencyCode} {rate.unitPriceExact}</td>
            <td>{rate.maximumQuantityExact ?? "—"}</td><td><Badge>{rate.Status}</Badge></td></tr>)}</tbody>
        </RecordTable></div></Panel>
        <Panel title="Internal decision" className="mt-5"><div className="space-y-3 p-5">
          <p className="text-sm text-muted-foreground">Approval here records internal review only. It does not sign or activate the contract.</p>
          <Field label="Reason for Return or Reject"><Textarea maxLength={2000} value={reason}
            onChange={(event) => setReason(event.target.value)} /></Field>
          <div className="flex flex-wrap gap-3">
            <Button disabled={!canDecide} onClick={() => void decide("Approve")}>Approve internal review</Button>
            <Button variant="secondary" disabled={!canDecide || !reason.trim()} onClick={() => void decide("Return")}>Return for correction</Button>
            <Button variant="danger" disabled={!canDecide || !reason.trim()} onClick={() => void decide("Reject")}>Reject review</Button>
          </div>
        </div></Panel>
      </> : !pending && <Panel><p className="p-5 text-sm">This assignment is no longer available. Return to your worklist.</p></Panel>}
    </>}
    <Link to="/contracts/internal-review" className="mt-5 inline-block text-sm text-primary hover:underline">Back to assigned reviews</Link>
  </div>;
}
