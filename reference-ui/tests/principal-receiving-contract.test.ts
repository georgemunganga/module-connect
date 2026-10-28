import { afterEach, describe, expect, it, vi } from "vitest";
import { getPrincipalReceipt, getPrincipalService, listPrincipalReceiving, listPrincipalReceivingSources, principalReceivingCommandPath, recoverPrincipalReceiving, sendPrincipalReceiving } from "../../src/platform/procurement-principal-receiving-api";
import { receivingCommandPath, type ReceivingCommand } from "../../src/platform/procurement-receiving-api";
const company="11111111-1111-4111-8111-111111111111", branch="22222222-2222-4222-8222-222222222222", order="33333333-3333-4333-8333-333333333333";
const issued="44444444-4444-4444-8444-444444444444", target="55555555-5555-4555-8555-555555555555", line="66666666-6666-4666-8666-666666666666", key="77777777-7777-4777-8777-777777777777", sourceLine="88888888-8888-4888-8888-888888888888";
const command=(operation:ReceivingCommand["operation"]="ReceivingAccept"):ReceivingCommand=>({protocol:"Principal2",operation,orderId:order,targetId:target,lineId:line,key,method:"POST",body:'{"version":2,"sourceVersion":1,"quantity":"0.0001","evidenceReference":"REF:actual"}'});
const result=(kind="Goods")=>({id:target,version:2,executionVersion:2,status:kind==="Goods"?"Recorded":"Certified",kind,purchaseOrderId:order,issuedVersionId:issued});
const json=(body:unknown)=>new Response(JSON.stringify(body),{headers:{"Content-Type":"application/json"}});
afterEach(()=>vi.unstubAllGlobals());
describe("principal receiving exact scoped transport",()=>{
  it("keeps the actual branch on collection rows and rejects records without it",async()=>{
    const row={id:target,version:1,status:"Draft",kind:"Goods",purchaseOrderId:order,purchaseOrderNumber:"PO-EXACT",siteId:branch};
    vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>json({records:[row],total:1,offset:0,limit:10,executionVersion:2})));
    expect((await listPrincipalReceiving(company,"receipts",1)).items[0].siteRef).toBe(branch);
    vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>json({records:[{...row,siteId:null}],total:1,offset:0,limit:10,executionVersion:2})));
    await expect(listPrincipalReceiving(company,"receipts",1)).rejects.toThrow("incomplete");
  });
  it("preserves exact original source digits and identifies unknown history without a fabricated zero",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>json({records:[{purchaseOrderId:order,purchaseOrderNumber:"PO-EXACT",issuedVersionId:issued,
      purchaseOrderLineId:sourceLine,siteId:branch,description:"Retained source",unitCode:"EA",currencyCode:"ZMW",authorizedQuantity:"99999999999999.9999",
      netUnitPrice:"0.0001",kind:"Goods",historyState:"NoSuccessorHistory",sourceVersion:null,currentAcceptedQuantity:null,
      supplierAcknowledgmentIsDelivery:false,actionCandidatesAreAuthority:false}],total:1,offset:0,limit:25})));
    const page=await listPrincipalReceivingSources(company,1);expect(page.items[0].orderedQuantity).toBe("99999999999999.9999");
    expect(page.items[0].netUnitPrice).toBe("0.0001");expect(page.items[0].acceptanceHistory).toBe("NoSuccessorHistory");
    expect(page.items[0]).not.toHaveProperty("acceptedQuantity");
  });
  it("uses explicit versioned command routes and refuses cross-protocol commands",()=>{
    expect(principalReceivingCommandPath(command())).toBe(`/receipts/${target}/lines/${line}/principal-accept`);
    expect(principalReceivingCommandPath(command("ServiceCertify"))).toBe(`/service-acceptances/${target}/principal-certify`);
    expect(principalReceivingCommandPath({...command("ReceivingDraft"),targetId:null})).toBe("/receipts/principal-drafts");
    expect(principalReceivingCommandPath({...command("ReceivingDraft"),method:"PUT"})).toBe(`/receipts/${target}/principal-draft`);
    expect(()=>principalReceivingCommandPath({...command(),protocol:undefined})).toThrow();expect(()=>receivingCommandPath(command())).toThrow();
  });
  it("never reposts an uncertain write and recovers creation by the original GET key",async()=>{
    const fetch=vi.fn().mockRejectedValueOnce(new TypeError("lost acknowledgement")).mockImplementation(async()=>json({...result(),status:"Draft"}));vi.stubGlobal("fetch",fetch);
    const pending={...command("ReceivingDraft"),targetId:null};await expect(sendPrincipalReceiving(company,pending)).rejects.toThrow("interrupted");
    expect(fetch).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[0][1].body).toBe(pending.body);expect(fetch.mock.calls[0][1].headers.get("Idempotency-Key")).toBe(key);
    expect(await recoverPrincipalReceiving(company,pending)).toEqual({id:target,status:"Draft"});expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toContain(`/receiving/principal-command-receipts/Create/${key}`);expect(fetch.mock.calls[1][1].method).toBeUndefined();
  });
  it("rejects a substituted original order or target instead of treating it as recovered success",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>json({...result(),purchaseOrderId:line})));
    await expect(recoverPrincipalReceiving(company,command())).rejects.toThrow("incomplete");
    vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>json({...result(),id:line})));
    await expect(sendPrincipalReceiving(company,command())).rejects.toThrow("incomplete");
  });
  it("maps an assigned inspection's real source line and server hints without broad receipt access",async()=>{
    const fetch=vi.fn().mockImplementation(async()=>json({records:[{id:target,lineId:line,purchaseOrderLineId:sourceLine,version:2,sourceVersion:1,
      taskKind:"Inspection",status:"Recorded",purchaseOrderId:order,issuedVersionId:issued,siteId:branch,isAuthority:false,actionCandidates:["Inspect"],blockers:[],
      projection:{observedAt:"2026-10-23T12:00:00Z",physicalQuantity:"2",initiallyRejectedQuantity:"0",rejectedQuantity:"0",qualifiedQuantity:null,inspectionRejectedQuantity:null,
        acceptedQuantity:"0",unacceptedPhysicalQuantity:"2",checklistReference:"CHECK"}}],purposeOnly:true,executionVersion:2,total:1,offset:0,limit:25}));vi.stubGlobal("fetch",fetch);
    const receipt=await getPrincipalReceipt(company,target,true);expect(receipt.lines[0].id).toBe(line);expect(receipt.lines[0].purchaseOrderLineId).toBe(sourceLine);
    expect(receipt.lineReadiness[0].actionCandidates).toEqual([{action:"Inspect",candidate:true,blocker:null}]);expect(receipt).not.toHaveProperty("notes");
    expect(fetch.mock.calls[0][0]).toContain("principal-inspection-task");expect(receipt.lineReadiness[0].capacity.verified).toBe(false);
  });
  it("does not invent service quantities or values omitted from the purpose-only owner task",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>json({records:[{id:target,lineId:target,purchaseOrderLineId:sourceLine,version:1,sourceVersion:0,
      taskKind:"Service",status:"Draft",purchaseOrderId:order,issuedVersionId:issued,siteId:branch,isAuthority:false,actionCandidates:["Certify"],blockers:[],
      projection:{deliverableReference:"Real milestone",periodFrom:"2026-10-22",periodTo:"2026-10-23",quantity:"0.5"}}],purposeOnly:true,executionVersion:2,total:1,offset:0,limit:25})));
    const task=await getPrincipalService(company,target,true);expect(task.purchaseOrderLineId).toBe(sourceLine);expect(task.intendedQuantity).toBe("0.5");
    expect(task.acceptedQuantity).toBeNull();expect(task.acceptedNetAmount).toBeNull();expect(task).not.toHaveProperty("notes");
  });
  it("rejects private owner fields or actions from another task purpose",async()=>{
    const body={records:[{id:target,lineId:target,purchaseOrderLineId:sourceLine,version:1,sourceVersion:0,taskKind:"Service",status:"Draft",purchaseOrderId:order,
      issuedVersionId:issued,siteId:branch,isAuthority:false,actionCandidates:["Certify"],blockers:[],projection:{quantity:"0.5",deliverableReference:"Milestone",periodFrom:"2026-10-22",periodTo:"2026-10-23",notes:"Private"}}],purposeOnly:true,executionVersion:2,total:1,offset:0,limit:25};
    vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>json(body)));await expect(getPrincipalService(company,target,true)).rejects.toThrow("incomplete");
    delete (body.records[0].projection as {notes?:string}).notes;body.records[0].actionCandidates=["Accept"];
    await expect(getPrincipalService(company,target,true)).rejects.toThrow("incomplete");
  });
});
