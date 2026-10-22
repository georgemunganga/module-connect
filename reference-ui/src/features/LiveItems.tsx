import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Panel, Select, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useErpShell } from "../lib/erpShell";
import { invoiceDecimal } from "./invoice-values";
import { ItemApiError, catalogPriceCanEdit, catalogPriceEditDraft, updateCatalogPrice, type CatalogPriceEdit } from "../../../src/platform/procurement-items-api";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import {
  activateItem, addCatalogPrice, createItemDraft, deactivateItem, getItemDraft,
  listCatalogPrices, listItemDrafts, publishCatalogPrice, updateItemDraft, withdrawCatalogPrice,
  type CatalogPrice, type ItemDetail, type ItemDraft, type ItemPage,
} from "../../../src/platform/procurement-items-api";
import { listVendorDrafts, type VendorSummary } from "../../../src/platform/procurement-vendors-api";
import { LivePublishedCatalog } from "./LivePublishedCatalog";

const initial: ItemDraft = {
  code: "", name: "", kind: "Goods", categoryCode: "", unitCode: "each",
  description: "", brand: "", manufacturer: "", manufacturerPartNumber: "",
  taxCodeRef: "", expenseAccountRef: "", leadTimeDays: null, minimumOrderQuantity: null,
  isStockItem: false, isAsset: false, inspectionRequired: false,
};
const needsReview = (error: unknown) => !(error instanceof ItemApiError) || error.status === 0 || error.status === 409 || error.status >= 500;
const message = (error: unknown) => error instanceof Error ? error.message : "The item action failed. Try again.";
function companyId() {
  const readiness = useLiveReadiness();
  if (!readiness) throw new Error("Items require ERP company context.");
  return readiness.legalEntityId;
}

export function LiveItemList() {
  const canManage = useLiveReadiness()?.permissions.includes("procurement-item-manage") === true;
  return canManage ? <ManagedItemList /> : <LivePublishedCatalog />;
}

function ManagedItemList() {
  const company = companyId();
  const canManage = true;
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
    <PageHeader title="Items" subtitle="Manage goods and services your company may buy." actions={canManage ? <Link to="/items/new"><Button><Plus size={16} className="mr-2 inline" />Add item</Button></Link> : undefined} />
    <Panel><div className="p-5">
      <form className="mb-4 flex max-w-md gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(query.trim()); }}><Input aria-label="Search items" placeholder="Search item name or code" value={query} onChange={(event) => setQuery(event.target.value)} /><Button type="submit" variant="secondary">Search</Button></form>
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      {loading ? <p role="status">Loading items…</p> : data?.items.length ? <div className="overflow-x-auto"><RecordTable>
        <thead><tr><th>Item</th><th>Code</th><th>Type</th><th>Unit</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{data.items.map((item) => <tr key={item.id}><td><Link className="font-medium text-primary hover:underline" to={`/items/${item.id}`}>{item.name}</Link></td><td>{item.code}</td><td>{item.kind}</td><td>{item.unitCode}</td><td><Badge>{item.status}</Badge></td><td><Link className="text-sm text-primary hover:underline" to={`/items/${item.id}`}>Open</Link></td></tr>)}</tbody>
      </RecordTable></div> : <EmptyState title={canManage ? "Add your first item" : "No items yet"} description={canManage ? "Create a draft item before making it available for buying." : "Your company's items will appear here."} action={canManage ? <Link to="/items/new"><Button>Add item</Button></Link> : undefined} />}
      {data && data.total > data.pageSize && <div className="mt-4 flex items-center gap-3 text-sm"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page}</span><Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</Button></div>}
    </div></Panel>
  </div>;
}

