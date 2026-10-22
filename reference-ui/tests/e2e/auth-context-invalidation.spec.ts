import {expect,test} from "@playwright/test";
import {fullVendorMock,vendor} from "./vendor-full-mock";
const key="erp.auth-context.v1";
test("actual cross-tab public nonce storage event removes unsaved vendor state even for the same worker",async({page,context})=>{
  await fullVendorMock(page);await page.goto(`/procurement/workspace/vendors/${vendor}/edit`);await page.getByLabel("Display name",{exact:true}).fill("Old account unsaved value");
  const sibling=await context.newPage();await fullVendorMock(sibling);await sibling.goto("/procurement/workspace/vendors");await sibling.evaluate(name=>localStorage.setItem(name,crypto.randomUUID()),key);await sibling.close();await page.bringToFront();
  await expect(page.getByLabel("Display name",{exact:true})).toHaveValue("Full Vendor");
});
test("late saved response after auth invalidation cannot navigate an unmounted create editor",async({page})=>{
  await fullVendorMock(page);let writes=0;let release!:()=>void;let entered!:()=>void;const enteredPromise=new Promise<void>(resolve=>{entered=resolve;});const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route("**/api/procurement/v1/vendors",async route=>{if(route.request().method()!=="POST")return route.fallback();writes++;entered();await held;try{await route.fulfill({status:201,contentType:"application/json",body:JSON.stringify({id:vendor,version:1,number:"VEN-1",possibleDuplicate:false})});}catch{/* navigation may abort the old request */}});
  await page.goto("/procurement/workspace/vendors/new");await page.getByLabel("Company name",{exact:true}).fill("Old actor draft");await page.getByLabel("Display name",{exact:true}).fill("Old actor draft");await page.getByRole("button",{name:"Save draft",exact:true}).click();await enteredPromise;
  // Same-document canonical event; no token/actor ID invented and no changed business response.
  await page.evaluate(()=>window.dispatchEvent(new Event("erp:auth-context-changed")));await expect(page.getByLabel("Display name",{exact:true})).toHaveValue("");const response=page.waitForResponse(value=>value.request().method()==="POST"&&new URL(value.url()).pathname.endsWith("/vendors"));release();await (await response).finished();await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())));await expect(page).toHaveURL(/\/vendors\/new$/);expect(writes).toBe(1);
});
test("ordinary blur/focus preserves the entered vendor and performs no auth recheck",async({page})=>{
  const state=await fullVendorMock(page);let authReads=0;page.on("request",request=>{if(new URL(request.url()).pathname==="/api/hrm/auth/me")authReads++;});await page.goto(`/procurement/workspace/vendors/${vendor}/edit`);await page.getByLabel("Display name",{exact:true}).fill("Keep my unsaved draft");const before=authReads;
  await page.evaluate(()=>{window.dispatchEvent(new Event("blur"));window.dispatchEvent(new Event("focus"));document.dispatchEvent(new Event("visibilitychange"));});await expect(page.getByLabel("Display name",{exact:true})).toHaveValue("Keep my unsaved draft");expect(authReads).toBe(before);expect(state.writes).toHaveLength(0);
});
test("canonical auth generation rechecks and renders current denial instead of old form",async({page})=>{
  await fullVendorMock(page);await page.goto(`/procurement/workspace/vendors/${vendor}/edit`);await page.getByLabel("Display name",{exact:true}).fill("Old draft");await page.route("**/api/hrm/auth/me",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({authenticated:false,user:null})}));await page.evaluate(()=>window.dispatchEvent(new Event("erp:auth-context-changed")));await expect(page.getByRole("alert")).toContainText("Sign in");await expect(page.getByRole("button",{name:"Save vendor details",exact:true})).toHaveCount(0);
});

test("sibling OIDC token refresh preserves unsaved form and makes no authentication recheck",async({page,context})=>{
  const state=await fullVendorMock(page);let reads=0;page.on("request",request=>{if(new URL(request.url()).pathname==="/api/hrm/auth/me")reads++;});await page.goto(`/procurement/workspace/vendors/${vendor}/edit`);await page.getByLabel("Display name",{exact:true}).fill("Keep this across token refresh");const before=reads;
  const sibling=await context.newPage();await fullVendorMock(sibling);await sibling.goto("/procurement/workspace/vendors");await sibling.evaluate(()=>localStorage.setItem("erp.oidc.session",JSON.stringify({accessToken:"synthetic-refreshed-token",idToken:"synthetic-id",expiresAt:Date.now()+60000})));await sibling.close();await page.bringToFront();
  await expect(page.getByLabel("Display name",{exact:true})).toHaveValue("Keep this across token refresh");expect(reads).toBe(before);expect(state.writes).toHaveLength(0);
});
test("canonical generation rechecks an administrator readonly context and removes stale editor",async({page})=>{
  await fullVendorMock(page);await page.goto(`/procurement/workspace/vendors/${vendor}/edit`);await page.getByLabel("Display name",{exact:true}).fill("Old purchasing draft");
  await page.route("**/api/hrm/auth/me",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({authenticated:true,user:{id:"99999999-9999-4999-8999-999999999999",isActive:true,roles:["erp_admin"],displayName:"Administrator"}})}));
  await page.route("**/api/procurement/v1/context",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({tenantId:"mock",legalEntityId:"11111111-1111-4111-8111-111111111111",workerId:null,adminViewOnly:true,permissions:["procurement-access","procurement-vendor-read"],company:{id:"11111111-1111-4111-8111-111111111111",code:"TEST",name:"Synthetic Company",currencyCode:"ZMW"}})}));
  await page.evaluate(()=>window.dispatchEvent(new Event("erp:auth-context-changed")));await expect(page.getByRole("heading",{name:"View only",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Save vendor details",exact:true})).toHaveCount(0);await expect(page.getByRole("textbox",{name:"Display name",exact:true})).toHaveCount(0);
});
test("selected branch switch removes old loaded readiness while new context is still pending",async({page,context})=>{
  const state=await fullVendorMock(page);await page.goto(`/procurement/workspace/vendors/${vendor}/edit`);await page.getByLabel("Display name",{exact:true}).fill("Old branch draft");let entered!:()=>void;let release!:()=>void;const pending=new Promise<void>(resolve=>{entered=resolve;});const hold=new Promise<void>(resolve=>{release=resolve;});
  await page.route("**/api/procurement/v1/context",async route=>{entered();await hold;try{await route.fulfill({status:403,contentType:"application/json",body:JSON.stringify({message:"Selected branch is unavailable"})});}catch{/* scope navigation may abort this old request */}});
  const sibling=await context.newPage();await fullVendorMock(sibling);await sibling.goto("/procurement/workspace/vendors");await sibling.evaluate(()=>localStorage.setItem("erp.shell.state.v1",JSON.stringify({entityId:"11111111-1111-4111-8111-111111111111",branch:"88888888-8888-4888-8888-888888888888"})));await pending;
  await expect(page.getByRole("button",{name:"Save vendor details",exact:true})).toHaveCount(0);await expect(page.getByRole("textbox",{name:"Display name",exact:true})).toHaveCount(0);expect(state.writes).toHaveLength(0);release();await sibling.close();await page.bringToFront();await expect(page.getByRole("alert")).toContainText("does not have Procurement access");
});
