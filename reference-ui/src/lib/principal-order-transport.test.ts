import { afterEach, describe, expect, it, vi } from "vitest";
import { createPrincipalBody, editPrincipalBody, exactJson, listPrincipalSuppliers, recoverPrincipalCommand,
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
    const fetcher=vi.fn(async(_url:string)=>new Response(JSON.stringify({items:[{id:id(4),number:"SUP-4",displayName:"Approved vendor"}],
      candidateTotal:1,page:1,pageSize:25,nextPage:null,previewOnly:true}),{status:200,headers:{"Content-Type":"application/json"}}));
    vi.stubGlobal("fetch",fetcher);
    const result=await listPrincipalSuppliers(id(5),1,"");expect(result.items[0].displayName).toBe("Approved vendor");
    expect(String(fetcher.mock.calls[0][0])).toContain("principal-direct-suppliers");
  });
  it("GET-only recovery checks the original actor command key and never repeats POST",async()=>{
    const command:PrincipalCommand={operation:"Create",key:id(6),orderId:null,body:'{"draft":{}}'};
    const historic={orderId:id(7),number:"PO-1",status:"Draft",version:1,originalDirectSourceSha256:"a".repeat(64),commandKey:id(6),recordedHistoricalResult:true};
    const fetcher=vi.fn(async(url:string)=>new Response(JSON.stringify(url.includes("command-receipts/")?{
      operation:"Create",commandKey:id(6),originalStatusCode:201,responseJson:JSON.stringify(historic),recordedHistoricalResult:true}:historic),
    {status:200,headers:{"Content-Type":"application/json"}}));vi.stubGlobal("fetch",fetcher);
    expect((await recoverPrincipalCommand(id(5),command)).orderId).toBe(id(7));
    expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toContain("/principal-direct-command-receipts/Create/");
  });
  it("encodes an Edit against the saved version and immutable source without losing exact decimals",()=>{
    const saved={id:id(7),number:"PO-1",status:"Draft",version:2,supplierId:id(4),branchRef:id(2),
      currencyCode:"ZMW",originalDirectSourceSha256:"a".repeat(64),fundingRecorded:false,
      shipToRef:"",billToRef:"",paymentTermRef:"",expectedDeliveryOn:null,release:null,releaseConfirmation:null,
      lines:[{id:id(8),lineNumber:1,description:"Laptop",unitCode:"EA",quantity:"1.0001",unitPrice:"1.0001",
        taxAmount:"0.0001",purchaseRequestId:id(5),allocationStatus:"Reserved"}]};
    const draft={supplierId:id(4),currencyCode:"ZMW",shipToRef:"HQ",billToRef:"",paymentTermRef:"",
      expectedDeliveryOn:null,lines:[{id:id(8),description:"Laptop",unitCode:"EA",quantity:"1.0000",
        unitPrice:"1.0001",taxAmount:"0.0001"}]};
    const raw=editPrincipalBody(saved,draft,"  reduce quantity  ");
    expect(raw).toContain('"expectedOrderVersion":2');
    expect(raw).toContain('"quantity":1.0000');
    expect(raw).toContain('"reason":"reduce quantity"');
    expect(()=>editPrincipalBody(saved,{...draft,supplierId:id(9)},"reason")).toThrow();
    expect(()=>editPrincipalBody(saved,{...draft,lines:[{...draft.lines[0],id:id(10)}]},"reason")).toThrow();
  });
  it("Edit recovery is GET only and accepts the original 200 result",async()=>{
    const command:PrincipalCommand={operation:"Edit",key:id(6),orderId:id(7),body:""};
    const historic={orderId:id(7),number:"PO-1",status:"Draft",version:3,
      originalDirectSourceSha256:"a".repeat(64),commandKey:id(6),recordedHistoricalResult:true};
    const fetcher=vi.fn(async(_url:string)=>new Response(JSON.stringify({operation:"Edit",commandKey:id(6),
      originalStatusCode:200,responseJson:JSON.stringify(historic),recordedHistoricalResult:true}),
    {status:200,headers:{"Content-Type":"application/json"}}));vi.stubGlobal("fetch",fetcher);
    expect((await recoverPrincipalCommand(id(5),command)).version).toBe(3);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain("/principal-direct-command-receipts/Edit/");
  });
});
