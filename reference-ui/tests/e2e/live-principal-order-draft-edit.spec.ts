import { expect, test, type Page } from "@playwright/test";

const id=(n:number)=>`${String(n).padStart(8,"0")}-1111-4111-8111-111111111111`;
const company=id(1),branch=id(2),buyer=id(3),supplier=id(4),request=id(5),order=id(7),line=id(8);
const root="/procurement/workspace/purchase-orders",api="/api/procurement/v1/orders";

async function fixture(page:Page,{enabled=true,lost=false}={}){
  let version=1,quantity="1.0001";
  const writes:Array<{key:string;body:string}>=[],recovery:string[]=[];
  await page.addInitScript(({entityId,branch})=>localStorage.setItem("erp.shell.state.v1",
    JSON.stringify({entityId,branch})),{entityId:company,branch});
  await page.route("**/api/**",async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    const json=(body:unknown,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
    if(path==="/api/hrm/auth/me")return json({authenticated:true,user:{id:buyer,isActive:true,displayName:"Buyer",roles:["buyer"]}});
    if(path==="/api/hrm/branding")return json({displayName:"Amizo Power"});
    if(path==="/api/core/v1/workspace-context")return json({schemaVersion:1,tenantId:"tenant",principalId:buyer,organisationWide:false,
      companies:[{id:company,code:"AMIZO",registeredName:"Amizo Power",currency:"ZMW",isDefault:true}],
      branches:[{id:branch,code:"HQ",name:"Main",legalEntityId:company}]});
    if(path==="/api/hrm/admin/legal-entities")return json({items:[{id:company,code:"AMIZO",registeredName:"Amizo Power"}]});
    if(path==="/api/hrm/admin/locations")return json({items:[{id:branch,code:"HQ",name:"Main",legalEntityId:company}]});
    if(path.startsWith("/api/hrm/shell/"))return json({assignedLocationIds:[branch],confined:true});
    if(path==="/api/procurement/v1/context")return json({principalId:buyer,tenantId:"tenant",legalEntityId:company,workerId:null,
      permissions:["procurement-access","procurement-po-read","procurement-po-edit"],
      company:{id:company,code:"AMIZO",name:"Amizo Power",currencyCode:"ZMW"},branch:{id:branch,name:"Main"}});
    if(path==="/api/procurement/v1/meta")return json({tenantId:"tenant",legalEntityId:company,schemaReady:true,
      capabilities:{principalDirectOrderDrafts:true,...(enabled?{principalOrderDraftRevision:true}:{})}});
    if(path===`${api}/${order}/principal-direct-draft`)return json({id:order,number:"PO-1",status:"Draft",version,
      supplierId:supplier,branchRef:branch,supplierDisplayName:"Approved vendor",branchDisplayName:"Main",currencyCode:"ZMW",
      originalDirectSourceSha256:"a".repeat(64),fundingRecorded:false,canEditDraft:enabled,
      editUnavailableReason:enabled?null:"Draft editing is unavailable.",createdAt:"2026-10-24T09:00:00Z",
      shipToRef:"HQ",billToRef:"",paymentTermRef:"",expectedDeliveryOn:null,release:null,releaseConfirmation:null,
      draftEditHistory:version===1?null:{originalSnapshotSha256:"b".repeat(64),originalSnapshotJson:"{}",captureMode:"VerifiedFirstEdit",
        revisions:[{id:id(9),revisionNumber:1,reason:"Reduce quantity",actorPrincipalId:buyer,
          recordedAt:"2026-10-24T10:00:00Z",previousSnapshotSha256:null,snapshotSha256:"c".repeat(64),
          snapshotJson:"{}",resultOrderVersion:2}]},
      lines:[{id:line,lineNumber:1,description:"Laptop",unitCode:"EA",quantity,unitPrice:"1.0001",taxAmount:"0.0001",
        costCenterRef:"IT",projectRef:null,expectedDeliveryOn:null,purchaseRequestId:request,allocationStatus:"Reserved"}]});
    if(path===`${api}/${order}/principal-direct-edit`){
      const key=req.headers()["idempotency-key"],body=req.postData()??"";writes.push({key,body});
      if(!enabled)return json({message:"Unavailable"},503);
      version=2;quantity="1.0000";
      if(lost)return route.abort("failed");
      return json({orderId:order,number:"PO-1",status:"Draft",version,originalDirectSourceSha256:"a".repeat(64),
        commandKey:key,recordedHistoricalResult:true});
    }
    if(path.startsWith(`${api}/principal-direct-command-receipts/Edit/`)){
      recovery.push(path);const key=writes[0].key;
      return json({operation:"Edit",commandKey:key,originalStatusCode:200,recordedHistoricalResult:true,
        responseJson:JSON.stringify({orderId:order,number:"PO-1",status:"Draft",version:2,
          originalDirectSourceSha256:"a".repeat(64),commandKey:key,recordedHistoricalResult:true})});
    }
    return json({message:"Unexpected endpoint"},404);
  });
  return {writes,recovery};
}

test("unavailable revision capability keeps the restored edit form read-only",async({page})=>{
  const state=await fixture(page,{enabled:false});await page.goto(`${root}/${order}/edit?workflow=principal`);
  await expect(page.getByRole("heading",{name:"Edit PO-1"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Save draft revision"})).toBeDisabled();
  await expect(page.getByRole("status").filter({hasText:"Draft editing is unavailable"})).toBeVisible();
  expect(state.writes).toHaveLength(0);
});

test("workerless buyer revises the same linked draft and sees retained history",async({page})=>{
  const state=await fixture(page);await page.goto(`${root}/${order}/edit?workflow=principal`);
  await expect(page.getByRole("region",{name:"Order lines"}).getByRole("table")).toBeVisible();
  await page.getByRole("textbox",{name:"Reason for revision"}).fill("Reduce quantity");
  await page.getByRole("textbox",{name:"Line 1 quantity"}).fill("1.0002");
  await expect(page.getByRole("button",{name:"Save draft revision"})).toBeDisabled();
  await page.getByRole("textbox",{name:"Line 1 quantity"}).fill("1.0000");
  await page.getByRole("button",{name:"Save draft revision"}).click();
  await expect(page.getByRole("heading",{name:"PO-1"})).toBeVisible();
  await page.getByRole("tab",{name:"History"}).click();
  await expect(page.getByText("Draft revision 1 · version 2")).toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].body).toContain('"quantity":1.0000');
  expect(JSON.parse(state.writes[0].body)).toMatchObject({expectedOrderVersion:1,
    originalDirectSourceSha256:"a".repeat(64),reason:"Reduce quantity"});
});

test("interrupted Edit response uses actor-owned GET recovery with no second POST",async({page})=>{
  const state=await fixture(page,{lost:true});await page.goto(`${root}/${order}/edit?workflow=principal`);
  await page.getByRole("textbox",{name:"Reason for revision"}).fill("Reduce quantity");
  await page.getByRole("textbox",{name:"Line 1 quantity"}).fill("1.0000");
  await page.getByRole("button",{name:"Save draft revision"}).click();
  await expect(page.getByRole("button",{name:"Check saved result"})).toBeVisible();
  expect(state.writes).toHaveLength(1);
  await page.getByRole("button",{name:"Check saved result"}).click();
  await expect(page.getByRole("heading",{name:"PO-1"})).toBeVisible();
  expect(state.writes).toHaveLength(1);expect(state.recovery).toHaveLength(1);
});
