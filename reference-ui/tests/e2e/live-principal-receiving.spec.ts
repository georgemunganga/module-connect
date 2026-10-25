import { expect, test, type Page } from "@playwright/test";
// Mocked transport/interaction contracts only. No live Core, PostgreSQL or posting proof.
test.setTimeout(90_000);
const company="11111111-1111-4111-8111-111111111111", branch="22222222-2222-4222-8222-222222222222", actor="33333333-3333-4333-8333-333333333333";
const order="44444444-4444-4444-8444-444444444444", issued="55555555-5555-4555-8555-555555555555", id="66666666-6666-4666-8666-666666666666";
const line="77777777-7777-4777-8777-777777777777", sourceLine="88888888-8888-4888-8888-888888888888", denied="99999999-9999-4999-8999-999999999999";
const root="/procurement/workspace/purchase-receives", api="/api/procurement/v1";
type Options={role?:"receiver"|"inspector"|"acceptor"|"owner";absent?:boolean;lostCreate?:boolean;stale?:boolean;draft?:boolean};
async function mock(page:Page,options:Options={}){
  const role=options.role??"receiver", service=role==="owner", writes:{path:string;body:Record<string,unknown>;key:string}[]=[],reads:string[]=[];
  let receivedQuantity="0.0001";
  let version=options.draft?1:2,status=options.draft?"Draft":"Recorded",sourceVersion=service?1:1,lost=false,rejected=false;
  const receipts=new Map<string,unknown>();
  const permissions=["procurement-access",...(role==="inspector"?["procurement-receipt-inspect"]:role==="acceptor"?["procurement-receipt-accept"]:
    role==="owner"?["procurement-service-certify"]:["procurement-receipt-view","procurement-receipt-create","procurement-receipt-edit","procurement-receipt-record"])];
  const candidate=(action:string,enabled=true)=>({action,candidate:enabled,blocker:enabled?null:"ReceivingCurrentPermissionOrStateRequired"});
  function full(){
    const receipt={id,number:id,version,status,executionVersion:2,purchaseOrderId:order,issuedVersionId:issued,siteRef:branch,
      receivedAt:"2026-10-23T12:00:00.123456Z",recordedAt:status==="Draft"?null:"2026-10-23T12:10:00Z",notes:"Retained notes",deliveryNoteRef:"DN-ORIGINAL",
      physicalEvidenceRecorded:status!=="Draft",matchingAuthorityAvailable:false,readPurpose:"Receipt",draftActionCandidates:[candidate("EditDraft",status==="Draft"),candidate("CancelDraft",status==="Draft")],
      lines:[{id:line,version,purchaseOrderLineId:sourceLine,sourceVersion,receivedQuantity,initiallyRejectedQuantity:"0",rejectedQuantity:"0",acceptedQuantity:"0",unacceptedHeldQuantity:status==="Draft"?null:"0.0001",status,inspection:null}],
      lineReadiness:[{lineId:line,sourceVersion,labels:{orderNumber:"PO-RETAINED",supplierDisplayName:"",description:"Actual retained source",unitCode:"EA",currencyCode:"ZMW",branchRef:branch,issuedVersionId:issued},
        capacity:{verified:true,orderRemainingQuantity:"1",physicalRemainingQuantity:null,acceptableQuantity:null,blocker:null},effects:[],actionCandidates:[candidate("Record",status==="Draft")]}]};
    return{id,version,status,executionVersion:2,kind:service?"Service":"Goods",purchaseOrderId:order,issuedVersionId:issued,siteId:branch,receipt,service:null};
  }
  function task(){const kind=role==="owner"?"Service":role==="acceptor"?"Acceptance":"Inspection";
    return{records:[{id,lineId:service?id:line,purchaseOrderLineId:sourceLine,version,sourceVersion,taskKind:kind,status:service?"Draft":status,
      purchaseOrderId:order,issuedVersionId:issued,siteId:branch,isAuthority:false,blockers:[],actionCandidates:[service?"Certify":role==="acceptor"?"Accept":"Inspect"],
      projection:service?{deliverableReference:"Half completed milestone",periodFrom:"2026-10-22",periodTo:"2026-10-23",quantity:"0.5"}:
        {observedAt:"2026-10-23T12:00:00Z",physicalQuantity:"2",initiallyRejectedQuantity:"0",rejectedQuantity:"0",qualifiedQuantity:null,inspectionRejectedQuantity:null,
          acceptedQuantity:"0",unacceptedPhysicalQuantity:"2",checklistReference:"CHECK-EXPLICIT"}}],total:1,offset:0,limit:25,purposeOnly:true,executionVersion:2};}
  await page.addInitScript(({company,branch})=>localStorage.setItem("erp.shell.state.v1",JSON.stringify({entityId:company,branch})),{company,branch});
  await page.route("**/api/**",async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname;
    const json=(value:unknown,code=200)=>route.fulfill({status:code,contentType:"application/json",body:JSON.stringify(value)});
    if(path==="/api/hrm/auth/me")return json({authenticated:true,user:{id:actor,isActive:true,displayName:"Core receiver",roles:["procurement_receiver"]}});
    if(path==="/api/hrm/branding")return json({displayName:"Amizo Power"});
    if(path==="/api/core/v1/workspace-context")return json({schemaVersion:1,tenantId:"amizo",principalId:actor,organisationWide:false,
      companies:[{id:company,code:"AMIZO",registeredName:"Amizo Power",currency:"ZMW",isDefault:true}],branches:[{id:branch,code:"HQ",name:"Main site",legalEntityId:company}]});
    if(path==="/api/hrm/admin/legal-entities")return json({items:[{id:company,code:"AMIZO",registeredName:"Amizo Power"}]});
    if(path==="/api/hrm/admin/locations")return json({items:[{id:branch,code:"HQ",name:"Main site",legalEntityId:company}]});
    if(path==="/api/hrm/shell/")return json({assignedLocationIds:[branch],confined:true});
    if(path.startsWith(api)){expect(request.headers()["x-shell-entity"]).toBe(company);expect(request.headers()["x-shell-location"]).toBe(branch);}
    if(path===api+"/context")return json({principalId:actor,tenantId:"amizo",legalEntityId:company,workerId:null,permissions,branch:{id:branch,code:"HQ",name:"Main site"},company:{id:company,code:"AMIZO",name:"Amizo Power",currencyCode:"ZMW"}});
    if(path===api+"/meta")return json({tenantId:"amizo",legalEntityId:company,schemaReady:true,capabilities:{vendorDraft:false,itemDraft:false,requestDraft:false,approvals:false,sourcing:false,contracts:false,orders:false,receiving:false,invoiceIntake:false,invoiceValidation:false,
      financeHandoff:false,supplierPortal:false,planningDraft:false,configurationDraft:false,contractDraft:false,sourcingDraft:false,...(options.absent?{}:{principalReceiving:true})}});
    if(request.method()==="GET"){
      reads.push(path+url.search);
      if(path===api+"/receiving/principal-sources")return json({records:[{purchaseOrderId:order,purchaseOrderNumber:"PO-RETAINED",issuedVersionId:issued,purchaseOrderLineId:sourceLine,
        description:"Actual retained source",kind:"Goods",siteId:branch,unitCode:"EA",currencyCode:"ZMW",authorizedQuantity:"1",netUnitPrice:"0.0001",historyState:"NoSuccessorHistory",sourceVersion:null,
        supplierAcknowledgmentIsDelivery:false,actionCandidatesAreAuthority:false}],total:1,offset:0,limit:25,executionVersion:2});
      if(path.includes("principal-command-receipts"))return receipts.has(path.split("/").at(-1)!)?json(receipts.get(path.split("/").at(-1)!)):json({message:"No result"},404);
      if(path===`${api}/receipts/${denied}/principal-draft`)return json({message:"Not in this scope"},404);
      if(path===`${api}/receipts/${id}/principal-draft`)return json(full());
      if(path.endsWith("principal-inspection-task")||path.endsWith("principal-acceptance-task")||path.endsWith("principal-certification-task"))return json(task());
      if(path.includes("principal-")&&path.endsWith("-tasks"))return json(task());
      if(path===api+"/receiving/principal-worklist")return json({records:[{id,version,status,kind:"Goods",purchaseOrderId:order,purchaseOrderNumber:"PO-RETAINED",createdAt:"2026-10-23T12:00:00Z"},
        {id:denied,version:1,status:"Draft",kind:"Goods",purchaseOrderId:order,purchaseOrderNumber:"PO-DENIED",createdAt:"2026-10-23T12:00:00Z"}],total:2,offset:0,limit:10,executionVersion:2});
    }else if(path.startsWith(api)){
      const body=request.postDataJSON() as Record<string,unknown>;const key=request.headers()["idempotency-key"];
      writes.push({path,body,key});expect(key).toMatch(/^[0-9a-f-]{36}$/);expect(JSON.stringify(body)).not.toMatch(/workerId|employeeId|principalId/);
      if(options.stale&&!rejected){rejected=true;version++;sourceVersion++;return json({message:"Changed"},409);}
      const captured=body.draft && typeof body.draft === "object" ? body.draft as Record<string,unknown> : body;
      if(Array.isArray(captured.lines) && captured.lines[0] && typeof captured.lines[0].receivedQuantity === "string")receivedQuantity=captured.lines[0].receivedQuantity;
      if(path.endsWith("principal-drafts")){version=1;sourceVersion=0;}else{version++;if(path.endsWith("principal-record")||path.endsWith("principal-inspect")||path.endsWith("principal-accept")||path.endsWith("principal-certify"))sourceVersion++;}
      status=path.endsWith("principal-cancel")?"Cancelled":path.endsWith("principal-drafts")||path.endsWith("principal-draft")?"Draft":service?"Certified":"Recorded";
      const response=full();receipts.set(key,response);
      if(options.lostCreate&&!lost){lost=true;return route.abort("failed");}
      return json(response,path.endsWith("principal-drafts")?201:200);
    }
    return json({message:`Unhandled fixture path ${path}`},404);
  });return{writes,reads};
}
async function confirm(page:Page){await page.getByLabel("Evidence reference",{exact:true}).fill("REF:actual-evidence");await page.getByRole("switch",{name:"I checked the delivery evidence"}).click();await page.getByRole("button",{name:"Confirm delivery action"}).click();}

