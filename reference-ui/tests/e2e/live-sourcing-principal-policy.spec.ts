import { expect, test, type Page } from "@playwright/test";

// Browser transport contract only. The real Core/PostgreSQL publication proof is separate.
const company = "11111111-1111-4111-8111-111111111111";
const author = "22222222-2222-4222-8222-222222222222";
const reviewer = "33333333-3333-4333-8333-333333333333";
const policyId = "44444444-4444-4444-8444-444444444444";
const base = "/api/procurement/v1/configuration/policies";
const settings = "/procurement/workspace/settings/modules/request-for-quotes/approvals";
type Saved = { id: string; policyKey: string; policyVersionNumber: number; state: string;
  version: number; rulesJson: string; effectiveFrom: string; effectiveTo: string | null; createdAt: string };
async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
async function mock(page: Page, options: { loseCreate?: boolean } = {}) {
  let actor: "author" | "reviewer" = "author";
  let saved: Saved | null = null;
  const writes: Array<{ method: string; path: string; body: Record<string, unknown>; actor: string }> = [];
  await page.addInitScript(id => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: id })), company);
  await page.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { id: actor === "author" ? author : reviewer,
      isActive: true, displayName: actor === "author" ? "Policy author" : "Independent reviewer", roles: ["procurement_admin"] } });
    if (path === "/api/core/v1/workspace-context") return json({ schemaVersion: 1, tenantId: "test", principalId: actor === "author" ? author : reviewer,
      organisationWide: true, companies: [{ id: company, code: "TEST", registeredName: "Company", currency: "ZMW", isDefault: true }], branches: [] });
    if (path === "/api/hrm/branding") return json({ displayName: "Company" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "TEST", registeredName: "Company" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ principalId: actor === "author" ? author : reviewer,
      tenantId: "test", legalEntityId: company, workerId: null,
      permissions: ["procurement-access", "procurement-configuration-read",
        actor === "author" ? "procurement-configuration-edit" : "procurement-configuration-approve"],
      company: { id: company, code: "TEST", name: "Company", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "test", legalEntityId: company, schemaReady: true,
      capabilities: { vendorDraft: false, itemDraft: false, requestDraft: false, approvals: false, sourcing: false,
        contracts: false, orders: false, receiving: false, invoiceValidation: false, financeHandoff: false,
        supplierPortal: false, planningDraft: false, configurationDraft: true, contractDraft: false,
        sourcingDraft: false } });
    if (path === `${base}/lookups/sourcing-reviewers`) return json({ items: [{ principalId: reviewer,
      displayName: "Independent reviewer", workerId: null }], total: 1, offset: 0, limit: 25,
      nextOffset: null, isAuthority: false, configurationVersion: 1, supportedSourcingRuleSchemas: [1, 2] });
    if (path === base && method === "GET") return json({ items: saved ? [{ ...saved, rulesJson: undefined }] : [], total: saved ? 1 : 0,
      page: 1, pageSize: 100 });
    if (path === `${base}/${policyId}` && method === "GET") return saved ? json(saved) : json({}, 404);
    if (path === `${base}/validate`) {
      const input = request.postDataJSON() as { rulesJson: string };
      const rules = JSON.parse(input.rulesJson) as { schemaVersion: number; rules: Array<{ result: { audience?: Record<string, unknown> } }> };
      const audience = rules.rules[0].result.audience;
      const complete = rules.schemaVersion === 2 && !!audience && Object.values(audience).every(value => value !== null);
      return json({ isValid: true, issues: [], reviewConfigurationComplete: complete,
        reviewIssues: complete ? [] : [{ path: "$.rules[0].result.audience", message: "Complete supplier audience" }],
        supportedSourcingRuleSchemas: [1, 2], canPublish: false, isAuthority: false });
    }
    if (path.startsWith(base) && method !== "GET") {
      const body = request.postDataJSON() as Record<string, unknown>;
      writes.push({ method, path, body, actor });
      if (path === base && method === "POST") {
        if (actor !== "author") return json({}, 403);
        const draft = body as { policyKey: string; rulesJson: string; effectiveFrom: string; effectiveTo: string | null };
        saved = { ...draft, id: policyId, policyVersionNumber: 1, state: "Draft", version: 1,
          createdAt: "2026-10-23T00:00:00.000Z" };
        if (options.loseCreate) return route.abort("failed");
        return json(saved, 201);
      }
      if (!saved) return json({}, 404);
      if (path === `${base}/${policyId}` && method === "PUT") {
        if (actor !== "author" || body.version !== saved.version) return json({}, 409);
        saved = { ...saved, ...(body.draft as object), version: saved.version + 1 };
        return json(saved);
      }
      if (path === `${base}/${policyId}/submit-review`) {
        if (actor !== "author" || body.version !== saved.version) return json({}, 409);
        saved = { ...saved, state: "PendingReview", version: saved.version + 1 };
        return json(saved);
      }
      if (path === `${base}/${policyId}/publish`) {
        if (actor !== "reviewer" || body.version !== saved.version) return json({}, 403);
        saved = { ...saved, state: "Published", version: saved.version + 1 };
        return json(saved);
      }
    }
    return json({ code: "unexpected" }, 404);
  });
  return { writes, reviewer: () => { actor = "reviewer"; }, saved: () => saved };
}

