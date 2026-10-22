import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Panel, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { useErpShell } from "../lib/erpShell";
import {
  activateReference, ConfigurationApiError, createReference, listReferences, retireReference, updateReference,
  type ReferenceDraft, type ReferenceKind, type ReferencePage, type ReferenceRecord,
} from "../../../src/platform/procurement-configuration-api";

const blank = (): ReferenceDraft => ({ code: "", name: "", parentCode: null,
  expenseAccountRef: null, description: null, policyVersionId: null });
const errorText = (error: unknown) => error instanceof Error ? error.message : "The setting action failed. Try again.";
const labels: Record<ReferenceKind, { singular: string; plural: string; description: string }> = {
  categories: { singular: "category", plural: "Categories", description: "Group spending for buying rules and reports." },
  methods: { singular: "buying method", plural: "Buying methods", description: "Name the ways your team may source a purchase." },
};

export function LiveConfiguration() {
  const readiness = useLiveReadiness(); const { selection } = useErpShell();
  if (!readiness) throw new Error("Procurement settings require an ERP company.");
  if (selection.entityId && selection.entityId !== readiness.legalEntityId)
    return <p role="status">Checking the selected company…</p>;
  return <LiveConfigurationRecord key={[readiness.tenantId, readiness.legalEntityId, selection.branch,
    readiness.workerId ?? "admin"].join(":")} />;
}
function LiveConfigurationRecord() {
  const readiness = useLiveReadiness();
  if (!readiness) throw new Error("Procurement settings require an ERP company.");
  const companyId = readiness.legalEntityId;
  const canEdit = !readiness.adminViewOnly && readiness.permissions.includes("procurement-configuration-edit");
  const canApprove = !readiness.adminViewOnly && readiness.permissions.includes("procurement-configuration-approve");
  const [kind, setKind] = useState<ReferenceKind>("categories");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReferencePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<ReferenceRecord | "new" | null>(null);
  const [activating, setActivating] = useState<ReferenceRecord | null>(null);
  const [retiring, setRetiring] = useState<ReferenceRecord | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [draft, setDraft] = useState<ReferenceDraft>(blank);
  const [saving, setSaving] = useState(false);
  const [writeLocked, setWriteLocked] = useState(false);
  const [checkingSaved, setCheckingSaved] = useState(false);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const alive = useRef(true);
  const busy = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const uncertain = (cause: unknown) => !(cause instanceof ConfigurationApiError)
    || cause.status === 0 || cause.status === 409 || cause.status >= 500;
  const canStart = () => alive.current && !busy.current && !writeLocked;
  const failWrite = (cause: unknown) => {
    if (!alive.current) return;
    setError(errorText(cause));
    if (uncertain(cause)) setWriteLocked(true);
  };
  async function checkSaved() {
    if (!alive.current || busy.current || checkingSaved) return;
    setCheckingSaved(true);
    try {
      const latest = await listReferences(companyId, kind, page);
      if (!alive.current) return;
      setData(latest);
      setError("Saved settings were loaded for comparison. The unconfirmed command is still locked; open the saved record to continue.");
    } catch (cause) { if (alive.current) setError(errorText(cause)); }
    finally { if (alive.current) setCheckingSaved(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setListError("");
    listReferences(companyId, kind, page, controller.signal).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setListError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [companyId, kind, page, refresh]);
  useEffect(() => { setEditing(null); setActivating(null); setRetiring(null); setRemoveReason(""); setError(""); setDraft(blank()); }, [companyId]);
  const changeKind = (next: ReferenceKind) => {
    if (saving || writeLocked) return;
    setKind(next); setPage(1); setEditing(null); setActivating(null); setRetiring(null); setError(""); setData(null);
  };
  const field = <K extends keyof ReferenceDraft>(key: K, value: ReferenceDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const begin = (record?: ReferenceRecord) => {
    if (!canEdit || writeLocked) return;
    setEditing(record ?? "new"); setActivating(null); setRetiring(null); setError("");
    setDraft(record ? { code: record.code, name: record.name, parentCode: record.parentCode || null,
      expenseAccountRef: record.expenseAccountRef || null, description: record.description || null,
      policyVersionId: record.policyVersionId || null } : blank());
  };
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !editing || !canStart()) return;
    busy.current = true;
    setSaving(true); setError("");
    try {
      if (editing === "new") await createReference(companyId, kind, draft);
      else await updateReference(companyId, kind, editing.id, editing.version, draft);
      if (!alive.current) return;
      setEditing(null); setRefresh((value) => value + 1);
    } catch (cause) { failWrite(cause); }
    finally { busy.current = false; if (alive.current) setSaving(false); }
  }
  async function activate(event: FormEvent) {
    event.preventDefault();
    if (!canApprove || !activating || !reviewReason.trim() || !canStart()) return;
    busy.current = true;
    setSaving(true); setError("");
    try {
      await activateReference(companyId, kind, activating.id, activating.version, reviewReason.trim());
      if (!alive.current) return;
      setActivating(null); setReviewReason(""); setRefresh((value) => value + 1);
    } catch (cause) { failWrite(cause); }
    finally { busy.current = false; if (alive.current) setSaving(false); }
  }
  async function removeDraft(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !retiring || !removeReason.trim() || !canStart()) return;
    busy.current = true;
    setSaving(true); setError("");
    try {
      await retireReference(companyId, kind, retiring.id, retiring.version, removeReason);
      if (!alive.current) return;
      setRetiring(null); setRemoveReason(""); setRefresh((value) => value + 1);
    } catch (cause) { failWrite(cause); }
    finally { busy.current = false; if (alive.current) setSaving(false); }
  }
  return <div className="mx-auto max-w-5xl space-y-5">
    <PageHeader title="Buying categories & methods" subtitle="Keep buying categories and methods organized for your company." />
    <div role="tablist" aria-label="Reference type" className="flex gap-2 border-b border-border">
      {(["categories", "methods"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={kind === value} disabled={saving || writeLocked} onClick={() => changeKind(value)} className={`border-b-2 px-4 py-2.5 text-sm font-medium ${kind === value ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{labels[value].plural}</button>)}
    </div>
    {writeLocked && <div role="status" className="rounded-lg border border-border bg-surface p-4 text-sm"><p>A setting change is unconfirmed or the saved record changed. Do not submit it again. Your entered values are still here.</p><Button type="button" variant="secondary" disabled={saving || checkingSaved} onClick={() => void checkSaved()}>{checkingSaved ? "Checking saved settings…" : "Check saved settings (read only)"}</Button></div>}
    <Panel><div className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{labels[kind].plural}</h2><p className="text-sm text-muted-foreground">{labels[kind].description}</p></div>{canEdit && <Button disabled={saving || writeLocked} onClick={() => begin()}>Add {labels[kind].singular}</Button>}</div>
      {listError && <p role="alert" className="mb-4 text-sm text-red-600">{listError}</p>}
      {loading ? <p role="status">Loading {labels[kind].plural.toLowerCase()}…</p> : data?.items.length ? <div className="overflow-x-auto"><RecordTable><thead><tr><th>Code</th><th>Name</th><th>{kind === "categories" ? "Parent" : "Description"}</th><th>Status</th><th>Action</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.id}><td>{item.code}</td><td>{item.name}</td><td>{kind === "categories" ? item.parentCode || "—" : item.description || "—"}</td><td><Badge>{item.status}</Badge></td><td>{(canEdit || canApprove) && item.status === "Draft" ? <div className="flex gap-2">{canEdit && <><Button variant="secondary" disabled={saving || writeLocked} onClick={() => begin(item)}>Edit</Button><Button variant="secondary" disabled={saving || writeLocked} onClick={() => { setRetiring(item); setEditing(null); setActivating(null); setRemoveReason(""); setError(""); }}>Remove</Button></>}{canApprove && <Button variant="secondary" disabled={saving || writeLocked} onClick={() => { setActivating(item); setEditing(null); setRetiring(null); setReviewReason(""); setError(""); }}>Review</Button>}</div> : "—"}</td></tr>)}</tbody></RecordTable></div> : <EmptyState title={`No ${labels[kind].plural.toLowerCase()} yet`} description={`Add a draft ${labels[kind].singular} for this company.`} action={canEdit ? <Button disabled={saving || writeLocked} onClick={() => begin()}>Add {labels[kind].singular}</Button> : undefined} />}
      {data && data.total > data.pageSize && <div className="mt-4 flex items-center gap-3 text-sm"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} of {Math.ceil(data.total / data.pageSize)}</span><Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</Button></div>}
    </div></Panel>
    {canEdit && retiring && <form onSubmit={removeDraft}><fieldset className="min-w-0" disabled={saving}><Panel title={`Remove ${retiring.name}`}><div className="space-y-3 p-5">
      <p className="text-sm text-muted-foreground">Remove this unused draft from buying choices. Its record and history will remain available.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <Field label="Removal reason"><Textarea required maxLength={1000} value={removeReason} onChange={(event) => setRemoveReason(event.target.value)} /></Field>
      <div className="flex gap-2"><Button type="submit" disabled={saving || writeLocked || !removeReason.trim()}>{saving ? "Removing…" : `Remove ${labels[kind].singular}`}</Button><Button variant="secondary" disabled={saving} onClick={() => setRetiring(null)}>Keep draft</Button></div>
    </div></Panel></fieldset></form>}
    {canApprove && activating && <form onSubmit={activate}><fieldset className="min-w-0" disabled={saving}><Panel title={`Review ${activating.name}`}><div className="space-y-3 p-5">
      <p className="text-sm text-muted-foreground">{kind === "categories" ? "Check the category and its parent before making it available for items." : "Check the buying method and any linked policy before making it available."} Another person must review a {labels[kind].singular} you created.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <Field label="Review reason"><Textarea required maxLength={1000} value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} /></Field>
      <div className="flex gap-2"><Button type="submit" disabled={saving || writeLocked || !reviewReason.trim()}>{saving ? "Saving…" : `Activate ${labels[kind].singular}`}</Button><Button variant="secondary" onClick={() => setActivating(null)}>Cancel</Button></div>
    </div></Panel></fieldset></form>}
    {canEdit && editing && <form onSubmit={save}><fieldset className="min-w-0" disabled={saving}><Panel title={editing === "new" ? `New ${labels[kind].singular}` : `Edit ${labels[kind].singular}`}><div className="grid gap-4 p-5 sm:grid-cols-2">
      {error && <p role="alert" className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}{error.toLowerCase().includes("refresh") && <span className="block">Your edits are still here. Compare the current setting before retrying.</span>}</p>}
      <Field label="Code"><Input required maxLength={50} disabled={editing !== "new"} value={draft.code} onChange={(event) => field("code", event.target.value.toUpperCase())} /></Field>
      <Field label="Name"><Input required maxLength={200} value={draft.name} onChange={(event) => field("name", event.target.value)} /></Field>
      {kind === "categories" ? <>
        <Field label="Parent category code"><Input maxLength={50} value={draft.parentCode || ""} onChange={(event) => field("parentCode", event.target.value.toUpperCase() || null)} /></Field>
        <Field label="Expense account reference"><Input maxLength={100} value={draft.expenseAccountRef || ""} onChange={(event) => field("expenseAccountRef", event.target.value || null)} /></Field>
      </> : <Field label="Description" className="sm:col-span-2"><Textarea maxLength={2000} value={draft.description || ""} onChange={(event) => field("description", event.target.value || null)} /></Field>}
      <div className="sm:col-span-2 flex gap-3"><Button type="submit" disabled={saving || writeLocked}>{saving ? "Saving…" : "Save draft"}</Button><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button></div>
    </div></Panel></fieldset></form>}
  </div>;
}