test("principal delivery directory uses retained PO labels and server-wide stable sort",async({page})=>{
  const state=await mock(page);await page.goto(root);
  await expect(page.getByRole("cell",{name:"Goods delivery",exact:true})).toHaveCount(2);
  await expect(page.getByRole("cell",{name:"PO-RETAINED",exact:true})).toHaveCount(1);
  await page.getByRole("button",{name:"More Actions"}).click();
  await page.getByRole("menuitem",{name:"Sort by"}).click();
  await page.getByRole("menuitem",{name:"Oldest first"}).click();
  await expect(page.getByText("Showing oldest deliveries first.")).toBeVisible();
  await expect.poll(()=>state.reads.filter(path=>path.includes("principal-worklist")&&path.includes("sort=oldest")).length).toBeGreaterThan(0);
  expect(state.writes).toHaveLength(0);
});
test("absent principal capability never loads or mutates receiving despite Core permissions",async({page})=>{
  const state=await mock(page,{absent:true});await page.goto(root+"/new");await expect(page.getByText(/This workflow is being connected to your ERP/)).toBeVisible();await expect(page.getByRole("button",{name:"Save delivery draft"})).toHaveCount(0);
  expect(state.writes).toHaveLength(0);expect(state.reads.filter(path=>path.includes("principal-"))).toHaveLength(0);
});
test("Core-only user preserves the editor frame, exact entered quantity and GET-only lost-create recovery",async({page})=>{
  const state=await mock(page,{lostCreate:true});await page.goto(root+"/new");await page.getByRole("switch",{name:/Select PO-RETAINED/}).click();
  await page.getByLabel("Received quantity 1").fill("0.0001");await page.getByLabel("Delivery note reference").fill("DN-ORIGINAL");await page.getByLabel("Receiving Notes").fill("Retained notes");
  await expect(page.getByRole("button",{name:"Close editor"})).toBeVisible();await page.getByRole("button",{name:"Save delivery draft"}).click();
  await expect(page.getByText("Check the saved draft",{exact:true})).toBeVisible();expect(state.writes).toHaveLength(1);
  expect((state.writes[0].body.lines as {receivedQuantity:string}[])[0].receivedQuantity).toBe("0.0001");
  await page.getByRole("button",{name:"Check saved draft"}).click();await expect(page).toHaveURL(new RegExp(id));expect(state.writes).toHaveLength(1);
  expect(state.reads.some(path=>path.includes("principal-command-receipts/Create/"))).toBe(true);
});
test("draft edits preserve the actual source line, original notes and CAS",async({page})=>{
  const state=await mock(page,{draft:true});await page.goto(`${root}/${id}/edit?kind=goods`);await expect(page.getByLabel("Receiving Notes")).toHaveValue("Retained notes");
  await page.getByLabel("Received quantity 1").fill("0.5");await page.getByRole("button",{name:"Save delivery draft"}).click();
  await expect.poll(()=>state.writes.length).toBe(1);expect(state.writes[0].path).toMatch(/principal-draft$/);expect(state.writes[0].body.version).toBe(1);
  const draft=state.writes[0].body.draft as {receivedAt:string;lines:{id:string;purchaseOrderLineId:string}[]};expect(draft.receivedAt).toBe("2026-10-23T12:00:00.123456Z");expect(draft.lines[0]).toMatchObject({id:line,purchaseOrderLineId:sourceLine});
});
test("purpose-only inspector needs no broad receipt read and submits the actual source cursor",async({page})=>{
  const state=await mock(page,{role:"inspector"});await page.goto(`${root}/${id}?kind=goods&purpose=inspection`);
  await page.getByRole("button",{name:"Inspect delivery"}).click();await page.getByLabel("Qualified quantity").fill("1");await confirm(page);
  await expect.poll(()=>state.writes.length).toBe(1);expect(state.writes[0].body).toMatchObject({version:2,sourceVersion:1,quantity:"1"});
  expect(state.reads.every(path=>!path.endsWith("/principal-draft"))).toBe(true);await expect(page.getByText("Retained notes",{exact:true})).toHaveCount(0);
});
test("assigned acceptor refreshes a known stale response without replaying POST",async({page})=>{
  const state=await mock(page,{role:"acceptor",stale:true});await page.goto(`${root}/${id}?kind=goods&purpose=acceptance`);
  await page.getByRole("button",{name:"Accept goods"}).click();await page.getByLabel("Quantity to accept").fill("1");await confirm(page);
  await expect(page.getByRole("alert").filter({hasText:"changed"})).toBeVisible();expect(state.writes).toHaveLength(1);
  await expect.poll(()=>state.reads.filter(path=>path.includes("principal-acceptance-task")).length).toBeGreaterThan(1);expect(state.writes).toHaveLength(1);
});
test("service-owner task preserves half quantity and displays unavailable financial data truthfully",async({page})=>{
  const state=await mock(page,{role:"owner"});await page.goto(`${root}/${id}?kind=service&purpose=certification`);
  await expect(page.getByText(/Accepted quantity: Not provided in this task/)).toBeVisible();await page.getByRole("button",{name:"Confirm service"}).click();
  await expect(page.getByLabel("Quantity to accept")).toHaveValue("0.5");await confirm(page);await expect.poll(()=>state.writes.length).toBe(1);
  expect(state.writes[0].body).toMatchObject({sourceVersion:1,quantity:"0.5"});
});

