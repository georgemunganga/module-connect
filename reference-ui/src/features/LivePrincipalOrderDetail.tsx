import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Badge, Button, Field, Input, Panel, Select, Textarea } from "../components/ui";
import { DetailSection, DetailTabs, DetailValue } from "../components/data/DetailPrimitives";
import { RecordTable } from "../components/data/RecordTable";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { principalOrderJournal, type PrincipalLocator } from "../lib/principal-order-command-journal";
import { exactJson, getPrincipalFinanceDetail, getPrincipalFulfilmentDetail, getPrincipalOrder, getPrincipalReview,
  PrincipalOrderError, recoverPrincipalCommand, sendPrincipalCommand, type PrincipalCommand,
  type PrincipalFinanceDetail, type PrincipalFulfilmentDetail, type PrincipalOrderDetail,
  type PrincipalReview } from "../../../src/platform/procurement-principal-orders-api";

type View="buyer"|"finance"|"reviews"|"issue"|"ack";
type Detail={view:"buyer";record:PrincipalOrderDetail}|{view:"finance";record:PrincipalFinanceDetail}
  |{view:"reviews";record:PrincipalReview}|{view:"issue"|"ack";record:PrincipalFulfilmentDetail};
type Action="Cancel"|"Funding"|"Submit"|"Decide"|"Issue"|"Ack"|"ReleaseRequest"|"ReleaseConfirm";
const errorText=(cause:unknown)=>cause instanceof Error?cause.message:"The order action could not be confirmed.";
const iso=(value:string)=>/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,7})?)?(?:Z|[+-]\d\d:\d\d)$/.test(value)
  &&!Number.isNaN(Date.parse(value));
const exact=/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/;