export function LiveItemEditor() {
  const { id } = useParams(); const readiness = useLiveReadiness(); const { selection } = useErpShell();
  if (!readiness?.permissions.includes("procurement-item-manage"))
    return <div className="p-5 sm:p-8" role="alert">Item changes are unavailable for your account. <Link to="/items">Browse approved items</Link></div>;
  return <LiveItemEditorBody key={[readiness?.tenantId, readiness?.legalEntityId, readiness?.principalId, selection.entityId, selection.branch, id ?? "new"].join(":")} />;
}
function LiveItemEditorBody() {
  const { id } = useParams();
  const navigate = useNavigate();
  const company = companyId();
  const [draft, setDraft] = useState<ItemDraft>(initial);
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [unconfirmed,setUnconfirmed]=useState(false);
  const savingRef=useRef(false);
  const mounted = useRef(true); useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [loadedKey, setLoadedKey] = useState<string | null>(id ? null : `${company}:new`);
  const viewOnly = useLiveReadiness()?.permissions.includes("procurement-item-manage") !== true;
  useEffect(() => {
    setVersion(null); setLoadedKey(null);
    if (!id) { setDraft(initial); setLoadedKey(`${company}:new`); return; }
    const controller = new AbortController();
    setLoading(true); setError("");
    getItemDraft(company, id, controller.signal).then((item) => {
      if (controller.signal.aborted) return;
      setDraft({ ...initial, ...item }); setVersion(item.version); setLoadedKey(`${company}:${id}`);
    })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [company, id]);
  const field = (key: keyof ItemDraft, value: string | boolean | number | null) => setDraft((current) => ({ ...current, [key]: value }));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!mounted.current || savingRef.current || saving || unconfirmed || viewOnly || loadedKey !== `${company}:${id ?? "new"}` || id && version === null) {
      setError("Load this item before saving. No new item was created."); return;
    }
    savingRef.current=true;setSaving(true); setError("");
    let started=false;
    try {
      started=true;
      const result = id ? await updateItemDraft(company, id, version!, draft) : await createItemDraft(company, draft);
      if(id && result.id!==id)throw new ItemApiError(0,"The ERP returned a different item. Review the saved record before another change.");
      if (mounted.current) navigate(`/items/${result.id}`);
    } catch (cause) { if (mounted.current) {setError(message(cause));if(started&&needsReview(cause))setUnconfirmed(true);} }
    finally { savingRef.current=false;if (mounted.current) setSaving(false); }
  }
  async function reloadSaved() {
    if(!id || savingRef.current || !mounted.current)return;
    savingRef.current=true;setSaving(true);
    try { const saved=await getItemDraft(company,id);if(!mounted.current)return;
      if(saved.id!==id)throw new ItemApiError(0,"The ERP returned a different item.");
      setDraft({...initial,...saved});setVersion(saved.version);setLoadedKey(`${company}:${id}`);setUnconfirmed(false);setError("");
    } catch(cause){if(mounted.current)setError(message(cause));}finally{savingRef.current=false;if(mounted.current)setSaving(false);}
  }
  return <div className="p-5 sm:p-8">
    <PageHeader title={id ? "Edit item" : "New item"} subtitle="Save a draft. Items need a separate approval before employees can buy them." />
    {loading ? <p role="status">Loading item…</p> : id && loadedKey !== `${company}:${id}`
      ? <div role="alert"><p>{error || "This item could not be loaded for editing. No new item will be created."}</p><Link to="/items">Back to items</Link></div>
      : <form className="max-w-4xl space-y-5" onSubmit={save}>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}{error.toLowerCase().includes("changed") && <span className="block">Your edits are still here. Compare with the current item before retrying.</span>}</p>}
      {unconfirmed && <div className="space-y-2 text-sm"><p role="status">This change is unconfirmed or the item changed. Your entries are still here. Do not submit again; review the saved records first.</p>{id ? <><Link to={`/items/${id}`} target="_blank" rel="noreferrer" className="text-primary">Review saved item</Link><Button type="button" variant="secondary" disabled={saving} onClick={()=>void reloadSaved()}>Reload saved item and discard edits</Button></> : <Link to="/items" className="text-primary">Review items before creating again</Link>}</div>}
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
      <div className="flex gap-3"><Button type="submit" disabled={saving || unconfirmed || viewOnly}>{saving ? "Saving…" : "Save draft"}</Button><Link to={id ? `/items/${id}` : "/items"}><Button variant="secondary">Cancel</Button></Link></div>
    </form>}
  </div>;
}

export function LiveItemDetail() {
  const canManage = useLiveReadiness()?.permissions.includes("procurement-item-manage") === true;
  return canManage ? <ManagedItemDetail /> : <div className="p-5 sm:p-8" role="alert">Item management details are unavailable for your account. <Link className="text-primary" to="/items">Browse approved items</Link></div>;
}

