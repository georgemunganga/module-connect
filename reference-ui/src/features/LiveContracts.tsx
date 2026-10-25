import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Panel, Select, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { ContractDraftRates } from "./ContractDraftRates";
import { ContractInternalReview } from "./ContractInternalReview";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { useErpShell } from "../lib/erpShell";
import { isDefiniteHttpRejection } from "../lib/http-write-outcome";
import { listVendorDrafts, type VendorSummary } from "../../../src/platform/procurement-vendors-api";
import {
  ContractApiError,
  cancelOwnContractDraft, createOwnContractDraft, getOwnContractDraft,
  listOwnContractDrafts, updateOwnContractDraft, validContractCeiling,
  type ContractDetail, type ContractDraft, type ContractPage,
} from "../../../src/platform/procurement-contracts-api";

const errorText = (error: unknown) => error instanceof Error ? error.message : "The contract action failed. Try again.";
function useCompany() {
  const readiness = useLiveReadiness();
  if (!readiness) throw new Error("Contracts require an ERP company.");
  return readiness;
}
function exactMoney(amount: string | undefined, currency: string) {
  if (amount === undefined) return "Exact spending limit unavailable";
  const [whole, fraction = ""] = amount.split(".");
  return currency + " " + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    + "." + fraction.padEnd(2, "0");
}
function emptyDraft(currencyCode: string): ContractDraft {
  return { supplierId: "", title: "", contractType: "Supply", currencyCode,
    ceilingAmount: "0", effectiveFrom: null, expiresOn: null, renewalNoticeOn: null };
}
function validDates(draft: ContractDraft): string | null {
  if (draft.effectiveFrom && draft.expiresOn && draft.expiresOn < draft.effectiveFrom)
    return "Expiry must follow the start date.";
  if (draft.renewalNoticeOn && draft.expiresOn && draft.renewalNoticeOn > draft.expiresOn)
    return "Renewal notice cannot follow expiry.";
  return null;
}

export function LiveContractList() {
  const { tenantId, legalEntityId, principalId, effectiveBranchId, permissions, capabilities } = useCompany();
  const { authEpoch } = useErpShell();
  const viewScope = `${authEpoch}:${tenantId}:${legalEntityId}:${principalId}:${effectiveBranchId ?? ""}`;
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ContractPage | null>(null);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { setPage(1); }, [viewScope]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setData(null); setLoadedScope(null);
    listOwnContractDrafts(legalEntityId, page, controller.signal).then((value) => {
      if (!controller.signal.aborted) { setData(value); setLoadedScope(viewScope); }
    })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [legalEntityId, page, viewScope]);
  return <div className="p-5 sm:p-8">
    <PageHeader title="Contracts" subtitle="Keep supplier agreements together. Drafts need approval and signature before they can be used for purchasing." actions={<div className="flex gap-3">
      {capabilities.contractInternalReview === true && permissions.includes("procurement-contract-review-read") && <Link to="/contracts/internal-review"><Button variant="secondary">Assigned reviews</Button></Link>}
      {permissions.includes("procurement-contract-create") && <Link to="/contracts/new"><Button><Plus size={16} className="mr-2 inline" />New contract</Button></Link>}
    </div>} />
    <Panel><div className="p-5">
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      {loading || loadedScope !== viewScope ? <p role="status">Loading contracts…</p> : data?.items.length ? <div className="overflow-x-auto"><RecordTable>
        <thead><tr><th>Reference</th><th>Contract</th><th>Type</th><th>Limit</th><th>Expires</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{data.items.map((item) => <tr key={item.id}><td>{item.number}</td><td><Link to={`/contracts/${item.id}`} className="font-medium text-primary hover:underline">{item.title}</Link></td><td>{item.contractType}</td><td>{exactMoney(item.ceilingAmountExact, item.currencyCode)}</td><td>{item.expiresOn || "—"}</td><td><Badge>{item.status}</Badge></td><td><Link to={`/contracts/${item.id}`} className="text-sm text-primary hover:underline">Open</Link></td></tr>)}</tbody>
      </RecordTable></div> : <EmptyState title="No contracts yet" description="Create a draft to record the supplier, dates and spending limit." action={permissions.includes("procurement-contract-create") ? <Link to="/contracts/new"><Button>New contract</Button></Link> : undefined} />}
      {loadedScope === viewScope && data && data.total > data.pageSize && <div className="mt-4 flex items-center gap-3 text-sm"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} of {Math.ceil(data.total / data.pageSize)}</span><Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</Button></div>}
    </div></Panel>
  </div>;
}

