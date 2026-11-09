import { expect, test } from "@playwright/test";
import { mockErp } from "./request-mock";

test("department entry saves one existing request and keeps optional details", async ({ page }) => {
 await mockErp(page);
 const writes: string[] = [];
 page.on("request", request => { if (request.url().includes("/api/procurement/") && request.method() !== "GET") writes.push(new URL(request.url()).pathname); });
 await page.goto("/procurement/workspace/requests/new?entry=department");
 await expect(page.getByRole("heading", { name: "Request materials or services", exact: true })).toBeVisible();
 await expect(page.getByText("Start with what your department needs", { exact: false })).toBeVisible();
 await expect(page.getByLabel("Estimated unit price", { exact: true })).toHaveValue("");
 await page.getByLabel("What do you need?", { exact: true }).fill("Safety helmets for site workers");
 await page.getByLabel("Item or service 1").fill("Yellow safety helmet");
 await page.getByLabel("Quantity", { exact: true }).fill("20");
 await page.getByRole("button", { name: "Save draft", exact: true }).click();
 expect(writes).toEqual([]); // An unknown estimate is never silently changed to zero.
 await page.getByText("More request details (optional)", { exact: true }).click();
 await page.getByLabel("Cost centre", { exact: true }).fill("Engineering");
 await page.getByLabel("Estimated unit price", { exact: true }).fill("12.50");
 const saved = page.waitForRequest(request => new URL(request.url()).pathname === "/api/procurement/v1/requests" && request.method() === "POST");
 await page.getByRole("button", { name: "Save draft", exact: true }).click();
 const payload = (await saved).postDataJSON();
 expect(payload.purpose).toBe("Safety helmets for site workers");
 expect(payload.costCenterRef).toBe("Engineering");
 expect(payload.lines[0].estimatedUnitPrice).toBe("12.50");
 await expect(page.getByRole("heading", { name: "Safety helmets for site workers", exact: true })).toBeVisible();
 expect(writes).toEqual(["/api/procurement/v1/requests"]);
});

test("guided entry remains denied without create permission", async ({ page }) => {
 await mockErp(page, { permissions: ["procurement-access", "procurement-request-read"] });
 await page.goto("/procurement/workspace/requests/new?entry=department");
 await expect(page.getByRole("alert")).toContainText("do not have permission");
 await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
});

for (const width of [390, 1440]) test(`guided entry fits viewport ${width}`, async ({ page }) => {
 await page.setViewportSize({ width, height: 1000 });await mockErp(page);
 await page.goto("/procurement/workspace/requests/new?entry=department");
 await expect(page.getByLabel("What do you need?", { exact: true })).toBeVisible();
 await expect(page.getByLabel("Cost centre", { exact: true })).toBeHidden();
 await page.getByText("More request details (optional)", { exact: true }).click();
 await expect(page.getByLabel("Cost centre", { exact: true })).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
