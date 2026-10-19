import { expect, test, type Page } from "@playwright/test";

const companyId = "11111111-1111-4111-8111-111111111111";
const workerId = "22222222-2222-4222-8222-222222222222";
const vendorId = "33333333-3333-4333-8333-333333333333";
const capabilities = Object.fromEntries([
  "vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "receiving", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft",
  "configurationDraft", "contractDraft", "sourcingDraft",
].map((key) => [key, key === "vendorDraft"]));

type Vendor = Record<string, unknown> & { id: string; version: number; displayName: string; legalName: string; status: string };

async function mockErp(page: Page, options: { denyList?: boolean; staleUpdate?: boolean; reviewer?: boolean; qualification?: boolean } = {}) {
  let vendor: Vendor | null = options.reviewer ? {
    id: vendorId, number: "VEN-001", legalName: "Acme Zambia Ltd", displayName: "Acme",
    countryCode: "ZM", categoryCode: "OFFICE", status: "Submitted", version: 3,
    isOrderable: false, canReturnForInformation: true, canApprove: true, canReject: true,
    contacts: [{ id: "44444444-4444-4444-8444-444444444444", name: "Pat Supplier" }], sites: [],
    qualifications: options.qualification ? [{ id: "66666666-6666-4666-8666-666666666666",
      qualificationType: "Tax clearance", expiresOn: "2027-12-31", reviewStatus: "Pending" }] : [],
  } : null;
  await page.addInitScript((entityId) => {
    localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId }));
  }, companyId);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: options.reviewer ? "Reviewer" : "Buyer", email: "buyer@example.test", roles: [options.reviewer ? "procurement_manager" : "procurement_buyer"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: companyId, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ tenantId: "amizo", legalEntityId: companyId, workerId, company: { id: companyId, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: companyId, schemaReady: true, capabilities });
    if (path === "/api/procurement/v1/vendors") {
      if (request.method() === "GET") {
        const selectedStatus = new URL(request.url()).searchParams.get("status");
        const matches = vendor && (!selectedStatus || vendor.status === selectedStatus);
        return options.denyList ? json({ title: "Forbidden" }, 403)
          : json({ items: matches ? [{ ...vendor }] : [], total: matches ? 1 : 0, page: 1, pageSize: 25 });
      }
      if (request.method() === "POST") {
        const draft = request.postDataJSON();
        vendor = { ...draft, id: vendorId, number: "VEN-001", status: "Draft", version: 1, isOrderable: false, defaultCurrencyCode: draft.currencyCode, contacts: [], sites: [], qualifications: [] };
        return json({ id: vendorId, number: "VEN-001", version: 1, possibleDuplicate: false }, 201);
      }
    }
    if (path === `/api/procurement/v1/vendors/${vendorId}` && vendor) {
      if (request.method() === "GET") return json(vendor);
      if (request.method() === "PUT") {
        if (options.staleUpdate) return json({ detail: "This vendor changed. Refresh it and try again." }, 409);
        const { version, draft } = request.postDataJSON();
        if (version !== vendor.version) return json({ detail: "Stale version" }, 409);
        vendor = { ...vendor, ...draft, defaultCurrencyCode: draft.currencyCode, version: version + 1 };
        return json({ id: vendorId, status: "Draft", version: vendor.version });
      }
    }
    if (path === `/api/procurement/v1/vendors/${vendorId}/contacts` && vendor) {
      const { version, contact } = request.postDataJSON();
      if (version !== vendor.version) return json({ detail: "Stale version" }, 409);
      vendor = { ...vendor, contacts: [...(vendor.contacts as unknown[]), { ...contact, id: "44444444-4444-4444-8444-444444444444" }], version: version + 1 };
      return json({ id: vendorId, version: vendor.version }, 201);
    }
    if (path === `/api/procurement/v1/vendors/${vendorId}/sites` && vendor) {
      const { version, site } = request.postDataJSON();
      if (version !== vendor.version) return json({ detail: "Stale version" }, 409);
      vendor = { ...vendor, sites: [...(vendor.sites as unknown[]), { ...site, id: "55555555-5555-4555-8555-555555555555" }], version: version + 1 };
      return json({ id: vendorId, version: vendor.version }, 201);
    }
    if (path === `/api/procurement/v1/vendors/${vendorId}/qualifications` && vendor) {
      const { version, qualification } = request.postDataJSON();
      if (version !== vendor.version) return json({ detail: "Stale version" }, 409);
      vendor = { ...vendor, qualifications: [...(vendor.qualifications as unknown[]),
        { ...qualification, id: "66666666-6666-4666-8666-666666666666", reviewStatus: "Pending" }], version: version + 1 };
      return json({ id: vendorId, version: vendor.version }, 201);
    }
    if (path === `/api/procurement/v1/vendors/${vendorId}/qualifications/66666666-6666-4666-8666-666666666666/review` && vendor) {
      const { version, decision, reason } = request.postDataJSON();
      if (version !== vendor.version || !reason || !["Verified", "Rejected"].includes(decision))
        return json({ message: "Review requires the current version and a reason." }, 422);
      vendor = { ...vendor, qualifications: (vendor.qualifications as Record<string, unknown>[])
        .map((row) => ({ ...row, reviewStatus: decision })), version: version + 1 };
      return json({ id: "66666666-6666-4666-8666-666666666666", reviewStatus: decision,
        supplierVersion: vendor.version });
    }
    if (path === `/api/procurement/v1/vendors/${vendorId}/withdraw` && vendor) {
      const { version } = request.postDataJSON();
      vendor = { ...vendor, status: "Withdrawn", version: version + 1 };
      return json({ id: vendorId, status: "Withdrawn", version: vendor.version });
    }
    if (path === `/api/procurement/v1/vendors/${vendorId}/submit` && vendor) {
      const { version, businessReason } = request.postDataJSON();
      if (!businessReason || !vendor.categoryCode || !(vendor.contacts as unknown[]).length)
        return json({ message: "Category, contact and reason are required." }, 422);
      if (version !== vendor.version || !["Draft", "More Information Required"].includes(vendor.status)) return json({ message: "Refresh this vendor." }, 409);
      vendor = { ...vendor, status: "Submitted", statusReason: businessReason,
        isOrderable: false, version: version + 1 };
      return json({ id: vendorId, status: "Submitted", isOrderable: false, version: vendor.version });
    }
    if (path === `/api/procurement/v1/vendors/${vendorId}/return` && vendor) {
      const { version, reason } = request.postDataJSON();
      if (version !== vendor.version || vendor.status !== "Submitted") return json({ message: "Refresh this vendor." }, 409);
      vendor = { ...vendor, status: "More Information Required", statusReason: reason,
        isOrderable: false, canReturnForInformation: false, canApprove: false, canReject: false, version: version + 1 };
      return json({ id: vendorId, status: vendor.status, isOrderable: false, version: vendor.version });
    }
    if (path === `/api/procurement/v1/vendors/${vendorId}/approve` && vendor) {
      const { version, reason, duplicatesReviewed } = request.postDataJSON();
      if (version !== vendor.version || vendor.status !== "Submitted") return json({ message: "Refresh this vendor." }, 409);
      if (!reason || !duplicatesReviewed) return json({ message: "Review duplicates and give a reason." }, 422);
      vendor = { ...vendor, status: "Active", statusReason: reason,
        isOrderable: true, canReturnForInformation: false, canApprove: false, canReject: false,
        canSuspend: true, version: version + 1 };
      return json({ id: vendorId, status: vendor.status, isOrderable: true, version: vendor.version });
    }
    if (path === `/api/procurement/v1/vendors/${vendorId}/open-orders` && vendor)
      return json({ supplierId: vendorId, count: 1, items: [{ id: "77777777-7777-4777-8777-777777777777",
        number: "PO-101", status: "Issued", currencyCode: "ZMW" }] });
    if (path === `/api/procurement/v1/vendors/${vendorId}/suspend` && vendor) {
      const { version, reason, existingOrdersReviewed } = request.postDataJSON();
      if (version !== vendor.version || vendor.status !== "Active") return json({ message: "Refresh this vendor." }, 409);
      if (!reason?.trim() || !existingOrdersReviewed) return json({ message: "Give a reason and review existing orders." }, 422);
      vendor = { ...vendor, status: "Suspended", statusReason: reason, isOrderable: false,
        canSuspend: false, version: version + 1 };
      return json({ id: vendorId, status: vendor.status, isOrderable: false, version: vendor.version });
    }
    if (path === `/api/procurement/v1/vendors/${vendorId}/reject` && vendor) {
      const { version, reason } = request.postDataJSON();
      if (version !== vendor.version || vendor.status !== "Submitted") return json({ message: "Refresh this vendor." }, 409);
      if (!reason) return json({ message: "Give a reason." }, 422);
      vendor = { ...vendor, status: "Rejected", statusReason: reason,
        isOrderable: false, canReturnForInformation: false, canApprove: false, canReject: false, version: version + 1 };
      return json({ id: vendorId, status: vendor.status, isOrderable: false, version: vendor.version });
    }
    return json({ title: `Unexpected route: ${path}` }, 404);
  });
}