export function LivePrincipalOrderDetail(){
  const context=useLiveReadiness()!,shell=useErpShell(),{id}=useParams(),[params]=useSearchParams();
  const requested=params.get("view"),view:View=requested==="finance"||requested==="reviews"||requested==="issue"||requested==="ack"?requested:"buyer";
  const assignmentId=params.get("assignmentId")??"";
  const key=[shell.authEpoch,context.tenantId,context.legalEntityId,context.principalId,shell.selection.branch??"all",id??"",view,assignmentId].join(":");
  return <PrincipalDetail key={key} id={id??""} view={view} assignmentId={assignmentId} scopeKey={key}/>;
}
function PrincipalDetail({id,view,assignmentId,scopeKey}:{id:string;view:View;assignmentId:string;scopeKey:string}){
  const context=useLiveReadiness()!,navigate=useNavigate(),company=context.legalEntityId;
  const [data,setData]=useState<Detail|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [action,setAction]=useState<Action|null>(null),[reason,setReason]=useState(""),[reference,setReference]=useState(""),
    [evidence,setEvidence]=useState(""),[amount,setAmount]=useState(""),[references,setReferences]=useState(""),
    [when,setWhen]=useState(""),[decision,setDecision]=useState<"Approve"|"Return"|"Reject">("Approve"),
    [outcome,setOutcome]=useState<"Accepted"|"Rejected">("Accepted"),[channel,setChannel]=useState("");
  const [busy,setBusy]=useState(false),[pending,setPending]=useState<PrincipalLocator|null>(null);
  const [activeTab,setActiveTab]=useState("overview");
  const lock=useRef(false),alive=useRef(true),[revision,setRevision]=useState(0);
  useEffect(()=>{alive.current=true;try{setPending(principalOrderJournal.read(scopeKey));}
    catch(cause){setError(errorText(cause));lock.current=true;}return()=>{alive.current=false;};},[scopeKey]);
  useEffect(()=>{const abort=new AbortController();setLoading(true);setData(null);setError("");
    const read=view==="buyer"?getPrincipalOrder(company,id,abort.signal).then(record=>({view,record} as Detail))
      :view==="finance"?getPrincipalFinanceDetail(company,id,abort.signal).then(record=>({view,record} as Detail))
        :view==="reviews"?getPrincipalReview(company,id,assignmentId,abort.signal).then(record=>({view,record} as Detail))
          :getPrincipalFulfilmentDetail(company,id,view,abort.signal).then(record=>({view,record} as Detail));
    read.then(value=>{if(!abort.signal.aborted)setData(value);})
      .catch(cause=>{if(!abort.signal.aborted)setError(errorText(cause));})
      .finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();
  },[company,id,view,assignmentId,revision]);
  const grant=(name:string)=>context.permissions.includes(name);
  const record=data?.record;
  function availableActions():Action[]{
    if(!data)return [];
    if(data.view==="buyer")return [
      ...(data.record.status==="Draft"&&!data.record.fundingRecorded&&grant("procurement-po-edit")?["Cancel" as const]:[]),
      ...(context.capabilities.principalOrderGovernance&&data.record.status==="Draft"&&data.record.fundingRecorded
        &&grant("procurement-po-submit")?["Submit" as const]:[]),
      ...(context.capabilities.principalOrderGovernance&&data.record.fundingRecorded
        &&["Draft","Returned","Rejected"].includes(data.record.status)
        &&grant("procurement-po-edit")?["ReleaseRequest" as const]:[])];
    if(!context.capabilities.principalOrderGovernance)return [];
    if(data.view==="finance")return [
      ...(data.record.canRecordFunding&&grant("procurement-po-finance-confirm")?["Funding" as const]:[]),
      ...(data.record.canConfirmRelease&&grant("procurement-po-finance-confirm")?["ReleaseConfirm" as const]:[])];
    if(data.view==="reviews")return data.record.canDecide&&grant("procurement-po-approve")?["Decide"]:[];
    if(data.view==="issue")return data.record.canIssue&&grant("procurement-po-issue")?["Issue"]:[];
    return data.record.canRecordSupplierResponse&&grant("procurement-po-dispatch-confirm")?["Ack"]:[];
  }
  const actions=availableActions();
  function begin(next:Action){setAction(next);setError("");setReason("");setReference("");setEvidence("");setReferences("");setWhen("");
    setAmount(data?.view==="finance"?data.record.grossAmountExact:"");setChannel(data?.view==="ack"?data.record.allowedManualResponseChannels[0]??"":"");}
  function commandFor(selected:Action):PrincipalCommand{
    if(!data)throw new Error("Reload this order before taking an action.");
    const version=data.record.version,source="originalDirectSourceSha256" in data.record?data.record.originalDirectSourceSha256:"";
    if(!Number.isSafeInteger(version)||version<1)throw new Error("Order version is unavailable.");
    let body:string;
    if(selected==="Cancel"||selected==="ReleaseRequest"){
      if(!reason.trim()||!source)throw new Error("Enter a reason and reload the saved source evidence.");
      body=JSON.stringify({expectedOrderVersion:version,originalDirectSourceSha256:source,reason:reason.trim()});
    }else if(selected==="Funding"){
      if(data.view!=="finance"||!data.record.canRecordFunding||!reference.trim()||!evidence.trim()||!iso(when)
        ||!exact.test(amount)||amount!==data.record.grossAmountExact)throw new Error("Enter the exact commercial amount, external references and observed date with time zone.");
      const refs=references.split("\n").map(row=>row.trim()).filter(Boolean);
      if(refs.length!==data.record.sourceReservationReferences.length ||
        refs.some((value,i)=>value!==data.record.sourceReservationReferences[i]))throw new Error("Use every retained source reservation reference shown below.");
      body=exactJson({expectedOrderVersion:version,manualCommitmentReference:reference.trim(),externalEvidenceReference:evidence.trim(),
        currencyCode:data.record.currencyCode,sourceReservationReferences:refs,observedAt:new Date(when).toISOString()},
      {attestedGrossAmount:amount});
    }else if(selected==="Submit"||selected==="Issue")body=JSON.stringify({expectedOrderVersion:version});
    else if(selected==="Decide"){
      if(data.view!=="reviews"||!data.record.canDecide||decision!=="Approve"&&!reason.trim())throw new Error("Enter a reason for returning or rejecting this order.");
      body=JSON.stringify({action:decision,reason:reason.trim()||null,expectedOrderVersion:version,
        expectedCaseVersion:data.record.caseVersion,expectedAssignmentVersion:data.record.assignmentVersion});
    }else if(selected==="Ack"){
      if(data.view!=="ack"||!data.record.issuedVersionId||!data.record.allowedManualResponseChannels.includes(channel)
        ||!reference.trim()||!evidence.trim()||!iso(when))throw new Error("Enter the supplier response, its approved channel, references and actual time.");
      body=JSON.stringify({expectedOrderVersion:version,issuedVersionId:data.record.issuedVersionId,
        outcome,channel,supplierReference:reference.trim(),evidenceReference:evidence.trim(),observedAt:new Date(when).toISOString()});
    }else{
      if(data.view!=="finance"||!data.record.canConfirmRelease||!data.record.release?.id||!evidence.trim()||!iso(when)
        ||!exact.test(amount)||amount!==data.record.grossAmountExact)throw new Error("Confirm the full external release with its evidence and actual date.");
      const refs=references.split("\n").map(row=>row.trim()).filter(Boolean);
      if(refs.length!==data.record.sourceReservationReferences.length||refs.some((value,i)=>value!==data.record.sourceReservationReferences[i]))
        throw new Error("Use every retained source reservation reference shown below.");
      body=exactJson({expectedOrderVersion:version,releaseRequestId:data.record.release.id,
        externalReleaseEvidenceReference:evidence.trim(),currencyCode:data.record.currencyCode,
        restoredSourceReservationReferences:refs,confirmedAt:new Date(when).toISOString()},
      {releasedGrossAmount:amount});
    }
    return {operation:selected,key:crypto.randomUUID(),orderId:id,
      ...(selected==="Decide"?{assignmentId}:{}),body};
  }
  async function submit(event:FormEvent){event.preventDefault();if(!action||!actions.includes(action)||lock.current||pending||busy)return;
    let command:PrincipalCommand;try{command=commandFor(action);principalOrderJournal.claim(scopeKey,command);
      setPending({operation:command.operation,key:command.key,orderId:id,...(command.assignmentId?{assignmentId:command.assignmentId}:{})});}
    catch(cause){setError(errorText(cause));return;}
    lock.current=true;setBusy(true);setError("");
    try{const result=await sendPrincipalCommand(company,command);principalOrderJournal.clear(scopeKey,command);
      if(alive.current){setPending(null);setAction(null);setNotice(`${action} was saved. ${result.status}.`);
        if(view==="buyer")setRevision(value=>value+1);
        else navigate(`/purchase-orders?workflow=principal&view=${view}`,{state:{notice:`${action} saved.`}});}}
    catch(cause){if(cause instanceof PrincipalOrderError&&[400,422].includes(cause.status)){
        try{principalOrderJournal.clear(scopeKey,command);if(alive.current)setPending(null);}catch{/* Keep recovery marker. */}}
      if(alive.current)setError(errorText(cause));}
    finally{lock.current=false;if(alive.current)setBusy(false);}}
  async function recover(){if(!pending||lock.current)return;lock.current=true;setBusy(true);setError("");
    try{const result=await recoverPrincipalCommand(company,{...pending,body:""});principalOrderJournal.clear(scopeKey,pending);
      if(alive.current){setPending(null);setAction(null);setNotice(`Saved result confirmed: ${result.status}.`);
        if(view==="buyer")setRevision(value=>value+1);
        else navigate(`/purchase-orders?workflow=principal&view=${view}`,{state:{notice:"The saved result was confirmed."}});}}
    catch(cause){if(alive.current)setError(`${errorText(cause)} Keep command reference ${pending.key}.`);}
    finally{lock.current=false;if(alive.current)setBusy(false);}}
  if(loading)return <div className="p-5 sm:p-8" role="status">Loading order…</div>;
  if(!data)return <div className="p-5 sm:p-8"><p role="alert">{error||"This order is unavailable in your current company and branch."}</p>
    <Link to="/purchase-orders?workflow=principal">Back to purchase orders</Link></div>;
  return <div className="min-h-[calc(100dvh-5rem)] bg-background">
    <header className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface/95 px-5 py-4 backdrop-blur sm:px-8"><div className="min-w-0">
      <Link className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary" to="/purchase-orders?workflow=principal"><ArrowLeft size={13}/>Purchase Orders</Link>
      <div className="flex min-w-0 flex-wrap items-center gap-2"><h1 title={record.number} className="max-w-3xl break-all text-2xl font-semibold line-clamp-2">{record.number}</h1><Badge>{record.status}</Badge></div>
      <p className="mt-1 text-xs text-muted-foreground">{record.supplierDisplayName} · {record.currencyCode}</p>
    </div></header>
    <DetailTabs tabs={[{key:"overview",label:"Overview"},{key:"items",label:`Items (${data.record.lines.length})`},
      {key:"related",label:"Related"},{key:"comments",label:"Comments"},{key:"history",label:"History"}]} active={activeTab} onChange={setActiveTab} />
    <div className="space-y-5 px-5 py-6 sm:px-8">
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{notice&&<p role="status">{notice}</p>}
      {pending&&<Panel title="Check previous action"><div className="space-y-3 p-5"><p>This action may already have succeeded. Command reference: {pending.key}.</p>
        <Button disabled={busy} onClick={()=>void recover()}>Check saved result</Button></div></Panel>}
      {activeTab==="overview"&&<><DetailSection title="Purchase Order Overview" action={<Badge>{record.status}</Badge>}><dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <DetailValue label="Status" value={record.status}/><DetailValue label="Vendor" value={record.supplierDisplayName}/>
        <DetailValue label="Branch" value={record.branchDisplayName}/><DetailValue label="Currency" value={record.currencyCode}/>
        <DetailValue label="Commercial version" value={record.version}/>
        {data.view==="buyer"&&<><DetailValue label="Deliver to" value={data.record.shipToRef||"—"}/>
          <DetailValue label="Bill to" value={data.record.billToRef||"—"}/>
          <DetailValue label="Payment terms" value={data.record.paymentTermRef||"—"}/>
          <DetailValue label="External commitment" value={data.record.fundingRecorded?"Recorded":"Awaiting independent Finance recording"}/></>}
      </dl></DetailSection>
      {data.view==="buyer"&&<>
        {data.record.release&&<Panel title="External release"><div className="space-y-2 p-5"><p>Requested: {data.record.release.reason}</p><p>{data.record.release.state}</p>
          {data.record.releaseConfirmation&&<p>External release recorded: {data.record.releaseConfirmation.releasedGrossAmountExact} {record.currencyCode}</p>}</div></Panel>}</>}
      {data.view==="finance"&&<Panel title="External commitment"><div className="space-y-3 p-5"><p>Commercial gross: {record.currencyCode} {data.record.grossAmountExact}</p>
        <p>Source reservations: {data.record.sourceReservationReferences.join(", ")}</p>
        {data.record.funding&&<p>Recorded reference: {data.record.funding.manualCommitmentReference}</p>}
        <p className="text-sm text-muted-foreground">This records external evidence. It does not post to the Finance ledger.</p></div></Panel>}
      {data.view==="reviews"&&<Panel title="Assigned approval"><div className="space-y-3 p-5"><p>Commercial gross: {record.currencyCode} {data.record.grossAmountExact}</p>
        <p>Manual commitment: {data.record.manualCommitmentReference}</p><p>Evidence: {data.record.externalEvidenceReference}</p>
        <p>Policy reference: {data.record.approvedManualPolicyReference}</p><p className="text-sm text-muted-foreground">Approval here authorizes the order workflow; it does not post Finance entries.</p></div></Panel>}
      {(data.view==="issue"||data.view==="ack")&&<Panel title="Internal order version"><div className="space-y-2 p-5"><p>Commercial gross: {record.currencyCode} {data.record.grossAmountExact}</p>
        <p>Issued version: {data.record.issuedVersionId??"Awaiting internal authorization"}</p>
        <p className="text-sm text-muted-foreground">Authorizing a version does not send it to the supplier. Supplier responses below are entered from external evidence.</p></div></Panel>}
      {actions.length>0&&<Panel title="Next action"><div className="space-y-4 p-5"><div className="flex flex-wrap gap-3">{actions.map(code=><Button key={code} variant={action===code?"primary":"secondary"} disabled={busy||!!pending} onClick={()=>begin(code)}>
        {{Cancel:"Cancel internal draft",Funding:"Record external commitment",Submit:"Send for approval",Decide:"Decide assigned approval",
          Issue:"Authorize internal version",Ack:"Record supplier response",ReleaseRequest:"Request external release",ReleaseConfirm:"Confirm external release"}[code]}</Button>)}</div>
        {action&&<form onSubmit={submit} className="space-y-4 rounded-lg border border-border p-4"><fieldset disabled={busy||!!pending} className="space-y-4">
          {action==="Decide"&&<Field label="Decision"><Select value={decision} onChange={event=>setDecision(event.target.value as typeof decision)}>
            <option value="Approve">Approve</option><option value="Return">Return for changes</option><option value="Reject">Reject</option></Select></Field>}
          {action==="Ack"&&<><Field label="Supplier response"><Select value={outcome} onChange={event=>setOutcome(event.target.value as typeof outcome)}>
            <option value="Accepted">Accepted</option><option value="Rejected">Rejected</option></Select></Field>
            <Field label="Recorded channel"><Select value={channel} onChange={event=>setChannel(event.target.value)}>
              {data.view==="ack"&&data.record.allowedManualResponseChannels.map(value=><option key={value} value={value}>{value}</option>)}</Select></Field></>}
          {(action==="Cancel"||action==="ReleaseRequest"||action==="Decide")&&<Field label="Reason"><Textarea value={reason} onChange={event=>setReason(event.target.value)}/></Field>}
          {(action==="Funding"||action==="Ack")&&<Field label={action==="Ack"?"Supplier reference":"Manual commitment reference"}><Input value={reference} onChange={event=>setReference(event.target.value)}/></Field>}
          {(action==="Funding"||action==="Ack"||action==="ReleaseConfirm")&&<Field label="External evidence reference"><Input value={evidence} onChange={event=>setEvidence(event.target.value)}/></Field>}
          {(action==="Funding"||action==="ReleaseConfirm")&&<><Field label={`Exact amount (${record.currencyCode})`}><Input inputMode="decimal" value={amount} onChange={event=>setAmount(event.target.value)}/></Field>
            <Field label="Source reservation references, one per line"><Textarea value={references} onChange={event=>setReferences(event.target.value)}/></Field></>}
          {(action==="Funding"||action==="Ack"||action==="ReleaseConfirm")&&<Field label="Actual date and time, with time zone"><Input placeholder="2026-10-23T09:30:00+02:00" value={when} onChange={event=>setWhen(event.target.value)}/></Field>}
          <div className="flex gap-3"><Button type="submit" disabled={busy||!!pending}>{busy?"Saving…":"Confirm action"}</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={()=>setAction(null)}>Close</Button></div>
        </fieldset></form>}</div></Panel>}
      </>}
      {activeTab==="items"&&<DetailSection title="Items / Line Details"><div className="overflow-x-auto"><RecordTable variant="compact"><thead><tr><th>Description</th><th>Unit</th><th>Quantity</th><th>Unit price</th><th>Tax</th>{data.view==="buyer"&&<><th>Source request</th><th>Allocation</th></>}</tr></thead>
        <tbody>{data.record.lines.map(row=><tr key={row.id}><td>{row.description}</td><td>{row.unitCode}</td><td>{row.quantity}</td><td>{record.currencyCode} {row.unitPrice}</td><td>{record.currencyCode} {row.taxAmount}</td>{data.view==="buyer"&&"purchaseRequestId" in row&&<><td>{row.purchaseRequestId}</td><td>{row.allocationStatus}</td></>}</tr>)}</tbody></RecordTable></div></DetailSection>}
      {activeTab==="related"&&<><Panel title="Finance evidence"><div className="space-y-3 p-5"><p className="text-sm">The recorded commitment and release references describe external evidence. This page does not move money or post a Finance entry.</p>
        {data.view==="finance"&&data.record.funding?<p>{data.record.funding.manualCommitmentReference} · {data.record.funding.attestedGrossAmountExact} {record.currencyCode}</p>
          :data.view==="buyer"&&data.record.releaseConfirmation?<p>Release confirmed: {data.record.releaseConfirmation.externalReleaseEvidenceReference}</p>
          :<p>No commitment reference is visible in this responsibility view.</p>}</div></Panel>
        <DetailSection title="Related Records"><p className="text-sm text-muted-foreground">Approved request references appear on the order lines. Receipts and supplier invoices belong to their own workspaces. No supplier send or payment is asserted here.</p></DetailSection></>}
      {activeTab==="comments"&&<DetailSection title="Comments"><p className="text-sm text-muted-foreground">Comments cannot be saved on this purchase order yet.</p></DetailSection>}
      {activeTab==="history"&&<DetailSection title="Recorded activity"><p className="text-sm">Current saved state: {record.status}, version {record.version}.</p>
        {data.view==="buyer"&&data.record.release&&<p className="mt-2 text-sm">External release requested {data.record.release.requestedAt}: {data.record.release.reason}</p>}
        <p className="mt-2 text-sm text-muted-foreground">The complete audit trail is held by ERP. This view shows only the history returned by this order API.</p></DetailSection>}
      <div className="flex gap-3"><Link to="/purchase-orders?workflow=principal" className="text-sm text-primary">Back to purchase orders</Link>
        <Button variant="secondary" disabled={busy} onClick={()=>setRevision(value=>value+1)}>Refresh order</Button></div>
    </div>
  </div>;
}
