import { expect, test, type Page } from "@playwright/test";
// Mocked UI contract only. The independent native and owner proofs remain separate.
const company="11111111-1111-4111-8111-111111111111", branch="22222222-2222-4222-8222-222222222222", actor="33333333-3333-4333-8333-333333333333";
const draft="44444444-4444-4444-8444-444444444444", fact="55555555-5555-4555-8555-555555555555", receipt="66666666-6666-4666-8666-666666666666", order="77777777-7777-4777-8777-777777777777", line="88888888-8888-4888-8888-888888888888";
const path="/procurement/workspace/purchase-receives/returns", api="/api/procurement/v1", root=api+"/returns/principal-drafts";
const labels={purchaseOrderNumber:"PO-RETAINED",supplierDisplayName:"Approved supplier",lineNumber:1,description:"Accepted goods",unitCode:"EA",currencyCode:"ZMW",deliveryNoteReference:"DN-1",receivedAt:"2026-10-25T10:00:00Z"};
async function fixture(page:Page,{lost=false,revoked=false,returnOnly=false,returnsAbsent=false,allBranches=false,stale=false}={}){
  const writes:{url:string;body:Record<string,unknown>;key:string}[]=[], reads:string[]=[];
  const receipts=new Map<string,unknown>();let version=1,status="Draft",quantity="0.5",reason="Wrong colour",interrupted=false,rejected=false;
  const current=()=>({id:draft,status,version,branchId:branch,receiptId:receipt,acceptanceFactId:fact,purchaseOrderId:order,purchaseOrderLineId:line,acceptedFactQuantityExact:"1.0001",quantityExact:quantity,reason,evidenceReference:null,draftOnly:true,stockChanged:false,financeChanged:false,supplierNotified:false});
  const detail=()=>({...current(),allowedActions:status==="Draft"&&!revoked?["Edit","Cancel"]:[],labels});
  const perms=["procurement-access","procurement-return-read","procurement-return-create",...(revoked?[]:["procurement-return-edit"]),...(returnOnly?[]:["procurement-receipt-view"])];
  await page.addInitScript(({company,branch,allBranches})=>localStorage.setItem("erp.shell.state.v1",JSON.stringify(allBranches?{entityId:company,branchScope:"all"}:{entityId:company,branch})),{company,branch,allBranches});
  await page.route("**/api/**",async route=>{
    const request=route.request(),url=new URL(request.url()),urlPath=url.pathname;
    const json=(value:unknown,statusCode=200)=>route.fulfill({status:statusCode,contentType:"application/json",body:JSON.stringify(value)});
    if(urlPath==="/api/hrm/auth/me")return json({authenticated:true,user:{id:actor,isActive:true,displayName:"Core buyer",roles:[]}});
    if(urlPath==="/api/hrm/branding")return json({displayName:"Amizo Power"});
    if(urlPath==="/api/core/v1/workspace-context")return json({schemaVersion:1,tenantId:"amizo",principalId:actor,organisationWide:false,companies:[{id:company,code:"AMIZO",registeredName:"Amizo Power",currency:"ZMW",isDefault:true}],branches:[{id:branch,code:"HQ",name:"Main site",legalEntityId:company}]});
    if(urlPath==="/api/hrm/admin/legal-entities")return json({items:[{id:company,code:"AMIZO",registeredName:"Amizo Power"}]});
    if(urlPath==="/api/hrm/admin/locations")return json({items:[{id:branch,code:"HQ",name:"Main site",legalEntityId:company}]});
    if(urlPath==="/api/hrm/shell/")return json({assignedLocationIds:[branch],confined:true});
    if(urlPath.startsWith(api)){expect(request.headers()["x-shell-entity"]).toBe(company);if(!allBranches)expect(request.headers()["x-shell-location"]).toBe(branch);}
    if(urlPath===api+"/context")return json({principalId:actor,tenantId:"amizo",legalEntityId:company,workerId:null,permissions:perms,branch:allBranches?null:{id:branch,code:"HQ",name:"Main site"},company:{id:company,code:"AMIZO",name:"Amizo Power",currencyCode:"ZMW"}});
    if(urlPath===api+"/meta")return json({tenantId:"amizo",legalEntityId:company,schemaReady:true,capabilities:{vendorDraft:false,itemDraft:false,requestDraft:false,approvals:false,sourcing:false,contracts:false,orders:false,receiving:false,invoiceIntake:false,invoiceValidation:false,financeHandoff:false,supplierPortal:false,planningDraft:false,configurationDraft:false,contractDraft:false,...(returnsAbsent?{}:{principalGoodsReturnDrafts:true}),principalReceiving:!returnOnly}});
    if(request.method()==="GET"){
      reads.push(urlPath);
      if(urlPath===root+"/eligible-goods")return json({items:[{acceptanceFactId:fact,receiptId:receipt,purchaseOrderId:order,purchaseOrderLineId:line,branchId:branch,acceptedFactQuantityExact:"1.0001",labels}],hasMore:false,nextOffset:null});
      if(urlPath===root)return json({items:status==="Draft"?[]:[detail()],hasMore:false,nextOffset:null});
      if(urlPath.startsWith(root+"/commands/"))return receipts.has(urlPath.split("/").at(-1)!)?json(receipts.get(urlPath.split("/").at(-1)!)):json({message:"Not found"},404);
      if(urlPath===root+"/"+draft)return json(detail());
    }
    if(urlPath.startsWith(root)){
      const key=request.headers()["idempotency-key"],body=request.postDataJSON() as Record<string,unknown>;
      writes.push({url:urlPath,body,key});expect(key).toMatch(/^[0-9a-f-]{36}$/);expect(JSON.stringify(body)).not.toMatch(/workerId|employeeId|principalId/);
      if(stale&&!rejected){rejected=true;version++;return json({message:"ReturnDraftChanged"},409);}
      reason=String(body.reason);
      if(request.method()==="POST"&&urlPath===root)quantity=String(body.quantity);
      else if(request.method()==="PUT"){expect(body.expectedRevision).toBe(version);quantity=String(body.quantity);version++;}
      else if(urlPath.endsWith("/cancel")){expect(body.expectedRevision).toBe(version);version++;status="Cancelled";}
      const ack=current();receipts.set(key,ack);
      if(lost&&!interrupted){interrupted=true;return route.abort("failed");}
      return json(ack,urlPath===root?201:200);
    }
    return json({message:`Unhandled fixture path ${urlPath}`},404);
  });return{writes,reads};
}
test("return-only capability opens a contextual draft without receiving write permission",async({page})=>{
  const state=await fixture(page,{returnOnly:true});await page.goto(path);
  await expect(page.getByRole("link",{name:"Add return draft"})).toBeVisible();await page.getByRole("link",{name:"Add return draft"}).click();
  await page.getByRole("radio",{name:/Select PO-RETAINED line 1/}).check();await page.getByLabel("Reason").fill("Wrong colour");
  await page.getByRole("button",{name:"Save return draft"}).click();await expect(page.getByText(/Draft only · Stock unchanged/)).toBeVisible();
  expect(state.writes).toHaveLength(1);expect(state.writes[0].body).toMatchObject({acceptanceFactId:fact,quantity:"1.0001",reason:"Wrong colour"});
  expect(state.reads).toContain(root+"/"+draft);
});
test("lost write is recovered by GET without a second POST",async({page})=>{
  const state=await fixture(page,{lost:true});await page.goto(path+"/new");
  await page.getByRole("radio",{name:/Select PO-RETAINED line 1/}).check();await page.getByLabel("Reason").fill("Wrong colour");
  await page.getByRole("button",{name:"Save return draft"}).click();await expect(page.getByRole("button",{name:"Check saved return"})).toBeVisible();
  await page.getByRole("button",{name:"Check saved return"}).click();await expect(page.getByText(/Draft only · Stock unchanged/)).toBeVisible();
  expect(state.writes).toHaveLength(1);expect(state.reads.some((item)=>item.includes("/commands/"))).toBe(true);
});
test("revoked creator action stays hidden despite read access",async({page})=>{
  const state=await fixture(page,{revoked:true});await page.goto(path+"/"+draft);
  await expect(page.getByText("PO-RETAINED")).toBeVisible();await expect(page.getByRole("link",{name:"Edit return draft"})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Cancel draft"})).toHaveCount(0);expect(state.writes).toHaveLength(0);
});
test("edit and cancel use fresh revision and preserve no-effects draft truth",async({page})=>{
  const state=await fixture(page);await page.goto(path+"/"+draft);
  await page.getByRole("link",{name:"Edit return draft"}).click();await page.getByLabel("Proposed quantity").fill("0.0001");
  await page.getByRole("button",{name:"Save return draft"}).click();await expect(page.getByText(/Proposed quantity: 0.0001/)).toBeVisible();
  await page.getByRole("button",{name:"Cancel draft"}).click();await page.getByLabel("Cancellation reason").fill("No longer proposed");
  await page.getByRole("button",{name:"Cancel draft"}).last().click();await expect(page.getByText("Cancelled")).toBeVisible();
  expect(state.writes.map((item)=>item.url)).toEqual([root+"/"+draft,root+"/"+draft+"/cancel"]);
  expect(state.writes[0].body).toMatchObject({expectedRevision:1,quantity:"0.0001"});expect(state.writes[1].body).toMatchObject({expectedRevision:2,reason:"No longer proposed"});
  await expect(page.getByRole("link",{name:"Edit return draft"})).toHaveCount(0);
});
test("stale edit is denied without an automatic retry",async({page})=>{
  const state=await fixture(page,{stale:true});await page.goto(path+"/"+draft+"/edit");
  await page.getByLabel("Proposed quantity").fill("0.1");await page.getByRole("button",{name:"Save return draft"}).click();
  await expect(page.getByRole("alert").filter({hasText:"changed"})).toBeVisible();expect(state.writes).toHaveLength(1);
});
test("a return-only capability does not open goods receiving actions",async({page})=>{
  const state=await fixture(page,{returnOnly:true});await page.goto("/procurement/workspace/purchase-receives/new");
  await expect(page.getByText(/workflow is being connected to your ERP/)).toBeVisible();expect(state.writes).toHaveLength(0);
});
test("a receiving-only capability does not open Returns",async({page})=>{
  const state=await fixture(page,{returnsAbsent:true});await page.goto(path);
  await expect(page.getByText(/workflow is being connected to your ERP/)).toBeVisible();expect(state.writes).toHaveLength(0);
});
test("Organisation All remains blocked until a branch is selected",async({page})=>{
  const state=await fixture(page,{allBranches:true});await page.goto(path);
  await expect(page.getByText(/Choose a permitted branch/)).toBeVisible();expect(state.writes).toHaveLength(0);
});