test("vendor draft persists through the ERP API across refresh, edit and withdrawal", async ({ page }) => {
  await mockErp(page);
  await page.goto("/procurement/workspace/vendors");
  await expect(page.getByText("Every purchase starts with a vendor")).toBeVisible();
  await expect(page.getByText("Northstar Office Supply")).toHaveCount(0);
  await page.getByRole("link", { name: "Add vendor" }).first().click();
  await page.getByLabel("Company name").fill("Amizo Supplies Ltd");
  await page.getByLabel("Display name").fill("Amizo Supplies");
  await expect(page.getByLabel("Currency")).toHaveValue("ZMW");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("heading", { name: "Amizo Supplies" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Amizo Supplies" })).toBeVisible();
  await page.getByLabel("Contact name").fill("Jane Buyer");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByText("Jane Buyer")).toBeVisible();
  await page.getByLabel("Address line 1").fill("Plot 10, Cairo Road");
  await page.getByRole("button", { name: "Add address" }).click();
  await expect(page.getByText(/Plot 10, Cairo Road/)).toBeVisible();
  await page.getByLabel("Qualification type").fill("Tax clearance");
  await page.getByLabel("Issue date").fill("2026-01-01");
  await page.getByLabel("Expiry date").fill("2025-12-31");
  await expect(page.getByText("Expiry date must be on or after the issue date.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add qualification" })).toBeDisabled();
  await page.getByLabel("Expiry date").fill("2027-12-31");
  await page.getByRole("button", { name: "Add qualification" }).click();
  await expect(page.getByText(/Tax clearance.*Expires 2027-12-31/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Tax clearance.*Expires 2027-12-31/)).toBeVisible();
  await page.getByRole("link", { name: "Edit vendor" }).click();
  await page.getByLabel("Display name").fill("Amizo Trading");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("heading", { name: "Amizo Trading" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept("No longer needed"));
  await page.getByRole("button", { name: "Withdraw draft" }).click();
  await expect(page.getByRole("heading", { name: "Vendors" })).toBeVisible();
  await expect(page.getByText("Withdrawn")).toBeVisible();
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.getByText("This workflow is being connected to your ERP.", { exact: false })).toBeVisible();
  await expect(page.getByText("Office equipment for new team")).toHaveCount(0);
});

