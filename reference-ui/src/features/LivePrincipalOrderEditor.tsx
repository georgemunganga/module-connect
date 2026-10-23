import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ShoppingBag, X } from "lucide-react";
import { Button, Field, Input, Panel, Select } from "../components/ui";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { principalOrderJournal, type PrincipalLocator } from "../lib/principal-order-command-journal";
import { createPrincipalBody, listPrincipalSources, listPrincipalSuppliers, recoverPrincipalCommand, sendPrincipalCommand,
  PrincipalOrderError, type PrincipalCommand, type PrincipalSource, type PrincipalSupplier } from "../../../src/platform/procurement-principal-orders-api";
import type { ExactOrderDraft, ExactOrderDraftLine } from "../../../src/platform/procurement-order-execution-api";

const blank = (currencyCode: string): ExactOrderDraft => ({ supplierId: "", currencyCode,
  shipToRef: "", billToRef: "", paymentTermRef: "", expectedDeliveryOn: null, lines: [] });
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : "The order could not be confirmed.";

export function LivePrincipalOrderEditor() {
  const context=useLiveReadiness()!, shell=useErpShell(), navigate=useNavigate(), {id}=useParams();
  const key=[shell.authEpoch,context.tenantId,context.legalEntityId,context.principalId,
    shell.selection.branch??"all",id??"new"].join(":");
  return <PrincipalEditor key={key} scopeKey={key} id={id} onSaved={orderId=>navigate(`/purchase-orders/${orderId}?workflow=principal`)} />;
}
function PrincipalEditor({scopeKey,id,onSaved}:{scopeKey:string;id?:string;onSaved:(id:string)=>void}) {
  const context=useLiveReadiness()!,navigate=useNavigate(),company=context.legalEntityId;
  const [draft,setDraft]=useState<ExactOrderDraft>(()=>blank(context.defaultCurrencyCode));
  const [chosen,setChosen]=useState<PrincipalSource[]>([]),[available,setAvailable]=useState<PrincipalSource[]>([]);
  const [vendors,setVendors]=useState<PrincipalSupplier[]>([]),[vendorSearch,setVendorSearch]=useState(""),
    [vendorPage,setVendorPage]=useState(1),[vendorNext,setVendorNext]=useState<number|null>(null);
  const [page,setPage]=useState(1),[total,setTotal]=useState(0),[loading,setLoading]=useState(true);
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
  const [pending,setPending]=useState<PrincipalLocator|null>(null);
  const lock=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;try{setPending(principalOrderJournal.read(scopeKey));}
    catch(cause){setError(errorText(cause));lock.current=true;}
    return()=>{alive.current=false;};},[scopeKey]);
  useEffect(()=>{if(id || !context.permissions.includes("procurement-po-convert"))return;
    const abort=new AbortController();setLoading(true);setError("");
    listPrincipalSources(company,page,abort.signal).then(result=>{if(!abort.signal.aborted){setAvailable(result.items);setTotal(result.candidateTotal);}})
      .catch(cause=>{if(!abort.signal.aborted)setError(errorText(cause));})
      .finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();},[company,page,id,context.permissions]);
  useEffect(()=>{if(!context.permissions.includes("procurement-po-convert"))return;
    const abort=new AbortController(),timer=setTimeout(()=>listPrincipalSuppliers(company,vendorPage,vendorSearch.trim(),abort.signal)
      .then(result=>{if(!abort.signal.aborted){setVendors(result.items);setVendorNext(result.nextPage);}})
      .catch(cause=>{if(!abort.signal.aborted)setError(errorText(cause));}),vendorSearch?250:0);
    return()=>{clearTimeout(timer);abort.abort();};},[company,vendorSearch,vendorPage,context.permissions]);
  function select(source:PrincipalSource) {
    if(!source.canSelect || !source.availableQuantity || !source.approvedUnitEstimate || !source.unitCode
      || !source.expectedRequestVersion || chosen.some(row=>row.purchaseRequestLineId===source.purchaseRequestLineId))return;
    if(chosen.length && (draft.currencyCode!==source.currencyCode || chosen[0].branchRef!==source.branchRef)){
      setError("Choose request lines in the same currency and branch for this order.");return;}
    const line:ExactOrderDraftLine={description:source.description??"",unitCode:source.unitCode,
      quantity:source.availableQuantity,unitPrice:source.approvedUnitEstimate,taxAmount:"0"};
    setChosen(rows=>[...rows,source]);setDraft(current=>({...current,currencyCode:source.currencyCode??current.currencyCode,
      lines:[...current.lines,line]}));setError("");
  }
  function remove(at:number){setChosen(rows=>rows.filter((_,i)=>i!==at));
    setDraft(current=>({...current,lines:current.lines.filter((_,i)=>i!==at)}));}
  function line(at:number,patch:Partial<ExactOrderDraftLine>){setDraft(current=>({...current,
    lines:current.lines.map((entry,i)=>i===at?{...entry,...patch}:entry)}));}
  async function recover(){if(lock.current || !pending)return;lock.current=true;setBusy(true);setError("");
    try{const result=await recoverPrincipalCommand(company,{...pending,body:""});
      principalOrderJournal.clear(scopeKey,pending);if(alive.current){setPending(null);setNotice("The saved order was confirmed.");onSaved(result.orderId);}}
    catch(cause){if(alive.current)setError(`${errorText(cause)} Keep this command reference: ${pending.key}.`);}
    finally{lock.current=false;if(alive.current)setBusy(false);}}
  async function save(event:FormEvent){event.preventDefault();if(lock.current||busy||pending||id)return;
    if(!context.permissions.includes("procurement-po-convert"))return;
    let command:PrincipalCommand;
    try{command={operation:"Create",key:crypto.randomUUID(),orderId:null,body:createPrincipalBody(draft,chosen)};
      principalOrderJournal.claim(scopeKey,command);setPending({operation:command.operation,key:command.key,orderId:null});}
    catch(cause){setError(errorText(cause));return;}
    lock.current=true;setBusy(true);setError("");
    try{const result=await sendPrincipalCommand(company,command);
      principalOrderJournal.clear(scopeKey,command);if(alive.current){setPending(null);onSaved(result.orderId);}}
    catch(cause){if(cause instanceof PrincipalOrderError && [400,422].includes(cause.status)){
        try{principalOrderJournal.clear(scopeKey,command);if(alive.current)setPending(null);}catch{/* Retain recovery lock. */}}
      if(alive.current)setError(errorText(cause));}
    finally{lock.current=false;if(alive.current)setBusy(false);}}
  if(id)return <div className="p-5 sm:p-8" role="status">This governed order keeps its approved lines unchanged. Open the saved order to continue its workflow.</div>;
  if(!context.capabilities.principalDirectOrderDrafts||!context.permissions.includes("procurement-po-convert"))
    return <div className="p-5 sm:p-8" role="alert">Creating an order from approved requests is unavailable for this account.</div>;
  return <div className="min-h-[calc(100dvh-5rem)] bg-background pb-20">
    <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-5 py-5 sm:px-8">
      <div className="min-w-0"><h1 className="flex items-center gap-2 text-2xl font-semibold"><ShoppingBag size={23} />New purchase order</h1>
        <p className="mt-1 text-sm text-muted-foreground">Select approved request lines. This first saves an internal draft.</p></div>
      <Button variant="ghost" aria-label="Close editor" disabled={busy} onClick={()=>navigate("/purchase-orders?workflow=principal")}><X size={20}/></Button>
    </header>
    <form onSubmit={save} className="max-w-[1260px] space-y-6 px-5 py-6 sm:px-8">
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{notice&&<p role="status">{notice}</p>}
      {pending&&<Panel title="Check your last save"><div className="space-y-3 p-5"><p>The last order save may have succeeded. Check command {pending.key} before another save.</p>
        <Button type="button" disabled={busy} onClick={()=>void recover()}>Check saved result</Button></div></Panel>}
      <fieldset disabled={busy||!!pending} className="contents">
      <Panel title="Approved requests"><div className="space-y-3 p-5">{loading?<p role="status">Loading approved requests…</p>:available.length?available.map(source=><div key={source.purchaseRequestLineId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
        <div><p className="font-medium">{source.requestNumber} · {source.description??"Request line"}</p>
          <p className="text-sm text-muted-foreground">{source.canSelect?`${source.availableQuantity} ${source.unitCode} available · ${source.currencyCode} ${source.approvedUnitEstimate} each`:"Unavailable for this order"}</p></div>
        <Button type="button" variant="secondary" disabled={!source.canSelect||chosen.some(row=>row.purchaseRequestLineId===source.purchaseRequestLineId)} onClick={()=>select(source)}>Add line</Button>
      </div>):<p>No approved direct-purchase lines are available in this company and branch.</p>}
      <div className="flex gap-3"><Button type="button" variant="secondary" disabled={page===1} onClick={()=>setPage(page-1)}>Previous</Button><Button type="button" variant="secondary" disabled={page*25>=total} onClick={()=>setPage(page+1)}>More</Button></div>
      </div></Panel>
      <Panel title="Order details"><div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Find vendor"><Input value={vendorSearch} onChange={event=>{setVendorSearch(event.target.value);setVendorPage(1);}} /></Field>
        <Field label="Vendor"><Select required value={draft.supplierId} onChange={event=>setDraft(current=>({...current,supplierId:event.target.value}))}>
          <option value="">Choose an approved vendor</option>
          {draft.supplierId&&!vendors.some(row=>row.id===draft.supplierId)&&<option value={draft.supplierId}>Previously selected vendor</option>}
          {vendors.map(row=><option key={row.id} value={row.id}>{row.displayName}</option>)}</Select>
          <div className="mt-2 flex gap-2"><Button type="button" variant="secondary" disabled={vendorPage===1} onClick={()=>setVendorPage(vendorPage-1)}>Previous</Button>
            <Button type="button" variant="secondary" disabled={!vendorNext} onClick={()=>setVendorPage(vendorNext??vendorPage)}>More</Button></div></Field>
        <Field label="Currency"><Input readOnly value={draft.currencyCode} /></Field>
        <Field label="Expected delivery"><Input type="date" value={draft.expectedDeliveryOn??""} onChange={event=>setDraft(current=>({...current,expectedDeliveryOn:event.target.value||null}))}/></Field>
        {(["shipToRef","billToRef","paymentTermRef"] as const).map((field)=><Field key={field} label={{shipToRef:"Deliver to",billToRef:"Bill to",paymentTermRef:"Payment terms"}[field]}>
          <Input value={draft[field]} onChange={event=>setDraft(current=>({...current,[field]:event.target.value}))} /></Field>)}
      </div></Panel>
      <Panel title="Linked order lines"><div className="space-y-4 p-5">{draft.lines.map((entry,at)=><div key={chosen[at]?.purchaseRequestLineId??at} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-6">
        <p className="text-sm sm:col-span-6">Source {chosen[at]?.requestNumber} · Available {chosen[at]?.availableQuantity}</p>
        <Field label="Description" className="sm:col-span-2"><Input required value={entry.description} onChange={event=>line(at,{description:event.target.value})}/></Field>
        <Field label="Unit"><Input readOnly value={entry.unitCode}/></Field>
        <Field label="Quantity"><Input required inputMode="decimal" value={entry.quantity} onChange={event=>line(at,{quantity:event.target.value})}/></Field>
        <Field label="Unit price"><Input required inputMode="decimal" value={entry.unitPrice} onChange={event=>line(at,{unitPrice:event.target.value})}/></Field>
        <Field label="Tax"><Input required inputMode="decimal" value={entry.taxAmount} onChange={event=>line(at,{taxAmount:event.target.value})}/></Field>
        <Button type="button" variant="secondary" onClick={()=>remove(at)}>Remove line</Button></div>)}
        {!draft.lines.length&&<p>Choose a request line above to prepare the order.</p>}</div></Panel>
      </fieldset>
      <footer className="sticky bottom-8 z-10 flex flex-wrap items-center gap-3 border-y border-border bg-surface/95 px-5 py-4 backdrop-blur">
        <Button type="submit" disabled={busy||!!pending||!chosen.length||!draft.supplierId}>{busy?"Saving…":"Save internal draft"}</Button>
        <Button type="button" variant="secondary" disabled title="Supplier sending is a separate controlled action.">Save and send</Button>
        <Link to="/purchase-orders?workflow=principal" className="text-sm text-primary">Back to orders</Link>
        <span className="ml-auto text-xs text-muted-foreground">No supplier notification or Finance posting occurs here</span>
      </footer>
    </form>
  </div>;
}
