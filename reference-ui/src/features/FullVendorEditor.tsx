import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, PageHeader } from "../components/ui";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { useErpShell } from "../lib/erpShell";
import { VendorEditorForm, type ChildKind, type ChildRow } from "./VendorEditorForm";
import { createVendorPayload, readVendorModel, newVendorModel, type VendorEditorModel, type Row } from "./vendor-editor-model";
import { VendorApiError, createVendorDraft, getVendorDraft, updateVendorDraft,
  addVendorContact, updateVendorContact, addVendorSite, updateVendorSite, 
  addVendorQualification, updateVendorQualification, 
  type VendorChildReceipt, type VendorDetail, type VendorContactDraft, type VendorSiteDraft, type VendorQualificationDraft } from "../../../src/platform/procurement-vendors-api";
const errorText = (error: unknown) => error instanceof Error ? error.message : "The vendor change was not confirmed.";
export function FullVendorEditor() {
  const readiness=useLiveReadiness(); const {selection}=useErpShell(); const {id}=useParams();
  if (!readiness) return <p role="alert">Choose a company before opening vendors.</p>;
  if (selection.entityId && selection.entityId!==readiness.legalEntityId) return <p role="status">Checking the selected company…</p>;
  return <VendorEditorSession key={`${readiness.tenantId}:${readiness.legalEntityId}:${selection.branch ?? ""}:${readiness.principalId}:${id ?? "new"}`} id={id} />;
}
function VendorEditorSession({id}:{id?:string}) {
  const readiness=useLiveReadiness()!; const company=readiness.legalEntityId; const navigate=useNavigate();
  const [model,setModel]=useState<VendorEditorModel>(()=>newVendorModel(readiness.defaultCurrencyCode));
  const [detail,setDetail]=useState<VendorDetail|null>(null); const [loading,setLoading]=useState(Boolean(id)); const [busy,setBusy]=useState(false);
  const [error,setError]=useState(""); const [saved,setSaved]=useState(""); const [blocked,setBlocked]=useState(false);
  const [dirty,setDirty]=useState<Set<string>>(()=>new Set()); const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{if(!id)return;const abort=new AbortController();getVendorDraft(company,id,abort.signal).then(value=>{if(abort.signal.aborted)return;setModel(readVendorModel(value,readiness.defaultCurrencyCode));setDetail(value);}).catch(cause=>{if(!abort.signal.aborted)setError(errorText(cause));}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();},[company,id,readiness.defaultCurrencyCode]);
  const permitted=readiness.permissions.includes(id ? "procurement-vendor-edit" : "procurement-vendor-create");
  const editable=!id || Boolean(detail && ["Draft","More Information Required"].includes(detail.status));
  const disabled=!permitted || !editable || busy || blocked || loading || Boolean(id&&!detail);
  function change(value:VendorEditorModel,key:string){setModel(value);setDirty(current=>new Set(current).add(key));setSaved("");}
  function failed(cause:unknown){setError(errorText(cause));if(!(cause instanceof VendorApiError) || cause.status===0 || cause.status===409 || cause.status>=500)setBlocked(true);}
  async function reconcile(){if(!id)return;setBusy(true);setError("");try{const value=await getVendorDraft(company,id);if(!alive.current)return;setModel(readVendorModel(value,readiness.defaultCurrencyCode));setDetail(value);setDirty(new Set());setBlocked(false);setSaved("Saved vendor reloaded. Unsaved form changes were discarded.");}catch(cause){if(alive.current)setError(errorText(cause));}finally{if(alive.current)setBusy(false);}}
  async function saveHeader(){if(disabled)return;setBusy(true);setError("");let mutationStarted=false;let confirmed=false;try{
    if(!id){const payload=createVendorPayload(model);mutationStarted=true;const result=await createVendorDraft(company,payload);if(alive.current)navigate(`/vendors/${result.id}`);return;}
    if(!detail)throw new Error("Load the saved vendor before editing.");
    // Header/attributes only. Never submit child arrays as if PUT updated them.
    const draft=createVendorPayload({...model,primary:null,contacts:[],sites:[],qualifications:[]});
    const {primaryContact: _primary,contacts:_contacts,sites:_sites,qualifications:_qualifications,...header}=draft;
    mutationStarted=true;const result=await updateVendorDraft(company,id,detail.version,header);confirmed=true;if(!alive.current)return;
    // Reconcile the actual saved header and attribute identities. Newly persisted keys
    // must be locked in this session too; do not invent attribute IDs from a PUT receipt.
    const fresh=await getVendorDraft(company,id);if(!alive.current)return;
    if(fresh.version!==result.version)throw new Error("Another vendor change followed your save. Reload and compare before another change.");
    const parsed=readVendorModel(fresh,readiness.defaultCurrencyCode);
    setDetail(fresh);setModel(current=>({...current,header:parsed.header}));
    setDirty(current=>{const next=new Set(current);next.delete("header");return next;});setSaved("Vendor details saved. Contacts, addresses and qualifications have their own Save buttons.");
  }catch(cause){if(alive.current){if(mutationStarted){failed(cause);if(confirmed)setBlocked(true);}else setError(errorText(cause));}}finally{if(alive.current)setBusy(false);}}
  async function saveChild(kind:ChildKind,row:ChildRow,remove=false){if(disabled)return;
    if(remove&&!row.id){setModel(current=>({...current,primary:current.primary?.key===row.key?null:current.primary,contacts:current.contacts.filter(item=>item.key!==row.key),sites:current.sites.filter(item=>item.key!==row.key),qualifications:current.qualifications.filter(item=>item.key!==row.key)}));setDirty(current=>{const next=new Set(current);next.delete(row.key);return next;});return;}
    if(!id||!detail)return;
    // Existing backend child removal requires a reason. Keep existing saved detail CRUD as the removal surface.
    if(remove){setError("Remove saved contacts, addresses or qualifications from the saved vendor, where a removal reason is recorded.");return;}
    setBusy(true);setError("");let confirmed=false;
    try{let receipt:VendorChildReceipt;
      if(kind==="contact"){const value=(row as Row<VendorContactDraft>).value;receipt=row.id?await updateVendorContact(company,id,row.id,detail.version,value):await addVendorContact(company,id,detail.version,value);}
      else if(kind==="site"){const value=(row as Row<VendorSiteDraft>).value;receipt=row.id?await updateVendorSite(company,id,row.id,detail.version,value):await addVendorSite(company,id,detail.version,value);}
      else{const value=(row as Row<VendorQualificationDraft>).value;receipt=row.id?await updateVendorQualification(company,id,row.id,detail.version,value):await addVendorQualification(company,id,detail.version,value);}
      confirmed=true;if(!alive.current)return;
      const fresh=await getVendorDraft(company,id);if(!alive.current)return;
      if(fresh.version!==receipt.version)throw new Error("Another vendor change followed your save. Reload and compare before another change.");
      const parsed=readVendorModel(fresh,readiness.defaultCurrencyCode);
      const savedRow=kind==="contact"?[...(parsed.primary?[parsed.primary]:[]),...parsed.contacts].find(item=>item.id===receipt.id):kind==="site"?parsed.sites.find(item=>item.id===receipt.id):parsed.qualifications.find(item=>item.id===receipt.id);
      if(!savedRow)throw new Error("The saved vendor detail could not be reconciled. Reload before another change.");
      setModel(current=>{if(kind==="contact"){const next=savedRow as Row<VendorContactDraft>;return {...current,primary:current.primary?.key===row.key?{...next,key:row.key}:current.primary,contacts:current.contacts.map(item=>item.key===row.key?{...next,key:row.key}:item)};}
        if(kind==="site")return {...current,sites:current.sites.map(item=>item.key===row.key?{...(savedRow as Row<VendorSiteDraft>),key:row.key}:item)};
        return {...current,qualifications:current.qualifications.map(item=>item.key===row.key?{...(savedRow as Row<VendorQualificationDraft>),key:row.key}:item)};});
      setDetail(fresh);setDirty(current=>{const next=new Set(current);next.delete(row.key);return next;});setSaved(`This ${kind==="site"?"address":kind} was saved. Other unsaved form changes are still here.`);
    }catch(cause){if(alive.current){failed(cause);if(confirmed)setBlocked(true);}}finally{if(alive.current)setBusy(false);}}
  return <div className="p-5 sm:p-8"><PageHeader title={id?"Edit vendor":"New vendor"} subtitle="Vendor information and contact details. Approval and Finance verification are managed separately." />
    {error&&<p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}{saved&&<p role="status" className="mb-4 text-sm">{saved}</p>}
    {blocked&&<div className="mb-4 space-y-2"><p className="text-sm">A change is unconfirmed or the vendor changed. Do not submit it again. Reload the saved record and compare; reloading discards unsaved form changes.</p>{id?<Button disabled={busy} variant="secondary" onClick={()=>void reconcile()}>Reload saved vendor and discard edits</Button>:<Link to="/vendors">Review vendor list before creating again</Link>}</div>}
    {loading?<p role="status">Loading vendor…</p>:<><VendorEditorForm model={model} editing={Boolean(id)} disabled={disabled} dirty={dirty} retainedAttributeKeys={new Set((detail?.attributes || []).map(row=>`${row.kind}:${row.key}`))} onChange={change} onSaveChild={(kind,row)=>void saveChild(kind,row)} onRemoveChild={(kind,row)=>void saveChild(kind,row,true)} />
      <div className="mt-6 flex gap-3"><Button disabled={disabled} onClick={()=>void saveHeader()}>{busy?"Saving…":id?"Save vendor details":"Save draft"}</Button><Link to={id?`/vendors/${id}`:"/vendors"}><Button variant="secondary">Cancel</Button></Link></div>
      {id&&<p className="mt-3 text-sm text-muted-foreground">Save vendor details updates the header, custom fields, tags and remarks only. Save each contact, address and qualification separately. Saved-record removal remains available from the vendor details page.</p>}
    </>}
  </div>;
}
