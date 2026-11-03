// INERT until Root reviews the original v1 owner, new fixed UI bytes and exact private runtime.
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { closeSync, fsyncSync, openSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { continuationInput } from "./continuation-input";
import { digest, productCommit } from "./input";
const input = continuationInput(), fixture = input.fixture;
const selected = { "X-Shell-Entity": fixture.companyId, "X-Shell-Location": fixture.branchId };
const base = `/api/procurement/v1/sourcing/${fixture.eventId}/round-plan`;
const need = (x: unknown, code: string) => { if (!x) throw Object.assign(new Error(code), { safeCode: code }); };
function persist(filename: string, value: unknown) {
  const fd = openSync(filename, "wx", 0o600); try { writeFileSync(fd, JSON.stringify(value, null, 2) + "\n"); fsyncSync(fd); } finally { closeSync(fd); }
  const directory = openSync(path.dirname(filename), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
}
test("continue proved v1: B verifies All/history/receipt then C revises and cancels with no Create", async ({ browser }) => {
  need(test.info().project.use.trace === "off" && test.info().project.use.screenshot === "off" && test.info().project.use.video === "off", "CredentialCaptureForbidden");
  const evidence: any = { schemaVersion: 1, status: "RUNNING_NOT_ACCEPTANCE", purpose: "CONTINUE_EXISTING_PROVED_V1_NO_CREATE", uiSourceCommit: productCommit, backendSourceCommit: input.backendSourceCommit,
    testSourceSha256: digest(readFileSync(new URL(import.meta.url))), fixtureSha256: input.fixtureSha256, runtimeSha256: input.runtimeSha256, proxySha256: input.proxySha256, manifestSha256: input.manifestSha256,
    originalOwnerProofSha256: input.ownerProofSha256, priorUiSha256: input.priorUiSha256, beforeNativeSha256: input.originalNativeSha256,
    originalCreate: input.originalCreate, normalCoreCookies: true, businessResponseSubstitutions: false, injectedIdentityAliases: false, productionTouched: false,
    authenticationCommands: [], startedCommands: [], commands: [], pageErrors: 0, pageErrorDigests: [], unexpectedBusinessWrites: 0, nativeOwnerReconciliationRequired: true };
  let active: BrowserContext | null = null, actorIndex: number | null = null, failed = false, v1: any;
  const budget = new Map<string, { operation: "Revise" | "Cancel"; expectedVersion: number }>();
  async function get(context: BrowserContext, pathname: string) { const r = await context.request.get(pathname, { headers: selected }); need(r.status() === 200, "OwningReadFailed"); return r.json(); }
  async function login(index: number) {
    evidence.step = `actor-${index}-normal-login`; const actor = fixture.users[index];
    const context = await browser.newContext({ baseURL: input.origin, ignoreHTTPSErrors: true, timezoneId: "UTC" }); active = context; actorIndex = index;
    const r = await context.request.post("/api/hrm/auth/login", { data: { email: actor.email, password: actor.password }, failOnStatusCode: false });
    evidence.authenticationCommands.push({ actorIndex: index, action: "Login", status: r.status() }); need(r.status() === 200, "NormalLoginFailed");
    const me = await get(context, "/api/hrm/auth/me"), scope = await get(context, "/api/procurement/v1/context"), meta = await get(context, "/api/procurement/v1/meta");
    need(me.user?.id === actor.id && scope.principalId === actor.id && scope.workerId === null && scope.tenantId === fixture.tenantId && scope.legalEntityId === fixture.companyId
      && ["procurement-round-plan-read", "procurement-round-plan-manage", "procurement-round-plan-cancel"].every(p => scope.permissions?.includes(p))
      && meta.capabilities?.roundPlanRead === true && meta.capabilities?.roundPlanRecord === true, "CurrentWorkerlessAuthorityUnavailable");
    await context.addInitScript(({ company, branch, origin }) => { if (location.origin !== origin) return; if (localStorage.getItem("erp.shell.state.v1") === null) localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: company, branch })); }, { company: fixture.companyId, branch: fixture.branchId, origin: input.origin });
    const page = await context.newPage(); page.on("pageerror", error => { evidence.pageErrors++; evidence.pageErrorDigests.push({ step: evidence.step, name: error.name, messageSha256: digest(error.message), stackSha256: digest(error.stack ?? "") }); });
    await context.route("**/api/**", async route => {
      const request = route.request(), pathname = new URL(request.url()).pathname;
      if (Object.keys(request.headers()).some(k => k.startsWith("x-private-") || k.startsWith("x-test-") || ["x-crud-actor", "x-crud-browser-actor"].includes(k))) { evidence.identityAliasAttempted = true; await route.abort("blockedbyclient"); return; }
      if (!["GET", "HEAD"].includes(request.method())) {
        const admitted = budget.get(pathname);
        if (index !== 1 || request.method() !== "POST" || !admitted || pathname === base) { evidence.unexpectedBusinessWrites++; await route.abort("blockedbyclient"); return; }
        budget.delete(pathname); const key = request.headers()["idempotency-key"], body = request.postData();
        const saved = await page.evaluate(expectedKey => Object.keys(sessionStorage).filter(k => k.startsWith("erp.procurement.round-plan-command.v1:")).map(slot => ({ slot, raw: sessionStorage.getItem(slot)! })).find(x => { try { return JSON.parse(x.raw).locator?.key === expectedKey; } catch { return false; } }), key);
        need(key && body && saved, "ExactPendingLocatorOrBodyMissing"); const journal = JSON.parse(saved!.raw), scope = JSON.parse(saved!.slot.slice("erp.procurement.round-plan-command.v1:".length)), command = JSON.parse(body!);
        need(Object.keys(journal).length === 2 && Object.keys(journal.locator ?? {}).length === 3 && Array.isArray(scope) && scope.length === 4 && /^[a-f0-9-]{36}$/.test(scope[3])
          && request.headers()["x-shell-entity"] === fixture.companyId && request.headers()["x-shell-location"] === fixture.branchId && !request.headers()["x-shell-branch-scope"]
          && journal.slot === saved!.slot && journal.locator?.key === key && journal.locator.eventId === fixture.eventId && journal.locator.operation === admitted.operation
          && scope[0]?.tenantId === fixture.tenantId && scope[0]?.companyId === fixture.companyId && scope[0]?.principalId === actor.id && scope[0]?.branchId === fixture.branchId && scope[1] === "selected" && scope[2] === fixture.eventId
          && command.expectedEventVersion === fixture.originalEventVersion && command.expectedPlanVersion === admitted.expectedVersion, "CapturedCommandScopeOrVersionMismatch");
        const intentPath = path.join(path.dirname(input.output), `before-send-${admitted.operation.toLowerCase()}.private.json`);
        const intent = { schemaVersion: 1, status: "DURABLE_BEFORE_SEND_INTENT_NOT_RESULT", actorIndex: index, actorPrincipalId: actor.id, operation: admitted.operation, path: pathname, originalKey: key,
          exactBody: body, requestBodySha256: digest(body!), originalClientJournal: saved, clientJournalSha256: digest(saved!.raw), ownerProofSha256: input.ownerProofSha256,
          runtimeSha256: input.runtimeSha256, fixtureSha256: input.fixtureSha256 };
        persist(intentPath, intent); evidence.startedCommands.push({ actorIndex: index, operation: admitted.operation, path: pathname, originalKey: key, requestBodySha256: intent.requestBodySha256, beforeSendIntentPath: intentPath, beforeSendIntentSha256: digest(readFileSync(intentPath)) });
      }
      await route.continue();
    }); return { context, page };
  }
  async function logout() {
    if (!active) return; const context = active, index = actorIndex; active = null;
    try { const r = await context.request.post("/api/hrm/auth/logout", { failOnStatusCode: false }); evidence.authenticationCommands.push({ actorIndex: index, action: "Logout", status: r.status() }); need(r.status() === 200, "NormalLogoutFailed"); }
    finally { await context.close(); actorIndex = null; }
  }
  async function versionUi(page: Page, version: number) {
    evidence.step = `read-only-history-${version}`; await page.getByRole("tab", { name: "History", exact: true }).click(); await page.getByRole("button", { name: `Open version ${version}`, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: `Saved evaluation plan version ${version}`, exact: true }); await expect(dialog).toBeVisible();
    for (const name of ["Revise evaluation plan", "Cancel evaluation plan", "Save proposed plan"]) await expect(dialog.getByRole("button", { name, exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close dialog", exact: true }).click(); await page.getByRole("tab", { name: "Overview", exact: true }).click();
  }
  async function command(page: Page, operation: "Revise" | "Cancel", expectedVersion: number, click: () => Promise<unknown>) {
    evidence.step = `C-${operation}-command`; const pathname = base + "/" + operation.toLowerCase(); budget.set(pathname, { operation, expectedVersion });
    const wait = page.waitForResponse(r => new URL(r.url()).pathname === pathname && r.request().method() === "POST"); await click(); const r = await wait;
    const key = r.request().headers()["idempotency-key"], bytes = await r.body();
    persist(path.join(path.dirname(input.output), `response-${operation.toLowerCase()}.private.json`), { status: r.status(), originalKey: key, exactBody: bytes.toString("utf8"), responseSha256: digest(bytes) });
    const body = JSON.parse(bytes.toString("utf8")); evidence.commands.push({ actorIndex: 1, operation, originalKey: key, status: r.status(), responseSha256: digest(bytes), revisionId: body.revisionId, version: body.version });
    need(r.status() === 200 && body.eventId === fixture.eventId && body.planId === input.originalPlanId && body.commandKey === key && body.operation === operation && body.version === expectedVersion + 1 && body.reviewAvailable === false && body.publicationAvailable === false, "OwningCommandNotConfirmed");
  }
  try {
    let { context, page } = await login(0); evidence.step = "B-original-key-GET-recovery";
    const original = await context.request.get(base + `/commands/${input.originalCreate.originalKey}`, { headers: selected });
    need(original.status() === 201 && digest(await original.body()) === input.originalCreate.responseSha256, "OriginalCreate201BytesMismatch"); evidence.originalCreateRecoveryStatus = original.status();
    v1 = await get(context, base + "/versions/1"); need(v1.plan?.id === input.originalPlanId && v1.plan.status === "Draft" && v1.plan.version === 1 && v1.revision?.id === input.originalCreate.revisionId
      && v1.content.criteria?.length === 2 && digest(JSON.stringify(v1.content)) === input.originalContentSha256 && v1.allowedActions?.length === 0, "ExistingProvedV1Changed");
    await page.goto(`/procurement/workspace/rfqs/${fixture.eventId}?source=round-plan`); await expect(page.getByRole("heading", { name: v1.source.title, exact: true })).toBeVisible();
    evidence.step = "B-All-read-active-v1"; const allWait = page.waitForResponse(r => new URL(r.url()).pathname === base && r.request().method() === "GET" && r.request().headers()["x-shell-branch-scope"] === "all");
    await page.getByRole("button", { name: "Organisation context", exact: true }).click(); await page.getByRole("button", { name: "All permitted branches", exact: true }).click();
    const all = await allWait, allBody = await all.json(); need(all.status() === 200 && allBody.plan?.version === 1 && allBody.plan.status === "Draft" && allBody.allowedActions?.length === 0, "AllActiveV1ReadInvalid");
    for (const name of ["Revise evaluation plan", "Cancel evaluation plan", "Set up evaluation plan"]) await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    await versionUi(page, 1); evidence.BAllActiveV1Passed = true; evidence.activeV1AllResponseSha256 = digest(await all.body());
    need(evidence.commands.length === 0 && evidence.startedCommands.length === 0 && evidence.pageErrors === 0, "BReadPhaseHadWriteOrError"); await logout();
    ({ context, page } = await login(1)); evidence.step = "C-current-v1-and-original-key-privacy";
    const foreign = await context.request.get(base + `/commands/${input.originalCreate.originalKey}`, { headers: selected }); need(foreign.status() === 404, "OriginalCreateActorPrivacyFailed"); evidence.COriginalCreateRecoveryStatus = foreign.status();
    await page.goto(`/procurement/workspace/rfqs/${fixture.eventId}?source=round-plan`); await page.getByRole("button", { name: "Revise evaluation plan", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "Revise evaluation plan", exact: true }); await expect(dialog.getByRole("textbox", { name: "Requirements", exact: true })).toHaveValue(v1.content.requirements);
    await expect(dialog.getByRole("textbox", { name: "Proposed weight", exact: true })).toHaveValue("12.3456");
    await dialog.getByRole("button", { name: "Remove criterion 1", exact: true }).click(); await dialog.getByRole("textbox", { name: "Proposed weight", exact: true }).fill("15.1234");
    await command(page, "Revise", 1, () => dialog.getByRole("button", { name: "Save proposed plan", exact: true }).click()); await expect(dialog).toHaveCount(0); await page.reload();
    const v2 = await get(context, base + "/versions/2"); need(v2.revision?.actorPrincipalId === fixture.users[1].id && v2.content.criteria?.length === 1 && v2.content.criteria[0].logicalId === v1.content.criteria[1].logicalId
      && v2.content.criteria[0].weight === "15.1234" && JSON.stringify(v2.content.participants) === JSON.stringify(v1.content.participants) && v2.content.requirements === v1.content.requirements
      && v2.content.opensAt === v1.content.opensAt && v2.content.closesAt === v1.content.closesAt && v2.allowedActions?.length === 0, "RevisionIdentityOrContentInvalid");
    evidence.revisedContentSha256 = digest(JSON.stringify(v2.content)); await versionUi(page, 1); await versionUi(page, 2);
    evidence.step = "C-cancel-required-reason"; await page.getByRole("button", { name: "Cancel evaluation plan", exact: true }).click(); dialog = page.getByRole("dialog", { name: "Cancel evaluation plan", exact: true });
    await expect(dialog.getByRole("button", { name: "Cancel evaluation plan", exact: true })).toBeDisabled(); await dialog.getByRole("textbox", { name: "Plan cancellation reason", exact: true }).fill("Native UI planning proposal withdrawn");
    await command(page, "Cancel", 2, () => dialog.getByRole("button", { name: "Cancel evaluation plan", exact: true }).click()); await expect(dialog).toHaveCount(0); await page.reload();
    const current = await get(context, base); need(current.plan?.id === input.originalPlanId && current.plan.status === "Cancelled" && current.plan.version === 3 && current.source.status === "Draft" && current.source.version === fixture.originalEventVersion
      && current.allowedActions?.length === 0 && JSON.stringify(current.content) === JSON.stringify(v2.content), "CancelledRetentionOrSourceStateInvalid"); evidence.cancelledContentSha256 = digest(JSON.stringify(current.content));
    await versionUi(page, 3); evidence.step = "C-retained-All-history"; await page.getByRole("button", { name: "Organisation context", exact: true }).click(); await page.getByRole("button", { name: "All permitted branches", exact: true }).click();
    const retainedAllWait = page.waitForResponse(r => new URL(r.url()).pathname === base && r.request().method() === "GET" && r.request().headers()["x-shell-branch-scope"] === "all");
    await page.reload(); const retainedAll = await retainedAllWait, retainedAllBody = await retainedAll.json();
    need(retainedAll.status() === 200 && retainedAllBody.plan?.version === 3 && retainedAllBody.plan.status === "Cancelled" && retainedAllBody.source.version === fixture.originalEventVersion && retainedAllBody.allowedActions?.length === 0, "ReloadedRetainedAllReadInvalid");
    evidence.CRetainedAllPassed = true; evidence.retainedAllResponseSha256 = digest(await retainedAll.body()); await versionUi(page, 1); await versionUi(page, 3);
    for (const name of ["Set up evaluation plan", "Revise evaluation plan", "Cancel evaluation plan"]) await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    need(evidence.commands.length === 2 && evidence.startedCommands.length === 2 && new Set(evidence.commands.map((x: any) => x.originalKey)).size === 2 && evidence.unexpectedBusinessWrites === 0 && evidence.pageErrors === 0 && !evidence.identityAliasAttempted, "ContinuationCommandBudgetOrErrorsInvalid");
    evidence.status = "PASS_NATIVE_UI_V1_CONTINUATION_TWO_COMMANDS_AWAIT_OWNER"; evidence.step = "completed";
  } catch (error) { const e = error as Error & { safeCode?: string }; failed = true; evidence.status = "FAILED_NOT_ACCEPTANCE"; evidence.failure = { step: evidence.step, code: e.safeCode ?? (/strict mode violation/.test(e.message) ? "StrictLocator" : /Timeout/.test(e.message) ? "LocatorTimeout" : "HarnessAssertion"), name: e.name, messageSha256: digest(String(e.message)), stackSha256: digest(e.stack ?? "") }; }
  finally { try { await logout(); } catch { failed = true; evidence.status = "FAILED_NOT_ACCEPTANCE"; evidence.logoutFailed = true; } persist(input.output, evidence); }
  need(!failed, "NativeContinuationFailedInspectProtectedReceipt");
});
