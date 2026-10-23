import { expect, test } from "@playwright/test";
import { mockErp } from "./request-mock";
const permissions=["procurement-access","procurement-request-read"];
test("Analytics preserves original report center with actual loaded rows and no invented spend",async({page})=>{
  const calls:string[]=[];page.on("request",r=>{if(r.url().includes("/api/procurement/"))calls.push(new URL(r.url()).pathname);});
  await mockErp(page,{seedDraft:true,permissions});await page.goto("/procurement/workspace/analytics");
  await expect(page.getByRole("heading",{name:"Analytics",exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"All reports",exact:true})).toBeVisible();
  await expect(page.getByRole("cell",{name:/Office chairs/})).toBeVisible();
  await expect(page.getByRole("button",{name:"Export CSV",exact:true})).toBeDisabled();
  await expect(page.getByLabel("My purchase requests: 1")).toBeVisible();
  await page.getByLabel("Search loaded report records").fill("PR-001");await expect(page.getByRole("cell",{name:/Office chairs/})).toBeVisible();
  await page.getByLabel("Search loaded report records").fill("Not a saved record");await expect(page.getByText("No report rows match",{exact:true})).toBeVisible();
  for(const resource of ["orders","contracts","plans","invoices","payments"])expect(calls).not.toContain(`/api/procurement/v1/${resource}`);
  await expect(page.getByText(/records saved in this browser|local procurement record/)).toHaveCount(0);
});
test("failed Analytics data remains unavailable rather than a zero spend or empty report",async({page})=>{
  await mockErp(page,{seedDraft:true,permissions,denyList:true});await page.goto("/procurement/workspace/analytics");
  await expect(page.getByLabel("My purchase requests: error")).toBeVisible();
  await expect(page.getByText("Could not load report records. Refresh to try again.",{exact:true})).toBeVisible();
  await expect(page.getByText("No report rows match",{exact:true})).toHaveCount(0);
  await expect(page.getByRole("cell",{name:/Office chairs/})).toHaveCount(0);
});
test("Analytics query resets on explicit account invalidation and Refresh makes reads only",async({page})=>{
  let writes=0;page.on("request",r=>{if(r.url().includes("/api/procurement/")&&r.method()!=="GET")writes++;});
  await mockErp(page,{seedDraft:true,permissions});await page.goto("/procurement/workspace/analytics");
  await page.getByLabel("Search loaded report records").fill("chairs");
  await page.evaluate(()=>window.dispatchEvent(new Event("erp:auth-context-changed")));
  await expect(page.getByLabel("Search loaded report records")).toHaveValue("");
  await page.getByRole("button",{name:"Refresh",exact:true}).click();await expect(page.getByLabel("My purchase requests: 1")).toBeVisible();expect(writes).toBe(0);
});
for(const width of [1440,390])test(`Analytics original report layout fits ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:1000});await mockErp(page,{seedDraft:true,permissions});await page.goto("/procurement/workspace/analytics");
  await expect(page.getByRole("cell",{name:/Office chairs/})).toBeVisible();await expect(page.locator("#erp-global-preloader")).toHaveCount(0);
  await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath(`analytics-${width}.png`),fullPage:true});
});
