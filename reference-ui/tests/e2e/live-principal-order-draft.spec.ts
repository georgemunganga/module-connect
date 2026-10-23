import { expect, test, type Page } from "@playwright/test";

const id=(n:number)=>`${String(n).padStart(8,"0")}-1111-4111-8111-111111111111`;
const company=id(1),branch=id(2),buyer=id(3),supplier=id(4),request=id(5),requestLine=id(6),order=id(7),line=id(8);
const root="/procurement/workspace/purchase-orders", api="/api/procurement/v1/orders";
const coreCaps=["vendorDraft","itemDraft","requestDraft","approvals","sourcing","contracts","orders","orderDraft",
  "receiving","invoiceIntake","invoiceDocuments","invoiceValidation","financeHandoff","supplierPortal",
  "planningDraft","configurationDraft","contractDraft","sourcingDraft"];
async function fixture(page:Page,{lost=false}={}){
  const writes:Array<{key:string;raw:string}>=[],reads:string[]=[];
  await page.addInitScript(({entityId,branch})=>localStorage.setItem("erp.shell.state.v1",JSON.stringify({entityId,branch})),{entityId:company,branch});
  await page.route("**/api/**",async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname;
    const json=(body:unknown,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
    if(path==="/api/hrm/auth/me")return json({authenticated:true,user:{isActive:true,displayName:"Buyer",roles:["buyer"]}});
    if(path==="/api/hrm/branding")return json({displayName:"Amizo Power"});
    if(path==="/api/hrm/admin/legal-entities")return json({items:[{id:company,code:"AMIZO",registeredName:"Amizo Power"}]});
    if(path==="/api/hrm/admin/locations")return json({items:[]});
    if(path.startsWith("/api/hrm/shell/"))return json({assignedLocationIds:[branch],confined:true});
    if(path==="/api/procurement/v1/context")return json({principalId:buyer,tenantId:"test-company",legalEntityId:company,workerId:null,
      permissions:["procurement-access","procurement-po-convert","procurement-po-read"],
      company:{id:company,code:"AMIZO",name:"Amizo Power",currencyCode:"ZMW"},branch:{id:branch,name:"Main"}});
    if(path==="/api/procurement/v1/meta")return json({tenantId:"test-company",legalEntityId:company,schemaReady:true,
      capabilities:{...Object.fromEntries(coreCaps.map(key=>[key,false])),principalDirectOrderDrafts:true}});
    if(path===api+"/approved-principal-direct-sources")return json({items:[{purchaseRequestId:request,purchaseRequestLineId:requestLine,
      requestNumber:"PR-APPROVED",branchRef:branch,expectedRequestVersion:9,description:"Laptop",unitCode:"EA",
      availableQuantity:"2.0000",approvedUnitEstimate:"1.0001",currencyCode:"ZMW",canSelect:true}],candidateTotal:1,page:1,pageSize:25});
    if(path===api+"/principal-direct-suppliers")return json({items:[{id:supplier,number:"VEN-1",displayName:"Approved vendor"}],
      candidateTotal:1,page:1,pageSize:25,nextPage:null,previewOnly:true});
    if(path===api+"/from-approved-principal-direct-sources"){
      writes.push({key:req.headers()["idempotency-key"],raw:req.postData()??""});
      if(lost)return route.abort("failed");
      return json({orderId:order,number:"PO-1",status:"Draft",version:1,originalDirectSourceSha256:"a".repeat(64),
        commandKey:writes[0].key,recordedHistoricalResult:true},201);
    }
    if(path.startsWith(api+"/principal-direct-command-receipts/")){
      reads.push(path);return json({operation:"Create",commandKey:writes[0].key,originalStatusCode:201,recordedHistoricalResult:true,
        responseJson:JSON.stringify({orderId:order,number:"PO-1",status:"Draft",version:1,
          originalDirectSourceSha256:"a".repeat(64),commandKey:writes[0].key,recordedHistoricalResult:true})});
    }
    if(path===`${api}/${order}/principal-direct-draft`)return json({id:order,number:"PO-1",status:"Draft",version:1,supplierId:supplier,
      branchRef:branch,currencyCode:"ZMW",originalDirectSourceSha256:"a".repeat(64),fundingRecorded:false,
      shipToRef:"",billToRef:"",paymentTermRef:"",expectedDeliveryOn:null,release:null,releaseConfirmation:null,
      lines:[{id:line,lineNumber:1,description:"Laptop",unitCode:"EA",quantity:"1.0001",unitPrice:"1.0001",
        taxAmount:"0",purchaseRequestId:request,allocationStatus:"Reserved"}]});
    return json({message:"Unexpected endpoint"},404);
  });
  return {writes,reads};
}
async function prepare(page:Page){await page.goto(root+"/new?workflow=principal");
  await page.getByRole("button",{name:"Add line"}).click();
  await page.getByRole("combobox",{name:"Vendor"}).selectOption(supplier);
  await page.getByRole("textbox",{name:"Quantity"}).fill("1.0001");}

test("workerless buyer converts approved direct demand using purpose supplier lookup and exact transport",async({page})=>{
  const result=await fixture(page);await prepare(page);
  await page.getByRole("button",{name:"Save internal draft"}).click();
  await expect(page.getByRole("heading",{name:"PO-1"})).toBeVisible();
  expect(result.writes).toHaveLength(1);expect(result.writes[0].raw).toContain('"quantity":1.0001');
  expect(JSON.parse(result.writes[0].raw).sources[0]).toMatchObject({purchaseRequestId:request,purchaseRequestLineId:requestLine,expectedRequestVersion:9});
  expect(result.reads).toHaveLength(0);
});
test("interrupted create is checked by actor-owned GET and never repeated",async({page})=>{
  const result=await fixture(page,{lost:true});await prepare(page);
  await page.getByRole("button",{name:"Save internal draft"}).click();
  await expect(page.getByRole("button",{name:"Check saved result"})).toBeVisible();
  expect(result.writes).toHaveLength(1);
  await page.getByRole("button",{name:"Check saved result"}).click();
  await expect(page.getByRole("heading",{name:"PO-1"})).toBeVisible();
  expect(result.writes).toHaveLength(1);expect(result.reads).toHaveLength(1);
});
