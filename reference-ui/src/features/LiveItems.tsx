import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MoreHorizontal, Package, Plus } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Panel, Select, Textarea } from "../components/ui";
import { DetailSection, DetailTabs, DetailValue } from "../components/data/DetailPrimitives";
import { RecordTable } from "../components/data/RecordTable";
import { LiveCatalogDirectory } from "../components/data/LiveCatalogDirectory";
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
  const readiness = useLiveReadiness(); const { selection, authEpoch } = useErpShell();
  if (!readiness) throw new Error("Items require ERP company context.");
  if (selection.entityId && selection.entityId !== readiness.legalEntityId)
    return <p role="status">Checking the selected company…</p>;
  const canManage = readiness.permissions.includes("procurement-item-manage");
  return canManage ? <ManagedItemList key={[authEpoch, readiness.tenantId, readiness.legalEntityId,
    selection.branch ?? "", readiness.principalId, readiness.permissions.slice().sort().join("|")].join(":")} />
    : <LivePublishedCatalog />;
}

function ManagedItemList() {
  const company = companyId();
  const canManage = true;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<ItemPage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setData(null);
    listItemDrafts(company, { search, page, signal: controller.signal }).then(result => { if (!controller.signal.aborted) setData(result); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [company, search, page, revision]);
  return <div className="p-5 sm:p-8">
    <LiveCatalogDirectory key={`${search}:${page}`} title="Items" entity="items"
      subtitle="Manage goods and services your company may buy."
      columns={[{ key: "number", label: "Item / Code", width: 260 }, { key: "kind", label: "Type", width: 110 },
        { key: "category", label: "Category", width: 135 }, { key: "unit", label: "Unit", width: 85 },
        { key: "purchasable", label: "Available to buy", width: 140 }, { key: "status", label: "Status", width: 110 }]}
      rows={(data?.items ?? []).map(item => ({ id: item.id, number: item.code, title: item.name,
        status: item.status, path: `/items/${item.id}`, fields: { kind: item.kind, category: item.categoryCode,
          unit: item.unitCode, purchasable: item.isPurchasable ? "Yes" : "No" } }))}
      total={data?.total ?? 0} page={page} pageSize={data?.pageSize || 25} loading={loading} error={error}
      search={search} onSearch={value => { setPage(1); setSearch(value); }}
      onPage={setPage} onRefresh={() => setRevision(value => value + 1)}
      action={canManage ? <Link to="/items/new"><Button><Plus size={16} className="mr-2 inline" />Add item</Button></Link> : undefined}
      emptyTitle="Add your first item" emptyDescription="Create a draft item before making it available for buying." />
  </div>;
}

export function LiveItemEditor() {
  const { id } = useParams(); const readiness = useLiveReadiness(); const { selection, authEpoch } = useErpShell();
  if (!readiness?.permissions.includes("procurement-item-manage"))
    return <div className="p-5 sm:p-8" role="alert">Item changes are unavailable for your account. <Link to="/items">Browse approved items</Link></div>;
  return <LiveItemEditorBody key={[authEpoch, readiness?.tenantId, readiness?.legalEntityId, readiness?.principalId, selection.entityId, selection.branch, id ?? "new"].join(":")} />;
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
  const [dirty, setDirty] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const savingRef=useRef(false);
  const mounted = useRef(true); useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [loadedKey, setLoadedKey] = useState<string | null>(id ? null : `${company}:new`);
  const viewOnly = useLiveReadiness()?.permissions.includes("procurement-item-manage") !== true;
  useEffect(() => {
    setVersion(null); setLoadedKey(null);
    if (!id) { setDraft(initial); setDirty(false); setLoadedKey(`${company}:new`); return; }
    const controller = new AbortController();
    setLoading(true); setError("");
    getItemDraft(company, id, controller.signal).then((item) => {
      if (controller.signal.aborted) return;
      setDraft({ ...initial, ...item }); setDirty(false); setVersion(item.version); setLoadedKey(`${company}:${id}`);
    })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [company, id]);
  const field = (key: keyof ItemDraft, value: string | boolean | number | null) => { setDraft((current) => ({ ...current, [key]: value })); setDirty(true); };
  function leave() { if (savingRef.current || saving) return; if (dirty || unconfirmed) setLeaveOpen(true); else navigate(id ? `/items/${id}` : "/items"); }
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
      setDraft({...initial,...saved});setDirty(false);setVersion(saved.version);setLoadedKey(`${company}:${id}`);setUnconfirmed(false);setError("");
    } catch(cause){if(mounted.current)setError(message(cause));}finally{savingRef.current=false;if(mounted.current)setSaving(false);}
  }
  return <div className="p-5 sm:p-8">
    <div className="mb-5 flex items-center gap-2 text-sm text-muted-foreground"><Button type="button" variant="ghost" disabled={saving} onClick={leave}><ArrowLeft size={15} /> Items</Button><span>/</span><span>{id ? "Edit item" : "New item"}</span></div>
    <PageHeader title={id ? "Edit item" : "New item"} subtitle="Save a draft. A separate approval makes items available for buying." />
    {loading ? <p role="status">Loading item…</p> : id && loadedKey !== `${company}:${id}`
      ? <div role="alert"><p>{error || "This item could not be loaded for editing. No new item will be created."}</p><Link to="/items">Back to items</Link></div>
      : <form className="max-w-4xl space-y-5" onSubmit={save}>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}{error.toLowerCase().includes("changed") && <span className="block">Your edits are still here. Compare with the current item before retrying.</span>}</p>}
      {unconfirmed && <div className="space-y-2 text-sm"><p role="status">This change is unconfirmed or the item changed. Your entries are still here. Do not submit again; review the saved records first.</p>{id ? <><Link to={`/items/${id}`} target="_blank" rel="noreferrer" className="text-primary">Review saved item</Link><Button type="button" variant="secondary" disabled={saving} onClick={()=>void reloadSaved()}>Reload saved item and discard edits</Button></> : <Link to="/items" className="text-primary">Review items before creating again</Link>}</div>}
      <Panel title="Item details"><div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Item name"><Input required maxLength={300} value={draft.name} onChange={(event) => field("name", event.target.value)} /></Field>
        <Field label="Item code"><Input required maxLength={50} value={draft.code} onChange={(event) => field("code", event.target.value.toUpperCase())} /></Field>
        <Field label="Type"><Select value={draft.kind} onChange={(event) => field("kind", event.target.value)}><option>Goods</option><option>Service</option><option>Asset</option><option>Subscription</option></Select></Field>
        <Field label="Category code"><Input required value={draft.categoryCode} onChange={(event) => field("categoryCode", event.target.value)} /></Field>
        <Field label="Unit"><Input required value={draft.unitCode} onChange={(event) => field("unitCode", event.target.value)} /></Field>
        <Field label="Brand"><Input value={draft.brand ?? ""} onChange={(event) => field("brand", event.target.value)} /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea rows={3} value={draft.description ?? ""} onChange={(event) => field("description", event.target.value)} /></Field>
      </div></Panel>
      <Panel title="Purchase information"><div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Manufacturer"><Input value={draft.manufacturer ?? ""} onChange={(event) => field("manufacturer", event.target.value)} /></Field>
        <Field label="Manufacturer part number"><Input value={draft.manufacturerPartNumber ?? ""} onChange={(event) => field("manufacturerPartNumber", event.target.value)} /></Field>
        <Field label="Lead time in days"><Input type="number" min={0} value={draft.leadTimeDays ?? ""} onChange={(event) => field("leadTimeDays", event.target.value === "" ? null : Number(event.target.value))} /></Field>
        <Field label="Minimum order quantity"><Input type="number" min={0} step="any" value={draft.minimumOrderQuantity ?? ""} onChange={(event) => field("minimumOrderQuantity", event.target.value === "" ? null : Number(event.target.value))} /></Field>
        <Field label="Tax code"><Input value={draft.taxCodeRef ?? ""} onChange={(event) => field("taxCodeRef", event.target.value)} /></Field>
        <Field label="Expense account reference"><Input value={draft.expenseAccountRef ?? ""} onChange={(event) => field("expenseAccountRef", event.target.value)} /></Field>
        <Field label="Preferred vendor"><Input disabled value="Set per supplier catalog price" /></Field>
        <Field label="Purchase rate"><Input disabled value="Set per supplier catalog price after approval" /></Field>
        <Field label="Stock item"><Select value={draft.isStockItem ? "yes" : "no"} onChange={(event) => field("isStockItem", event.target.value === "yes")}><option value="no">No</option><option value="yes">Yes</option></Select></Field>
        <Field label="Asset"><Select value={draft.isAsset ? "yes" : "no"} onChange={(event) => field("isAsset", event.target.value === "yes")}><option value="no">No</option><option value="yes">Yes</option></Select></Field>
        <Field label="Inspection needed"><Select value={draft.inspectionRequired ? "yes" : "no"} onChange={(event) => field("inspectionRequired", event.target.value === "yes")}><option value="no">No</option><option value="yes">Yes</option></Select></Field>
      </div></Panel>
      <div className="grid gap-4 sm:grid-cols-2"><Panel title="Sales information"><p className="p-5 text-sm text-muted-foreground">Sales rate and sales accounting are not managed in this procurement item record.</p></Panel><Panel title="Reporting tags"><p className="p-5 text-sm text-muted-foreground">Reporting tags are not available for this item yet.</p></Panel></div>
      <div className="sticky bottom-8 z-10 flex gap-3 border-t border-border bg-surface/95 py-4"><Button type="submit" disabled={saving || unconfirmed || viewOnly}>{saving ? "Saving…" : "Save draft"}</Button><Button type="button" variant="secondary" disabled={saving} onClick={leave}>Cancel</Button></div>
    </form>}
    {leaveOpen && <Modal title={unconfirmed ? "Leave item review?" : "Discard item changes?"} onClose={() => setLeaveOpen(false)}><p className="mb-5 text-sm text-muted-foreground">{unconfirmed ? "This save needs review before another change. Your entries may already have reached ERP." : "Your changes to this draft have not been saved."}</p><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setLeaveOpen(false)}>Keep editing</Button><Button onClick={() => navigate(id ? `/items/${id}` : "/items")}>{unconfirmed ? "Leave and review" : "Discard changes"}</Button></div></Modal>}
  </div>;
}

