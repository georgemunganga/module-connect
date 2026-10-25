import { expect, test, type Page } from "@playwright/test";

// Mocked UI contract only. No P36 physical, finite role or real HTTP claim.
const id = (n: number) => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const company=id(1), branch=id(2), actor=id(3), round=id(4), offer=id(5), line=id(6), draft=id(7), revisionId=id(8);
const path="/procurement/workspace/rfqs/recommendations", api="/api/procurement/v1/sourcing";
const sha="a".repeat(64), source={roundId:round,unsealingId:id(9),rfqTitle:"Verified goods RFQ",
  sourceLines:[{sourceLineId:line,lineLabel:"Line 1"}],offers:[{offerId:offer,offerSha256:sha,offerLabel:"Offer 1",supplierLabel:null,
    lines:[{sourceLineId:line,lineLabel:"Line 1",offeredQuantityExact:"1.0000",currencyCode:"ZMW"}]}],
  canSubmit:false,awardAvailable:false,purchaseOrderAvailable:false};
const required=Object.fromEntries(["vendorDraft","itemDraft","requestDraft","approvals","sourcing","contracts","orders","receiving",
  "invoiceValidation","financeHandoff","supplierPortal","planningDraft","configurationDraft","contractDraft","sourcingDraft"].map(key=>[key,false]));