function ManagedItemDetail() {
  const { id } = useParams(); const readiness = useLiveReadiness(); const { selection } = useErpShell();
  return <LiveItemDetailBody key={[readiness?.tenantId, readiness?.legalEntityId, readiness?.principalId, selection.entityId, selection.branch, id].join(":")} />;
}
function LiveItemDetailBody() {
  const { id } = useParams();
  const readiness = useLiveReadiness();
  const viewOnly = readiness?.permissions.includes("procurement-item-manage") !== true;
  const company = companyId();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef=useRef(false);
  const [reviewReason, setReviewReason] = useState("");
  const [prices, setPrices] = useState<CatalogPrice[]>([]);
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [priceError, setPriceError] = useState("");
  const [priceDraft, setPriceDraft] = useState({ supplierId: "", unitPrice: "0",
    effectiveFrom: new Date().toISOString().slice(0, 10) });
  const [publishId, setPublishId] = useState<string | null>(null);
  const [publishReason, setPublishReason] = useState("");
  const [withdrawId, setWithdrawId] = useState<string | null>(null);
  const [withdrawReason, setWithdrawReason] = useState("");
  const mounted = useRef(true); useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [priceEdit, setPriceEdit] = useState<{ price: CatalogPrice; draft: CatalogPriceEdit } | null>(null);
  const [writeUnconfirmed, setWriteUnconfirmed] = useState(false);
  const [priceSaved, setPriceSaved] = useState("");
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true); setError("");
    getItemDraft(company, id, controller.signal).then((value) => { if (!controller.signal.aborted) setItem(value); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [company, id]);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    Promise.all([
      listCatalogPrices(company, id, controller.signal),
      listVendorDrafts(company, { status: "Active", pageSize: 100, signal: controller.signal }),
    ]).then(([entries, supplierPage]) => {
      if (controller.signal.aborted) return;
      setPrices(entries); setVendors(supplierPage.items.filter((supplier) => supplier.isOrderable));
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setPriceError(message(cause)); });
    return () => controller.abort();
  }, [company, id]);
  async function mutate<T,>(command:()=>Promise<T>, after:(saved:T)=>Promise<void>|void, report:(value:string)=>void) {
    if(!mounted.current || viewOnly || busyRef.current || busy || writeUnconfirmed)return;
    busyRef.current=true;setBusy(true);let started=false,confirmed=false;
    try {started=true;const saved=await command();confirmed=true;if(!mounted.current)return;await after(saved);}
    catch(cause){if(mounted.current){report(message(cause));if(confirmed||(started&&needsReview(cause)))setWriteUnconfirmed(true);}}
    finally{busyRef.current=false;if(mounted.current)setBusy(false);}
  }
  async function reloadSavedItem() {
    if(!item || !mounted.current || busyRef.current)return;
    busyRef.current=true;setBusy(true);
    try {const [fresh,entries]=await Promise.all([getItemDraft(company,item.id),listCatalogPrices(company,item.id)]);if(!mounted.current)return;
      if(fresh.id!==item.id)throw new ItemApiError(0,"The ERP returned a different item.");
      setItem(fresh);setPrices(entries);setPriceEdit(null);setPublishId(null);setWithdrawId(null);setReviewReason("");setPublishReason("");setWithdrawReason("");setPriceDraft({supplierId:"",unitPrice:"0",effectiveFrom:new Date().toISOString().slice(0,10)});setWriteUnconfirmed(false);setError("");setPriceError("");setPriceSaved("Saved item and prices reloaded. Unsaved changes were discarded.");
    }catch(cause){if(mounted.current)setPriceError(message(cause));}finally{busyRef.current=false;if(mounted.current)setBusy(false);}
  }
  async function retire() {
    if(!mounted.current || viewOnly || busyRef.current || busy || writeUnconfirmed || !item || !window.confirm("Make this item inactive for future buying?"))return;
    setError("");await mutate(()=>deactivateItem(company,item.id,item.version),saved=>{if(saved.id!==item.id)throw new ItemApiError(0,"The ERP returned a different item.");setItem(saved as ItemDetail);},setError);
  }
  async function activate() {
    if(!mounted.current || viewOnly || busyRef.current || busy || writeUnconfirmed || !item || !reviewReason.trim())return;setError("");
    await mutate(()=>activateItem(company,item.id,item.version,reviewReason.trim()),async saved=>{if(saved.id!==item.id)throw new ItemApiError(0,"The ERP returned a different item.");const fresh=await getItemDraft(company,item.id);if(!mounted.current)return;if(fresh.id!==item.id)throw new ItemApiError(0,"The ERP returned a different item.");setItem(fresh);setReviewReason("");},setError);
  }
  async function addPrice(event:FormEvent) {
    event.preventDefault();if(!mounted.current || viewOnly || busyRef.current || busy || writeUnconfirmed || !item || !priceDraft.supplierId)return;
    let entry;try{entry={supplierId:priceDraft.supplierId,currencyCode:readiness!.defaultCurrencyCode,unitCode:item.unitCode,unitPrice:invoiceDecimal(priceDraft.unitPrice),effectiveFrom:new Date(`${priceDraft.effectiveFrom}T00:00:00Z`).toISOString()};}
    catch(cause){setPriceError(message(cause));return;}
    setPriceError("");await mutate(()=>addCatalogPrice(company,item.id,entry),async saved=>{if(saved.catalogItemId!==item.id)throw new ItemApiError(0,"The ERP returned a price for a different item.");const entries=await listCatalogPrices(company,item.id);if(!mounted.current)return;setPrices(entries);setPriceSaved("Draft price added. It still needs separate review before buying.");},setPriceError);
  }
  function editPrice(price: CatalogPrice) {
    if (!mounted.current || viewOnly || busyRef.current || busy || writeUnconfirmed || !readiness?.permissions.includes("procurement-item-manage")) return;
    try { setPriceEdit({ price, draft: catalogPriceEditDraft(price) }); setPriceError(""); setPriceSaved(""); setPublishId(null); setWithdrawId(null); }
    catch (cause) { setPriceError(message(cause)); }
  }
  async function savePrice(event: FormEvent) {
    event.preventDefault();
    if (!mounted.current || viewOnly || busyRef.current || busy || writeUnconfirmed || !item || !priceEdit || !readiness?.permissions.includes("procurement-item-manage")
      || priceEdit.price.catalogItemId !== item.id || !catalogPriceCanEdit(priceEdit.price)) return;
    let entry: CatalogPriceEdit;
    try { entry = { ...priceEdit.draft, unitPrice: invoiceDecimal(priceEdit.draft.unitPrice),
      minimumQuantity: priceEdit.draft.minimumQuantity === null || priceEdit.draft.minimumQuantity === "" ? null : invoiceDecimal(priceEdit.draft.minimumQuantity),
      maximumQuantity: priceEdit.draft.maximumQuantity === null || priceEdit.draft.maximumQuantity === "" ? null : invoiceDecimal(priceEdit.draft.maximumQuantity) }; }
    catch (cause) { setPriceError(message(cause)); return; }
    setPriceError("");setPriceSaved("");
    await mutate(()=>updateCatalogPrice(company,item.id,priceEdit.price.id,priceEdit.price.version,entry),saved=>{
      if(saved.catalogItemId!==item.id || saved.id!==priceEdit.price.id)throw new ItemApiError(0,"The ERP returned a different catalog price.");
      setPrices(values=>values.map(value=>value.id===saved.id?saved:value));setPriceEdit(null);setPriceSaved("Draft price updated. It still needs separate review before buying.");
    },setPriceError);
  }
  async function checkSavedPrices() {
    if (!mounted.current || !item || busyRef.current || busy) return;
    busyRef.current=true;setBusy(true);
    try { const saved = await listCatalogPrices(company, item.id); if (mounted.current) setPrices(saved); }
    catch (cause) { if (mounted.current) setPriceError(message(cause)); }
    finally {busyRef.current=false; if (mounted.current) setBusy(false); }
  }
  async function publishPrice() {
    if(!mounted.current || viewOnly || busyRef.current || busy || writeUnconfirmed || !item || !publishId || !publishReason.trim())return;const price=prices.find(value=>value.id===publishId);if(!price)return;
    setPriceError("");await mutate(()=>publishCatalogPrice(company,item.id,price.id,price.version,publishReason.trim()),async saved=>{if(saved.catalogItemId!==item.id || saved.id!==price.id)throw new ItemApiError(0,"The ERP returned a different catalog price.");const entries=await listCatalogPrices(company,item.id);if(!mounted.current)return;setPrices(entries);setPublishId(null);setPublishReason("");},setPriceError);
  }
  async function withdrawPrice() {
    if(!mounted.current || viewOnly || busyRef.current || busy || writeUnconfirmed || !item || !withdrawId || !withdrawReason.trim())return;const price=prices.find(value=>value.id===withdrawId);if(!price)return;
    setPriceError("");await mutate(()=>withdrawCatalogPrice(company,item.id,price.id,price.version,withdrawReason.trim()),async saved=>{if(saved.catalogItemId!==item.id || saved.id!==price.id)throw new ItemApiError(0,"The ERP returned a different catalog price.");const entries=await listCatalogPrices(company,item.id);if(!mounted.current)return;setPrices(entries);setWithdrawId(null);setWithdrawReason("");},setPriceError);
  }
  if (loading) return <div role="status" className="p-5 sm:p-8">Loading item…</div>;
  if (!item) return <div role="alert" className="p-5 sm:p-8">{error || "Item not found."}</div>;
  return <div className="p-5 sm:p-8">
    <PageHeader title={item.name} subtitle={`${item.code} · ${item.kind}`} actions={<><Badge>{item.status}</Badge>{!viewOnly && !writeUnconfirmed && !busy && item.status === "Inactive" && <Link to={`/items/${item.id}/edit`}><Button variant="secondary">Edit item</Button></Link>}</>} />
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    {writeUnconfirmed && <div className="mb-4 space-y-2 text-sm"><p role="status">A change is unconfirmed or this record changed. Your entries are preserved. Review the saved item and prices before another action; no command will be sent again automatically.</p><Button variant="secondary" disabled={busy} onClick={()=>void reloadSavedItem()}>Reload saved item and discard edits</Button><Link to={`/items/${item.id}`} target="_blank" rel="noreferrer" className="ml-3 text-primary">Review saved item</Link></div>}
    <div className="grid gap-5 lg:grid-cols-2"><Panel title="Item overview"><dl className="grid grid-cols-2 gap-4 p-5 text-sm"><dt>Category</dt><dd>{item.categoryCode}</dd><dt>Unit</dt><dd>{item.unitCode}</dd><dt>Brand</dt><dd>{item.brand || "—"}</dd><dt>Available for buying</dt><dd>{item.isPurchasable ? "Yes" : "No — approval required"}</dd></dl></Panel><Panel title="Description"><p className="p-5 text-sm">{item.description || "No description."}</p></Panel></div>
    {!viewOnly && item.status === "Inactive" && readiness?.permissions.includes("procurement-item-approve") && <Panel title="Review item" className="mt-5"><div className="space-y-3 p-5">
      <p className="text-sm text-muted-foreground">Check its category and buying details. Another person must review an item you created.</p>
      <Field label="Review reason"><Textarea required maxLength={1000} value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} /></Field>
      <Button disabled={busy || writeUnconfirmed || !reviewReason.trim()} onClick={() => void activate()}>{busy ? "Saving…" : "Activate item"}</Button>
    </div></Panel>}
    {item.status === "Active" && <Panel title="Catalog prices" className="mt-5"><div className="space-y-4 p-5">
      <p className="text-sm text-muted-foreground">A vendor price needs a separate review before employees see it in the catalog.</p>
      {priceSaved && <p role="status">{priceSaved}</p>}
      {priceError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{priceError}</p>}
      {prices.length ? <div className="overflow-x-auto"><RecordTable><thead><tr><th>Vendor</th><th>Price</th><th>Starts</th><th>Status</th><th>Action</th></tr></thead><tbody>{prices.map((price) => <tr key={price.id}>
        <td>{vendors.find((vendor) => vendor.id === price.supplierId)?.displayName ?? "Vendor reference unavailable"}</td>
        <td>{price.currencyCode} {price.exactAmounts?.unitPrice ?? price.unitPrice.toLocaleString()} / {price.unitCode}</td>
        <td>{price.effectiveFrom?.slice(0, 10)}</td><td><Badge>{price.status}</Badge></td>
        <td><div className="flex flex-wrap gap-2">
          {!viewOnly && catalogPriceCanEdit(price) && readiness?.permissions.includes("procurement-item-manage") &&
            <Button variant="secondary" disabled={busy || writeUnconfirmed} onClick={() => editPrice(price)}>Edit draft price</Button>}
          {!viewOnly && price.status === "Draft" && readiness?.permissions.includes("procurement-catalog-approve") &&
            <Button variant="secondary" disabled={busy || writeUnconfirmed} onClick={() => { if(busyRef.current || !mounted.current || writeUnconfirmed)return;setPublishId(price.id); setWithdrawId(null); setPublishReason(""); setPriceError(""); }}>Review price</Button>}
          {!viewOnly && price.status !== "Withdrawn" && readiness?.permissions.includes("procurement-item-manage") &&
            <Button variant="secondary" disabled={busy || writeUnconfirmed} onClick={() => { if(busyRef.current || !mounted.current || writeUnconfirmed)return;setWithdrawId(price.id); setPublishId(null); setWithdrawReason(""); setPriceError(""); }}>Withdraw price</Button>}
          {price.status === "Withdrawn" && "—"}
        </div></td>
      </tr>)}</tbody></RecordTable></div> : <p className="text-sm">No vendor prices added yet.</p>}
      {!viewOnly && priceEdit && <form aria-label="Edit catalog draft price" className="space-y-4 rounded-lg border border-border p-4" onSubmit={event => void savePrice(event)}>
        <p className="text-sm">Correct this draft. Saved tax, quantity, audience and date details stay with this price.</p>
        <fieldset disabled={busy || writeUnconfirmed} className="grid gap-3 sm:grid-cols-2">
          <Field label="Price vendor"><Select value={priceEdit.draft.supplierId ?? ""} onChange={event => setPriceEdit(current => current && ({ ...current, draft: { ...current.draft, supplierId: event.target.value || null } }))}>
            <option value="">No vendor selected</option>
            {priceEdit.draft.supplierId && !vendors.some(vendor => vendor.id === priceEdit.draft.supplierId) && <option value={priceEdit.draft.supplierId}>Saved vendor — current selection unavailable</option>}
            {vendors.map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.displayName}</option>)}
          </Select></Field>
          <Field label="Price currency"><Input required maxLength={3} value={priceEdit.draft.currencyCode} onChange={event => setPriceEdit(current => current && ({ ...current, draft: { ...current.draft, currencyCode: event.target.value.toUpperCase() } }))} /></Field>
          <Field label="Price unit"><Input required maxLength={30} value={priceEdit.draft.unitCode} onChange={event => setPriceEdit(current => current && ({ ...current, draft: { ...current.draft, unitCode: event.target.value } }))} /></Field>
          <Field label="Draft unit price"><Input required inputMode="decimal" value={priceEdit.draft.unitPrice} onChange={event => setPriceEdit(current => current && ({ ...current, draft: { ...current.draft, unitPrice: event.target.value } }))} /></Field>
          <Field label="Minimum price quantity"><Input inputMode="decimal" value={priceEdit.draft.minimumQuantity ?? ""} onChange={event => setPriceEdit(current => current && ({ ...current, draft: { ...current.draft, minimumQuantity: event.target.value || null } }))} /></Field>
          <Field label="Maximum price quantity"><Input inputMode="decimal" value={priceEdit.draft.maximumQuantity ?? ""} onChange={event => setPriceEdit(current => current && ({ ...current, draft: { ...current.draft, maximumQuantity: event.target.value || null } }))} /></Field>
          <Field label="Tax basis"><Input value={priceEdit.draft.taxBasis ?? ""} onChange={event => setPriceEdit(current => current && ({ ...current, draft: { ...current.draft, taxBasis: event.target.value || null } }))} /></Field>
          <Field label="Audience code"><Input value={priceEdit.draft.audienceCode ?? ""} onChange={event => setPriceEdit(current => current && ({ ...current, draft: { ...current.draft, audienceCode: event.target.value || null } }))} /></Field>
          <Field label="Draft price starts"><Input type="date" required value={priceEdit.draft.effectiveFrom.slice(0,10)} onChange={event => setPriceEdit(current => current && ({ ...current, draft: { ...current.draft, effectiveFrom: event.target.value === current.price.effectiveFrom.slice(0,10) ? current.price.effectiveFrom : `${event.target.value}T00:00:00Z` } }))} /></Field>
          <Field label="Draft price ends"><Input type="date" value={priceEdit.draft.effectiveTo?.slice(0,10) ?? ""} onChange={event => setPriceEdit(current => current && ({ ...current, draft: { ...current.draft, effectiveTo: !event.target.value ? null : event.target.value === current.price.effectiveTo?.slice(0,10) ? current.price.effectiveTo : `${event.target.value}T00:00:00Z` } }))} /></Field>
        </fieldset>
        {writeUnconfirmed && <p role="status">This save is unconfirmed. Check saved prices before taking another action. Your correction stays here; it will not be sent again automatically.</p>}
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || writeUnconfirmed}>{busy ? "Saving…" : "Save draft price"}</Button>
          <Button variant="secondary" disabled={busy} onClick={() => void checkSavedPrices()}>Check saved prices</Button>
          <Button variant="secondary" disabled={busy} onClick={() => { setPriceEdit(null); setPriceError(""); }}>Close correction</Button></div>
      </form>}
      {!viewOnly && publishId && <div className="space-y-3 rounded-lg border border-border p-4">
        <p className="text-sm">Review the vendor, amount, unit and dates. A different person must approve a price they entered.</p>
        <Field label="Price review reason"><Textarea required maxLength={1000} value={publishReason} onChange={(event) => setPublishReason(event.target.value)} /></Field>
        <div className="flex gap-2"><Button disabled={busy || writeUnconfirmed || !publishReason.trim()} onClick={() => void publishPrice()}>{busy ? "Saving…" : "Publish price"}</Button><Button variant="secondary" onClick={() => setPublishId(null)}>Cancel</Button></div>
      </div>}
      {!viewOnly && withdrawId && <div className="space-y-3 rounded-lg border border-border p-4">
        <p className="text-sm">Withdraw this price from future buying. Existing requests keep their history.</p>
        <Field label="Withdrawal reason"><Textarea required maxLength={1000} value={withdrawReason} onChange={(event) => setWithdrawReason(event.target.value)} /></Field>
        <div className="flex gap-2"><Button variant="danger" disabled={busy || writeUnconfirmed || !withdrawReason.trim()} onClick={() => void withdrawPrice()}>{busy ? "Saving…" : "Confirm withdrawal"}</Button><Button variant="secondary" onClick={() => setWithdrawId(null)}>Cancel</Button></div>
      </div>}
      {!viewOnly && readiness?.permissions.includes("procurement-item-manage") && <form className="grid gap-3 border-t border-border pt-4 sm:grid-cols-4" onSubmit={(event) => void addPrice(event)}>
        <Field label="Vendor" className="sm:col-span-2"><Select required value={priceDraft.supplierId} onChange={(event) => setPriceDraft((value) => ({ ...value, supplierId: event.target.value }))}><option value="">Choose approved vendor</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.displayName}</option>)}</Select></Field>
        <Field label={`Unit price (${readiness.defaultCurrencyCode})`}><Input required inputMode="decimal" value={priceDraft.unitPrice} onChange={(event) => setPriceDraft((value) => ({ ...value, unitPrice: event.target.value }))} /></Field>
        <Field label="Price starts"><Input required type="date" value={priceDraft.effectiveFrom} onChange={(event) => setPriceDraft((value) => ({ ...value, effectiveFrom: event.target.value }))} /></Field>
        <div className="sm:col-span-4 flex items-center gap-3"><Button type="submit" disabled={busy || writeUnconfirmed || !vendors.length || !priceDraft.supplierId}>{busy ? "Saving…" : "Add draft price"}</Button>{!vendors.length && <Link to="/vendors" className="text-sm text-primary hover:underline">Add an approved vendor first</Link>}</div>
      </form>}
    </div></Panel>}
    {!viewOnly && item.status !== "Inactive" && <div className="mt-6"><Button variant="danger" disabled={busy || writeUnconfirmed} onClick={() => void retire()}>Make inactive</Button></div>}
    <Link to="/items" className="mt-5 inline-block text-sm text-primary hover:underline">Back to items</Link>
  </div>;
}
