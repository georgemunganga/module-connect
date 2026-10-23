import { afterEach, describe, expect, it, vi } from "vitest";
import { createPrincipalBody, exactJson, listPrincipalSuppliers, recoverPrincipalCommand,
  sendPrincipalCommand, type PrincipalCommand } from "../../../src/platform/procurement-principal-orders-api";
const id=(n:number)=>`${String(n).padStart(8,"0")}-1111-4111-8111-111111111111`;
afterEach(()=>vi.unstubAllGlobals());
describe("principal order exact transport",()=>{
  it("pins one source per line without converting exact money through Number",()=>{
    const raw=createPrincipalBody({supplierId:id(1),currencyCode:"ZMW",shipToRef:"",billToRef:"",paymentTermRef:"",expectedDeliveryOn:null,
      lines:[{description:"Laptop",unitCode:"EA",quantity:"1.0001",unitPrice:"1.0001",taxAmount:"0"}]},
    [{purchaseRequestId:id(2),purchaseRequestLineId:id(3),requestNumber:"PR-1",expectedRequestVersion:9,
      availableQuantity:"2",approvedUnitEstimate:"1.0001",currencyCode:"ZMW",canSelect:true}]);
    expect(raw).toContain('"quantity":1.0001');expect(raw).toContain('"unitPrice":1.0001');
    expect(JSON.parse(raw).sources).toEqual([{draftLineIndex:0,purchaseRequestId:id(2),purchaseRequestLineId:id(3),expectedRequestVersion:9}]);
    expect(exactJson({expectedOrderVersion:4},{attestedGrossAmount:"1.00020001"})).toContain('"attestedGrossAmount":1.00020001');
    expect(()=>exactJson({}, {releasedGrossAmount:"1e3"})).toThrow();
  });
  it("uses the PO-convert purpose picker with only minimal supplier labels",async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({items:[{id:id(4),number:"SUP-4",displayName:"Approved vendor"}],
      candidateTotal:1,page:1,pageSize:25,nextPage:null,previewOnly:true}),{status:200,headers:{"Content-Type":"application/json"}}));
    vi.stubGlobal("fetch",fetcher);
    const result=await listPrincipalSuppliers(id(5),1,"");expect(result.items[0].displayName).toBe("Approved vendor");
    expect(String(fetcher.mock.calls[0][0])).toContain("principal-direct-suppliers");
  });
  it("GET-only recovery checks the original actor command key and never repeats POST",async()=>{
    const command:PrincipalCommand={operation:"Create",key:id(6),orderId:null,body:'{"draft":{}}'};
    const historic={orderId:id(7),number:"PO-1",status:"Draft",version:1,originalDirectSourceSha256:"a".repeat(64),commandKey:id(6),recordedHistoricalResult:true};
    const fetcher=vi.fn(async(url:string)=>new Response(JSON.stringify(url.includes("command-receipts/")?{
      operation:"Create",commandKey:id(6),responseJson:JSON.stringify(historic),recordedHistoricalResult:true}:historic),
    {status:200,headers:{"Content-Type":"application/json"}}));vi.stubGlobal("fetch",fetcher);
    expect((await recoverPrincipalCommand(id(5),command)).orderId).toBe(id(7));
    expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toContain("/principal-direct-command-receipts/Create/");
  });
});
