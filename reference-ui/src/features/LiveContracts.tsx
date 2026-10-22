import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Panel, Select, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { listVendorDrafts, type VendorSummary } from "../../../src/platform/procurement-vendors-api";
import {
  ContractApiError,
  cancelOwnContractDraft, createOwnContractDraft, getOwnContractDraft,
  listOwnContractDrafts, updateOwnContractDraft,
  type ContractDetail, type ContractDraft, type ContractPage,
} from "../../../src/platform/procurement-contracts-api";

const errorText = (error: unknown) => error instanceof Error ? error.message : "The contract action failed. Try again.";
function useCompany() {
  const readiness = useLiveReadiness();
  if (!readiness) throw new Error("Contracts require an ERP company.");
  return readiness;
}
function money(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function emptyDraft(currencyCode: string): ContractDraft {
  return { supplierId: "", title: "", contractType: "Supply", currencyCode,
    ceilingAmount: 0, effectiveFrom: null, expiresOn: null, renewalNoticeOn: null };
}
function validDates(draft: ContractDraft): string | null {
  if (draft.effectiveFrom && draft.expiresOn && draft.expiresOn < draft.effectiveFrom)
    return "Expiry must follow the start date.";
  if (draft.renewalNoticeOn && draft.expiresOn && draft.renewalNoticeOn > draft.expiresOn)
    return "Renewal notice cannot follow expiry.";
  return null;
}

export function LiveContractList() {
  const { legalEntityId, adminViewOnly } = useCompany();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ContractPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    listOwnContractDrafts(legalEntityId, page, controller.signal).then(setData)
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [legalEntityId, page]);
  return <div className="p-5 sm:p-8">
    <PageHeader title="Contracts" subtitle="Keep supplier agreements together. Drafts need approval and signature before they can be used for purchasing." actions={!adminViewOnly ? <Link to="/contracts/new"><Button><Plus size={16} className="mr-2 inline" />New contract</Button></Link> : undefined} />
    <Panel><div className="p-5">
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      {loading ? <p role="status">Loading contracts…</p> : data?.items.length ? <div className="overflow-x-auto"><RecordTable>
        <thead><tr><th>Reference</th><th>Contract</th><th>Type</th><th>Limit</th><th>Expires</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{data.items.map((item) => <tr key={item.id}><td>{item.number}</td><td><Link to={`/contracts/${item.id}`} className="font-medium text-primary hover:underline">{item.title}</Link></td><td>{item.contractType}</td><td>{money(item.ceilingAmount, item.currencyCode)}</td><td>{item.expiresOn || "—"}</td><td><Badge>{item.status}</Badge></td><td><Link to={`/contracts/${item.id}`} className="text-sm text-primary hover:underline">Open</Link></td></tr>)}</tbody>
      </RecordTable></div> : <EmptyState title="No contracts yet" description="Create a draft to record the supplier, dates and spending limit." action={!adminViewOnly ? <Link to="/contracts/new"><Button>New contract</Button></Link> : undefined} />}
      {data && data.total > data.pageSize && <div className="mt-4 flex items-center gap-3 text-sm"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} of {Math.ceil(data.total / data.pageSize)}</span><Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</Button></div>}
    </div></Panel>
  </div>;
}

