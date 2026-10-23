import { expect, test } from "@playwright/test";
import { mockErp, requestId } from "./request-mock";

test("Requests retains imported directory tools, selection, preview and truthful page filters", async ({ page }) => {
  await mockErp(page, { seedDraft: true });await page.goto("/procurement/workspace/requests");
  await expect(page.getByTestId("erp-record-table")).toBeVisible();
  await expect(page.getByRole("button", { name: "Filter My Requests by field" })).toBeVisible();
  await page.getByLabel("Search requests on this page").fill("No matching item");
  await expect(page.getByText("No matching requests on this page", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear page filters" }).click();
  await page.getByRole("checkbox", { name: "Select Open PR-001", exact: true }).check();
  await expect(page.getByText("1 selected on this page", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Preview PR-001", exact: true }).click();
  const preview=page.getByRole("dialog", { name: "PR-001 · Preview" });await expect(preview).toBeVisible();
  await expect(preview.getByRole("link", { name: "View full details" })).toHaveAttribute("href", `/procurement/workspace/requests/${requestId}`);
});
test("Procurement requests uses the shared directory without dropping its policy work queue", async ({ page }) => {
  await mockErp(page, { seedDraft: true, policyReviewer: true });await page.goto("/procurement/workspace/procurement-requests");
  await expect(page.getByRole("heading", { name: "Purchase Requests", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Buying-rule checks and issues", exact: true })).toBeVisible();
  await expect(page.getByTestId("erp-record-table")).toBeVisible();
});
test("original request editor frame retains catalog and line fields with guarded discard", async ({ page }) => {
  await mockErp(page);await page.goto("/procurement/workspace/requests/new");
  await page.getByLabel("What do you need?", { exact: true }).fill("Unsaved original request");
  await page.getByLabel("Item or service 1", { exact: true }).fill("Office chair");
  await expect(page.getByRole("button", { name: "Attach files", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Close request editor", exact: true }).click();
  const modal=page.getByRole("dialog", { name: "Discard changes?" });await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page.getByLabel("What do you need?", { exact: true })).toHaveValue("Unsaved original request");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("dialog", { name: "Discard changes?" }).getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My Requests", exact: true })).toBeVisible();
});
test("request detail retains original tabs and preserves an entered withdrawal reason across them", async ({ page }) => {
  await mockErp(page, { seedDraft: true });await page.goto(`/procurement/workspace/requests/${requestId}`);
  await page.getByLabel(/^Reason/).fill("Keep this reason");
  await page.getByRole("tab", { name: "Items (1)", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Items / Line Details", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await expect(page.getByText("Detailed activity history is not connected to this view yet.", { exact: false })).toBeVisible();
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(page.getByLabel(/^Reason/)).toHaveValue("Keep this reason");
});
for (const code of [408, 429, 499]) test(`request save HTTP ${code} keeps the frozen draft and blocks another POST`, async ({ page }) => {
  await mockErp(page);let writes=0;
  await page.route("**/api/procurement/v1/requests", route => {
    if(route.request().method()!=="POST") return route.fallback();writes++;return route.fulfill({ status: code, json: { message: "Outcome not confirmed" } });
  });
  await page.goto("/procurement/workspace/requests/new");
  await page.getByLabel("What do you need?", { exact: true }).fill("Unknown save result");await page.getByLabel("Item or service 1", { exact: true }).fill("Chair");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("The save result was not confirmed.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeDisabled();
  await expect(page.getByLabel("What do you need?", { exact: true })).toHaveValue("Unknown save result");expect(writes).toBe(1);
});
for (const width of [1440,390]) for (const view of ["list","editor","detail"]) test(`request ${view} original layout fits viewport ${width}`, async ({page},info)=>{
  await page.setViewportSize({width,height:1000});await mockErp(page,{seedDraft:view!=="editor"});
  await page.goto(`/procurement/workspace/requests${view==="editor"?"/new":view==="detail"?`/${requestId}`:""}`);
  await expect(page.getByRole("heading",{name:view==="editor"?"New request":view==="detail"?"Office chairs":"My Requests",exact:true})).toBeVisible();
  await expect(page.locator("#erp-global-preloader")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath(`request-${view}-${width}.png`),fullPage:true});
});

test("long request titles do not cover the detail workspace", async ({ page }) => {
  const title = "Long request title ".repeat(50).slice(0, 1000);
  await mockErp(page, { seedDraft: true, seedPurpose: title });
  await page.goto(`/procurement/workspace/requests/${requestId}`);
  const heading = page.getByRole("heading", { name: title, exact: true });
  await expect(heading).toBeVisible();
  expect(await heading.evaluate(node => node.getBoundingClientRect().height)).toBeLessThan(100);
  await expect(page.getByRole("tab", { name: "Overview", exact: true })).toBeVisible();
});