test("vendor list denial shows an error without demo rows", async ({ page }) => {
  await mockErp(page, { denyList: true });
  await page.goto("/procurement/workspace/vendors");
  await expect(page.getByRole("alert")).toContainText("do not have access");
  await expect(page.getByText("Northstar Office Supply")).toHaveCount(0);
});

test("stale edit keeps entered values for comparison", async ({ page }) => {
  await mockErp(page, { staleUpdate: true });
  await page.goto("/procurement/workspace/vendors/new");
  await page.getByLabel("Company name").fill("Amizo Supplies Ltd");
  await page.getByLabel("Display name").fill("Amizo Supplies");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("link", { name: "Edit vendor" }).click();
  await page.getByLabel("Display name").fill("Unsaved change");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert")).toContainText("changed");
  await expect(page.getByLabel("Display name")).toHaveValue("Unsaved change");
});

test("vendor can be submitted for review after category and contact are saved", async ({ page }) => {
  await mockErp(page);
  await page.goto("/procurement/workspace/vendors/new");
  await page.getByLabel("Company name").fill("Acme Zambia Ltd");
  await page.getByLabel("Display name").fill("Acme");
  await page.getByLabel("Vendor category").fill("OFFICE");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("button", { name: "Submit for review" })).toBeDisabled();
  await page.getByLabel("Contact name").fill("Pat Supplier");
  await page.getByRole("button", { name: "Add contact" }).click();
  await page.getByLabel("Why do you need this vendor?").fill("Office equipment sourcing");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
  await expect(page.getByText("No — approval required")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit vendor" })).toHaveCount(0);
  await page.evaluate(async (id) => {
    const response = await fetch(`/api/procurement/v1/vendors/${id}/return`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 3, reason: "Confirm legal address" }),
    });
    if (!response.ok) throw new Error("Mock reviewer return failed");
  }, vendorId);
  await page.reload();
  await expect(page.getByText(/Reviewer note: Confirm legal address/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit vendor" })).toBeVisible();
  await page.getByLabel("Why do you need this vendor?").fill("Legal address confirmed");
  await page.getByRole("button", { name: "Resubmit for review" }).click();
  await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
  await expect(page.getByText("No — approval required")).toBeVisible();
});