async function chooseOpenedLine(page: Page) {
  await page.getByLabel("Opened offer and line").click();
  await page.getByRole("option", { name: "Offer 1 · Line 1" }).click();
}
async function fixture(page:Page,{unavailable=false,lost=false,revoked=false,all=false,unverified=false,stale=false,revokedAtSave=false,wrongBranch=false,
  multiple=false,unprocessableOnce=false,afterAckDetailFails=false,wrongAck=false,wrongDetail=false}={}){
  const writes:{key:string;body:Record<string,unknown>}[]=[], reads:string[]=[];
  const receipts=new Map<string,unknown>();let saved=multiple,version=multiple?1:0,hash=sha,interrupted=false,rejected=false,detailFailed=false;
  await page.addInitScript(({company,branch,all})=>localStorage.setItem("erp.shell.state.v1",JSON.stringify(all?{entityId:company,branchScope:"all"}:{entityId:company,branch})),{company,branch,all});
  await page.route("**/api/**",async route=>{
    const request=route.request(),url=new URL(request.url()),routePath=url.pathname,method=request.method();
    const json=(body:unknown,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
    if(routePath==="/api/hrm/auth/me")return json({authenticated:true,user:{id:actor,isActive:true,displayName:"Core reviewer",roles:[]}});
    if(routePath==="/api/hrm/branding")return json({displayName:"Amizo Power"});
    if(routePath==="/api/core/v1/workspace-context")return json({schemaVersion:1,tenantId:"amizo",principalId:actor,organisationWide:false,
      companies:[{id:company,code:"AMIZO",registeredName:"Amizo Power",currency:"ZMW",isDefault:true}],
      branches:[{id:branch,code:"HQ",name:"Main site",legalEntityId:company}]});
    if(routePath==="/api/hrm/admin/legal-entities")return json({items:[{id:company,code:"AMIZO",registeredName:"Amizo Power"}]});
    if(routePath==="/api/hrm/admin/locations")return json({items:[{id:branch,code:"HQ",name:"Main site",legalEntityId:company}]});
    if(routePath==="/api/hrm/shell/")return json({assignedLocationIds:[branch],confined:true});
    if(routePath.startsWith("/api/procurement/v1"))expect(request.headers()["x-shell-entity"]).toBe(company);
    const actions=["procurement-access","procurement-sourcing-recommend-draft","procurement-sourcing-opened-offer-read"];
    if(routePath==="/api/procurement/v1/context")return json({principalId:actor,tenantId:"amizo",legalEntityId:company,workerId:null,
      permissions:revoked?actions.slice(0,2):actions,branch:all?null:{id:branch,code:"HQ",name:"Main site"},
      company:{id:company,code:"AMIZO",name:"Amizo Power",currencyCode:"ZMW"}});
    if(routePath==="/api/procurement/v1/meta")return json({tenantId:"amizo",legalEntityId:company,schemaReady:true,
      capabilities:{...required,...(unavailable?{}:{principalRfqRecommendationDrafts:true})}});
    if(routePath.startsWith(api)){
      reads.push(`${method} ${routePath}`);
      expect(request.headers()["x-shell-location"]).toBe(branch);
      if(routePath===api+"/commercial-opened-rounds")return json({items:[{roundId:round,sourcingEventId:id(10),branchId:branch,
        openedAt:"2026-10-25T10:00:00Z",unsealingId:id(9)}],total:1,offset:0,limit:3,
        priceReadRequiresRetainedProof:true,evaluationAvailable:false,awardAvailable:false,purchaseOrderAvailable:false});
      if(routePath===api+`/commercial-rounds/${round}/recommendation-source`)return unverified||wrongBranch?json({message:"Not available"},wrongBranch?404:409):json(source);
      if(routePath===api+`/commercial-rounds/${round}/recommendation-drafts/own`)return json({items:[...(saved?[{draftId:draft,roundId:round,revision:version,
        revisionId,snapshotSha256:hash,state:"Draft",canSubmit:false,awardCreatedByThisCommand:false,purchaseOrderCreatedByThisCommand:false}]:[]),
        ...(multiple?[{draftId:id(12),roundId:round,revision:1,revisionId:id(13),snapshotSha256:sha,state:"Draft",canSubmit:false,awardCreatedByThisCommand:false,purchaseOrderCreatedByThisCommand:false}]:[])],
        total:multiple?2:saved?1:0,offset:0,limit:25});
      if(routePath===api+`/commercial-rounds/${round}/recommendation-drafts/${draft}` || routePath===api+`/commercial-rounds/${round}/recommendation-drafts/${id(12)}`){
        if(afterAckDetailFails&&saved&&!detailFailed){detailFailed=true;return json({message:"Read failed"},503);}
        const selectedDraft=routePath.endsWith(id(12))?id(12):draft;
        return json({draftId:selectedDraft,roundId:round,state:"Draft",
        currentRevision:selectedDraft===draft?version:1,currentRevisionId:selectedDraft===draft?revisionId:id(13),currentSnapshotSha256:selectedDraft===draft?hash:sha,
        lines:[{offerId:offer,supplierId:id(11),sourcingLineId:line,quantityExact:"0.0001",proposedValueExact:wrongDetail?"0.00000002":"0.00000001",currencyCode:"ZMW",rationale:"Human comparison"}],
        revisions:Array.from({length:selectedDraft===draft?version:1},(_,index)=>({id:selectedDraft===draft?revisionId:id(13),revision:index+1,recordedAt:"2026-10-25T10:00:00Z",snapshotSha256:selectedDraft===draft?hash:sha})),
        assessmentCoverageComplete:null,canSubmit:false,awardCreatedByThisCommand:false,purchaseOrderCreatedByThisCommand:false});}
      if(routePath.startsWith(api+`/commercial-rounds/${round}/recommendation-commands/`)){
        const key=routePath.split("/").at(-1)!;return receipts.has(key)?json(receipts.get(key),201):json({message:"Unknown"},404);
      }
      if(method==="POST"&&routePath===api+`/commercial-rounds/${round}/recommendation-drafts`){
        const key=request.headers()["idempotency-key"],body=request.postDataJSON() as Record<string,unknown>;
        writes.push({key,body});expect(key).toMatch(/^[0-9a-f-]{36}$/);
        if(revokedAtSave)return json({message:"Action revoked"},403);
        if(stale)return json({message:"Draft changed"},409);
        if(unprocessableOnce&&!rejected){rejected=true;return json({message:"Check lines"},422);}
        expect(body.expectedRevision).toBe(version);version++;saved=true;hash="b".repeat(64);
        const ack={draftId:draft,roundId:round,revisionId,revision:version,state:"Draft",snapshotSha256:hash,
          awardCreatedByThisCommand:false,purchaseOrderCreatedByThisCommand:false};receipts.set(key,ack);
        if(lost&&!interrupted){interrupted=true;return route.abort("failed");}
        return json(wrongAck?{...ack,revisionId:id(14)}:ack,201);
      }
      throw new Error(`Unmocked recommendation API: ${method} ${routePath}`);
    }
    return json({message:"Unmocked API"},404);
  });
  return {writes,reads};
}

test("recommendation-only named reader finds verified titles without ordinary RFQ read or raw IDs",async({page})=>{
  const state=await fixture(page);await page.goto(path);
  await expect(page.getByText("Verified goods RFQ")).toBeVisible();
  await expect(page.getByText(round)).toHaveCount(0);
  expect(state.reads.some(value=>value.includes("/recommendation-source"))).toBe(true);
  expect(state.reads.some(value=>value.includes("/principal-publication")||value.includes("/source-draft"))).toBe(false);
});
test("an unverified opened round displays no invented RFQ label or raw identifier",async({page})=>{
  await fixture(page,{unverified:true});await page.goto(path);
  await expect(page.getByText("Opened round unavailable")).toBeVisible();
  await expect(page.getByText(round)).toHaveCount(0);
  await expect(page.getByRole("link",{name:"Open recommendation draft"})).toHaveCount(0);
});
test("a round denied in the selected branch has no selectable link",async({page})=>{
  const state=await fixture(page,{wrongBranch:true});await page.goto(path);
  await expect(page.getByText("Opened round unavailable")).toBeVisible();
  await expect(page.getByRole("link",{name:"Open recommendation draft"})).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});
test("all owned drafts remain selectable with human ordinal and revision labels",async({page})=>{
  const state=await fixture(page,{multiple:true});await page.goto(path+"/"+round);
  await expect(page.getByRole("link",{name:"Draft 1 · Revision 1"})).toBeVisible();
  await expect(page.getByRole("link",{name:"Draft 2 · Revision 1"})).toBeVisible();
  await expect(page.getByRole("link",{name:"Start a new recommendation draft"})).toBeVisible();
  await page.getByRole("link",{name:"Draft 2 · Revision 1"}).click();
  await expect(page.getByRole("link",{name:"Draft 1 · Revision 1"})).toBeVisible();
  await page.getByRole("link",{name:"Start a new recommendation draft"}).click();
  await expect(page.getByRole("button",{name:"Save recommendation draft"})).toBeEnabled();
  await expect(page.getByText(id(12))).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});
test("save and revise use typed exact strings, original CAS and no award effect",async({page})=>{
  const state=await fixture(page);await page.goto(path+"/"+round);
  await expect(page.getByText("Verified goods RFQ")).toBeVisible();
  await page.getByRole("link",{name:"Start a new recommendation draft"}).click();
  await page.getByRole("button",{name:"Add offer line"}).click();
  await chooseOpenedLine(page);
  await page.getByLabel("Quantity").fill("0.0001");await page.getByLabel("Proposed value").fill("0.00000001");
  await page.getByLabel("Reason").fill("Human comparison");
  await page.getByRole("button",{name:"Save recommendation draft"}).click();
  await expect(page.getByText("Current draft revision: 1")).toBeVisible();
  expect(state.writes[0].body).toEqual({draftId:null,expectedRevision:0,expectedSnapshotSha256:null,
    lines:[{offerId:offer,sourcingLineId:line,quantityExact:"0.0001",proposedValueExact:"0.00000001",rationale:"Human comparison"}]});
  await page.getByRole("link",{name:"Draft 1 · Revision 1"}).click();
  await expect(page.getByText("Current draft revision: 1")).toBeVisible();
  await page.getByRole("button",{name:"Save revised draft"}).click();
  expect(state.writes[1].body).toMatchObject({draftId:draft,expectedRevision:1,expectedSnapshotSha256:"b".repeat(64)});
});
test("lost save survives a hard reload and checks original key without a second POST",async({page})=>{
  const state=await fixture(page,{lost:true});await page.goto(path+"/"+round+"?new=1");
  await page.getByRole("button",{name:"Add offer line"}).click();await chooseOpenedLine(page);
  await page.getByLabel("Quantity").fill("0.0001");await page.getByLabel("Proposed value").fill("0.00000001");
  await page.getByLabel("Reason").fill("Human comparison");await page.getByRole("button",{name:"Save recommendation draft"}).click();
  await expect(page.getByRole("button",{name:"Check saved draft"})).toBeVisible();
  await page.reload();await expect(page.getByRole("button",{name:"Save recommendation draft"})).toHaveCount(0);
  await page.getByRole("button",{name:"Check saved draft"}).click();
  await expect(page.getByRole("link",{name:"Draft 1 · Revision 1"})).toBeVisible();
  expect(state.writes).toHaveLength(1);expect(state.reads.some(value=>value.includes("/recommendation-commands/"))).toBe(true);
});
test("definitive 422 clears only the rejected key and lets the author correct entered lines",async({page})=>{
  const state=await fixture(page,{unprocessableOnce:true});await page.goto(path+"/"+round+"?new=1");
  await page.getByRole("button",{name:"Add offer line"}).click();await chooseOpenedLine(page);
  await page.getByLabel("Quantity").fill("0.0001");await page.getByLabel("Proposed value").fill("0.00000001");
  await page.getByLabel("Reason").fill("Human comparison");await page.getByRole("button",{name:"Save recommendation draft"}).click();
  await expect(page.getByRole("alert").filter({hasText:"Check the recommendation lines"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Check saved draft"})).toHaveCount(0);
  await expect(page.getByLabel("Reason")).toHaveValue("Human comparison");
  await page.getByLabel("Reason").fill("Corrected human comparison");await page.getByRole("button",{name:"Save recommendation draft"}).click();
  await expect(page.getByRole("link",{name:"Draft 1 · Revision 1"})).toBeVisible();
  expect(state.writes).toHaveLength(2);expect(state.writes[0].key).not.toBe(state.writes[1].key);
});
test("GET after a valid acknowledgement can fail; hard reload still recovers without a second POST",async({page})=>{
  const state=await fixture(page,{afterAckDetailFails:true});await page.goto(path+"/"+round+"?new=1");
  await page.getByRole("button",{name:"Add offer line"}).click();await chooseOpenedLine(page);
  await page.getByLabel("Quantity").fill("0.0001");await page.getByLabel("Proposed value").fill("0.00000001");
  await page.getByLabel("Reason").fill("Human comparison");await page.getByRole("button",{name:"Save recommendation draft"}).click();
  await expect(page.getByRole("button",{name:"Check saved draft"})).toBeVisible();
  await page.reload();await expect(page.getByLabel("Reason")).toHaveValue("Human comparison");
  await page.getByRole("button",{name:"Check saved draft"}).click();
  expect(state.writes).toHaveLength(1);expect(state.reads.some(value=>value.includes("/recommendation-commands/"))).toBe(true);
});
test("a substituted POST acknowledgement never clears the original command journal",async({page})=>{
  const state=await fixture(page,{wrongAck:true});await page.goto(path+"/"+round+"?new=1");
  await page.getByRole("button",{name:"Add offer line"}).click();await chooseOpenedLine(page);
  await page.getByLabel("Quantity").fill("0.0001");await page.getByLabel("Proposed value").fill("0.00000001");
  await page.getByLabel("Reason").fill("Human comparison");await page.getByRole("button",{name:"Save recommendation draft"}).click();
  await expect(page.getByRole("button",{name:"Check saved draft"})).toBeVisible();
  await page.reload();await page.getByRole("button",{name:"Check saved draft"}).click();
  expect(state.writes).toHaveLength(1);
});
test("a substituted retained line denies recovery despite a valid receipt",async({page})=>{
  const state=await fixture(page,{wrongDetail:true});await page.goto(path+"/"+round+"?new=1");
  await page.getByRole("button",{name:"Add offer line"}).click();await chooseOpenedLine(page);
  await page.getByLabel("Quantity").fill("0.0001");await page.getByLabel("Proposed value").fill("0.00000001");
  await page.getByLabel("Reason").fill("Human comparison");await page.getByRole("button",{name:"Save recommendation draft"}).click();
  await expect(page.getByRole("button",{name:"Check saved draft"})).toBeVisible();
  await page.getByRole("button",{name:"Check saved draft"}).click();
  await expect(page.getByRole("button",{name:"Check saved draft"})).toBeVisible();expect(state.writes).toHaveLength(1);
});
test("absent capability, revoked action and Organisation All do not call recommendation APIs",async({page})=>{
  for(const options of [{unavailable:true},{revoked:true},{all:true}]){
    const state=await fixture(page,options);await page.goto(path);
    await expect(page.getByRole("link",{name:"Open recommendation draft"})).toHaveCount(0);
    expect(state.reads).toHaveLength(0);expect(state.writes).toHaveLength(0);
    await page.unrouteAll();
  }
});
test("a stale revision produces one write and no automatic POST retry",async({page})=>{
  const state=await fixture(page,{stale:true});await page.goto(path+"/"+round+"?new=1");
  await page.getByRole("button",{name:"Add offer line"}).click();await chooseOpenedLine(page);
  await page.getByLabel("Quantity").fill("0.0001");await page.getByLabel("Proposed value").fill("0.00000001");
  await page.getByLabel("Reason").fill("Human comparison");await page.getByRole("button",{name:"Save recommendation draft"}).click();
  await expect(page.getByRole("alert").filter({hasText:"changed"})).toBeVisible();
  await page.getByRole("button",{name:"Refresh current draft and compare your entries"}).click();
  await expect(page.getByLabel("Reason")).toHaveValue("Human comparison");
  expect(state.writes).toHaveLength(1);
});
test("a revoked current recommendation action denies the save without a replacement key",async({page})=>{
  const state=await fixture(page,{revokedAtSave:true});await page.goto(path+"/"+round+"?new=1");
  await page.getByRole("button",{name:"Add offer line"}).click();await chooseOpenedLine(page);
  await page.getByLabel("Quantity").fill("0.0001");await page.getByLabel("Proposed value").fill("0.00000001");
  await page.getByLabel("Reason").fill("Human comparison");await page.getByRole("button",{name:"Save recommendation draft"}).click();
  await expect(page.getByRole("alert").filter({hasText:"access"})).toBeVisible();
  expect(state.writes).toHaveLength(1);
});
test("a substituted tab journal remains blocked after hard reload",async({page})=>{
  const state=await fixture(page);await page.goto(path+"/"+round+"?new=1");
  const slot="erp.procurement.recommendation-draft.v1:"+["amizo",company,actor,branch,round,"new"].join(":");
  await page.evaluate(([name,value])=>sessionStorage.setItem(name,JSON.stringify(value)),[slot,{schemaVersion:1,
    scope:{tenantId:"amizo",companyId:company,principalId:actor,branchId:id(12),roundId:round,recordId:"new"},
    command:{key:id(13),roundId:round,draftId:null,expectedRevision:0,expectedSnapshotSha256:null,body:"{}"}}] as const);
  await page.reload();
  await expect(page.getByText("A saved draft needs review before another change.")).toBeVisible();
  await expect(page.getByRole("button",{name:"Save recommendation draft"})).toBeDisabled();
  expect(state.writes).toHaveLength(0);
});
