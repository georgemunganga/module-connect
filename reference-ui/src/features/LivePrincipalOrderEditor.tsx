import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Paperclip } from "lucide-react";
import { Button, Field, Input, Select } from "../components/ui";
import { TransactionEditorFrame } from "./TransactionEditor";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { principalOrderJournal, type PrincipalLocator } from "../lib/principal-order-command-journal";
import { createPrincipalBody, editPrincipalBody, getPrincipalOrder, listPrincipalSources, listPrincipalSuppliers,
  recoverPrincipalCommand, sendPrincipalCommand, PrincipalOrderError, type PrincipalCommand,
  type PrincipalOrderDetail, type PrincipalSource, type PrincipalSupplier } from "../../../src/platform/procurement-principal-orders-api";
import type { ExactOrderDraft, ExactOrderDraftLine } from "../../../src/platform/procurement-order-execution-api";
import { draftEditProblem } from "./principal-order-draft-edit";

const blank = (currencyCode: string): ExactOrderDraft => ({ supplierId: "", currencyCode,
  shipToRef: "", billToRef: "", paymentTermRef: "", expectedDeliveryOn: null, lines: [] });
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : "The order could not be confirmed.";
const exactUnits = (value: string): bigint | null => {
  if (!/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"));
};
function draftTotal(lines: ExactOrderDraftLine[]): string | null {
  let units = 0n;
  for (const line of lines) {
    const quantity = exactUnits(line.quantity), price = exactUnits(line.unitPrice), tax = exactUnits(line.taxAmount);
    if (quantity === null || price === null || tax === null) return null;
    units += quantity * price + tax * 10000n;
  }
  const whole = units / 100000000n, fractional = String(units % 100000000n).padStart(8, "0").replace(/0+$/, "");
  return fractional ? `${whole}.${fractional}` : String(whole);
}

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
  const [page,setPage]=useState(1),[sourceTotal,setSourceTotal]=useState(0),[loading,setLoading]=useState(true);
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
  const [saved,setSaved]=useState<PrincipalOrderDetail|null>(null),[reason,setReason]=useState("");
  const [pending,setPending]=useState<PrincipalLocator|null>(null);
  const lock=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;try{setPending(principalOrderJournal.read(scopeKey));}
    catch(cause){setError(errorText(cause));lock.current=true;}
    return()=>{alive.current=false;};},[scopeKey]);
  useEffect(()=>{if(id || !context.permissions.includes("procurement-po-convert"))return;
    const abort=new AbortController();setLoading(true);setError("");
    listPrincipalSources(company,page,abort.signal).then(result=>{if(!abort.signal.aborted){setAvailable(result.items);setSourceTotal(result.candidateTotal);}})
      .catch(cause=>{if(!abort.signal.aborted)setError(errorText(cause));})
      .finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();},[company,page,id,context.permissions]);
  useEffect(()=>{if(!id)return;
    const abort=new AbortController();setLoading(true);setSaved(null);setError("");
    getPrincipalOrder(company,id,abort.signal).then(result=>{if(abort.signal.aborted)return;
      setSaved(result);setDraft({supplierId:result.supplierId,currencyCode:result.currencyCode,
        shipToRef:result.shipToRef??"",billToRef:result.billToRef??"",paymentTermRef:result.paymentTermRef??"",
        expectedDeliveryOn:result.expectedDeliveryOn,
        lines:result.lines.map(row=>({id:row.id,description:row.description,unitCode:row.unitCode,
          quantity:row.quantity,unitPrice:row.unitPrice,taxAmount:row.taxAmount,
          costCenterRef:row.costCenterRef,projectRef:row.projectRef,expectedDeliveryOn:row.expectedDeliveryOn}))});})
      .catch(cause=>{if(!abort.signal.aborted)setError(errorText(cause));})
      .finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();},[company,id]);
  useEffect(()=>{if(id||!context.permissions.includes("procurement-po-convert"))return;
    const abort=new AbortController(),timer=setTimeout(()=>listPrincipalSuppliers(company,vendorPage,vendorSearch.trim(),abort.signal)
      .then(result=>{if(!abort.signal.aborted){setVendors(result.items);setVendorNext(result.nextPage);}})
      .catch(cause=>{if(!abort.signal.aborted)setError(errorText(cause));}),vendorSearch?250:0);
    return()=>{clearTimeout(timer);abort.abort();};},[company,id,vendorSearch,vendorPage,context.permissions]);
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
  async function recover(){if(lock.current || !pending)return;
    if(id ? pending.operation!=="Edit"||pending.orderId!==id : pending.operation!=="Create"||pending.orderId!==null){
      setError("This command belongs to a different order action. Open the original record to reconcile it.");return;}
    lock.current=true;setBusy(true);setError("");
    try{const result=await recoverPrincipalCommand(company,{...pending,body:""});
      principalOrderJournal.clear(scopeKey,pending);if(alive.current){setPending(null);setNotice("The saved order was confirmed.");onSaved(result.orderId);}}
    catch(cause){if(alive.current)setError(`${errorText(cause)} Keep this command reference: ${pending.key}.`);}
    finally{lock.current=false;if(alive.current)setBusy(false);}}
  async function save(event:FormEvent){event.preventDefault();if(lock.current||busy||pending||loading)return;
    if(id ? !saved||saved.id!==id||!context.capabilities.principalOrderDraftRevision
        ||saved.canEditDraft!==true||!context.permissions.includes("procurement-po-edit")
        ||!!draftEditProblem(saved,draft)||!reason.trim()
      : !context.permissions.includes("procurement-po-convert"))return;
    let command:PrincipalCommand;
    try{command=id&&saved?{operation:"Edit",key:crypto.randomUUID(),orderId:id,
        body:editPrincipalBody(saved,draft,reason)}
      :{operation:"Create",key:crypto.randomUUID(),orderId:null,body:createPrincipalBody(draft,chosen)};
      principalOrderJournal.claim(scopeKey,command);
      setPending({operation:command.operation,key:command.key,orderId:command.orderId});}
    catch(cause){setError(errorText(cause));return;}
    lock.current=true;setBusy(true);setError("");
    try{const result=await sendPrincipalCommand(company,command);
      principalOrderJournal.clear(scopeKey,command);if(alive.current){setPending(null);onSaved(result.orderId);}}
    catch(cause){if(cause instanceof PrincipalOrderError && [400,422].includes(cause.status)){
        try{principalOrderJournal.clear(scopeKey,command);if(alive.current)setPending(null);}catch{/* Retain recovery lock. */}}
      if(alive.current)setError(errorText(cause));}
    finally{lock.current=false;if(alive.current)setBusy(false);}}
  if(!context.capabilities.principalDirectOrderDrafts||!id&&!context.permissions.includes("procurement-po-convert"))
    return <div className="p-5 sm:p-8" role="alert">Creating an order from approved requests is unavailable for this account.</div>;
  if(id&&loading)return <div className="p-5 sm:p-8" role="status">Loading order draft…</div>;
  if(id&&!saved)return <div className="p-5 sm:p-8" role="alert">{error||"This order draft is unavailable in your selected company and branch."}</div>;
  const editing=!!id,canEdit=editing&&context.capabilities.principalOrderDraftRevision
    &&context.permissions.includes("procurement-po-edit")&&saved?.canEditDraft===true;
  const editProblem=editing&&saved?draftEditProblem(saved,draft):null;
  const closePath=editing?`/purchase-orders/${id}?workflow=principal`:"/purchase-orders?workflow=principal";
  const saveDisabled=busy||!!pending||loading||(editing
    ?!canEdit||!!editProblem||!reason.trim():!chosen.length||!draft.supplierId);
  const total=draftTotal(draft.lines);
  const footer=<>
    <Button form="principal-order-draft-form" type="submit" disabled={saveDisabled}>{busy?"Saving…":editing?"Save draft revision":"Save internal draft"}</Button>
    <Button type="button" variant="secondary" disabled title="Supplier sending requires a separately approved order.">Save and send</Button>
    <Button type="button" variant="ghost" disabled={busy||!!pending} onClick={()=>navigate(closePath)}>Cancel</Button>
    <span className="ml-auto text-xs text-muted-foreground">No supplier notification or Finance posting occurs here</span>
  </>;
  return <TransactionEditorFrame title={editing?`Edit ${saved?.number??"purchase order"}`:"New purchase order"}
    close={()=>navigate(closePath)} closeDisabled={busy||!!pending} footer={footer}>
    <p className="text-sm text-muted-foreground">{editing
      ?"Revise this unfunded internal draft. Its supplier, currency and approved source lines stay linked."
      :"Select approved request lines. This first saves an internal draft."}</p>
    <form id="principal-order-draft-form" onSubmit={save} className="space-y-7">
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{notice&&<p role="status">{notice}</p>}
      {pending&&<section aria-label="Check your last save" className="space-y-3 rounded-md border border-border bg-card p-4">
        <h2 className="font-semibold">Check your last save</h2><p className="text-sm">The last order save may have succeeded. Check command {pending.key} before another save.</p>
        <Button type="button" disabled={busy} onClick={()=>void recover()}>Check saved result</Button></section>}
      {editing&&<section aria-label="Draft revision" className="space-y-3 rounded-md border border-border p-4">
        <p className="text-sm">Current version: {saved?.version}. Original source evidence remains linked.</p>
        {!canEdit&&<p role="status" className="text-sm text-muted-foreground">{saved?.editUnavailableReason??"Draft revision is not available for this order or account."}</p>}
        {editProblem&&<p role="alert" className="text-sm text-destructive">{editProblem}</p>}
        <Field label="Reason for revision"><Input value={reason} disabled={!canEdit||busy||!!pending}
          maxLength={1000} onChange={event=>setReason(event.target.value)}/></Field>
      </section>}
      <fieldset disabled={busy||!!pending||editing&&!canEdit} className="space-y-7">
        <section aria-label="Approved requests" className="space-y-3">
          <h2 className="text-sm font-semibold">Approved requests</h2>
          {editing?saved?.lines.map(row=><div key={row.id} className="rounded-md border border-border p-3 text-sm">
            <p className="font-medium">{row.description}</p><p className="text-muted-foreground">Approved purchase request · {row.allocationStatus} · {row.quantity} {row.unitCode}</p>
          </div>):loading?<p role="status">Loading approved requests…</p>:available.length?available.map(source=><div key={source.purchaseRequestLineId} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
            <div><p className="font-medium">{source.requestNumber} · {source.description??"Request line"}</p>
              <p className="text-sm text-muted-foreground">{source.canSelect?`${source.availableQuantity} ${source.unitCode} available · ${source.currencyCode} ${source.approvedUnitEstimate} each`:"Unavailable for this order"}</p></div>
            <Button type="button" variant="secondary" disabled={!source.canSelect||chosen.some(row=>row.purchaseRequestLineId===source.purchaseRequestLineId)} onClick={()=>select(source)}>Add line</Button>
          </div>):<p className="text-sm text-muted-foreground">No approved direct-purchase lines are available in this company and branch.</p>}
          {!editing&&<div className="flex gap-3"><Button type="button" variant="secondary" disabled={page===1} onClick={()=>setPage(page-1)}>Previous</Button><Button type="button" variant="secondary" disabled={page*25>=sourceTotal} onClick={()=>setPage(page+1)}>More</Button></div>}
        </section>
        <section aria-label="Vendor" className="-mx-5 bg-muted/50 px-5 py-5 sm:-mx-8 sm:px-8">
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            {editing?<Field label="Vendor Name"><Input readOnly value={saved?.supplierDisplayName??""}/></Field>
              :<><Field label="Find vendor"><Input value={vendorSearch} onChange={event=>{setVendorSearch(event.target.value);setVendorPage(1);}} /></Field>
            <Field label="Vendor Name *"><Select required value={draft.supplierId} onChange={event=>setDraft(current=>({...current,supplierId:event.target.value}))}>
              <option value="">Choose an approved vendor</option>
              {draft.supplierId&&!vendors.some(row=>row.id===draft.supplierId)&&<option value={draft.supplierId}>Previously selected vendor</option>}
              {vendors.map(row=><option key={row.id} value={row.id}>{row.displayName}</option>)}</Select>
              <div className="mt-2 flex gap-2"><Button type="button" variant="secondary" disabled={vendorPage===1} onClick={()=>setVendorPage(vendorPage-1)}>Previous</Button>
                <Button type="button" variant="secondary" disabled={!vendorNext} onClick={()=>setVendorPage(vendorNext??vendorPage)}>More</Button></div></Field></>}
          </div>
        </section>
        <section aria-label="Order details" className="grid max-w-4xl gap-x-8 gap-y-5 sm:grid-cols-2">
          <Field label="Date"><Input readOnly value={editing?saved?.createdAt?.slice(0,10)??"—":"Set by ERP when saved"} /></Field>
          <Field label="Purchase order #"><Input readOnly value={editing?saved?.number??"—":"Generated when saved"} /></Field>
          <Field label="Currency"><Input readOnly value={draft.currencyCode} /></Field>
          <Field label="Delivery Date"><Input type="date" value={draft.expectedDeliveryOn??""} onChange={event=>setDraft(current=>({...current,expectedDeliveryOn:event.target.value||null}))}/></Field>
          <Field label="Deliver to"><Input value={draft.shipToRef} onChange={event=>setDraft(current=>({...current,shipToRef:event.target.value}))}/></Field>
          <Field label="Billing address"><Input value={draft.billToRef} onChange={event=>setDraft(current=>({...current,billToRef:event.target.value}))}/></Field>
          <Field label="Payment terms"><Input value={draft.paymentTermRef} onChange={event=>setDraft(current=>({...current,paymentTermRef:event.target.value}))}/></Field>
          <Field label="Shipment preference"><Input readOnly value="Set after approval, before manual issue" /></Field>
        </section>
        <section aria-label="Order lines" className="space-y-3">
          <h2 className="text-sm font-semibold">Order lines</h2>
          <div className="overflow-x-auto rounded-md border border-border"><table className="w-full min-w-[850px] text-sm">
            <thead className="bg-muted/50 text-left"><tr><th className="p-3">Item / source</th><th className="p-3">Unit</th><th className="p-3">Quantity</th><th className="p-3">Unit price</th><th className="p-3">Tax</th><th className="p-3">Action</th></tr></thead>
            <tbody>{draft.lines.map((entry,at)=><tr key={entry.id??chosen[at]?.purchaseRequestLineId??at} className="border-t border-border align-top">
              <td className="p-3"><span className="mb-1 block text-xs text-muted-foreground">{editing?"Approved purchase request":`${chosen[at]?.requestNumber} · Available ${chosen[at]?.availableQuantity}`}</span><Input aria-label={`Line ${at+1} description`} required value={entry.description} onChange={event=>line(at,{description:event.target.value})}/>
                {editing&&<div className="mt-2 grid gap-2"><Input aria-label={`Line ${at+1} cost centre`} placeholder="Cost centre" value={entry.costCenterRef??""} onChange={event=>line(at,{costCenterRef:event.target.value||null})}/>
                  <Input aria-label={`Line ${at+1} project`} placeholder="Project" value={entry.projectRef??""} onChange={event=>line(at,{projectRef:event.target.value||null})}/></div>}</td>
              <td className="p-3"><Input aria-label={`Line ${at+1} unit`} readOnly value={entry.unitCode}/></td>
              <td className="p-3"><Input aria-label={`Line ${at+1} quantity`} required inputMode="decimal" value={entry.quantity} onChange={event=>line(at,{quantity:event.target.value})}/></td>
              <td className="p-3"><Input aria-label={`Line ${at+1} unit price`} required inputMode="decimal" value={entry.unitPrice} onChange={event=>line(at,{unitPrice:event.target.value})}/></td>
              <td className="p-3"><Input aria-label={`Line ${at+1} tax`} required inputMode="decimal" value={entry.taxAmount} onChange={event=>line(at,{taxAmount:event.target.value})}/></td>
              <td className="p-3"><Button type="button" variant="secondary" disabled={editing}
                title={editing?"Linked source lines cannot be removed from this draft.":undefined} onClick={()=>remove(at)}>Remove</Button></td>
            </tr>)}</tbody></table>{!draft.lines.length&&<p className="p-4 text-sm text-muted-foreground">Choose a request line above to prepare the order.</p>}</div>
          <div className="ml-auto max-w-sm space-y-2 border-t border-border pt-3 text-sm"><div className="flex justify-between"><span>Draft total ({draft.currencyCode})</span><strong>{total??"Check line amounts"}</strong></div>
            <p className="text-xs text-muted-foreground">Exact quantity × unit price plus entered tax. ERP validates the saved value.</p></div>
        </section>
        <section aria-label="Notes and attachments" className="grid gap-6 border-t border-border pt-6 sm:grid-cols-2">
          <Field label="Notes"><Input readOnly value="Notes are not available in this draft workflow" /></Field>
          <Field label="Terms and conditions"><Input readOnly value="Terms are set in the controlled issue workflow" /></Field>
          <div className="sm:col-span-2 flex items-center gap-2 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground"><Paperclip size={16}/>Attachments become available when the governed order workflow supports them.</div>
        </section>
      </fieldset>
    </form>
  </TransactionEditorFrame>;
}