export function LiveContractEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tenantId, legalEntityId, principalId, effectiveBranchId, defaultCurrencyCode, permissions } = useCompany();
  const { authEpoch } = useErpShell();
  const [draft, setDraft] = useState<ContractDraft>(() => emptyDraft(defaultCurrencyCode));
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const editorContext = `${authEpoch}:${tenantId}:${legalEntityId}:${principalId}:${effectiveBranchId ?? ""}:${id ?? "new"}`;
  const currentEditorContext = useRef(editorContext);
  currentEditorContext.current = editorContext;
  const editorGeneration = useRef(0);
  const [saveBlock, setSaveBlock] = useState<"stale" | "unknown" | null>(null);
  useEffect(() => { setSaveBlock(null); return () => { editorGeneration.current += 1; }; }, [editorContext]);
  const [loadedContext, setLoadedContext] = useState<string | null>(null);
  useEffect(() => {
    setVersion(null); setLoadedContext(null); setSaving(false);
    const controller = new AbortController();
    setLoading(true); setError("");
    (id ? getOwnContractDraft(legalEntityId, id, controller.signal) : Promise.resolve(null))
      .then((record) => {
      if (controller.signal.aborted) return;
      if (record) {
        setVersion(record.version); setLoadedContext(editorContext);
        setDraft({ supplierId: record.supplierId, title: record.title, contractType: record.contractType,
          currencyCode: record.currencyCode, ceilingAmount: record.ceilingAmountExact ?? "",
          effectiveFrom: record.effectiveFrom || null, expiresOn: record.expiresOn || null,
          renewalNoticeOn: record.renewalNoticeOn || null });
      } else { setVersion(null); setLoadedContext(editorContext); setDraft(emptyDraft(defaultCurrencyCode)); }
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, legalEntityId, defaultCurrencyCode, editorContext]);
  useEffect(() => {
    const controller = new AbortController();
    setVendors([]);
    const timer = window.setTimeout(() => {
      setSupplierLoading(true);
      listVendorDrafts(legalEntityId, { search: supplierSearch.trim() || undefined, pageSize: 100, signal: controller.signal })
        .then((page) => { if (!controller.signal.aborted) setVendors(page.items.filter((vendor) => vendor.status === "Draft"
          || ((vendor.status === "Active" || vendor.status === "Approved") && vendor.isOrderable))); })
        .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
        .finally(() => { if (!controller.signal.aborted) setSupplierLoading(false); });
    }, supplierSearch ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [legalEntityId, supplierSearch, editorContext]);
  const field = <K extends keyof ContractDraft>(key: K, value: ContractDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || saveBlock || loading || loadedContext !== editorContext
      || !permissions.includes(id ? "procurement-contract-edit" : "procurement-contract-create")) return;
    if (id && (version === null || loadedContext !== editorContext)) { setError("This draft is unavailable. Return to the list."); return; }
    const savingContext = editorContext;
    const savingGeneration = editorGeneration.current;
    const isCurrentSave = () => currentEditorContext.current === savingContext && editorGeneration.current === savingGeneration;
    setError("");
    const dateIssue = validDates(draft);
    if (dateIssue) { setError(dateIssue); return; }
    if (!validContractCeiling(draft.ceilingAmount)) {
      setError("Enter an exact non-negative spending limit with up to four decimal places."); return;
    }
    if (!draft.supplierId) { setError("Choose a supplier."); return; }
    setSaving(true);
    try {
      const saved = id && version !== null
        ? await updateOwnContractDraft(legalEntityId, id, version, draft)
        : await createOwnContractDraft(legalEntityId, draft);
      if (isCurrentSave()) navigate(`/contracts/${saved.id}`);
    } catch (cause) {
      if (isCurrentSave()) {
        setError(errorText(cause));
        if (cause instanceof ContractApiError && cause.status === 409) setSaveBlock("stale");
        else if (!(cause instanceof ContractApiError) || cause.status === 0 || cause.status >= 500) setSaveBlock("unknown");
      }
    }
    finally { if (isCurrentSave()) setSaving(false); }
  }
  if (!permissions.includes(id ? "procurement-contract-edit" : "procurement-contract-create")) return <p role="alert" className="p-5 sm:p-8">You cannot change this contract for this company.</p>;
  return <div className="p-5 sm:p-8">
    <PageHeader title={id ? "Edit contract draft" : "New contract"} subtitle="Save the commercial details for review. The contract remains a draft until a separate approval and signature process is complete." />
    {loading ? <p role="status">Loading contract…</p> : loadedContext !== editorContext || id && version === null
      ? <p role="alert">{error || "This draft is unavailable. Return to the list."}</p>
      : <form onSubmit={save} className="max-w-5xl space-y-5">
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}{error.toLowerCase().includes("refresh") && <span className="block">Your edits are still here. Compare the current draft before retrying.</span>}</p>}
      {saveBlock && <p role="status" className="rounded-lg border border-border p-3 text-sm">{saveBlock === "stale" ? "The saved contract changed. Review it before saving again." : "The save result was not confirmed. Review saved contracts before trying again."} <Link className="text-primary underline" to={id ? `/contracts/${id}` : "/contracts"}>Review saved contract{id ? "" : "s"}</Link></p>}
      <Panel title="Agreement details"><div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Search suppliers" className="sm:col-span-2"><Input value={supplierSearch} onChange={(event) => setSupplierSearch(event.target.value)} placeholder="Search by name or supplier number" /></Field>
        <Field label="Supplier" className="sm:col-span-2"><Select required value={draft.supplierId} onChange={(event) => field("supplierId", event.target.value)}><option value="">Choose a supplier</option>{draft.supplierId && !vendors.some((vendor) => vendor.id === draft.supplierId) && <option value={draft.supplierId}>Selected supplier</option>}{vendors.map((vendor) => <option value={vendor.id} key={vendor.id}>{vendor.displayName} ({vendor.status})</option>)}</Select></Field>
        {!supplierLoading && !vendors.length && <p className="sm:col-span-2 text-sm text-muted-foreground">{supplierSearch ? "No eligible suppliers match that search." : "Add an eligible supplier before creating a contract."}</p>}
        <Field label="Contract title" className="sm:col-span-2"><Input required maxLength={300} value={draft.title} onChange={(event) => field("title", event.target.value)} /></Field>
        <Field label="Contract type"><Select value={draft.contractType} onChange={(event) => field("contractType", event.target.value)}><option value="Supply">Goods supply</option><option value="Service">Services</option><option value="Framework">Framework agreement</option><option value="Subscription">Subscription</option><option value="Other">Other</option></Select></Field>
        <Field label="Spending limit"><Input required inputMode="decimal" value={draft.ceilingAmount} onChange={(event) => field("ceilingAmount", event.target.value)} /></Field>
        <Field label="Currency"><Input required maxLength={3} value={draft.currencyCode} onChange={(event) => field("currencyCode", event.target.value.toUpperCase())} /></Field>
        <Field label="Starts on"><Input type="date" value={draft.effectiveFrom || ""} onChange={(event) => field("effectiveFrom", event.target.value || null)} /></Field>
        <Field label="Expires on"><Input type="date" value={draft.expiresOn || ""} onChange={(event) => field("expiresOn", event.target.value || null)} /></Field>
        <Field label="Renewal reminder"><Input type="date" value={draft.renewalNoticeOn || ""} onChange={(event) => field("renewalNoticeOn", event.target.value || null)} /></Field>
      </div></Panel>
      <div className="flex gap-3"><Button type="submit" disabled={saving || !!saveBlock || (!draft.supplierId && !vendors.length)}>{saving ? "Saving…" : "Save draft"}</Button><Link to={id ? `/contracts/${id}` : "/contracts"}><Button variant="secondary">Cancel</Button></Link></div>
    </form>}
  </div>;
}

