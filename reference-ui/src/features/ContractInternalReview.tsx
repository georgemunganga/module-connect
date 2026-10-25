import { useEffect, useRef, useState } from "react";
import { Button, Field, Panel, Textarea } from "../components/ui";
import { ContractApiError, getOwnContractDraft, type ContractDetail } from "../../../src/platform/procurement-contracts-api";
import { correctContractReview, recoverContractReview, submitContractReview,
  type ContractReviewAck } from "../../../src/platform/procurement-contract-review-api";
import { clearContractReviewPending, readContractReviewPending, saveContractReviewPending,
  type ContractReviewPending } from "../../../src/platform/contract-review-journal";

const explain = (cause: unknown) => cause instanceof Error ? cause.message : "The review action could not be confirmed.";

/** An addition to the imported contract detail, with no signature or activation action. */
export function ContractInternalReview({ companyId, principalId, contract, branchId, enabled,
  canSubmit, submitBlocked, onFreshContract }: {
  companyId: string; principalId: string; contract: ContractDetail; branchId: string | null | undefined;
  enabled: boolean; canSubmit: boolean; submitBlocked: boolean;
  onFreshContract: (value: ContractDetail) => void;
}) {
  const scope = `${companyId}:${principalId}:${contract.id}`;
  const liveScope = useRef(scope); liveScope.current = scope;
  useEffect(() => () => { liveScope.current = ""; }, [scope]);
  const [pending, setPending] = useState<ContractReviewPending | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setPending(null); setBlocked(false); setBusy(false); setReason(""); setError("");
    if (!enabled) return;
    try {
      const saved = readContractReviewPending(window.sessionStorage,
        { companyId, principalId, contractId: contract.id, assignmentId: null });
      if (saved) { setPending(saved); setBlocked(true); }
    } catch (cause) { setBlocked(true); setError(explain(cause)); }
  }, [scope, enabled, companyId, principalId, contract.id]);

  async function finish(value: ContractReviewAck, original: ContractReviewPending, captured: string) {
    if (liveScope.current !== captured) return;
    if (value.ActorPrincipalId !== principalId || value.ReviewBranchId !== branchId && original.operation === "Submit")
      throw new ContractApiError(0, "The saved review acknowledgement does not match this ERP account and branch.");
    const fresh = await getOwnContractDraft(companyId, contract.id);
    if (liveScope.current !== captured) return;
    if (fresh.id !== contract.id || fresh.status !== value.contractStatus || fresh.version !== value.contractVersion)
      throw new ContractApiError(0, "The review result needs inspection. No new command will be sent.");
    clearContractReviewPending(window.sessionStorage, original);
    setPending(null); setBlocked(false); setReason(""); onFreshContract(fresh);
  }

  async function send(operation: "Submit" | "Correction") {
    if (!enabled || !canSubmit || submitBlocked || busy || blocked || pending) return;
    if (operation === "Submit" && (contract.status !== "Draft" || !branchId)) {
      setError("Select an ERP branch and review the current draft before submitting."); return;
    }
    if (operation === "Correction" && (contract.status !== "Returned" || !reason.trim())) {
      setError("Give a reason for correcting this returned review."); return;
    }
    const original: ContractReviewPending = { schemaVersion: 1, companyId, principalId,
      contractId: contract.id, assignmentId: null, operation, key: crypto.randomUUID() };
    const captured = scope;
    try { saveContractReviewPending(window.sessionStorage, original); }
    catch (cause) { setError(explain(cause)); setBlocked(true); return; }
    setPending(original); setBusy(true); setError("");
    try {
      const value = operation === "Submit"
        ? await submitContractReview(companyId, contract.id, original.key, contract.version, branchId!)
        : await correctContractReview(companyId, contract.id, original.key, contract.version, reason);
      await finish(value, original, captured);
    } catch (cause) {
      if (liveScope.current === captured) {
        setError(explain(cause)); setBlocked(true);
        // A 422 response is definite; the original key can be cleared safely.
        if (cause instanceof ContractApiError && cause.status === 422) {
          clearContractReviewPending(window.sessionStorage, original); setPending(null); setBlocked(false);
        }
      }
    } finally { if (liveScope.current === captured) setBusy(false); }
  }

  async function recover() {
    if (!pending || busy || !enabled) return;
    const captured = scope;
    setBusy(true); setError("");
    try {
      await finish(await recoverContractReview(companyId, contract.id, pending.key, pending.operation),
        pending, captured);
    } catch (cause) { if (liveScope.current === captured) setError(explain(cause)); }
    finally { if (liveScope.current === captured) setBusy(false); }
  }

  return <Panel title="Internal contract review" className="mt-5"><div className="space-y-3 p-5">
    {!enabled ? <p className="text-sm text-muted-foreground">Internal contract review is not available for this ERP company yet.</p> : <>
      <p className="text-sm text-muted-foreground">Review is an internal decision. It does not sign or activate the supplier agreement.</p>
      <p className="text-sm">Current state: <strong>{contract.status}</strong></p>
      {contract.status === "Approved" && <p className="text-sm">Internally approved. Signature and activation require separate controls.</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {pending && <p role="status" className="text-sm">A prior {pending.operation.toLowerCase()} needs confirmation. No new action will be sent.</p>}
      {pending && <Button variant="secondary" disabled={busy} onClick={() => void recover()}>
        {busy ? "Checking…" : "Check saved review result"}</Button>}
      {canSubmit && contract.status === "Draft" && !pending && <>
        {!branchId && <p role="status" className="text-sm">Choose an ERP branch in the header before submitting.</p>}
        <Button disabled={submitBlocked || busy || blocked || !branchId} onClick={() => void send("Submit")}>Submit for internal review</Button>
      </>}
      {canSubmit && contract.status === "Returned" && !pending && <>
        <Field label="Correction reason"><Textarea maxLength={2000} value={reason}
          onChange={(event) => setReason(event.target.value)} /></Field>
        <Button disabled={submitBlocked || busy || blocked || !reason.trim()} onClick={() => void send("Correction")}>Return to draft for correction</Button>
      </>}
    </>}
  </div></Panel>;
}
