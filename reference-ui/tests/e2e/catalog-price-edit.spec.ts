import { expect, test, type Page } from "@playwright/test";
const company="11111111-1111-4111-8111-111111111111", worker="22222222-2222-4222-8222-222222222222";
const item="33333333-3333-4333-8333-333333333333", priceId="44444444-4444-4444-8444-444444444444", vendor="55555555-5555-4555-8555-555555555555";
async function fixture(page: Page, mode: "normal"|"legacy"|"stale"|"lost"|"item-fails"="normal") {
  let price={ id:priceId,catalogItemId:item,supplierId:vendor,currencyCode:"ZMW",unitCode:"each",unitPrice:1,
    taxBasis:"Exclusive",audienceCode:"STAFF",minimumQuantity:null,maximumQuantity:2,effectiveFrom:"2026-10-22T12:34:56.123456Z",effectiveTo:null,
    status:"Draft",version:3,catalogEditVersion:mode==="legacy"?undefined:1,
    exactAmounts:{unitPrice:"99999999999999.9999",minimumQuantity:null,maximumQuantity:"2.0001"} };
  const writes:Array<{method:string,path:string,body:Record<string,unknown>}>=[]; let reads=0;
  await page.addInitScript(id=>localStorage.setItem("erp.shell.state.v1",JSON.stringify({entityId:id})),company);
  await page.route("**/api/**",async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    const json=(body:unknown,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
    if(path==="/api/hrm/auth/me")return json({authenticated:true,user:{isActive:true,displayName:"Synthetic buyer",roles:["procurement_buyer"]}});
    if(path==="/api/hrm/branding")return json({displayName:"Synthetic company"});
    if(path==="/api/hrm/admin/legal-entities")return json({items:[{id:company,code:"TEST",registeredName:"Synthetic company"}]});
    if(path==="/api/hrm/admin/locations")return json({items:[]});
    if(path==="/api/hrm/shell/")return json({assignedLocationIds:[],confined:false});
    if(path==="/api/procurement/v1/context")return json({tenantId:"synthetic",legalEntityId:company,workerId:worker,
      permissions:["procurement-access","procurement-item-manage"],company:{id:company,code:"TEST",name:"Synthetic company",currencyCode:"ZMW"}});
    if(path==="/api/procurement/v1/meta")return json({tenantId:"synthetic",legalEntityId:company,schemaReady:true,capabilities:{itemDraft:true}});
    if(path==="/api/procurement/v1/vendors")return json({items:[{id:vendor,number:"VEN-1",displayName:"Actual selected vendor",legalName:"Vendor",countryCode:"ZM",status:"Active",isOrderable:true,version:1,createdAt:"2026-10-22T00:00:00Z"}],total:1,page:1,pageSize:100});
    if(path===`/api/procurement/v1/items/${item}`)return mode==="item-fails"?json({message:"Item unavailable"},404):json({id:item,code:"TEST-1",name:"Catalog item",kind:"Goods",categoryCode:"TEST",unitCode:"each",status:"Active",isPurchasable:true,isStockItem:false,isAsset:false,inspectionRequired:false,version:1});
    if(path===`/api/procurement/v1/items/${item}/catalog-entries`&&request.method()==="GET"){reads++;return json({items:[price]});}
    if(request.method()!=="GET")writes.push({method:request.method(),path,body:request.postDataJSON()});
    if(path===`/api/procurement/v1/items/${item}/catalog-entries/${priceId}`&&request.method()==="PUT"){
      if(mode==="stale")return json({message:"This catalog price changed. Refresh and try again."},409);
      const {version,entry}=request.postDataJSON();expect(version).toBe(3);
      price={...price,...entry,version:version+1,exactAmounts:{unitPrice:entry.unitPrice,minimumQuantity:entry.minimumQuantity,maximumQuantity:entry.maximumQuantity}};
      if(mode==="lost")return route.abort("failed");return json(price);
    }
    return json({message:"No fixture action configured"},404);
  });
  return {writes,readCount:()=>reads};
}
test("draft catalog price edits exact strings and preserves saved terms without publishing",async({page})=>{
  const f=await fixture(page);await page.goto(`/procurement/workspace/items/${item}`);
  await page.getByRole("button",{name:"Edit draft price",exact:true}).click();
  const form=page.getByRole("form",{name:"Edit catalog draft price"});
  await expect(form.getByRole("textbox",{name:"Draft unit price",exact:true})).toHaveValue("99999999999999.9999");
  await form.getByRole("textbox",{name:"Draft unit price",exact:true}).fill("12345678901234.5678");
  await form.getByRole("button",{name:"Save draft price",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("Draft price updated");
  expect(f.writes).toHaveLength(1);expect(f.writes[0].method).toBe("PUT");
  expect(f.writes[0].body).toMatchObject({version:3,entry:{unitPrice:"12345678901234.5678",minimumQuantity:null,maximumQuantity:"2.0001",
    taxBasis:"Exclusive",audienceCode:"STAFF",effectiveFrom:"2026-10-22T12:34:56.123456Z",effectiveTo:null}});
  await page.reload();await expect(page.getByRole("cell").filter({hasText:"12345678901234.5678"})).toBeVisible();
  expect(f.writes).toHaveLength(1);
});
test("legacy catalog details stay readable without offering destructive guessed edits",async({page})=>{
  const f=await fixture(page,"legacy");await page.goto(`/procurement/workspace/items/${item}`);
  await expect(page.getByRole("heading",{name:"Catalog item",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Edit draft price",exact:true})).toHaveCount(0);expect(f.writes).toHaveLength(0);
});
test("stale price keeps the correction and explicit saved-price check performs only GET",async({page})=>{
  const f=await fixture(page,"stale");await page.goto(`/procurement/workspace/items/${item}`);
  await page.getByRole("button",{name:"Edit draft price",exact:true}).click();
  await page.getByRole("textbox",{name:"Draft unit price",exact:true}).fill("7.0001");await page.getByRole("button",{name:"Save draft price",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("changed");await expect(page.getByRole("textbox",{name:"Draft unit price",exact:true})).toHaveValue("7.0001");
  await page.getByRole("button",{name:"Check saved prices",exact:true}).click();await expect.poll(()=>f.readCount()).toBeGreaterThan(1);expect(f.writes).toHaveLength(1);
});
test("lost catalog correction stays unconfirmed with no automatic repeat PUT",async({page})=>{
  const f=await fixture(page,"lost");await page.goto(`/procurement/workspace/items/${item}`);await page.getByRole("button",{name:"Edit draft price",exact:true}).click();
  await page.getByRole("textbox",{name:"Draft unit price",exact:true}).fill("8.0001");await page.getByRole("button",{name:"Save draft price",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("save is unconfirmed");await expect(page.getByRole("button",{name:"Save draft price",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Check saved prices",exact:true}).click();await expect.poll(()=>f.readCount()).toBeGreaterThan(1);expect(f.writes).toHaveLength(1);
  await expect(page.getByRole("button",{name:"Save draft price",exact:true})).toBeDisabled();
});
test("failed item edit load cannot fall back to creating a new item",async({page})=>{
  const f=await fixture(page,"item-fails");await page.goto(`/procurement/workspace/items/${item}/edit`);
  await expect(page.getByRole("alert")).toContainText("Item unavailable");await expect(page.getByRole("button",{name:"Save draft",exact:true})).toHaveCount(0);expect(f.writes).toHaveLength(0);
});