test("navigation to a denied receipt removes prior action and line data",async({page})=>{
  const state=await mock(page,{draft:true});await page.goto(`${root}/${id}?kind=goods`);
  await expect(page.getByRole("button",{name:"Record arrival"})).toBeVisible();await page.getByRole("link",{name:"Back to deliveries"}).click();
  await page.getByRole("row").filter({hasText:"PO-DENIED"}).getByRole("link",{name:"Review delivery"}).click();
  await expect(page.getByRole("alert").filter({hasText:"unavailable in your current scope"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Record arrival"})).toHaveCount(0);await expect(page.getByRole("link",{name:"Edit delivery draft"})).toHaveCount(0);
  await expect(page.getByText("Actual retained source",{exact:true})).toHaveCount(0);expect(state.writes).toHaveLength(0);
});

test("owned draft cancellation retains the original data and sends an explicit reason with CAS",async({page})=>{
  const state=await mock(page,{draft:true});await page.goto(`${root}/${id}?kind=goods`);await page.getByRole("button",{name:"Cancel draft",exact:true}).click();
  await page.getByLabel("Reason for cancelling").fill("Duplicate physical draft");await page.getByRole("switch",{name:"I checked the delivery evidence"}).click();
  await page.getByRole("button",{name:"Confirm delivery action"}).click();await expect.poll(()=>state.writes.length).toBe(1);
  expect(state.writes[0].path).toMatch(/principal-cancel$/);expect(state.writes[0].body).toEqual({version:1,reason:"Duplicate physical draft"});
  await expect(page.getByText(/Saved: Cancelled/)).toBeVisible();await expect(page.getByRole("link",{name:"Edit delivery draft"})).toHaveCount(0);
});
