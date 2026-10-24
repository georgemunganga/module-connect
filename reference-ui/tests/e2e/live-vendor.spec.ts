import { expect, test, type Page } from "@playwright/test";

const companyId = "11111111-1111-4111-8111-111111111111";
const workerId = "22222222-2222-4222-8222-222222222222";
const vendorId = "33333333-3333-4333-8333-333333333333";
const capabilities = Object.fromEntries([
  "vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft",
  "configurationDraft", "contractDraft", "sourcingDraft",
].map((key) => [key, key === "vendorDraft"]));

type Vendor = Record<string, unknown> & { id: string; version: number; displayName: string; legalName: string; status: string };

async function mockErp(page: Page, options: { denyList?: boolean; staleUpdate?: boolean; reviewer?: boolean; approveOnly?: boolean; qualification?: boolean; adminViewOnly?: boolean; adminDraft?: boolean } = {}) {
  let vendor: Vendor | null = options.reviewer || options.approveOnly || options.adminViewOnly ? {
    id: vendorId, number: "VEN-001", legalName: "Acme Zambia Ltd", displayName: "Acme",
    countryCode: "ZM", categoryCode: "OFFICE", status: options.adminDraft ? "Draft" : "Submitted", version: 3,
    isOrderable: false, canReturnForInformation: !options.approveOnly && !options.adminViewOnly, canApprove: !options.adminViewOnly, canReject: !options.adminViewOnly,
    attributes: [], contacts: [{ id: "44444444-4444-4444-8444-444444444444", name: "Pat Supplier" }], sites: [],
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
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: options.reviewer ? "Reviewer" : "Buyer", email: "buyer@example.test", roles: [options.adminViewOnly ? "erp_admin" : options.reviewer ? "procurement_manager" : "procurement_buyer"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: companyId, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenantId: "amizo", legalEntityId: companyId, workerId: options.adminViewOnly ? null : workerId, adminViewOnly: options.adminViewOnly || undefined,
      permissions: options.adminViewOnly ? ["procurement-access", "procurement-vendor-read"] : options.approveOnly
        ? ["procurement-access", "procurement-vendor-read", "procurement-vendor-approve"]
        : ["procurement-access", "procurement-vendor-read", "procurement-vendor-create", "procurement-vendor-edit", "procurement-vendor-manage", "procurement-vendor-approve"],
      company: { id: companyId, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
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
        vendor = { ...draft, id: vendorId, number: "VEN-001", status: "Draft", version: 1, isOrderable: false, defaultCurrencyCode: draft.currencyCode, contacts: [], sites: [], qualifications: [], attributes: [] };
        return json({ id: vendorId, number: "VEN-001", version: 1, possibleDuplicate: false }, 201);
      }
    }
    if (path === `/api/procurement/v1/vendors/${vendorId}` && vendor) {
      if (request.method() === "GET") return json({ ...vendor, canEdit: !options.reviewer && !options.approveOnly && !options.adminViewOnly && ["Draft", "More Information Required"].includes(vendor.status) });
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
      return json({ id: "44444444-4444-4444-8444-444444444444", version: vendor.version }, 201);
    }
    if (path === `/api/procurement/v1/vendors/${vendorId}/contacts/44444444-4444-4444-8444-444444444444` && vendor && request.method() === "PUT") {
      const { version, contact } = request.postDataJSON();
      if (version !== vendor.version) return json({ detail: "This vendor changed. Refresh it." }, 409);
      vendor = { ...vendor, contacts: (vendor.contacts as Record<string, unknown>[]).map((row) =>
        row.id === "44444444-4444-4444-8444-444444444444" ? { ...row, ...contact } : row), version: version + 1 };
      return json({ id: "44444444-4444-4444-8444-444444444444", version: vendor.version });
    }
    if (path === `/api/procurement/v1/vendors/${vendorId}/contacts/44444444-4444-4444-8444-444444444444/remove` && vendor) {
      const { version, reason } = request.postDataJSON();
      if (version !== vendor.version || !reason) return json({ detail: "A current version and reason are required." }, 422);
      vendor = { ...vendor, contacts: [], version: version + 1 };
      return json({ id: "44444444-4444-4444-8444-444444444444", version: vendor.version });
    }
    if (path === `/api/procurement/v1/vendors/${vendorId}/sites` && vendor) {
      const { version, site } = request.postDataJSON();
      if (version !== vendor.version) return json({ detail: "Stale version" }, 409);
      vendor = { ...vendor, sites: [...(vendor.sites as unknown[]), { ...site, id: "55555555-5555-4555-8555-555555555555" }], version: version + 1 };
      return json({ id: "55555555-5555-4555-8555-555555555555", version: vendor.version }, 201);
    }
    if (path === `/api/procurement/v1/vendors/${vendorId}/sites/55555555-5555-4555-8555-555555555555` && vendor && request.method() === "PUT") {
      const { version, site } = request.postDataJSON();
      if (version !== vendor.version) return json({ detail: "This vendor changed. Refresh it." }, 409);
      vendor = { ...vendor, sites: (vendor.sites as Record<string, unknown>[]).map((row) =>
        row.id === "55555555-5555-4555-8555-555555555555" ? { ...row, ...site } : row), version: version + 1 };
      return json({ id: "55555555-5555-4555-8555-555555555555", version: vendor.version });
    }
    if (path === `/api/procurement/v1/vendors/${vendorId}/sites/55555555-5555-4555-8555-555555555555/remove` && vendor) {
      const { version, reason } = request.postDataJSON();
      if (version !== vendor.version || !reason) return json({ detail: "A current version and reason are required." }, 422);
      vendor = { ...vendor, sites: [], version: version + 1 };
      return json({ id: "55555555-5555-4555-8555-555555555555", version: vendor.version });
    }
    if (path === `/api/procurement/v1/vendors/${vendorId}/qualifications` && vendor) {
      const { version, qualification } = request.postDataJSON();
      if (version !== vendor.version) return json({ detail: "Stale version" }, 409);
      vendor = { ...vendor, qualifications: [...(vendor.qualifications as unknown[]),
        { ...qualification, id: "66666666-6666-4666-8666-666666666666", reviewStatus: "Pending" }], version: version + 1 };
      return json({ id: "66666666-6666-4666-8666-666666666666", version: vendor.version }, 201);
    }
    if (path === `/api/procurement/v1/vendors/${vendorId}/qualifications/66666666-6666-4666-8666-666666666666` && vendor && request.method() === "PUT") {
      const { version, qualification } = request.postDataJSON();
      if (version !== vendor.version) return json({ detail: "This vendor changed. Refresh it." }, 409);
      vendor = { ...vendor, qualifications: (vendor.qualifications as Record<string, unknown>[]).map((row) =>
        row.id === "66666666-6666-4666-8666-666666666666" ? { ...row, ...qualification } : row), version: version + 1 };
      return json({ id: "66666666-6666-4666-8666-666666666666", version: vendor.version });
    }
    if (path === `/api/procurement/v1/vendors/${vendorId}/qualifications/66666666-6666-4666-8666-666666666666/remove` && vendor) {
      const { version, reason } = request.postDataJSON();
      if (version !== vendor.version || !reason) return json({ detail: "A current version and reason are required." }, 422);
      vendor = { ...vendor, qualifications: [], version: version + 1 };
      return json({ id: "66666666-6666-4666-8666-666666666666", version: vendor.version });
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
        canSuspend: false, canReactivate: true, version: version + 1 };
      return json({ id: vendorId, status: vendor.status, isOrderable: false, version: vendor.version });
    }
    if (path === `/api/procurement/v1/vendors/${vendorId}/reactivate` && vendor) {
      const { version, reason, dueDiligenceReviewed } = request.postDataJSON();
      if (version !== vendor.version || vendor.status !== "Suspended") return json({ message: "Refresh this vendor." }, 409);
      if (!reason?.trim() || !dueDiligenceReviewed) return json({ message: "Review the current vendor evidence and give a reason." }, 422);
      vendor = { ...vendor, status: "Active", statusReason: reason, isOrderable: true,
        canReactivate: false, canSuspend: true, version: version + 1 };
      return json({ id: vendorId, status: vendor.status, isOrderable: true, version: vendor.version });
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
  test.setTimeout(90_000);
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
  await expect(page.getByRole("listitem").filter({ hasText: "Jane Buyer" })).toBeVisible();
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
  await page.getByRole("button", { name: "Save vendor details", exact: true }).click();
  await expect(page.getByRole("status").filter({hasText:"Vendor details saved"})).toBeVisible();
  await page.getByRole("link", {name:"Cancel",exact:true}).click();
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
test("lost detail contact-create result blocks replay until a scoped saved-record comparison", async ({ page }) => {
  await mockErp(page);await page.goto("/procurement/workspace/vendors/new");
  await page.getByLabel("Company name").fill("Reconciliation Supplier Ltd");
  await page.getByLabel("Display name").fill("Reconciliation Supplier");
  await page.getByRole("button",{name:"Save draft"}).click();
  await expect(page.getByRole("heading",{name:"Reconciliation Supplier"})).toBeVisible();
  let attempts=0;
  await page.route(`**/api/procurement/v1/vendors/${vendorId}/contacts`,route=>{attempts++;return route.abort("failed");});
  await page.getByLabel("Contact name").fill("Potentially saved contact");
  await page.getByRole("button",{name:"Add contact"}).click();
  await expect(page.getByText("A vendor change is unconfirmed",{exact:false})).toBeVisible();
  await expect(page.getByRole("button",{name:"Add contact"})).toHaveCount(0);
  expect(attempts).toBe(1);
  await page.getByRole("button",{name:"Reload saved vendor"}).click();
  await expect(page.getByRole("button",{name:"I compared the saved details"})).toBeVisible();
  expect(attempts).toBe(1);
});
test("confirmed child save with failed follow-up GET stays blocked until reconciliation", async ({ page }) => {
  await mockErp(page);await page.goto("/procurement/workspace/vendors/new");
  await page.getByLabel("Company name").fill("Saved Supplier Ltd");await page.getByLabel("Display name").fill("Saved Supplier");
  await page.getByRole("button",{name:"Save draft"}).click();
  await expect(page.getByRole("heading",{name:"Saved Supplier"})).toBeVisible();
  let failRead=true;
  await page.route(`**/api/procurement/v1/vendors/${vendorId}`,route=>route.request().method()==="GET"&&failRead
    ?route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"Temporary read failure"})}):route.fallback());
  await page.getByLabel("Contact name").fill("Saved Contact");await page.getByRole("button",{name:"Add contact"}).click();
  await expect(page.getByText("saved vendor could not be reloaded",{exact:false})).toBeVisible();
  await expect(page.getByRole("button",{name:"Add contact"})).toHaveCount(0);
  failRead=false;await page.getByRole("button",{name:"Reload saved vendor"}).click();
  await expect(page.getByRole("button",{name:"I compared the saved details"})).toBeVisible();
  await expect(page.getByText("Saved Contact",{exact:false})).toBeVisible();
});
test("late detail save response cannot restore controls after company context changes", async ({ page }) => {
  await mockErp(page);await page.goto("/procurement/workspace/vendors/new");
  await page.getByLabel("Company name").fill("Old Company Supplier Ltd");await page.getByLabel("Display name").fill("Old Company Supplier");
  await page.getByRole("button",{name:"Save draft"}).click();
  await expect(page.getByRole("heading",{name:"Old Company Supplier"})).toBeVisible();
  let release!:()=>void;let entered!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});const started=new Promise<void>(resolve=>{entered=resolve;});let writes=0;
  await page.route(`**/api/procurement/v1/vendors/${vendorId}/contacts`,async route=>{writes++;entered();await held;try{await route.fulfill({status:201,contentType:"application/json",body:JSON.stringify({id:"44444444-4444-4444-8444-444444444444",version:2})});}catch{/* old scope may abort */}});
  await page.getByLabel("Contact name").fill("Old company contact");await page.getByRole("button",{name:"Add contact"}).click();await started;
  await page.route("**/api/procurement/v1/context",route=>route.fulfill({status:403,contentType:"application/json",body:JSON.stringify({message:"No access to selected company"})}));
  await page.evaluate(()=>{const key="erp.shell.state.v1",newValue=JSON.stringify({entityId:"88888888-8888-4888-8888-888888888888"});localStorage.setItem(key,newValue);window.dispatchEvent(new StorageEvent("storage",{key,newValue}));});
  await expect(page.getByRole("heading",{name:"Old Company Supplier"})).toHaveCount(0);
  release();await expect(page.getByRole("button",{name:"Add contact"})).toHaveCount(0);expect(writes).toBe(1);
});

