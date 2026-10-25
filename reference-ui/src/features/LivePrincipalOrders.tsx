import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Select, Field } from "../components/ui";
import { LiveRecordDirectory } from "../components/data/LiveRecordDirectory";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { listPrincipalApprovals, listPrincipalFinanceWork, listPrincipalFulfilmentWork,
  listPrincipalOrders, type PrincipalOrderPage } from "../../../src/platform/procurement-principal-orders-api";

type View = "buyer" | "finance" | "reviews" | "issue" | "ack";
const viewLabels: Record<View, string> = { buyer: "My orders", finance: "Finance work", reviews: "Assigned approvals",
  issue: "Authorize versions", ack: "Supplier responses" };
export { LivePrincipalOrderEditor } from "./LivePrincipalOrderEditor";
export { LivePrincipalOrderDetail } from "./LivePrincipalOrderDetail";

export function LivePrincipalOrderApprovalQueue(){return <LivePrincipalOrderList forcedView="reviews"/>;}
export function LivePrincipalOrderList({forcedView}:{forcedView?:View}={}) {
  const context = useLiveReadiness()!, [params, setParams] = useSearchParams();
  const allowed: View[] = [
    ...(context.permissions.includes("procurement-po-read") ? ["buyer" as const] : []),
    ...(context.capabilities.principalOrderGovernance && context.permissions.includes("procurement-po-finance-confirm") ? ["finance" as const] : []),
    ...(context.capabilities.principalOrderGovernance && context.permissions.includes("procurement-po-approve") ? ["reviews" as const] : []),
    ...(context.capabilities.principalOrderGovernance && context.permissions.includes("procurement-po-issue") ? ["issue" as const] : []),
    ...(context.capabilities.principalOrderGovernance && context.permissions.includes("procurement-po-dispatch-confirm") ? ["ack" as const] : []),
  ];
  const requested=params.get("view") as View | null;
  const view=forcedView?(allowed.includes(forcedView)?forcedView:undefined):allowed.includes(requested as View)?requested as View:allowed[0];
  const [page,setPage]=useState(1),[status,setStatus]=useState(""),[revision,setRevision]=useState(0);
  const [data,setData]=useState<PrincipalOrderPage | null>(null),[loadedFor,setLoadedFor]=useState(""),
    [loading,setLoading]=useState(true),[error,setError]=useState("");
  const currentFor=`${view}:${page}:${status}:${revision}`;
  useEffect(()=>{setPage(1);setStatus("");setData(null);},[view]);
  useEffect(()=>{
    const abort=new AbortController();setData(null);setLoadedFor("");setError("");setLoading(true);
    if(!view){setLoading(false);return()=>abort.abort();}
    const read=view==="buyer"?listPrincipalOrders(context.legalEntityId,page,status,abort.signal)
      :view==="finance"?listPrincipalFinanceWork(context.legalEntityId,page,abort.signal)
        :view==="reviews"?listPrincipalApprovals(context.legalEntityId,page,abort.signal)
          :listPrincipalFulfilmentWork(context.legalEntityId,view as "issue"|"ack",page,abort.signal);
    read.then(value=>{if(!abort.signal.aborted){setData(value);setLoadedFor(currentFor);}})
      .catch((cause:unknown)=>{if(!abort.signal.aborted){setError(cause instanceof Error?cause.message:"Orders are unavailable.");setLoadedFor(currentFor);}})
      .finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();
  },[context.legalEntityId,view,page,status,revision]);
  if(!view)return <div className="p-5 sm:p-8" role="alert">You do not have access to this order worklist for this company.</div>;
  const controls=<div className="mb-5 space-y-4">{!forcedView&&<div role="tablist" aria-label="Order responsibilities" className="flex flex-wrap gap-3">
    {allowed.map(code=><Button key={code} role="tab" aria-selected={view===code} variant={view===code?"primary":"secondary"}
      onClick={()=>setParams({workflow:"principal",view:code})}>{viewLabels[code]}</Button>)}
    {context.capabilities.orders&&context.workerId&&<Link className="text-sm text-primary" to="/purchase-orders?workflow=worker">Worker order workspace</Link>}
  </div>}{view==="buyer"&&<Field label="Order status"><Select value={status} onChange={event=>{setStatus(event.target.value);setPage(1);setData(null);}}>
    <option value="">All statuses</option>{["Draft","PendingApproval","Approved","Returned","Rejected","ReleasePending","IssuePending","Issued","Disputed","Cancelled"]
      .map(code=><option key={code} value={code}>{code}</option>)}</Select></Field>}</div>;
  const taskView=view;
  const visible=loadedFor===currentFor?data:null;
  return <div className="p-5 sm:p-8"><LiveRecordDirectory key={`${taskView}:${status}:${page}:${revision}`} title="Purchase Orders" entity="orders"
    subtitle="Follow each internal order through approval, manual commitment and supplier response." contextControls={controls}
    action={context.permissions.includes("procurement-po-convert")?<Link to="/purchase-orders/new?workflow=principal"><Button>Create from approved requests</Button></Link>:undefined}
    columns={[{key:"number",label:"Order / Vendor",width:280},{key:"currency",label:"Currency",width:100},
      {key:"status",label:"Status",width:150},{key:"task",label:"Next step",width:220}]}
    rows={(visible?.items??[]).map(row=>({id:row.id,number:row.number,title:"Internal order",status:row.status,
      path:`/purchase-orders/${row.id}?workflow=principal&view=${taskView}${"assignmentId" in row&&typeof row.assignmentId==="string"?`&assignmentId=${row.assignmentId}`:""}`,
      fields:{currency:row.currencyCode,task:taskView==="finance"?row.status==="ReleasePending"?"Confirm external release":"Record external commitment"
        :taskView==="reviews"?"Review assigned approval":taskView==="issue"?"Authorize internal version"
          :taskView==="ack"?"Record supplier response":"View order"}}))}
    loading={loading||loadedFor!==currentFor} error={loadedFor===currentFor?error:""} total={visible?.total??0} page={page} pageSize={visible?.pageSize??25}
    onPage={next=>{setPage(next);setData(null);}} onRefresh={()=>{setRevision(n=>n+1);setData(null);}}
    emptyTitle="No orders need your attention" emptyDescription="Orders in the current company, branch and responsibility appear here." /></div>;
}
