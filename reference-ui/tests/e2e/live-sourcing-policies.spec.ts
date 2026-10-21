import { expect, test, type Page } from "@playwright/test";

// Contract fixtures only. Version1 represents future owner-readiness + immutable maker evidence, not current deployment.
const company = "11111111-1111-4111-8111-111111111111", otherCompany = "11111111-1111-4111-8111-222222222222";
const person = "22222222-2222-4222-8222-222222222222", policyId = "33333333-3333-4333-8333-333333333333";
const capabilities = Object.fromEntries(["vendorDraft","itemDraft","requestDraft","approvals","sourcing","contracts","orders","receiving","invoiceIntake","invoiceValidation","financeHandoff","supplierPortal","planningDraft","configurationDraft","contractDraft","sourcingDraft"].map(key => [key,key === "configurationDraft"]));
const definition = () => ({ schemaVersion: 1, policyKey: "SOURCING", transactionType: "SourcingPublication", action: "SourcingEvent.Publish",
  permission: "procurement-sourcing-publish", currencyCode: "ZMW", amountBasis: "ApprovedLineBase", rules: [{ code: "DEFAULT", priority: 0,
    when: { minimumAmountInclusive: null, maximumAmountExclusive: null, categoryCodes: [], purchaseTypes: [], branchIds: [] },
    result: { publication: { minimumQuoteCount: 0, minimumInvitedSuppliers: 0, requirementsPackRequired: false, evaluationCriteriaRequired: false, closingDateRequired: false },
      approvalStages: [{ code: "PUBLICATION", assignee: "ProcurementManager", mode: "All", principalIds: [person] }] } }] });
async function setup(page: Page, options: { saved?: boolean; unknown?: boolean; version?: boolean; loseCreate?: boolean; offPage?: boolean; unavailableSelected?: boolean } = {}) {
  const source = definition(); if (options.unknown) Object.assign(source.rules[0].result.publication, { extraControl: true });
  let record: Record<string, unknown> | null = options.saved ? { id: policyId, policyKey: "SOURCING", policyVersionNumber: 1,
    version: 1, state: "Draft", effectiveFrom: "2026-11-01T00:00:00Z", effectiveTo: null, createdAt: "2026-10-21T00:00:00Z", rulesJson: JSON.stringify(source) } : null;
  let writes = 0, validated = "";
  await page.addInitScript(entityId => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId })), company);
  await page.route("**/api/**", async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, roles: ["procurement_manager"], displayName: "Configuration user" } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo Power" }, { id: otherCompany, code: "OTHER", registeredName: "Other company" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    const selected = req.headers()["x-shell-entity"] || company;
    if (path === "/api/procurement/v1/context") return json({ tenantId: "fixture", legalEntityId: selected, workerId: person,
      permissions: ["procurement-access","procurement-configuration-read","procurement-configuration-edit","procurement-configuration-approve"],
      company: { id: selected, code: "FIXTURE", name: "Scoped fixture", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "fixture", legalEntityId: selected, schemaReady: true, capabilities });
    const base = "/api/procurement/v1/configuration/policies";
    if (path === `${base}/lookups/sourcing-reviewers`) {
      if (url.searchParams.get("search") === "offline") return json({ message: "Names unavailable" }, 503);
      const requested = url.searchParams.get("principalIds");
      const items = requested ? options.unavailableSelected ? [] : [{ principalId: person, displayName: options.offPage ? "Off-page named reviewer" : "Named reviewer", workerId: person }]
        : url.searchParams.get("search") || options.offPage ? [] : [{ principalId: person, displayName: "Named reviewer", workerId: person }];
      return json({ items, total: items.length, offset: 0, limit: 25, nextOffset: null, isAuthority: false, ...(options.version === false ? {} : { configurationVersion: 1 }) });
    }
    if (path === base && req.method() === "GET") return json({ items: selected === company && record ? [record] : [], total: selected === company && record ? 1 : 0, page: 1, pageSize: 100 });
    if (path === `${base}/validate`) { validated = req.postDataJSON().rulesJson; return json({ isValid: true, issues: [] }); }
    if (path === base && req.method() === "POST") {
      writes++; record = { ...req.postDataJSON(), id: policyId, policyVersionNumber: 1, version: 1, state: "Draft", createdAt: "2026-10-21T00:00:00Z" };
      return options.loseCreate ? route.abort("failed") : json(record, 201);
    }
    if (path === `${base}/${policyId}` && record) {
      if (req.method() === "GET") return json(record);
      if (req.method() === "PUT") { writes++; record = { ...record, ...req.postDataJSON().draft, version: 2 }; return json(record); }
    }
    return json({ message: "Unavailable fixture route" }, 404);
  });
  return { writes: () => writes, validated: () => validated };
}
async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
async function newSourcing(page: Page) {
  await page.getByRole("button", { name: "Add buying rule draft", exact: true }).first().click();
  await choose(page, "Use these rules for", "Sourcing publication rules");
}
async function explicitChoices(page: Page) {
  await choose(page, "Branch coverage", "All company branches");
  await page.getByLabel("Minimum quotes", { exact: true }).fill("0");
  await page.getByLabel("Minimum invited suppliers", { exact: true }).fill("0");
  for (const label of ["Requirements pack","Evaluation criteria","Closing date"]) await choose(page, label, "Not required");
  await choose(page, "Step 1 decision rule", "All eligible reviewers");
  await choose(page, "Step 1 named reviewers", "Named reviewer");
}

