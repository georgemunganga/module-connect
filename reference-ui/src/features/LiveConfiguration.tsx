import { useEffect, useState, type FormEvent } from "react";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Panel, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import {
  activateReference, createReference, listReferences, updateReference,
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
  const readiness = useLiveReadiness();
  if (!readiness) throw new Error("Procurement settings require an ERP company.");
  const companyId = readiness.legalEntityId;
  const [kind, setKind] = useState<ReferenceKind>("categories");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReferencePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<ReferenceRecord | "new" | null>(null);
  const [activating, setActivating] = useState<ReferenceRecord | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [draft, setDraft] = useState<ReferenceDraft>(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setListError("");
    listReferences(companyId, kind, page, controller.signal).then(setData)
      .catch((cause: unknown) => { if (!controller.signal.aborted) setListError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [companyId, kind, page, refresh]);
  const changeKind = (next: ReferenceKind) => {
    setKind(next); setPage(1); setEditing(null); setActivating(null); setError(""); setData(null);
  };
  const field = <K extends keyof ReferenceDraft>(key: K, value: ReferenceDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const begin = (record?: ReferenceRecord) => {
    setEditing(record ?? "new"); setError("");
    setDraft(record ? { code: record.code, name: record.name, parentCode: record.parentCode || null,
      expenseAccountRef: record.expenseAccountRef || null, description: record.description || null,
      policyVersionId: record.policyVersionId || null } : blank());
  };
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true); setError("");
    try {
      if (editing === "new") await createReference(companyId, kind, draft);
      else await updateReference(companyId, kind, editing.id, editing.version, draft);
      setEditing(null); setRefresh((value) => value + 1);
    } catch (cause) { setError(errorText(cause)); }
    finally { setSaving(false); }
  }
  async function activate(event: FormEvent) {
    event.preventDefault();
    if (!activating || !reviewReason.trim()) return;
    setSaving(true); setError("");
    try {
      await activateReference(companyId, kind, activating.id, activating.version, reviewReason.trim());
      setActivating(null); setReviewReason(""); setRefresh((value) => value + 1);
    } catch (cause) { setError(errorText(cause)); }
    finally { setSaving(false); }
  }
  return <div className="mx-auto max-w-5xl space-y-5">
    <PageHeader title="Buying categories & methods" subtitle="Keep buying categories and methods organized for your company." />
    <div role="tablist" aria-label="Reference type" className="flex gap-2 border-b border-border">
      {(["categories", "methods"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={kind === value} onClick={() => changeKind(value)} className={`border-b-2 px-4 py-2.5 text-sm font-medium ${kind === value ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{labels[value].plural}</button>)}
    </div>
    <Panel><div className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{labels[kind].plural}</h2><p className="text-sm text-muted-foreground">{labels[kind].description}</p></div><Button onClick={() => begin()}>Add {labels[kind].singular}</Button></div>
      {listError && <p role="alert" className="mb-4 text-sm text-red-600">{listError}</p>}
      {loading ? <p role="status">Loading {labels[kind].plural.toLowerCase()}…</p> : data?.items.length ? <div className="overflow-x-auto"><RecordTable><thead><tr><th>Code</th><th>Name</th><th>{kind === "categories" ? "Parent" : "Description"}</th><th>Status</th><th>Action</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.id}><td>{item.code}</td><td>{item.name}</td><td>{kind === "categories" ? item.parentCode || "—" : item.description || "—"}</td><td><Badge>{item.status}</Badge></td><td>{item.status === "Draft" ? <div className="flex gap-2"><Button variant="secondary" onClick={() => begin(item)}>Edit</Button>{readiness.permissions.includes("procurement-configuration-approve") && <Button variant="secondary" onClick={() => { setActivating(item); setEditing(null); setReviewReason(""); setError(""); }}>Review</Button>}</div> : "—"}</td></tr>)}</tbody></RecordTable></div> : <EmptyState title={`No ${labels[kind].plural.toLowerCase()} yet`} description={`Add a draft ${labels[kind].singular} for this company.`} action={<Button onClick={() => begin()}>Add {labels[kind].singular}</Button>} />}
      {data && data.total > data.pageSize && <div className="mt-4 flex items-center gap-3 text-sm"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} of {Math.ceil(data.total / data.pageSize)}</span><Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</Button></div>}
    </div></Panel>
    {activating && <form onSubmit={activate}><Panel title={`Review ${activating.name}`}><div className="space-y-3 p-5">
      <p className="text-sm text-muted-foreground">{kind === "categories" ? "Check the category and its parent before making it available for items." : "Check the buying method and any linked policy before making it available."} Another person must review a {labels[kind].singular} you created.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <Field label="Review reason"><Textarea required maxLength={1000} value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} /></Field>
      <div className="flex gap-2"><Button type="submit" disabled={saving || !reviewReason.trim()}>{saving ? "Saving…" : `Activate ${labels[kind].singular}`}</Button><Button variant="secondary" onClick={() => setActivating(null)}>Cancel</Button></div>
    </div></Panel></form>}
    {editing && <form onSubmit={save}><Panel title={editing === "new" ? `New ${labels[kind].singular}` : `Edit ${labels[kind].singular}`}><div className="grid gap-4 p-5 sm:grid-cols-2">
      {error && <p role="alert" className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}{error.toLowerCase().includes("refresh") && <span className="block">Your edits are still here. Compare the current setting before retrying.</span>}</p>}
      <Field label="Code"><Input required maxLength={50} disabled={editing !== "new"} value={draft.code} onChange={(event) => field("code", event.target.value.toUpperCase())} /></Field>
      <Field label="Name"><Input required maxLength={200} value={draft.name} onChange={(event) => field("name", event.target.value)} /></Field>
      {kind === "categories" ? <>
        <Field label="Parent category code"><Input maxLength={50} value={draft.parentCode || ""} onChange={(event) => field("parentCode", event.target.value.toUpperCase() || null)} /></Field>
        <Field label="Expense account reference"><Input maxLength={100} value={draft.expenseAccountRef || ""} onChange={(event) => field("expenseAccountRef", event.target.value || null)} /></Field>
      </> : <Field label="Description" className="sm:col-span-2"><Textarea maxLength={2000} value={draft.description || ""} onChange={(event) => field("description", event.target.value || null)} /></Field>}
      <div className="sm:col-span-2 flex gap-3"><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save draft"}</Button><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button></div>
    </div></Panel></form>}
  </div>;
}
