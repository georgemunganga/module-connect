import { expect, test, type Page } from "@playwright/test";

const companyId = "11111111-1111-4111-8111-111111111111";
const otherCompanyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const vendorId = "33333333-3333-4333-8333-333333333333";
const otherVendorId = "44444444-4444-4444-8444-444444444444";
const capabilities = Object.fromEntries([
  "vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders", "orderDraft", "receiving",
  "invoiceIntake", "invoiceDocuments", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft", "configurationDraft", "contractDraft", "sourcingDraft",
].map(key => [key, key === "vendorDraft"]));
const record = (id: string, name: string) => ({ id, number: id === vendorId ? "VEN-001" : "VEN-002", displayName: name,
  legalName: `${name} Ltd`, countryCode: "ZM", status: "Draft", isOrderable: false, version: 2,
  createdAt: "2026-10-20T00:00:00Z", defaultCurrencyCode: "ZMW", paymentTermRef: "NET30", remarks: "Saved vendor remarks",
  contacts: [{ id: "55555555-5555-4555-8555-555555555555", name: id === vendorId ? "Alice contact" : "Bob contact", email: id === vendorId ? "alice@example.test" : "bob@example.test", isPrimary: true }], sites: [], qualifications: [],
  canReturnForInformation: false, canApprove: false, canReject: false, canSuspend: false, canReactivate: false });

async function fixture(page: Page, delayDirectory = false) {
  const writes: string[] = [], reads: Array<{ path: string; company: string | undefined }> = [];
  let releaseDirectory = () => {};
  const pendingDirectory = new Promise<void>(resolve => { releaseDirectory = resolve; });
  let seenDirectory = () => {};
  const directoryRequested = new Promise<void>(resolve => { seenDirectory = resolve; });
  await page.addInitScript(entityId => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId })), companyId);
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const selected = request.headers()["x-shell-entity"];
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path.startsWith("/api/procurement/")) {
      reads.push({ path, company: selected });
      if (request.method() !== "GET") { writes.push(`${request.method()} ${path}`); return json({ message: "View only" }, 403); }
    }
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: "ERP admin", roles: ["erp_admin"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: companyId, code: "A", registeredName: "Company A" }, { id: otherCompanyId, code: "B", registeredName: "Company B" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ tenantId: "test", legalEntityId: selected, workerId: null, adminViewOnly: true,
      company: { id: selected, code: selected === companyId ? "A" : "B", name: selected === companyId ? "Company A" : "Company B", currencyCode: "ZMW" }, permissions: ["procurement-access", "procurement-vendor-read"] });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "test", legalEntityId: selected, schemaReady: true, capabilities });
    if (path === "/api/procurement/v1/vendors") {
      seenDirectory();
      if (delayDirectory && selected === companyId) await pendingDirectory;
      try { return await json({ items: selected === companyId ? [record(vendorId, "Alpha Supplier"), record(otherVendorId, "Beta Supplier")] : [], total: selected === companyId ? 2 : 0, page: 1, pageSize: 25 }); }
      catch { return; } // An intentionally aborted old-scope directory must not be reused.
    }
    if (path === `/api/procurement/v1/vendors/${vendorId}` && selected === companyId) return json(record(vendorId, "Alpha Supplier"));
    if (path === `/api/procurement/v1/vendors/${otherVendorId}` && selected === companyId) return json(record(otherVendorId, "Beta Supplier"));
    return json({ title: "Vendor not found." }, 404);
  });
  return { writes, reads, directoryRequested, releaseDirectory };
}

