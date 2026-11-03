// INERT PREPARATION. Run once only after Root's actual owner reconciliation.
import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { nativeInput, digest, productCommit } from "./input";
const input = nativeInput("retained"), fixture = input.fixture;
const base = `/api/procurement/v1/sourcing/${fixture.eventId}/round-plan`;
const selected = { "X-Shell-Entity": fixture.companyId, "X-Shell-Location": fixture.branchId }, all = { "X-Shell-Entity": fixture.companyId, "X-Shell-Branch-Scope": "all" };
const need = (x: unknown, code: string) => { if (!x) throw Object.assign(new Error(code), { safeCode: code }); };
test("actual B/C retained current/history/All reads and original actor receipts with no business POST", async ({ browser }) => {
  need(test.info().project.use.trace === "off" && test.info().project.use.screenshot === "off" && test.info().project.use.video === "off", "CredentialCaptureForbidden");
  const evidence: any = { schemaVersion: 1, status: "RUNNING_NOT_ACCEPTANCE", uiSourceCommit: productCommit, backendSourceCommit: input.backendSourceCommit,
    testSourceSha256: digest(readFileSync(new URL(import.meta.url))), fixtureSha256: input.fixtureSha256, runtimeSha256: input.runtimeSha256, proxySha256: input.proxySha256, manifestSha256: input.manifestSha256,
    normalCoreCookies: true, businessResponseSubstitutions: false, injectedIdentityAliases: false, productionTouched: false, businessWritesAttempted: 0, writerLookups: 0, actors: [], authenticationCommands: [], nativeOwnerReconciliationRequired: true };
  let failed = false;
  try {
    for (let actorIndex = 0; actorIndex < 2; actorIndex++) {
      evidence.step = `actor-${actorIndex}-normal-login`;
      const context = await browser.newContext({ baseURL: input.origin, ignoreHTTPSErrors: true, timezoneId: "UTC" }), actor = fixture.users[actorIndex]; let loggedIn = false;
      try {
        const login = await context.request.post("/api/hrm/auth/login", { data: { email: actor.email, password: actor.password }, failOnStatusCode: false }); evidence.authenticationCommands.push({ actorIndex, action: "Login", status: login.status() }); need(login.status() === 200, "NormalLoginFailed"); loggedIn = true;
        const current = await context.request.get("/api/procurement/v1/context", { headers: selected }), meta = await context.request.get("/api/procurement/v1/meta", { headers: selected }); need(current.status() === 200 && meta.status() === 200, "ReadScopeUnavailable");
        const scope = await current.json(), metadata = await meta.json(); need(scope.principalId === actor.id && scope.workerId === null && scope.tenantId === fixture.tenantId && scope.legalEntityId === fixture.companyId && scope.permissions?.includes("procurement-round-plan-read") && metadata.capabilities?.roundPlanRead === true, "WorkerlessReadScopeInvalid");
        if (input.expectRecordOff) need(metadata.capabilities?.roundPlanRecord === false, "RecordOffReadProfileRequired");
        const entry: any = { actorIndex, workerless: true, pageErrors: 0, receipts: [], recordOff: metadata.capabilities?.roundPlanRecord === false }; evidence.actors.push(entry);
        await context.route("**/api/**", async route => {
          const request = route.request(), pathname = new URL(request.url()).pathname;
          if (!["GET", "HEAD"].includes(request.method())) { evidence.businessWritesAttempted++; await route.abort("blockedbyclient"); return; }
          if (pathname.endsWith("/round-plan/people")) evidence.writerLookups++;
          if (Object.keys(request.headers()).some(k => k.startsWith("x-private-") || k.startsWith("x-test-") || ["x-crud-actor", "x-crud-browser-actor"].includes(k))) { evidence.identityAliasAttempted = true; await route.abort("blockedbyclient"); return; }
          await route.continue();
        });
        await context.addInitScript(({ entityId, branch }) => { if (localStorage.getItem("erp.shell.state.v1") === null) localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId, branch })); }, { entityId: fixture.companyId, branch: fixture.branchId });
        const page = await context.newPage(); page.on("pageerror", () => entry.pageErrors++);
        evidence.step = `actor-${actorIndex}-branch-current-history`;
        await page.goto(`/procurement/workspace/rfqs/${fixture.eventId}?source=round-plan`); await page.getByRole("tab", { name: "History", exact: true }).click();
        for (const n of [1, 3]) { await page.getByRole("button", { name: `Open version ${n}`, exact: true }).click(); const dialog = page.getByRole("dialog", { name: `Saved evaluation plan version ${n}`, exact: true }); await expect(dialog).toBeVisible(); await expect(dialog.getByRole("button", { name: "Revise evaluation plan", exact: true })).toHaveCount(0); await dialog.getByRole("button", { name: "Close dialog", exact: true }).click(); }
        await page.getByRole("tab", { name: "Overview", exact: true }).click();
        for (const name of ["Set up evaluation plan", "Revise evaluation plan", "Cancel evaluation plan"]) await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
        evidence.step = `actor-${actorIndex}-All-current-history`;
        await page.getByRole("button", { name: "Organisation context", exact: true }).click(); await page.getByRole("button", { name: "All permitted branches", exact: true }).click(); await page.reload();
        await page.getByRole("tab", { name: "History", exact: true }).click(); await page.getByRole("button", { name: "Open version 3", exact: true }).click(); await expect(page.getByRole("dialog", { name: "Saved evaluation plan version 3", exact: true })).toBeVisible();
        const detail = await context.request.get(base, { headers: all }); need(detail.status() === 200, "AllCurrentReadFailed"); const body = await detail.json(); need(body.plan?.status === "Cancelled" && body.plan.version === 3 && body.allowedActions?.length === 0 && body.source.version === fixture.originalEventVersion, "AllRetainedStateInvalid"); entry.allReadSha256 = digest(await detail.body());
        evidence.step = `actor-${actorIndex}-original-receipt-privacy`;
        for (const command of input.owner.commands) {
          const reply = await context.request.get(base + `/commands/${command.originalKey}`, { headers: all }), own = command.actorIndex === actorIndex;
          need(reply.status() === (own ? command.operation === "Create" ? 201 : 200 : 404), "OriginalReceiptOwnershipOrStatusInvalid");
          if (own) need(digest(await reply.body()) === command.responseSha256, "OriginalReceiptHashMismatch");
          entry.receipts.push({ operation: command.operation, own, status: reply.status() });
        }
        need(entry.pageErrors === 0, "PageErrorsObserved"); entry.branchHistoryVerified = true; entry.allHistoryVerified = true;
      } finally {
        try { if (loggedIn) { const logout = await context.request.post("/api/hrm/auth/logout", { failOnStatusCode: false }); evidence.authenticationCommands.push({ actorIndex, action: "Logout", status: logout.status() }); need([200, 204].includes(logout.status()), "NormalLogoutFailed"); } } finally { await context.close(); }
      }
    }
    need(evidence.actors.length === 2 && evidence.businessWritesAttempted === 0 && evidence.writerLookups === 0 && !evidence.identityAliasAttempted, "ReadOnlyBudgetOrWriterLookupInvalid"); evidence.status = "PASS_NATIVE_RETAINED_READ_ONLY_NO_BUSINESS_POST"; evidence.step = "completed";
  } catch (error) { const e = error as Error & { safeCode?: string }; failed = true; evidence.status = "FAILED_NOT_ACCEPTANCE"; evidence.failure = { step: evidence.step, code: e.safeCode ?? (/strict mode violation/.test(e.message) ? "StrictLocator" : /Timeout/.test(e.message) ? "LocatorTimeout" : "HarnessAssertion"), messageSha256: digest(String(e.message)) }; }
  finally { writeFileSync(input.output, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600, flag: "wx" }); }
  need(!failed, "NativeRetainedReadFailedInspectProtectedReceipt");
});
