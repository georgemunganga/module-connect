// INERT PREPARATION. Root must admit a NEW pristine UI clone and approve execution.
import { test, expect, type BrowserContext, type Page, type Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { nativeInput, digest, productCommit } from "./input";
const input = nativeInput("fresh"), fixture = input.fixture;
const headers = { "X-Shell-Entity": fixture.companyId, "X-Shell-Location": fixture.branchId };
const base = `/api/procurement/v1/sourcing/${fixture.eventId}/round-plan`;
const need = (x: unknown, code: string) => { if (!x) throw Object.assign(new Error(code), { safeCode: code }); };
async function choose(root: Page | Locator, label: string, option: string, index = 0) { await root.getByRole("combobox", { name: label, exact: true }).nth(index).click(); await root.getByRole("option", { name: option, exact: true }).click(); }

test("actual workerless B creates and C revises/cancels in the existing RFQ UI", async ({ browser }) => {
  need(test.info().project.use.trace === "off" && test.info().project.use.screenshot === "off" && test.info().project.use.video === "off", "CredentialCaptureForbidden");
  const evidence: any = { schemaVersion: 1, status: "RUNNING_NOT_ACCEPTANCE", uiSourceCommit: productCommit, backendSourceCommit: input.backendSourceCommit,
    testSourceSha256: digest(readFileSync(new URL(import.meta.url))), fixtureSha256: input.fixtureSha256, runtimeSha256: input.runtimeSha256, proxySha256: input.proxySha256, manifestSha256: input.manifestSha256,
    normalCoreCookies: true, businessResponseSubstitutions: false, injectedIdentityAliases: false, productionTouched: false, authenticationCommands: [], startedCommands: [], commands: [], unexpectedBusinessWrites: 0,
    pageErrors: 0, nativeOwnerReconciliationRequired: true, nativeBusinessAcceptanceClaimed: false, preparedClientRecovery: false, unknownResponseInduced: false };
  let active: BrowserContext | null = null, activeActor: number | null = null, failed = false;
  const budget = new Map<string, number>(), pending = new Map<string, { slot: string; raw: string }>();
  const marker = `B1-UI-${randomUUID()}`;
  async function get(context: BrowserContext, path: string) { const r = await context.request.get(path, { headers }); need(r.status() === 200, "OwningReadFailed"); return r.json(); }
  async function login(index: number) {
    evidence.step = `actor-${index}-normal-login`;
    const context = await browser.newContext({ baseURL: input.origin, ignoreHTTPSErrors: true, timezoneId: "UTC" }); active = context; activeActor = index;
    const user = fixture.users[index]; const login = await context.request.post("/api/hrm/auth/login", { data: { email: user.email, password: user.password }, failOnStatusCode: false });
    evidence.authenticationCommands.push({ actorIndex: index, action: "Login", status: login.status() }); need(login.status() === 200, "NormalLoginFailed");
    const me = await get(context, "/api/hrm/auth/me"), scope = await get(context, "/api/procurement/v1/context"), meta = await get(context, "/api/procurement/v1/meta");
    need(me.user?.id === user.id && scope.principalId === user.id && scope.workerId === null && scope.tenantId === fixture.tenantId && scope.legalEntityId === fixture.companyId
      && ["procurement-round-plan-read", "procurement-round-plan-manage", "procurement-round-plan-cancel"].every(p => scope.permissions?.includes(p))
      && meta.capabilities?.roundPlanRead === true && meta.capabilities?.roundPlanRecord === true, "CurrentWorkerlessScopeOrCapabilitiesInvalid");
    await context.addInitScript(({ entityId, branch, origin }) => { if (location.origin !== origin) return; if (localStorage.getItem("erp.shell.state.v1") === null) localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId, branch })); }, { entityId: fixture.companyId, branch: fixture.branchId, origin: input.origin });
    const page = await context.newPage(); page.on("pageerror", () => evidence.pageErrors++);
    await context.route("**/api/**", async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (Object.keys(request.headers()).some(k => k.startsWith("x-private-") || k.startsWith("x-test-") || ["x-crud-actor", "x-crud-browser-actor"].includes(k))) { evidence.identityAliasAttempted = true; await route.abort("blockedbyclient"); return; }
      if (!["GET", "HEAD"].includes(request.method())) {
        if (request.method() !== "POST" || budget.get(path) !== 1) { evidence.unexpectedBusinessWrites++; await route.abort("blockedbyclient"); return; }
        budget.set(path, 0); const originalKey = request.headers()["idempotency-key"];
        evidence.startedCommands.push({ actorIndex: index, path, originalKey });
        const saved = await page.evaluate(key => Object.keys(sessionStorage).filter(k => k.startsWith("erp.procurement.round-plan-command.v1:")).map(slot => ({ slot, raw: sessionStorage.getItem(slot)! })).find(x => { try { return JSON.parse(x.raw).locator?.key === key; } catch { return false; } }), originalKey);
        if (!saved) { evidence.originalJournalAdmissionFailed = true; await route.abort("blockedbyclient"); return; }
        pending.set(originalKey, saved);
      }
      await route.continue(); // No header changes, response fulfillment, fault injection or substitutions.
    });
    return { context, page };
  }
  async function logout() {
    if (!active) return; const context = active; active = null;
    try { const r = await context.request.post("/api/hrm/auth/logout", { failOnStatusCode: false }); evidence.authenticationCommands.push({ actorIndex: activeActor, action: "Logout", status: r.status() }); need([200, 204].includes(r.status()), "NormalLogoutFailed"); }
    finally { await context.close(); activeActor = null; }
  }
  async function command(page: Page, operation: "Create" | "Revise" | "Cancel", index: number, click: () => Promise<unknown>) {
    evidence.step = `actor-${index}-${operation}-command`;
    const path = base + (operation === "Create" ? "" : `/${operation.toLowerCase()}`); budget.set(path, 1);
    const responsePromise = page.waitForResponse(r => new URL(r.url()).pathname === path && r.request().method() === "POST");
    await click(); const response = await responsePromise, key = response.request().headers()["idempotency-key"], bytes = await response.body(), body = await response.json();
    evidence.commands.push({ actorIndex: index, operation, originalKey: key, status: response.status(), responseSha256: digest(bytes), revisionId: body.revisionId, version: body.version });
    need(response.status() === (operation === "Create" ? 201 : 200) && body.commandKey === key && body.eventId === fixture.eventId && body.operation === operation && body.reviewAvailable === false && body.publicationAvailable === false, "OwningCommandNotConfirmed");
    return { body, key, responseSha256: digest(bytes) };
  }
  async function versionUi(page: Page, n: number) {
    evidence.step = `history-open-version-${n}`; await page.getByRole("tab", { name: "History", exact: true }).click(); await page.getByRole("button", { name: `Open version ${n}`, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: `Saved evaluation plan version ${n}`, exact: true }); await expect(dialog).toBeVisible();
    for (const name of ["Revise evaluation plan", "Cancel evaluation plan", "Save proposed plan"]) await expect(dialog.getByRole("button", { name, exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close dialog", exact: true }).click(); await page.getByRole("tab", { name: "Overview", exact: true }).click();
  }
  try {
    let { context, page } = await login(0);
    evidence.step = "B-fresh-source-admission";
    const before = await get(context, base);
    need(before.enrolled === false && before.plan === null && before.source?.status === "Draft" && before.source.version === fixture.originalEventVersion && before.allowedActions?.includes("Create") && before.source.lines?.length > 0, "FreshUntouchedSourceRequired");
    await page.goto("/procurement/workspace/rfqs?source=round-plan"); await page.getByRole("tab", { name: "RFQs ready for planning", exact: true }).click();
    await page.getByRole("link").filter({ hasText: before.source.number }).first().click(); await expect(page.getByRole("heading", { name: before.source.title, exact: true })).toBeVisible();
    evidence.step = "B-open-original-items"; await page.getByRole("tab", { name: `Items (${before.source.lines.length})`, exact: true }).click(); await expect(page.getByRole("cell", { name: before.source.lines[0].description, exact: true })).toBeVisible(); await page.getByRole("tab", { name: "Overview", exact: true }).click();
    evidence.step = "B-discover-actual-colleague-label";
    let colleagueName = fixture.users[1].displayName, peopleCursor: string | null = null;
    for (let pageNumber = 0; !colleagueName && pageNumber < 20; pageNumber++) {
      const actualPeople = await get(context, base + `/people?limit=25&q=${peopleCursor ? `&after=${peopleCursor}` : ""}`);
      const actualColleague = actualPeople.items?.find((person: any) => person.principalId === fixture.users[1].id);
      if (actualColleague) colleagueName = actualColleague.displayName;
      peopleCursor = actualPeople.nextCursor; evidence.peopleDiscoveryPages = pageNumber + 1;
      if (!peopleCursor) break;
    }
    need(typeof colleagueName === "string" && colleagueName.trim().length >= 2, "CurrentColleagueLabelUnavailable");
    evidence.colleagueLabelSha256 = digest(colleagueName!);
    await page.getByRole("button", { name: "Set up evaluation plan", exact: true }).click(); let dialog = page.getByRole("dialog", { name: "Set up an evaluation plan", exact: true });
    await dialog.getByRole("textbox", { name: "Requirements", exact: true }).fill(marker); await dialog.getByRole("textbox", { name: "Proposed policy reference", exact: true }).fill("UI native proposal only");
    await dialog.getByRole("textbox", { name: "Proposed disclosure terms", exact: true }).fill("Proposal for internal review; no supplier release"); await dialog.getByRole("textbox", { name: "Proposed document requirements", exact: true }).fill("Proposed supporting-file checklist");
    await dialog.getByLabel("Opening time", { exact: true }).fill("2026-12-01T09:30:12.345"); await dialog.getByLabel("Closing time", { exact: true }).fill("2026-12-02T09:30:12.345");
    await dialog.getByRole("button", { name: "Add criterion", exact: true }).click(); await dialog.getByRole("textbox", { name: "Criterion 1 code", exact: true }).fill("DOC");
    await dialog.getByRole("button", { name: "Add criterion", exact: true }).click(); await dialog.getByRole("textbox", { name: "Criterion 2 code", exact: true }).fill("TECH"); await choose(page, "Stage", "Technical", 1); await choose(page, "Assessment", "Weighted score", 1);
    await dialog.getByRole("textbox", { name: "Proposed weight", exact: true }).fill("12.3456"); await dialog.getByRole("textbox", { name: "Proposed minimum score", exact: true }).fill("0.0001"); await dialog.getByRole("textbox", { name: "Proposed maximum score", exact: true }).fill("10.0001");
    await dialog.getByRole("textbox", { name: "Find a colleague", exact: true }).fill(colleagueName!);
    const candidate = dialog.getByRole("row").filter({ hasText: colleagueName! }); await candidate.getByRole("button", { name: "Add colleague", exact: true }).click();
    const created = await command(page, "Create", 0, () => dialog.getByRole("button", { name: "Save proposed plan", exact: true }).click()); await expect(dialog).toHaveCount(0);
    evidence.step = "B-reload-created-plan"; await page.reload(); const v1 = await get(context, base + "/versions/1");
    need(v1.plan?.version === 1 && v1.revision?.version === 1 && v1.content?.requirements === marker && v1.content.criteria?.length === 2 && v1.content.criteria[1].weight === "12.3456" && v1.content.participants?.[0]?.principalId === fixture.users[1].id && v1.allowedActions?.length === 0, "CreatedSnapshotOrLatestHistoricalActionsInvalid");
    evidence.createdContentSha256 = digest(JSON.stringify(v1.content)); await versionUi(page, 1);
    need(input.preparedClientRecoveryApproved, "PreparedRecoveryNeedsRootAdmission");
    evidence.step = "B-prepared-client-recovery-fixture"; const saved = pending.get(created.key); need(saved, "OriginalClientLocatorNotObserved");
    await page.evaluate(value => sessionStorage.setItem(value.slot, value.raw), saved!); evidence.preparedClientRecovery = true; evidence.preparedJournalSha256 = digest(saved!.raw);
    await page.reload(); const recoveredPromise = page.waitForResponse(r => new URL(r.url()).pathname === base + `/commands/${created.key}` && r.request().method() === "GET");
    await page.getByRole("button", { name: "Check saved result", exact: true }).click(); const recovered = await recoveredPromise;
    need(recovered.status() === 201 && digest(await recovered.body()) === created.responseSha256, "OriginalCreateRecovery201Mismatch"); await expect(page.getByRole("button", { name: "Check saved result", exact: true })).toHaveCount(0); evidence.originalCreateRecoveryStatus = recovered.status();
    evidence.step = "B-All-read-active-draft";
    const allRead = page.waitForResponse(r => new URL(r.url()).pathname === base && r.request().method() === "GET" && r.request().headers()["x-shell-branch-scope"] === "all");
    await page.getByRole("button", { name: "Organisation context", exact: true }).click(); await page.getByRole("button", { name: "All permitted branches", exact: true }).click();
    const allResponse = await allRead, allBody = await allResponse.json();
    need(allResponse.status() === 200 && allBody.plan?.version === 1 && allBody.plan?.status === "Draft" && allBody.allowedActions?.length === 0, "ActiveDraftAllReadInvalid");
    for (const name of ["Revise evaluation plan", "Cancel evaluation plan"]) await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    await versionUi(page, 1); evidence.activeDraftAllReadVerified = true; evidence.activeDraftAllResponseSha256 = digest(await allResponse.body());
    await logout(); ({ context, page } = await login(1)); evidence.step = "C-open-created-plan";
    await page.goto(`/procurement/workspace/rfqs/${fixture.eventId}?source=round-plan`); await page.getByRole("button", { name: "Revise evaluation plan", exact: true }).click(); dialog = page.getByRole("dialog", { name: "Revise evaluation plan", exact: true });
    await expect(dialog.getByRole("textbox", { name: "Requirements", exact: true })).toHaveValue(marker); await expect(dialog.getByRole("textbox", { name: "Proposed weight", exact: true })).toHaveValue("12.3456");
    await dialog.getByRole("button", { name: "Remove criterion 1", exact: true }).click(); await dialog.getByRole("textbox", { name: "Proposed weight", exact: true }).fill("15.1234");
    await command(page, "Revise", 1, () => dialog.getByRole("button", { name: "Save proposed plan", exact: true }).click()); await expect(dialog).toHaveCount(0); await page.reload();
    const v2 = await get(context, base + "/versions/2");
    need(v2.revision?.actorPrincipalId === fixture.users[1].id && v2.content.criteria?.length === 1 && v2.content.criteria[0].logicalId === v1.content.criteria[1].logicalId && v2.content.criteria[0].weight === "15.1234"
      && JSON.stringify(v2.content.participants) === JSON.stringify(v1.content.participants) && v2.content.requirements === v1.content.requirements && v2.content.opensAt === v1.content.opensAt && v2.content.closesAt === v1.content.closesAt && v2.allowedActions?.length === 0, "FullRevisionOrLogicalIdentityInvalid");
    evidence.revisedContentSha256 = digest(JSON.stringify(v2.content)); evidence.droppedCriterionCount = 1; await versionUi(page, 1); await versionUi(page, 2);
    evidence.step = "C-cancel-required-reason"; await page.getByRole("button", { name: "Cancel evaluation plan", exact: true }).click(); dialog = page.getByRole("dialog", { name: "Cancel evaluation plan", exact: true });
    await expect(dialog.getByRole("button", { name: "Cancel evaluation plan", exact: true })).toBeDisabled(); await dialog.getByRole("textbox", { name: "Plan cancellation reason", exact: true }).fill("Native UI planning proposal withdrawn");
    await command(page, "Cancel", 1, () => dialog.getByRole("button", { name: "Cancel evaluation plan", exact: true }).click()); await expect(dialog).toHaveCount(0); await page.reload();
    const current = await get(context, base); need(current.plan?.status === "Cancelled" && current.plan.version === 3 && current.source?.status === "Draft" && current.source.version === fixture.originalEventVersion && current.allowedActions?.length === 0
      && JSON.stringify(current.content) === JSON.stringify(v2.content) && new Set([v1.revision.id, v2.revision.id, current.revision.id]).size === 3, "CancellationRetentionOrSourceStateInvalid");
    evidence.cancelledContentSha256 = digest(JSON.stringify(current.content)); await versionUi(page, 3);
    for (const name of ["Set up evaluation plan", "Revise evaluation plan", "Cancel evaluation plan"]) await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    evidence.step = "C-retained-All-read"; await page.getByRole("button", { name: "Organisation context", exact: true }).click(); await page.getByRole("button", { name: "All permitted branches", exact: true }).click(); await page.reload(); await versionUi(page, 1); await versionUi(page, 3);
    need(evidence.startedCommands.length === 3 && evidence.commands.length === 3 && new Set(evidence.commands.map((c: any) => c.originalKey)).size === 3 && evidence.unexpectedBusinessWrites === 0 && !evidence.identityAliasAttempted && evidence.pageErrors === 0, "CommandBudgetOrBrowserErrorsInvalid");
    evidence.status = "PASS_NATIVE_UI_THREE_COMMANDS_AWAIT_OWNER_RECONCILIATION"; evidence.step = "completed";
  } catch (error) { const e = error as Error & { safeCode?: string }; failed = true; evidence.status = "FAILED_NOT_ACCEPTANCE"; evidence.failure = { step: evidence.step, code: e.safeCode ?? (/strict mode violation/.test(e.message) ? "StrictLocator" : /Timeout/.test(e.message) ? "LocatorTimeout" : "HarnessAssertion"), messageSha256: digest(String(e.message)) }; }
  finally { try { await logout(); } catch { failed = true; evidence.status = "FAILED_NOT_ACCEPTANCE"; evidence.logoutFailed = true; } writeFileSync(input.output, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600, flag: "wx" }); }
  need(!failed, "NativeFreshJourneyFailedInspectProtectedReceipt");
});
