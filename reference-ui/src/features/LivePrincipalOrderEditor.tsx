import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Field, Input, Panel, Select } from "../components/ui";
import { TransactionEditorFrame } from "./TransactionEditor";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { principalDraftJournal, principalDraftScope } from "../lib/principal-draft-command-journal";
import { confirmPrincipalCommand, createPrincipalBody, listPrincipalSources, listPrincipalSuppliers, recoverPrincipalCommand, sendPrincipalCommand,
  PrincipalDraftError, type PrincipalCommand, type PrincipalSource, type PrincipalSupplier } from "../../../src/platform/procurement-principal-drafts-api";
import type { ExactOrderDraft, ExactOrderDraftLine } from "../../../src/platform/procurement-order-execution-api";

const blank = (currencyCode: string): ExactOrderDraft => ({ supplierId: "", currencyCode,
  shipToRef: "", billToRef: "", paymentTermRef: "", expectedDeliveryOn: null, lines: [] });
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : "The order could not be confirmed.";

export function LivePrincipalOrderEditor() {
  const context=useLiveReadiness()!, shell=useErpShell(), navigate=useNavigate(), {id}=useParams();
  const key=[shell.authEpoch,context.tenantId,context.legalEntityId,context.principalId,
    shell.selection.branch??"all",id??"new"].join(":");
  const scopeKey=principalDraftScope(context.tenantId,context.legalEntityId,context.principalId);
  return <PrincipalEditor key={key} scopeKey={scopeKey} id={id} onSaved={orderId=>navigate(`/purchase-orders/${orderId}?workflow=principal`)} />;
}
function PrincipalEditor({scopeKey,id,onSaved}:{scopeKey:string;id?:string;onSaved:(id:string)=>void}) {
  const context=useLiveReadiness()!,navigate=useNavigate(),company=context.legalEntityId;
  const canConvert=context.capabilities.principalDirectOrderDrafts
    &&context.permissions.includes("procurement-po-convert")&&context.permissions.includes("procurement-po-read");
  const [draft,setDraft]=useState<ExactOrderDraft>(()=>blank(context.defaultCurrencyCode));
  const [chosen,setChosen]=useState<PrincipalSource[]>([]),[available,setAvailable]=useState<PrincipalSource[]>([]);
  const [vendors,setVendors]=useState<PrincipalSupplier[]>([]),[vendorSearch,setVendorSearch]=useState(""),
    [vendorPage,setVendorPage]=useState(1),[vendorNext,setVendorNext]=useState<number|null>(null);
  const [page,setPage]=useState(1),[total,setTotal]=useState(0),[loading,setLoading]=useState(true);
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
  const [pending,setPending]=useState<PrincipalCommand|null>(null);
  const lock=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;try{setPending(principalDraftJournal.read(scopeKey));}
    catch(cause){setError(errorText(cause));lock.current=true;}
    return()=>{alive.current=false;};},[scopeKey]);
  useEffect(()=>{if(id || !canConvert)return;
    const abort=new AbortController();setLoading(true);setError("");
    listPrincipalSources(company,page,abort.signal).then(result=>{if(!abort.signal.aborted){setAvailable(result.items);setTotal(result.candidateTotal);}})
      .catch(cause=>{if(!abort.signal.aborted)setError(errorText(cause));})
      .finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();},[company,page,id,canConvert]);
  useEffect(()=>{if(!canConvert)return;
    const abort=new AbortController(),timer=setTimeout(()=>listPrincipalSuppliers(company,vendorPage,vendorSearch.trim(),abort.signal)
      .then(result=>{if(!abort.signal.aborted){setVendors(result.items);setVendorNext(result.page*result.pageSize<result.total?result.page+1:null);}})
      .catch(cause=>{if(!abort.signal.aborted)setError(errorText(cause));}),vendorSearch?250:0);
    return()=>{clearTimeout(timer);abort.abort();};},[company,vendorSearch,vendorPage,canConvert]);
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
    try{const result=await recoverPrincipalCommand(company,pending);
      await confirmPrincipalCommand(company,pending,result);
      principalDraftJournal.clear(scopeKey,pending);if(alive.current){setPending(null);setNotice("The saved order was confirmed.");onSaved(result.orderId);}}
    catch(cause){if(alive.current)setError(`${errorText(cause)} Keep this command reference: ${pending.key}.`);}
    finally{lock.current=false;if(alive.current)setBusy(false);}}
  async function save(event:FormEvent){event.preventDefault();if(lock.current||busy||pending||id)return;
    if(!canConvert)return;
    let command:PrincipalCommand;
    try{const sources=chosen.map(row=>({purchaseRequestId:row.purchaseRequestId,
        purchaseRequestLineId:row.purchaseRequestLineId,expectedRequestVersion:row.expectedRequestVersion,canSelect:true}));
      command={operation:"Create",key:crypto.randomUUID(),orderId:null,
        body:createPrincipalBody(draft,sources),draft,sources};
      principalDraftJournal.claim(scopeKey,command);setPending(command);}
    catch(cause){setError(errorText(cause));return;}
    lock.current=true;setBusy(true);setError("");
    try{const result=await sendPrincipalCommand(company,command);
      const savedReceipt=await recoverPrincipalCommand(company,command);
      if(savedReceipt.orderId!==result.orderId||savedReceipt.version!==result.version
        ||savedReceipt.originalDirectSourceSha256!==result.originalDirectSourceSha256)
        throw new Error("The saved result does not match this command. Keep its reference and check again.");
      await confirmPrincipalCommand(company,command,result);
      principalDraftJournal.clear(scopeKey,command);if(alive.current){setPending(null);onSaved(result.orderId);}}
    catch(cause){if(cause instanceof PrincipalDraftError && [400,422].includes(cause.status)){
        try{principalDraftJournal.clear(scopeKey,command);if(alive.current)setPending(null);}catch{/* Retain recovery lock. */}}
      if(alive.current)setError(errorText(cause));}
    finally{lock.current=false;if(alive.current)setBusy(false);}}
  if(id)return <div className="p-5 sm:p-8" role="status">Editing this order is unavailable. Open the saved order to review or cancel its internal draft.</div>;
  if(!canConvert)
    return <div className="p-5 sm:p-8" role="alert">Creating an order from approved requests is unavailable for this account.</div>;
  if(context.effectiveBranchId===null)
    return <div className="p-5 sm:p-8" role="status">Choose a branch to create an order from approved requests.</div>;
  const footer=<>
    <Button form="principal-order-draft-form" type="submit" disabled={busy||!!pending||!chosen.length||!draft.supplierId}>{busy?"Saving…":"Save internal draft"}</Button>
    <Button type="button" variant="secondary" disabled title="Supplier sending is a separate controlled action.">Save and send</Button>
    <Button type="button" variant="ghost" disabled={busy||!!pending} onClick={()=>navigate("/purchase-orders?workflow=principal")}>Cancel</Button>
    <span className="ml-auto text-xs text-muted-foreground">No supplier notification or Finance posting occurs here</span>
  </>;
  return <TransactionEditorFrame title="New purchase order" close={()=>navigate("/purchase-orders?workflow=principal")}
    closeDisabled={busy||!!pending} footer={footer}>
    <p className="text-sm text-muted-foreground">Select approved request lines. This first saves an internal draft.</p>
    <form id="principal-order-draft-form" onSubmit={save} className="space-y-7">
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
        <Field label="Find supplier"><Input value={vendorSearch} onChange={event=>{setVendorSearch(event.target.value);setVendorPage(1);}} /></Field>
        <Field label="Supplier"><Select required value={draft.supplierId} onChange={event=>setDraft(current=>({...current,supplierId:event.target.value}))}>
          <option value="">Choose an eligible supplier</option>
          {draft.supplierId&&!vendors.some(row=>row.id===draft.supplierId)&&<option value={draft.supplierId}>Previously selected supplier</option>}
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
    </form>
  </TransactionEditorFrame>;
}