export function LiveContractDetail() {
  const { id } = useParams();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const navigate = useNavigate();
  const { tenantId, legalEntityId, principalId, effectiveBranchId, permissions, capabilities } = useCompany();
  const { authEpoch } = useErpShell();
  const viewScope = `${authEpoch}:${tenantId}:${legalEntityId}:${principalId}:${effectiveBranchId ?? ""}:${id ?? ""}`;
  const currentViewScope = useRef(viewScope); currentViewScope.current = viewScope;
  const [record, setRecord] = useState<ContractDetail | null>(null);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [cancelBlock, setCancelBlock] = useState<"unknown" | "stale" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [rateSafety, setRateSafety] = useState<{ scope: string; safe: boolean } | null>(null);
  const rateSafeRef = useRef(false);
  const ratesEnabled = capabilities.contractDraftRates === true;
  const rateSafe = !ratesEnabled || (rateSafety?.scope === viewScope && rateSafety.safe);
  const onRateSafetyChange = useCallback((captured: string, safe: boolean) => {
    if (currentViewScope.current !== captured) return;
    rateSafeRef.current = safe;
    setRateSafety((old) => old?.scope === captured && old.safe === safe ? old : { scope: captured, safe });
  }, []);
  const onFreshChildContract = useCallback((fresh: ContractDetail) => {
    if (currentViewScope.current !== viewScope || fresh.id !== id) return;
    setRecord((old) => old && fresh.version >= old.version ? fresh : old);
  }, [id, viewScope]);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true); setRecord(null); setLoadedScope(null); setError(""); setReason("");
    busyRef.current = false; rateSafeRef.current = false; setRateSafety(null);
    setBusy(false); setCancelBlock(null);
    getOwnContractDraft(legalEntityId, id, controller.signal).then((value) => {
      if (!controller.signal.aborted) { setRecord(value); setLoadedScope(viewScope); }
    })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, legalEntityId, effectiveBranchId, authEpoch, viewScope]);
  const stillCurrent = (captured: string) => alive.current && currentViewScope.current === captured;
  async function cancel() {
    if (busyRef.current || (ratesEnabled && !rateSafeRef.current) || cancelBlock || loading || !permissions.includes("procurement-contract-edit")) return;
    if (!record || record.id !== id || record.status !== "Draft" || loadedScope !== viewScope || !reason.trim()) return;
    busyRef.current = true; setBusy(true); setError("");
    const captured = viewScope;
    try {
      const saved = await cancelOwnContractDraft(legalEntityId, record.id, record.version, reason.trim());
      if (!stillCurrent(captured)) return;
      if (saved.id !== record.id || saved.version !== record.version + 1)
        throw new ContractApiError(0, "The cancellation response does not match this contract. Refresh the saved record before another change.");
      navigate("/contracts");
    } catch (cause) {
      if (!stillCurrent(captured)) return;
      setError(errorText(cause));
      if (cause instanceof ContractApiError && cause.status === 409) setCancelBlock("stale");
      else if (!(cause instanceof ContractApiError) || !isDefiniteHttpRejection(cause.status)) setCancelBlock("unknown");
    } finally { if (stillCurrent(captured)) { busyRef.current = false; setBusy(false); } }
  }
  async function refreshSavedContract() {
    if (!id || busyRef.current || loading || loadedScope !== viewScope) return;
    const captured = viewScope;
    busyRef.current = true; setBusy(true); setError("");
    try {
      // Cancel has no original-key receipt endpoint. This GET inspects saved
      // state only; it never retries the command or claims receipt recovery.
      const saved = await getOwnContractDraft(legalEntityId, id);
      if (!stillCurrent(captured)) return;
      if (saved.id !== id) throw new ContractApiError(0, "The saved response does not match this contract.");
      setRecord(saved);
      if (cancelBlock === "unknown" && saved.status === "Draft") {
        setError("The saved contract is still a draft. The cancellation result remains unconfirmed; no cancellation was retried.");
      } else { setCancelBlock(null); }
    } catch (cause) { if (stillCurrent(captured)) setError(errorText(cause)); }
    finally { if (stillCurrent(captured)) { busyRef.current = false; setBusy(false); } }
  }
  const writesBlocked = busy || loading || cancelBlock !== null || !rateSafe;
  return <div className="p-5 sm:p-8">
    {loading || loadedScope !== viewScope ? <p role="status">Loading contract…</p> : record && record.id === id ? <>
      <PageHeader title={record.title} subtitle={`${record.number} · Supplier agreement`} actions={!writesBlocked && permissions.includes("procurement-contract-edit") && record.status === "Draft" ? <Link to={`/contracts/${record.id}/edit`}><Button>Edit draft</Button></Link> : undefined} />
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      {cancelBlock && <div role="status" className="mb-4 rounded-lg border border-border p-4 text-sm">
        <p>{cancelBlock === "unknown" ? "Cancellation was not confirmed. Your reason is kept here. Check the saved contract before another change." : "The contract changed. Refresh its saved details before another change."}</p>
        <Button variant="secondary" className="mt-3" disabled={busy} onClick={() => void refreshSavedContract()}>Refresh saved contract</Button>
      </div>}
      <Panel title="Contract details"><dl className="grid gap-5 p-5 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Status</dt><dd className="mt-1"><Badge>{record.status}</Badge></dd></div>
        <div><dt className="text-muted-foreground">Supplier reference</dt><dd className="mt-1"><Link className="text-primary hover:underline" to={`/vendors/${record.supplierId}`}>Open supplier</Link></dd></div>
        <div><dt className="text-muted-foreground">Type</dt><dd className="mt-1">{record.contractType}</dd></div>
        <div><dt className="text-muted-foreground">Spending limit</dt><dd className="mt-1">{exactMoney(record.ceilingAmountExact, record.currencyCode)}</dd></div>
        <div><dt className="text-muted-foreground">Starts on</dt><dd className="mt-1">{record.effectiveFrom || "—"}</dd></div>
        <div><dt className="text-muted-foreground">Expires on</dt><dd className="mt-1">{record.expiresOn || "—"}</dd></div>
        <div><dt className="text-muted-foreground">Renewal reminder</dt><dd className="mt-1">{record.renewalNoticeOn || "—"}</dd></div>
        <div><dt className="text-muted-foreground">Draft revision</dt><dd className="mt-1">{record.draftVersion?.revisionNumber ?? "—"}</dd></div>
        {record.terminationReason && <div className="sm:col-span-2"><dt className="text-muted-foreground">Cancellation reason</dt><dd className="mt-1">{record.terminationReason}</dd></div>}
      </dl></Panel>
      <ContractDraftRates key={`rates:${authEpoch}:${legalEntityId}:${principalId}:${effectiveBranchId ?? ""}:${record.id}`} companyId={legalEntityId}
        scopeKey={`${tenantId}:${legalEntityId}:${principalId}:${effectiveBranchId ?? ""}:${record.id}`}
        safetyScopeKey={viewScope}
        contract={record} enabled={capabilities.contractDraftRates === true}
        canEdit={!busy && !loading && cancelBlock === null
          && permissions.includes("procurement-contract-edit")}
        onFreshContract={onFreshChildContract} onSafetyChange={onRateSafetyChange} />
      <ContractInternalReview key={`review:${authEpoch}:${legalEntityId}:${principalId}:${effectiveBranchId ?? ""}:${record.id}`}
        companyId={legalEntityId} principalId={principalId} contract={record}
        branchId={effectiveBranchId} enabled={capabilities.contractInternalReview === true}
        canSubmit={permissions.includes("procurement-contract-submit")}
        submitBlocked={writesBlocked}
        onFreshContract={onFreshChildContract} />
      {permissions.includes("procurement-contract-edit") && record.status === "Draft" && <Panel title="Cancel draft" className="mt-5"><div className="space-y-3 p-5"><Field label="Reason"><Textarea maxLength={1000} disabled={writesBlocked} value={reason} onChange={(event) => setReason(event.target.value)} /></Field><Button variant="danger" disabled={writesBlocked || !reason.trim()} onClick={() => void cancel()}>{busy ? "Cancelling…" : "Cancel draft"}</Button></div></Panel>}
    </> : <p role="alert">{error || "Contract not found."}</p>}
    <Link to="/contracts" className="mt-5 inline-block text-sm text-primary hover:underline">Back to contracts</Link>
  </div>;
}