test("reviewer can return a submitted vendor with a visible reason", async ({ page }) => {
  await mockErp(page, { reviewer: true });
  await page.goto("/procurement/workspace/vendors");
  await page.getByRole("combobox", { name: "Filter vendors by status" }).click();
  await page.getByRole("option", { name: "Submitted for review" }).click();
  await expect(page.getByText("Acme", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Acme" }).click();
  await expect(page.getByRole("heading", { name: "Review vendor" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send back for changes" })).toBeDisabled();
  await page.getByLabel("Reason for your decision").fill("Confirm the legal address");
  await page.getByRole("button", { name: "Send back for changes" }).click();
  await expect(page.getByText(/Reviewer note: Confirm the legal address/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review vendor" })).toHaveCount(0);
  await expect(page.getByText("No — approval required")).toBeVisible();
  await page.getByRole("link", { name: "Back to vendors" }).click();
  await page.getByRole("combobox", { name: "Filter vendors by status" }).click();
  await page.getByRole("option", { name: "Submitted for review" }).click();
  await expect(page.getByText("No vendors match this view")).toBeVisible();
});

test("reviewer must check duplicates before approving a vendor", async ({ page }) => {
  await mockErp(page, { reviewer: true });
  await page.goto(`/procurement/workspace/vendors/${vendorId}`);
  await expect(page.getByRole("button", { name: "Approve vendor" })).toBeDisabled();
  await page.getByLabel("Reason for your decision").fill("Registration and contact checked");
  await expect(page.getByRole("button", { name: "Approve vendor" })).toBeDisabled();
  await page.getByLabel("I checked for duplicate vendors").check();
  await page.getByRole("button", { name: "Approve vendor" }).click();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
  await expect(page.getByText("Yes", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review vendor" })).toHaveCount(0);
});

test("reviewer can place an active vendor on hold after checking existing orders", async ({ page }) => {
  await mockErp(page, { reviewer: true });
  await page.goto(`/procurement/workspace/vendors/${vendorId}`);
  await page.getByLabel("Reason for your decision").fill("Registration checked");
  await page.getByLabel("I checked for duplicate vendors").check();
  await page.getByRole("button", { name: "Approve vendor" }).click();
  await expect(page.getByRole("heading", { name: "Place vendor on hold" })).toBeVisible();
  await expect(page.getByText("1 open order to review.")).toBeVisible();
  await expect(page.getByText("PO-101 · Issued · ZMW")).toBeVisible();
  await expect(page.getByRole("button", { name: "Place on hold" })).toBeDisabled();
  await page.getByLabel("Why is this vendor on hold?").fill("Insurance expired");
  await page.getByLabel("I checked existing orders and will follow up on any open commitments").check();
  await page.getByRole("button", { name: "Place on hold" }).click();
  await expect(page.getByText("This vendor is on hold and cannot receive new orders.", { exact: false })).toBeVisible();
  await expect(page.getByText("Suspended", { exact: true })).toBeVisible();
  await expect(page.getByText("No — on hold")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Place vendor on hold" })).toHaveCount(0);
});

test("reviewer can verify a submitted vendor qualification with a reason", async ({ page }) => {
  await mockErp(page, { reviewer: true, qualification: true });
  await page.goto(`/procurement/workspace/vendors/${vendorId}`);
  await expect(page.getByRole("button", { name: "Verify", exact: true })).toBeDisabled();
  await page.getByLabel("Reason for your decision").fill("Checked tax reference with issuer");
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.getByText("Verified", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Verify", exact: true })).toHaveCount(0);
});