test("vendor draft contact and address can be corrected and removed with a reason", async ({ page }) => {
  test.setTimeout(90_000);
  await mockErp(page);
  await page.goto("/procurement/workspace/vendors/new");
  await page.getByLabel("Company name").fill("Office Supplies Ltd");
  await page.getByLabel("Display name").fill("Office Supplies");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByLabel("Contact name").fill("Old person");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Old person" })).toBeVisible();
  await page.getByRole("listitem").filter({ hasText: "Old person" }).getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Contact name").fill("New person");
  await page.getByRole("button", { name: "Save contact" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "New person" })).toBeVisible();
  await page.getByLabel("Address line 1").fill("Old road");
  await page.getByRole("button", { name: "Add address" }).click();
  await page.getByText(/Billing: Old road/).locator("..").getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Address line 1").fill("New road");
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByText(/Billing: New road/)).toBeVisible();
  await page.getByRole("listitem").filter({ hasText: "New person" }).getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("button", { name: "Remove detail" })).toBeDisabled();
  await page.getByLabel("Why remove this detail?").fill("Wrong person");
  await page.getByRole("button", { name: "Remove detail" }).click();
  await expect(page.getByText("No contacts yet.")).toBeVisible();
  await page.getByText(/Billing: New road/).locator("..").getByRole("button", { name: "Remove" }).click();
  await page.getByLabel("Why remove this detail?").fill("Wrong address");
  await page.getByRole("button", { name: "Remove detail" }).click();
  await expect(page.getByText("No addresses yet.")).toBeVisible();
});