export function LiveContractEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { legalEntityId, defaultCurrencyCode } = useCompany();
  const [draft, setDraft] = useState<ContractDraft>(() => emptyDraft(defaultCurrencyCode));
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const editorContext = `${legalEntityId}:${id ?? "new"}`;
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
          currencyCode: record.currencyCode, ceilingAmount: record.ceilingAmount,
          effectiveFrom: record.effectiveFrom || null, expiresOn: record.expiresOn || null,
          renewalNoticeOn: record.renewalNoticeOn || null });
      } else { setVersion(null); setDraft(emptyDraft(defaultCurrencyCode)); }
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, legalEntityId, defaultCurrencyCode]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSupplierLoading(true);
      listVendorDrafts(legalEntityId, { search: supplierSearch.trim() || undefined, pageSize: 100, signal: controller.signal })
        .then((page) => setVendors(page.items.filter((vendor) => vendor.status === "Draft"
          || ((vendor.status === "Active" || vendor.status === "Approved") && vendor.isOrderable))))
        .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
        .finally(() => { if (!controller.signal.aborted) setSupplierLoading(false); });
    }, supplierSearch ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [legalEntityId, supplierSearch]);
  const field = <K extends keyof ContractDraft>(key: K, value: ContractDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || saveBlock) return;
    if (id && (version === null || loadedContext !== editorContext)) { setError("This draft is unavailable. Return to the list."); return; }
    const savingContext = editorContext;
    const savingGeneration = editorGeneration.current;
    const isCurrentSave = () => currentEditorContext.current === savingContext && editorGeneration.current === savingGeneration;
    setError("");
    const dateIssue = validDates(draft);
    if (dateIssue) { setError(dateIssue); return; }
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
  return <div className="p-5 sm:p-8">
    <PageHeader title={id ? "Edit contract draft" : "New contract"} subtitle="Save the commercial details for review. The contract remains a draft until a separate approval and signature process is complete." />
    {loading ? <p role="status">Loading contract…</p> : id && (version === null || loadedContext !== editorContext)
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
        <Field label="Spending limit"><Input required type="number" min="0" max="99999999999999" step="0.0001" value={draft.ceilingAmount} onChange={(event) => field("ceilingAmount", Number(event.target.value))} /></Field>
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
  const navigate = useNavigate();
  const { legalEntityId, adminViewOnly } = useCompany();
  const [record, setRecord] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true); setError("");
    getOwnContractDraft(legalEntityId, id, controller.signal).then(setRecord)
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, legalEntityId]);
  async function cancel() {
    if (adminViewOnly) return;
    if (!record || !reason.trim()) { setError("Give a reason for cancelling this draft."); return; }
    setBusy(true); setError("");
    try { await cancelOwnContractDraft(legalEntityId, record.id, record.version, reason.trim()); navigate("/contracts"); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  return <div className="p-5 sm:p-8">
    {loading ? <p role="status">Loading contract…</p> : record ? <>
      <PageHeader title={record.title} subtitle={`${record.number} · Supplier agreement`} actions={!adminViewOnly && record.status === "Draft" ? <Link to={`/contracts/${record.id}/edit`}><Button>Edit draft</Button></Link> : undefined} />
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      <Panel title="Contract details"><dl className="grid gap-5 p-5 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Status</dt><dd className="mt-1"><Badge>{record.status}</Badge></dd></div>
        <div><dt className="text-muted-foreground">Supplier reference</dt><dd className="mt-1"><Link className="text-primary hover:underline" to={`/vendors/${record.supplierId}`}>Open supplier</Link></dd></div>
        <div><dt className="text-muted-foreground">Type</dt><dd className="mt-1">{record.contractType}</dd></div>
        <div><dt className="text-muted-foreground">Spending limit</dt><dd className="mt-1">{money(record.ceilingAmount, record.currencyCode)}</dd></div>
        <div><dt className="text-muted-foreground">Starts on</dt><dd className="mt-1">{record.effectiveFrom || "—"}</dd></div>
        <div><dt className="text-muted-foreground">Expires on</dt><dd className="mt-1">{record.expiresOn || "—"}</dd></div>
        <div><dt className="text-muted-foreground">Renewal reminder</dt><dd className="mt-1">{record.renewalNoticeOn || "—"}</dd></div>
        <div><dt className="text-muted-foreground">Draft revision</dt><dd className="mt-1">{record.draftVersion?.revisionNumber ?? "—"}</dd></div>
        {record.terminationReason && <div className="sm:col-span-2"><dt className="text-muted-foreground">Cancellation reason</dt><dd className="mt-1">{record.terminationReason}</dd></div>}
      </dl></Panel>
      {!adminViewOnly && record.status === "Draft" && <Panel title="Cancel draft" className="mt-5"><div className="space-y-3 p-5"><Field label="Reason"><Textarea maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></Field><Button variant="danger" disabled={busy || !reason.trim()} onClick={() => void cancel()}>{busy ? "Cancelling…" : "Cancel draft"}</Button></div></Panel>}
    </> : <p role="alert">{error || "Contract not found."}</p>}
    <Link to="/contracts" className="mt-5 inline-block text-sm text-primary hover:underline">Back to contracts</Link>
  </div>;
}