export function LiveItemDetail() {
  const canManage = useLiveReadiness()?.permissions.includes("procurement-item-manage") === true;
  return canManage ? <ManagedItemDetail /> : <div className="p-5 sm:p-8" role="alert">Item management details are unavailable for your account. <Link className="text-primary" to="/items">Browse approved items</Link></div>;
}

function ManagedItemDetail() {
  const { id } = useParams(); const readiness = useLiveReadiness(); const { selection, authEpoch } = useErpShell();
  return <LiveItemDetailBody key={[authEpoch, readiness?.tenantId, readiness?.legalEntityId, readiness?.principalId, selection.entityId, selection.branch, id].join(":")} />;
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
  const [tab, setTab] = useState("overview");
  const [moreOpen, setMoreOpen] = useState(false);
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
  return <div className="min-h-[calc(100dvh-5rem)] bg-muted/30">
    <div className="flex min-h-[calc(100dvh-5rem)] flex-col xl:flex-row">
      <aside className="w-full shrink-0 border-b border-border bg-surface xl:w-64 xl:border-b-0 xl:border-r">
        <div className="border-b border-border p-5"><p className="text-xs text-muted-foreground">Directory</p><Button variant="ghost" disabled={busy || writeUnconfirmed} onClick={() => navigate("/items")}>Items</Button></div>
        <div className="flex items-start gap-3 p-5"><span className="rounded-lg bg-primary/10 p-2 text-primary"><Package size={18} /></span><div className="min-w-0"><p className="break-words text-sm font-semibold">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.code} · {item.unitCode}</p><Badge>{item.status}</Badge></div></div>
        <p className="px-5 pb-5 text-xs text-muted-foreground">Other items are available in the item directory.</p>
      </aside>
      <main className="min-w-0 flex-1">
        <header className="sticky top-14 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-5 py-4 sm:px-8">
          <div className="min-w-0"><Button type="button" variant="ghost" disabled={busy || writeUnconfirmed} onClick={() => navigate("/items")}><ArrowLeft size={13} /> Items</Button><h1 className="break-words text-2xl font-semibold">{item.name}</h1><p className="text-sm text-muted-foreground">{item.code} · {item.kind} · {item.unitCode}</p></div>
          <div className="flex flex-wrap items-center gap-2"><Badge>{item.status}</Badge>
            {!viewOnly && !writeUnconfirmed && item.status === "Inactive" && <Link to={`/items/${item.id}/edit`} aria-disabled={busy} onClick={event => { if (busyRef.current || busy) event.preventDefault(); }}><Button variant="secondary" disabled={busy}>Edit item</Button></Link>}
            {!viewOnly && item.status === "Active" && <Button variant="secondary" disabled={busy || writeUnconfirmed} onClick={() => void retire()}>Make inactive</Button>}
            <div className="relative"><Button variant="secondary" aria-expanded={moreOpen} disabled={busy} onClick={() => setMoreOpen(value => !value)}><MoreHorizontal size={16} /> More</Button>
              {moreOpen && <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-52 rounded-lg border border-border bg-surface p-2 shadow-lg">
                <Button variant="ghost" disabled title="Item cloning is not available yet">Clone item</Button>
                <Button variant="ghost" disabled title="Item deletion is not available; use inactive status">Delete item</Button>
              </div>}</div>
          </div>
        </header>
        <DetailTabs tabs={[{ key: "overview", label: "Overview" }, { key: "prices", label: `Catalog prices (${prices.length})` }, { key: "transactions", label: "Transactions" }, { key: "history", label: "History" }]} active={tab} onChange={value => { if (!busyRef.current && !busy) setTab(value); }} />
        <div className="space-y-5 p-5 sm:p-8">
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    {writeUnconfirmed && <div className="space-y-2 text-sm"><p role="status">A change is unconfirmed or this record changed. Your entries are preserved. Review the saved item and prices before another action; no command will be sent again automatically.</p><Button variant="secondary" disabled={busy} onClick={()=>void reloadSavedItem()}>Reload saved item and discard edits</Button><Link to={`/items/${item.id}`} target="_blank" rel="noreferrer" className="ml-3 text-primary">Review saved item</Link></div>}
    <div hidden={tab !== "overview"} inert={tab !== "overview" ? true : undefined} className="space-y-5"><div className="grid gap-5 lg:grid-cols-2">
      <DetailSection title="Item Details"><dl className="grid gap-4 sm:grid-cols-2"><DetailValue label="Item type" value={item.kind} /><DetailValue label="Usage unit" value={item.unitCode} /><DetailValue label="SKU / Code" value={item.code} /><DetailValue label="Category" value={item.categoryCode} /><DetailValue label="Brand" value={item.brand || "—"} /><DetailValue label="Available for buying" value={item.isPurchasable ? "Yes" : "No — approval required"} /></dl></DetailSection>
      <DetailSection title="Purchase Information"><dl className="grid gap-4 sm:grid-cols-2"><DetailValue label="Manufacturer" value={item.manufacturer || "—"} /><DetailValue label="Manufacturer part number" value={item.manufacturerPartNumber || "—"} /><DetailValue label="Lead time in days" value={item.leadTimeDays ?? "—"} /><DetailValue label="Minimum order quantity" value={item.minimumOrderQuantity ?? "—"} /><DetailValue label="Tax code" value={item.taxCodeRef || "—"} /><DetailValue label="Expense account reference" value={item.expenseAccountRef || "—"} /><DetailValue label="Preferred vendor" value="Set per supplier catalog price" /><DetailValue label="Purchase rate" value="See catalog prices" /></dl></DetailSection></div>
      <div className="grid gap-5 lg:grid-cols-2"><DetailSection title="Description"><p className="text-sm">{item.description || "No description."}</p></DetailSection><DetailSection title="Buying flags"><dl className="grid gap-4 sm:grid-cols-2"><DetailValue label="Stock item" value={item.isStockItem ? "Yes" : "No"} /><DetailValue label="Asset" value={item.isAsset ? "Yes" : "No"} /><DetailValue label="Inspection needed" value={item.inspectionRequired ? "Yes" : "No"} /></dl></DetailSection></div>
    {!viewOnly && item.status === "Inactive" && readiness?.permissions.includes("procurement-item-approve") && <Panel title="Review item" className="mt-5"><div className="space-y-3 p-5">
      <p className="text-sm text-muted-foreground">Check its category and buying details. Another person must review an item you created.</p>
      <Field label="Review reason"><Textarea required maxLength={1000} value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} /></Field>
      <Button disabled={busy || writeUnconfirmed || !reviewReason.trim()} onClick={() => void activate()}>{busy ? "Saving…" : "Activate item"}</Button>
    </div></Panel>}
    </div>
    <div hidden={tab !== "prices"} inert={tab !== "prices" ? true : undefined}>
    {item.status === "Active" ? <Panel title="Catalog prices"><div className="space-y-4 p-5">
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
          <Button variant="secondary" disabled={busy || writeUnconfirmed} onClick={() => { setPriceEdit(null); setPriceError(""); }}>Close correction</Button></div>
      </form>}
      {!viewOnly && publishId && <div className="space-y-3 rounded-lg border border-border p-4">
        <p className="text-sm">Review the vendor, amount, unit and dates. A different person must approve a price they entered.</p>
        <Field label="Price review reason"><Textarea required maxLength={1000} value={publishReason} onChange={(event) => setPublishReason(event.target.value)} /></Field>
        <div className="flex gap-2"><Button disabled={busy || writeUnconfirmed || !publishReason.trim()} onClick={() => void publishPrice()}>{busy ? "Saving…" : "Publish price"}</Button><Button variant="secondary" disabled={busy || writeUnconfirmed} onClick={() => setPublishId(null)}>Cancel</Button></div>
      </div>}
      {!viewOnly && withdrawId && <div className="space-y-3 rounded-lg border border-border p-4">
        <p className="text-sm">Withdraw this price from future buying. Existing requests keep their history.</p>
        <Field label="Withdrawal reason"><Textarea required maxLength={1000} value={withdrawReason} onChange={(event) => setWithdrawReason(event.target.value)} /></Field>
        <div className="flex gap-2"><Button variant="danger" disabled={busy || writeUnconfirmed || !withdrawReason.trim()} onClick={() => void withdrawPrice()}>{busy ? "Saving…" : "Confirm withdrawal"}</Button><Button variant="secondary" disabled={busy || writeUnconfirmed} onClick={() => setWithdrawId(null)}>Cancel</Button></div>
      </div>}
      {!viewOnly && readiness?.permissions.includes("procurement-item-manage") && <form className="grid gap-3 border-t border-border pt-4 sm:grid-cols-4" onSubmit={(event) => void addPrice(event)}>
        <Field label="Vendor" className="sm:col-span-2"><Select required value={priceDraft.supplierId} onChange={(event) => setPriceDraft((value) => ({ ...value, supplierId: event.target.value }))}><option value="">Choose approved vendor</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.displayName}</option>)}</Select></Field>
        <Field label={`Unit price (${readiness.defaultCurrencyCode})`}><Input required inputMode="decimal" value={priceDraft.unitPrice} onChange={(event) => setPriceDraft((value) => ({ ...value, unitPrice: event.target.value }))} /></Field>
        <Field label="Price starts"><Input required type="date" value={priceDraft.effectiveFrom} onChange={(event) => setPriceDraft((value) => ({ ...value, effectiveFrom: event.target.value }))} /></Field>
        <div className="sm:col-span-4 flex items-center gap-3"><Button type="submit" disabled={busy || writeUnconfirmed || !vendors.length || !priceDraft.supplierId}>{busy ? "Saving…" : "Add draft price"}</Button>{!vendors.length && <Link to="/vendors" aria-disabled={busy} onClick={event => { if (busyRef.current || busy) event.preventDefault(); }} className="text-sm text-primary hover:underline">Add an approved vendor first</Link>}</div>
      </form>}
    </div></Panel> : <DetailSection title="Catalog prices"><p className="text-sm text-muted-foreground">Activate this item before adding supplier catalog prices.</p></DetailSection>}
    </div>
    {tab === "transactions" && <DetailSection title="Transactions"><p className="text-sm text-muted-foreground">Related purchase orders, receipts and bills are not available in this item view yet.</p></DetailSection>}
    {tab === "history" && <DetailSection title="History"><p className="text-sm text-muted-foreground">An item activity history is not available in this view yet.</p></DetailSection>}
        </div>
      </main>
    </div>
  </div>;
}
