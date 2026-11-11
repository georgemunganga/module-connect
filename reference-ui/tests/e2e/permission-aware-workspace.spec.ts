import { expect, test } from "@playwright/test";
import { mockErp } from "./request-mock";
const own=["procurement-access","procurement-request-read","procurement-request-create","procurement-request-edit","procurement-request-submit"];
for(const width of [1440,390])test(`request-only workspace hides unrelated menus, cards and shortcuts at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await mockErp(page,{allBranches:true,permissions:own});
 await page.goto("/procurement/workspace/");await expect(page.getByRole("heading",{name:"Welcome",exact:true})).toBeVisible();
 if(width===390)await page.getByRole("button",{name:"Open navigation",exact:true}).click();
 const nav=page.getByRole("navigation",{name:"Main",exact:true});await expect(nav.getByRole("link")).toHaveText(["Home","My Requests"]);
 for(const label of ["Spend Summary","Payables Summary","Attention Required","My purchase orders","Vendors","Procurement settings"])await expect(page.getByText(label,{exact:true})).toHaveCount(0);
 if(width===390)await page.getByRole("button",{name:"Close navigation",exact:true}).click();
 await page.getByRole("button",{name:"Quick create",exact:true}).click();
 await expect(page.getByRole("link",{name:"Purchase Request",exact:true})).toBeVisible();
 for(const label of ["Vendor","Bill","Purchase Order","Request for Quote"])await expect(page.getByRole("link",{name:label,exact:true})).toHaveCount(0);
 await page.getByRole("button",{name:"User menu",exact:true}).click();
 await expect(page.getByRole("link",{name:"Organization profile",exact:true})).toHaveCount(0);
 await expect(page.getByRole("link",{name:"Procurement settings",exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
for(const path of ["/vendors","/items","/approvals","/rfqs","/purchase-orders","/purchase-receives","/plans","/contracts","/bills","/payments","/batch-payments","/budgets","/analytics","/settings","/settings/modules/items/preferences"])test(`direct ${path} denies a request-only user before branch or business loading`,async({page})=>{
 await mockErp(page,{allBranches:true,permissions:own});const business:string[]=[];
 page.on("request",r=>{const p=new URL(r.url()).pathname;if(p.startsWith("/api/procurement/")&&!['/api/procurement/v1/context','/api/procurement/v1/meta'].includes(p))business.push(p);});
 await page.goto('/procurement/workspace'+path);await expect(page.getByRole("alert")).toContainText("do not have permission");
 await expect(page.getByRole("heading",{name:"Choose a branch to continue",exact:true})).toHaveCount(0);expect(business).toEqual([]);
});
test("effective grants preserve buyer navigation and read-only quick-create stays empty",async({page})=>{
 await mockErp(page,{permissions:["procurement-access","procurement-request-read","procurement-vendor-read","procurement-item-read","procurement-po-read","procurement-invoice-read","procurement-configuration-read","procurement-approval-read"]});
 await page.goto('/procurement/workspace/');await expect(page.getByRole('heading',{name:'Welcome',exact:true})).toBeVisible();
 const nav=page.getByRole('navigation',{name:'Main',exact:true});for(const label of ['Vendors','Items','Approvals','Purchase Orders','Bills','Analytics'])await expect(nav.getByRole('link',{name:label,exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Settings',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Quick create',exact:true})).toHaveCount(0);
});