test("vendor draft qualification can be corrected and removed with a reason", async ({ page }) => {
  test.setTimeout(90_000);
  await mockErp(page);
  await page.goto("/procurement/workspace/vendors/new");
  await page.getByLabel("Company name").fill("Equipment Supplies Ltd");
  await page.getByLabel("Display name").fill("Equipment Supplies");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByLabel("Qualification type").fill("Insurance");
  await page.getByLabel("Issued by").fill("Insurer");
  await page.getByLabel("Reference number").fill("POL-1");
  await page.getByRole("button", { name: "Add qualification" }).click();
  await page.getByText(/Insurance · Insurer/).locator("..").getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Reference number").fill("POL-2");
  await page.getByRole("button", { name: "Save qualification" }).click();
  await page.reload();
  await page.getByText(/Insurance · Insurer/).locator("..").getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Reference number")).toHaveValue("POL-2");
  await page.getByText(/Insurance · Insurer/).locator("..").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("button", { name: "Remove detail" })).toBeDisabled();
  await page.getByLabel("Why remove this detail?").fill("Entered by mistake");
  await page.getByRole("button", { name: "Remove detail" }).click();
  await expect(page.getByText("No qualifications added yet.")).toBeVisible();
});

test("stale edit keeps entered values for comparison", async ({ page }) => {
  await mockErp(page, { staleUpdate: true });
  await page.goto("/procurement/workspace/vendors/new");
  await page.getByLabel("Company name").fill("Amizo Supplies Ltd");
  await page.getByLabel("Display name").fill("Amizo Supplies");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("link", { name: "Edit vendor" }).click();
  await page.getByLabel("Display name").fill("Unsaved change");
  await page.getByRole("button", { name: "Save vendor details", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("changed");
  await expect(page.getByLabel("Display name")).toHaveValue("Unsaved change");
});

test("vendor can be submitted for review after category and contact are saved", async ({ page }) => {
  test.setTimeout(90_000);
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
  await expect(page.getByRole("region", { name: "Vendor record", exact: true }).locator("header").getByText("Submitted", { exact: true })).toBeVisible();
  await expect(page.getByText("No — approval required")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Vendor record", exact: true }).locator("header").getByText("Submitted", { exact: true })).toBeVisible();
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
  await expect(page.getByRole("region", { name: "Vendor record", exact: true }).locator("header").getByText("Submitted", { exact: true })).toBeVisible();
  await expect(page.getByText("No — approval required")).toBeVisible();
});

test("reviewer can return a submitted vendor with a visible reason", async ({ page }) => {
  await mockErp(page, { reviewer: true });
  await page.goto("/procurement/workspace/vendors");
  await page.getByRole("combobox", { name: "Filter vendors by status" }).click();
  await page.getByRole("option", { name: "Submitted for review" }).click();
  await expect(page.getByRole("link", { name: /VEN-001\s+Acme/ })).toBeVisible();
  await page.getByRole("link", { name: /VEN-001\s+Acme/ }).click();
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
  await expect(page.getByText("No vendors match this search")).toBeVisible();
});

test("independent vendor approver sees the review but no create or edit actions", async ({ page }) => {
  await mockErp(page, { approveOnly: true });
  await page.goto("/procurement/workspace/vendors");
  await expect(page.getByRole("link", { name: "Add vendor" })).toHaveCount(0);
  await page.getByRole("link", { name: "Open" }).click();
  await expect(page.getByRole("button", { name: "Approve vendor" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit vendor" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send back for changes" })).toHaveCount(0);
});

test("reviewer must check duplicates before approving a vendor", async ({ page }) => {
  await mockErp(page, { reviewer: true });
  await page.goto(`/procurement/workspace/vendors/${vendorId}`);
  await expect(page.getByRole("button", { name: "Approve vendor" })).toBeDisabled();
  await page.getByLabel("Reason for your decision").fill("Registration and contact checked");
  await expect(page.getByRole("button", { name: "Approve vendor" })).toBeDisabled();
  await page.getByLabel("I checked for duplicate vendors").check();
  await page.getByRole("button", { name: "Approve vendor" }).click();
  await expect(page.getByRole("region", { name: "Vendor record", exact: true }).locator("header").getByText("Active", { exact: true })).toBeVisible();
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
  await expect(page.getByRole("region", { name: "Vendor record", exact: true }).locator("header").getByText("Suspended", { exact: true })).toBeVisible();
  await expect(page.getByText("No — on hold")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Place vendor on hold" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Return vendor to active" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Return to active" })).toBeDisabled();
  await page.getByLabel("How was the issue resolved?").fill("Insurance renewed and verified");
  await page.getByLabel("I checked the current vendor details and qualifications").check();
  await page.getByRole("button", { name: "Return to active" }).click();
  await expect(page.getByRole("region", { name: "Vendor record", exact: true }).locator("header").getByText("Active", { exact: true })).toBeVisible();
  await expect(page.getByText("Yes", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Return vendor to active" })).toHaveCount(0);
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


test("worker-less ERP administrator can review vendors without purchasing commands", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/procurement/") && request.method() !== "GET") writes.push(request.url()); });
  await mockErp(page, { adminViewOnly: true });
  await page.goto("/procurement/workspace/vendors");
  await expect(page.getByText("Administrator view")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /VEN-001\s+Acme/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Add vendor|New vendor/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Add vendor|New vendor/i })).toHaveCount(0);
  await page.getByRole("link", { name: /VEN-001\s+Acme/ }).click();
  await expect(page.getByRole("heading", { name: "Review vendor", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Approve vendor|Reject vendor|Save vendor/i })).toHaveCount(0);
  await page.goto("/procurement/workspace/vendors/new");
  await expect(page.getByRole("alert")).toContainText("do not have permission");
  await expect(page.getByRole("button", { name: /Save/i })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("administrator's historic vendor draft has no inline editing or submission actions", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/procurement/") && request.method() !== "GET") writes.push(request.url()); });
  await mockErp(page, { adminViewOnly: true, adminDraft: true });
  await page.goto(`/procurement/workspace/vendors/${vendorId}`);
  await expect(page.getByRole("heading", { name: "Acme", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit vendor" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Add contact|Add address|Add qualification|Submit for review|Withdraw draft|Remove/i })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Vendor record", exact: true }).locator("form")).toHaveCount(0);
  expect(writes).toEqual([]);
});