test("Core-only author explicitly configures schema-2 audience, revises Draft and an independent person publishes", async ({ page }) => {
  const fixture = await mock(page);
  await page.goto(settings);
  await page.getByRole("button", { name: "Add draft" }).click();
  await expect(page.getByText("Schema 2.", { exact: false })).toBeVisible();
  await page.getByLabel("Rule code").fill("RFQ_ALL");
  await page.getByLabel("Priority").fill("1");
  await choose(page, "Branches", "All company branches");
  await page.getByLabel("Minimum quotes").fill("1");
  await page.getByLabel("Minimum invited suppliers").fill("1");
  await choose(page, "Requirements document required", "No");
  await choose(page, "Evaluation criteria required", "No");
  await choose(page, "Closing date required", "No");
  await page.getByLabel("Step code").fill("REVIEW");
  await choose(page, "Decision rule", "One reviewer");
  await choose(page, "Step 1 reviewers", "Independent reviewer");
  await choose(page, "Supplier lifecycle", "Recorded active approval");
  await choose(page, "Category coverage", "Do not require category coverage");
  await choose(page, "Qualification types", "No types required");
  await choose(page, "Qualification document check", "Not required");
  await choose(page, "Validity point", "When the shortlist is prepared");
  await choose(page, "Permit qualifications without expiry", "No");
  await choose(page, "Permit suppliers without validity end", "No");
  await choose(page, "Supplier contact choice", "One selected active contact");
  await choose(page, "Required contact fields", "Email");
  await page.getByRole("button", { name: "Save draft" }).click();
  const first = fixture.writes.find(write => write.method === "POST" && write.path === base)!;
  const rules = JSON.parse((first.body as { rulesJson: string }).rulesJson);
  expect(rules.schemaVersion).toBe(2);
  expect(rules.rules[0].result.approvalStages[0].principalIds).toEqual([reviewer]);
  expect(rules.rules[0].result.audience).toMatchObject({ supplierLifecycle: "RecordedActiveDecision",
    qualificationTypes: [], allowNoQualificationExpiry: false, contactRequiredFields: ["Email"] });
  await page.getByRole("button", { name: "Edit draft" }).click();
  await page.getByLabel("Minimum quotes").fill("2");
  await page.getByRole("button", { name: "Save draft" }).click();
  expect(fixture.writes.filter(write => write.method === "PUT")).toHaveLength(1);
  await page.getByRole("button", { name: "Send for review" }).click();
  await page.getByLabel("Reason").fill("Request independent review");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("PendingReview")).toBeVisible();
  fixture.reviewer(); await page.reload();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByLabel("Reason").fill("Reviewed supplier controls");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  expect(fixture.writes.find(write => write.path.endsWith("/publish"))?.actor).toBe("reviewer");
  expect(fixture.saved()?.state).toBe("Published");
});

test("lost schema-2 create response blocks a second policy version even after reload", async ({ page }) => {
  const fixture = await mock(page, { loseCreate: true });
  await page.goto(settings);
  await page.getByRole("button", { name: "Add draft" }).click();
  await page.getByLabel("Rule code").fill("RFQ_ALL");
  await page.getByLabel("Priority").fill("1");
  await choose(page, "Branches", "All company branches");
  await page.getByLabel("Minimum quotes").fill("1");
  await page.getByLabel("Minimum invited suppliers").fill("1");
  await choose(page, "Requirements document required", "No");
  await choose(page, "Evaluation criteria required", "No");
  await choose(page, "Closing date required", "No");
  await page.getByLabel("Step code").fill("REVIEW");
  await choose(page, "Decision rule", "One reviewer");
  await choose(page, "Step 1 reviewers", "Independent reviewer");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("A sourcing change has no confirmed result", { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Add draft" })).toBeDisabled();
  expect(fixture.writes.filter(write => write.method === "POST" && write.path === base)).toHaveLength(1);
});
