import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Panel, Select, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import {
  activateItem, createItemDraft, deactivateItem, getItemDraft, listItemDrafts, updateItemDraft,
  type ItemDetail, type ItemDraft, type ItemPage,
} from "../../../src/platform/procurement-items-api";

const initial: ItemDraft = {
  code: "", name: "", kind: "Goods", categoryCode: "", unitCode: "each",
  description: "", brand: "", manufacturer: "", manufacturerPartNumber: "",
  taxCodeRef: "", expenseAccountRef: "", leadTimeDays: null, minimumOrderQuantity: null,
  isStockItem: false, isAsset: false, inspectionRequired: false,
};
const message = (error: unknown) => error instanceof Error ? error.message : "The item action failed. Try again.";
function companyId() {
  const readiness = useLiveReadiness();
  if (!readiness) throw new Error("Items require ERP company context.");
  return readiness.legalEntityId;
}

export function LiveItemList() {
  const company = companyId();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ItemPage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    listItemDrafts(company, { search, page, signal: controller.signal }).then(setData)
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [company, search, page]);
  return <div className="p-5 sm:p-8">
    <PageHeader title="Items" subtitle="Manage goods and services your company may buy." actions={<Link to="/items/new"><Button><Plus size={16} className="mr-2 inline" />Add item</Button></Link>} />
    <Panel><div className="p-5">
      <form className="mb-4 flex max-w-md gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(query.trim()); }}><Input aria-label="Search items" placeholder="Search item name or code" value={query} onChange={(event) => setQuery(event.target.value)} /><Button type="submit" variant="secondary">Search</Button></form>
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      {loading ? <p role="status">Loading items…</p> : data?.items.length ? <div className="overflow-x-auto"><RecordTable>
        <thead><tr><th>Item</th><th>Code</th><th>Type</th><th>Unit</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{data.items.map((item) => <tr key={item.id}><td><Link className="font-medium text-primary hover:underline" to={`/items/${item.id}`}>{item.name}</Link></td><td>{item.code}</td><td>{item.kind}</td><td>{item.unitCode}</td><td><Badge>{item.status}</Badge></td><td><Link className="text-sm text-primary hover:underline" to={`/items/${item.id}`}>Open</Link></td></tr>)}</tbody>
      </RecordTable></div> : <EmptyState title="Add your first item" description="Create a draft item before making it available for buying." action={<Link to="/items/new"><Button>Add item</Button></Link>} />}
      {data && data.total > data.pageSize && <div className="mt-4 flex items-center gap-3 text-sm"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page}</span><Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</Button></div>}
    </div></Panel>
  </div>;
}

export function LiveItemEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const company = companyId();
  const [draft, setDraft] = useState<ItemDraft>(initial);
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!id) { setDraft(initial); return; }
    const controller = new AbortController();
    setLoading(true); setError("");
    getItemDraft(company, id, controller.signal).then((item) => { setDraft({ ...initial, ...item }); setVersion(item.version); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [company, id]);
  const field = (key: keyof ItemDraft, value: string | boolean | number | null) => setDraft((current) => ({ ...current, [key]: value }));
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const result = id && version !== null ? await updateItemDraft(company, id, version, draft) : await createItemDraft(company, draft);
      navigate(`/items/${result.id}`);
    } catch (cause) { setError(message(cause)); }
    finally { setSaving(false); }
  }
  return <div className="p-5 sm:p-8">
    <PageHeader title={id ? "Edit item" : "New item"} subtitle="Save a draft. Items need a separate approval before employees can buy them." />
    {loading ? <p role="status">Loading item…</p> : <form className="max-w-4xl space-y-5" onSubmit={save}>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}{error.toLowerCase().includes("changed") && <span className="block">Your edits are still here. Compare with the current item before retrying.</span>}</p>}
      <Panel title="Item details"><div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Item name"><Input required maxLength={300} value={draft.name} onChange={(event) => field("name", event.target.value)} /></Field>
        <Field label="Item code"><Input required maxLength={50} value={draft.code} onChange={(event) => field("code", event.target.value.toUpperCase())} /></Field>
        <Field label="Type"><Select value={draft.kind} onChange={(event) => field("kind", event.target.value)}><option>Goods</option><option>Service</option><option>Asset</option><option>Subscription</option></Select></Field>
        <Field label="Category code"><Input required value={draft.categoryCode} onChange={(event) => field("categoryCode", event.target.value)} /></Field>
        <Field label="Unit"><Input required value={draft.unitCode} onChange={(event) => field("unitCode", event.target.value)} /></Field>
        <Field label="Brand"><Input value={draft.brand ?? ""} onChange={(event) => field("brand", event.target.value)} /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea rows={3} value={draft.description ?? ""} onChange={(event) => field("description", event.target.value)} /></Field>
      </div></Panel>
      <Panel title="Buying details"><div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Manufacturer"><Input value={draft.manufacturer ?? ""} onChange={(event) => field("manufacturer", event.target.value)} /></Field>
        <Field label="Manufacturer part number"><Input value={draft.manufacturerPartNumber ?? ""} onChange={(event) => field("manufacturerPartNumber", event.target.value)} /></Field>
        <Field label="Lead time in days"><Input type="number" min={0} value={draft.leadTimeDays ?? ""} onChange={(event) => field("leadTimeDays", event.target.value === "" ? null : Number(event.target.value))} /></Field>
        <Field label="Minimum order quantity"><Input type="number" min={0} step="any" value={draft.minimumOrderQuantity ?? ""} onChange={(event) => field("minimumOrderQuantity", event.target.value === "" ? null : Number(event.target.value))} /></Field>
        <Field label="Tax code"><Input value={draft.taxCodeRef ?? ""} onChange={(event) => field("taxCodeRef", event.target.value)} /></Field>
        <Field label="Expense account reference"><Input value={draft.expenseAccountRef ?? ""} onChange={(event) => field("expenseAccountRef", event.target.value)} /></Field>
        <Field label="Stock item"><Select value={draft.isStockItem ? "yes" : "no"} onChange={(event) => field("isStockItem", event.target.value === "yes")}><option value="no">No</option><option value="yes">Yes</option></Select></Field>
        <Field label="Asset"><Select value={draft.isAsset ? "yes" : "no"} onChange={(event) => field("isAsset", event.target.value === "yes")}><option value="no">No</option><option value="yes">Yes</option></Select></Field>
        <Field label="Inspection needed"><Select value={draft.inspectionRequired ? "yes" : "no"} onChange={(event) => field("inspectionRequired", event.target.value === "yes")}><option value="no">No</option><option value="yes">Yes</option></Select></Field>
      </div></Panel>
      <div className="flex gap-3"><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save draft"}</Button><Link to={id ? `/items/${id}` : "/items"}><Button variant="secondary">Cancel</Button></Link></div>
    </form>}
  </div>;
}