test("new sourcing requires explicit choices and saves zero/false controls without publication claims", async ({ page }) => {
  const state = await setup(page); await page.goto("/procurement/workspace/settings/buying-rules"); await newSourcing(page);
  await expect(page.getByLabel("Minimum quotes", { exact: true })).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Requirements pack", exact: true })).toHaveText("Choose a requirement");
  await explicitChoices(page); await page.getByRole("button", { name: "Check and save draft", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Sourcing publication rules", exact: true })).toBeVisible();
  expect(state.writes()).toBe(1);
  const rules = JSON.parse(state.validated()); expect(rules.rules[0].result.publication.requirementsPackRequired).toBe(false);
  expect(rules.rules[0].result.publication.minimumQuoteCount).toBe(0);
  expect(rules.rules[0].result.approvalStages[0].principalIds).toEqual([person]);
  await expect(page.getByText("Publishing rules configures policy; it does not publish a request for quotes.", { exact: false })).toBeVisible();
});

test("existing zero/false controls and reviewer IDs survive empty or failed name searches", async ({ page }) => {
  const state = await setup(page, { saved: true }); await page.goto("/procurement/workspace/settings/buying-rules");
  await page.getByRole("button", { name: "Edit draft", exact: true }).click();
  await expect(page.getByLabel("Minimum quotes", { exact: true })).toHaveValue("0");
  await expect(page.getByRole("combobox", { name: "Requirements pack", exact: true })).toHaveText("Not required");
  await page.getByLabel("Find step 1 named reviewers", { exact: true }).fill("no match");
  await expect(page.getByText("No matching names. Your selected reviewers are unchanged.")).toBeVisible();
  await page.getByLabel("Find step 1 named reviewers", { exact: true }).fill("offline");
  await expect(page.getByRole("alert").filter({ hasText: "Names unavailable" })).toBeVisible();
  await page.getByRole("button", { name: "Check and save draft", exact: true }).click();
  await expect.poll(state.writes).toBe(1);
  expect(JSON.parse(state.validated()).rules[0].result.approvalStages[0].principalIds).toEqual([person]);
});

test("unknown controls and old backend markers preserve sourcing as read-only", async ({ page }) => {
  const state = await setup(page, { saved: true, version: false }); await page.goto("/procurement/workspace/settings/buying-rules");
  await page.getByRole("button", { name: "View saved rules", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Saved rule definition", exact: true })).toHaveAttribute("readonly", "");
  await expect(page.getByRole("button", { name: "Send for review", exact: true })).toHaveCount(0);
  expect(state.writes()).toBe(0);
});

test("unsupported saved sourcing fields remain read-only despite a supported backend marker", async ({ page }) => {
  const state = await setup(page, { saved: true, unknown: true }); await page.goto("/procurement/workspace/settings/buying-rules");
  await page.getByRole("button", { name: "Edit draft", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Saved rule definition", exact: true })).toHaveValue(/extraControl/);
  await expect(page.getByRole("button", { name: "Check and save draft", exact: true })).toHaveCount(0); expect(state.writes()).toBe(0);
});

test("unconfirmed create cannot be repeated before explicit saved-list reconciliation", async ({ page }) => {
  const state = await setup(page, { loseCreate: true }); await page.goto("/procurement/workspace/settings/buying-rules"); await newSourcing(page);
  await explicitChoices(page); await page.getByRole("button", { name: "Check and save draft", exact: true }).click();
  await expect(page.getByRole("button", { name: "Refresh and check saved rules", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check and save draft", exact: true })).toBeDisabled(); expect(state.writes()).toBe(1);
  await page.getByRole("button", { name: "Refresh and check saved rules", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Sourcing publication rules", exact: true })).toBeVisible(); expect(state.writes()).toBe(1);
});

test("a late reviewer search cannot replace the current empty result", async ({ page }) => {
  await setup(page, { saved: true });
  let release = () => {}, seen = () => {}, completed = () => {};
  const pending = new Promise<void>(resolve => { seen = () => resolve(); });
  const barrier = new Promise<void>(resolve => { release = () => resolve(); });
  const finished = new Promise<void>(resolve => { completed = () => resolve(); });
  await page.route("**/configuration/policies/lookups/sourcing-reviewers?**", async route => {
    if (new URL(route.request().url()).searchParams.get("search") !== "slow") return route.fallback();
    seen(); await barrier;
    try { await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [{ principalId: company, displayName: "Stale reviewer", workerId: company }], total: 1, offset: 0, limit: 25, nextOffset: null, isAuthority: false, configurationVersion: 1 }) }); }
    finally { completed(); }
  });
  await page.goto("/procurement/workspace/settings/buying-rules");
  await page.getByRole("button", { name: "Edit draft", exact: true }).click();
  await page.getByLabel("Find step 1 named reviewers", { exact: true }).fill("slow"); await pending;
  await page.getByLabel("Find step 1 named reviewers", { exact: true }).fill("no match");
  await expect(page.getByText("No matching names. Your selected reviewers are unchanged.")).toBeVisible();
  release(); await finished;
  await expect(page.getByText("No matching names. Your selected reviewers are unchanged.")).toBeVisible();
  await page.getByRole("combobox", { name: "Step 1 named reviewers", exact: true }).click();
  await expect(page.getByRole("option", { name: "Stale reviewer", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Remove (Named reviewer|saved reviewer 1)/ })).toBeVisible();
});

test("a late company detail cannot reopen its editor after company context changes", async ({ page }) => {
  const state = await setup(page, { saved: true });
  let release = () => {}, seen = () => {}, completed = () => {};
  const pending = new Promise<void>(resolve => { seen = () => resolve(); });
  const barrier = new Promise<void>(resolve => { release = () => resolve(); });
  const finished = new Promise<void>(resolve => { completed = () => resolve(); });
  await page.route(`**/configuration/policies/${policyId}`, async route => {
    if (route.request().method() !== "GET") return route.fallback();
    seen(); await barrier;
    try { await route.fulfill({ contentType: "application/json", body: JSON.stringify({ id: policyId, policyKey: "SOURCING", policyVersionNumber: 1,
      version: 1, state: "Draft", effectiveFrom: "2026-11-01T00:00:00Z", effectiveTo: null, rulesJson: JSON.stringify(definition()) }) }); }
    finally { completed(); }
  });
  await page.goto("/procurement/workspace/settings/buying-rules");
  await page.getByRole("button", { name: "Edit draft", exact: true }).click(); await pending;
  await page.evaluate(entityId => {
    const key = "erp.shell.state.v1", value = JSON.stringify({ entityId });
    localStorage.setItem(key, value); window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }));
  }, otherCompany);
  await expect(page.getByText("No buying rules yet", { exact: true })).toBeVisible();
  release(); await finished;
  await expect(page.getByRole("heading", { name: "Edit sourcing draft", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check and save draft", exact: true })).toHaveCount(0);
  expect(state.writes()).toBe(0);
});


test("saved off-page reviewer names resolve without enumerating all people", async ({ page }) => {
  const state = await setup(page, { saved: true, offPage: true });
  const peopleQueries: URL[] = [];
  page.on("request", request => { if (request.url().includes("/lookups/sourcing-reviewers")) peopleQueries.push(new URL(request.url())); });
  await page.goto("/procurement/workspace/settings/buying-rules");
  await page.getByRole("button", { name: "Edit draft", exact: true }).click();
  await expect(page.getByText("Off-page named reviewer", { exact: true })).toBeVisible();
  expect(peopleQueries.some(url => url.searchParams.get("principalIds") === person)).toBe(true);
  expect(peopleQueries.every(url => url.searchParams.get("offset") === "0")).toBe(true);
  await page.getByRole("button", { name: "Check and save draft", exact: true }).click();
  await expect.poll(state.writes).toBe(1);
  expect(JSON.parse(state.validated()).rules[0].result.approvalStages[0].principalIds).toEqual([person]);
});

test("unavailable saved reviewer labels stay read-only and do not silently remove the original selection", async ({ page }) => {
  const state = await setup(page, { saved: true, unavailableSelected: true });
  await page.goto("/procurement/workspace/settings/buying-rules");
  const names = page.waitForResponse(response => new URL(response.url()).searchParams.has("principalIds"));
  await page.getByRole("button", { name: "Edit draft", exact: true }).click(); await names;
  await expect(page.getByText("Loading saved reviewer name…", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Reviewer name unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /principal|worker id|reviewer id/i })).toHaveCount(0);
  await page.getByRole("button", { name: "Check and save draft", exact: true }).click();
  await expect.poll(state.writes).toBe(1);
  expect(JSON.parse(state.validated()).rules[0].result.approvalStages[0].principalIds).toEqual([person]);
  // The fixture accepts the original selection only to inspect the unchanged payload; real ERP revalidates eligibility.
});

test("late saved reviewer labels cannot appear in another company", async ({ page }) => {
  await setup(page, { saved: true });
  let release = () => {}, seen = () => {}, completed = () => {};
  const pending = new Promise<void>(resolve => { seen = () => resolve(); });
  const barrier = new Promise<void>(resolve => { release = () => resolve(); });
  const finished = new Promise<void>(resolve => { completed = () => resolve(); });
  await page.route("**/configuration/policies/lookups/sourcing-reviewers?**", async route => {
    if (!new URL(route.request().url()).searchParams.has("principalIds")) return route.fallback();
    seen(); await barrier;
    try { await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [{ principalId: person, displayName: "Previous company person", workerId: person }], total: 1, offset: 0, limit: 25, nextOffset: null, isAuthority: false, configurationVersion: 1 }) }); }
    finally { completed(); }
  });
  await page.goto("/procurement/workspace/settings/buying-rules");
  await page.getByRole("button", { name: "Edit draft", exact: true }).click(); await pending;
  await page.evaluate(entityId => {
    const key = "erp.shell.state.v1", value = JSON.stringify({ entityId });
    localStorage.setItem(key, value); window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }));
  }, otherCompany);
  await expect(page.getByText("No buying rules yet", { exact: true })).toBeVisible();
  release(); await finished;
  await expect(page.getByText("Previous company person", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check and save draft", exact: true })).toHaveCount(0);
});