test("live vendor uses the imported directory, compact header, split overview and URL tabs", async ({ page }, info) => {
  const setup = await fixture(page);
  await page.goto(`/procurement/workspace/vendors/${vendorId}`);
  await expect(page.getByRole("heading", { name: "Alpha Supplier", exact: true })).toBeVisible();
  const directory = page.getByRole("complementary", { name: "Vendor directory" });
  await expect(directory.getByRole("link", { name: /Beta Supplier/ })).toBeVisible();
  for (const title of ["Vendor contact", "Payables", "Addresses", "Other details", "Contact persons", "Bank Account Details", "Record info", "Recent Activity"])
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.getByText("alice@example.test", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit vendor", exact: true })).toHaveCount(0);
  const desktopScreenshot = info.outputPath("synthetic-vendor-desktop.png");
  await page.screenshot({ path: desktopScreenshot, fullPage: true });
  await page.evaluate(() => window.scrollTo(0, 240));
  const recordHeader = page.getByRole("region", { name: "Vendor record", exact: true }).locator("header");
  await expect.poll(async () => (await recordHeader.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(55);
  await page.evaluate(() => window.scrollTo(0, 0));
  await info.attach("synthetic-live-vendor-overview-desktop", { path: desktopScreenshot, contentType: "image/png" });
  for (const [label, tab, text] of [
    ["Comments", "comments", "Vendor comments are not connected yet."],
    ["Transactions", "transactions", "Linked purchase transactions are not connected to this vendor view yet."],
    ["Mails", "mails", "Vendor email history and sending are not connected yet."],
    ["Statement", "statement", "Vendor statements and payable balances are not connected to Finance yet."],
  ]) {
    await page.getByRole("tab", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/vendors/${vendorId}/${tab}$`));
    await expect(page.getByRole("tab", { name: label, exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText(text, { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Vendor record", exact: true }).getByRole("textbox")).toHaveCount(0); // No fake comment/email/payment editor.
  }
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Vendor contact", exact: true })).toBeVisible();
  const mobileScreenshot = info.outputPath("synthetic-vendor-mobile.png");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: mobileScreenshot, fullPage: true });
  await info.attach("synthetic-live-vendor-overview-mobile", { path: mobileScreenshot, contentType: "image/png" });
  expect(setup.writes).toEqual([]);
  expect(setup.reads.every(row => row.company === companyId)).toBe(true);
});

test("directory selection changes the actual UUID record without carrying the old contact", async ({ page }) => {
  const setup = await fixture(page);
  await page.goto(`/procurement/workspace/vendors/${vendorId}`);
  await page.getByRole("complementary", { name: "Vendor directory" }).getByRole("link", { name: /Beta Supplier/ }).click();
  await expect(page.getByRole("heading", { name: "Beta Supplier", exact: true })).toBeVisible();
  await expect(page.getByText("bob@example.test", { exact: true })).toBeVisible();
  await expect(page.getByText("alice@example.test", { exact: true })).toHaveCount(0);
  expect(setup.writes).toEqual([]);
});

for (const id of ["VEND-003", "66666666-6666-4666-8666-666666666666"]) {
  test(`unknown live reference ${id} never falls back to the local catalog`, async ({ page }) => {
    const setup = await fixture(page);
    await page.goto(`/procurement/workspace/vendors/${id}`);
    await expect(page.getByRole("alert")).toContainText(id === "VEND-003" ? "vendor reference is invalid" : "Vendor not found");
    await expect(page.getByTestId("vendor-detail-frame")).toHaveCount(0);
    expect(setup.writes).toEqual([]);
  });
}

test("a delayed directory from the old company cannot populate the new company view", async ({ page }) => {
  const setup = await fixture(page, true);
  await page.goto(`/procurement/workspace/vendors/${vendorId}`);
  await expect(page.getByRole("heading", { name: "Alpha Supplier", exact: true })).toBeVisible();
  await setup.directoryRequested;
  await page.evaluate(entityId => {
    localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId }));
    window.dispatchEvent(new StorageEvent("storage", { key: "erp.shell.state.v1" }));
  }, otherCompanyId);
  await expect(page.getByRole("alert")).toContainText("Vendor not found");
  setup.releaseDirectory();
  await expect(page.getByTestId("vendor-detail-frame")).toHaveCount(0);
  await expect(page.getByText("Alice contact", { exact: true })).toHaveCount(0);
  expect(setup.writes).toEqual([]);
});