export function LiveItemDetail() {
  const { id } = useParams();
  const readiness = useLiveReadiness();
  const company = companyId();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reviewReason, setReviewReason] = useState("");
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true); setError("");
    getItemDraft(company, id, controller.signal).then(setItem)
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [company, id]);
  async function retire() {
    if (!item || !window.confirm("Make this item inactive for future buying?")) return;
    setBusy(true); setError("");
    try { setItem(await deactivateItem(company, item.id, item.version) as ItemDetail); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }
  async function activate() {
    if (!item || !reviewReason.trim()) return;
    setBusy(true); setError("");
    try {
      await activateItem(company, item.id, item.version, reviewReason.trim());
      setItem(await getItemDraft(company, item.id)); setReviewReason("");
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }
  if (loading) return <div role="status" className="p-5 sm:p-8">Loading item…</div>;
  if (!item) return <div role="alert" className="p-5 sm:p-8">{error || "Item not found."}</div>;
  return <div className="p-5 sm:p-8">
    <PageHeader title={item.name} subtitle={`${item.code} · ${item.kind}`} actions={<><Badge>{item.status}</Badge>{item.status === "Inactive" && <Link to={`/items/${item.id}/edit`}><Button variant="secondary">Edit item</Button></Link>}</>} />
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    <div className="grid gap-5 lg:grid-cols-2"><Panel title="Item overview"><dl className="grid grid-cols-2 gap-4 p-5 text-sm"><dt>Category</dt><dd>{item.categoryCode}</dd><dt>Unit</dt><dd>{item.unitCode}</dd><dt>Brand</dt><dd>{item.brand || "—"}</dd><dt>Available for buying</dt><dd>{item.isPurchasable ? "Yes" : "No — approval required"}</dd></dl></Panel><Panel title="Description"><p className="p-5 text-sm">{item.description || "No description."}</p></Panel></div>
    {item.status === "Inactive" && readiness?.permissions.includes("procurement-item-approve") && <Panel title="Review item" className="mt-5"><div className="space-y-3 p-5">
      <p className="text-sm text-muted-foreground">Check its category and buying details. Another person must review an item you created.</p>
      <Field label="Review reason"><Textarea required maxLength={1000} value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} /></Field>
      <Button disabled={busy || !reviewReason.trim()} onClick={() => void activate()}>{busy ? "Saving…" : "Activate item"}</Button>
    </div></Panel>}
    {item.status !== "Inactive" && <div className="mt-6"><Button variant="danger" disabled={busy} onClick={() => void retire()}>Make inactive</Button></div>}
    <Link to="/items" className="mt-5 inline-block text-sm text-primary hover:underline">Back to items</Link>
  </div>;
}
