// INERT until Root supplies and approves a dedicated native fixture/API/UI build.
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { chmodSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { readPlanJson, sumPlanAmounts } from "../../../../shared/procurement-plan-json";
import { nativePlanInput, digest, guid, type ActorName } from "./input";
import { NativePlanFailure, safeNativeError as safeError, safeNativeStep as safeStep } from "./safety";
const input = nativePlanInput(), fixture = input.fixture, api = "/api/procurement/v1/plans";
const headers = { "X-Shell-Entity": fixture.companyId, "X-Shell-Location": fixture.branchId };
const need = (v: unknown, code: string) => { if (!v) throw new NativePlanFailure(code); };

test("actual Core owner submits, assigned reviewer reviews, independent final actor approves", async ({ browser }) => {
  need(test.info().project.use.trace === "off" && test.info().project.use.video === "off" && test.info().project.use.screenshot === "off", "CaptureMustStayOff");
  const report: any = { schemaVersion: 1, status: "RUNNING_NOT_ACCEPTANCE", testSourceSha256: digest(readFileSync(new URL(import.meta.url))), fixtureSha256: input.fixtureSha256, outerScopeReceiptSha256: input.outerScopeReceiptSha256, requiredOuterCleanupProofPath: input.outerCleanupProofPath,
    uiSourceCommit: fixture.uiSourceCommit, backendSourceCommit: fixture.backendSourceCommit, databaseName: fixture.databaseName,
    normalCoreCookieStates: true, mockOrInterceptionUsed: false, identityAliasesUsed: false, startedCommands: [], commands: [],
    pageErrors: [], usedActorLogoutAttempts: [], allThreeFixtureCookieCleanupRequired: true, ownedBrowserScopeCleanupRequired: true, assertions: {}, nativeOwnerReconciliationRequired: true, nativeAcceptanceClaimed: false };
  const persist = () => { const temporary = input.output + ".writing"; writeFileSync(temporary, JSON.stringify(report, null, 2) + "\n", { mode: 0o600, flag: "wx" }); chmodSync(temporary, 0o600); renameSync(temporary, input.output); };
  writeFileSync(input.output, JSON.stringify(report) + "\n", { mode: 0o600, flag: "wx" });
  let active: BrowserContext | null = null, activeActor: ActorName | null = null, violation: string | null = null;
  let armed: { path: string; operation: string; actor: ActorName } | null = null;
  let planId = "", submissionId = "", caseId = "", planNumber = "", snapshotHash = "";
  const financialPeriod = `Native FY ${randomUUID().slice(0, 8)}`, description = "Native purchase forecast", quantity = "1.0001", amount = "12.3456";
  report.draftIntent = { financialPeriod, description, quantity, amount, currencyCode: fixture.currencyCode }; persist();
  async function read(context: BrowserContext, path: string, expected = 200): Promise<any> {
    need(!violation, violation ?? "NetworkViolation");
    const r = await context.request.get(path, { headers, maxRetries: 0, failOnStatusCode: false });
    need(r.status() === expected, "ActualReadStatusMismatch");
    if (expected !== 200) return { status: r.status(), sha256: digest(await r.body()) };
    return readPlanJson(await r.text());
  }
  async function close(logout: boolean) {
    if (!active) return; const c = active, actor = activeActor; active = null; activeActor = null;
    try {
      if (logout) { const r = await c.request.post("/api/hrm/auth/logout", { maxRetries: 0, failOnStatusCode: false }); report.usedActorLogoutAttempts.push({ actor, status: r.status() }); persist(); need([200, 204].includes(r.status()), "NormalLogoutFailed"); }
    } finally { await c.close(); }
  }
  async function open(actor: ActorName) {
    report.step = `${actor}-current-Core-cookie-admission`; persist();
    const context = await browser.newContext({ baseURL: input.origin, storageState: fixture.actors[actor].storageState.path,
      ignoreHTTPSErrors: true, serviceWorkers: "block", timezoneId: "UTC" }); active = context; activeActor = actor;
    // Refuse HAR/mocking/interception registration instead of intercepting or rewriting business traffic.
    const forbid = async () => { violation = "BusinessRouteInterceptionAttempted"; report.mockOrInterceptionUsed = true; persist(); throw new NativePlanFailure(violation); };
    context.route = forbid; context.routeFromHAR = forbid;
    const me = await read(context, "/api/hrm/auth/me"), scope = await read(context, "/api/procurement/v1/context"), meta = await read(context, "/api/procurement/v1/meta");
    need(me.user?.id === fixture.actors[actor].principalId && scope.principalId === fixture.actors[actor].principalId
      && scope.tenantId === fixture.tenantId && scope.legalEntityId === fixture.companyId
      && meta.capabilities?.planReviewRead === true && meta.capabilities?.planReviewWorkflow === true, "ActualCoreIdentityScopeOrCapabilityMismatch");
    const required = actor === "owner" ? ["procurement-plan-read", "procurement-plan-create", "procurement-plan-submit"]
      : ["procurement-plan-review-read", actor === "reviewer" ? "procurement-plan-review" : "procurement-plan-approve"];
    need(required.every(p => scope.permissions?.includes(p)) && (actor !== "reviewer" || !scope.permissions?.includes("procurement-plan-read")), "CurrentPermissionFixtureMismatch");
    await context.addInitScript(({ origin, companyId, branchId }) => {
      if (location.origin !== origin) return;
      localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: companyId, branch: branchId }));
    }, { origin: input.origin, companyId: fixture.companyId, branchId: fixture.branchId });
    const page = await context.newPage(); page.route = forbid; page.routeFromHAR = forbid;
    page.on("pageerror", e => { report.pageErrors.push({ actor, step: safeStep(report.step), ...safeError(e) }); persist(); });
    page.on("request", request => {
      const u = new URL(request.url()); if (u.origin !== input.origin || !u.pathname.startsWith("/api/")) return;
      if (Object.keys(request.headers()).some(k => k.startsWith("x-private-") || k.startsWith("x-test-") || ["x-crud-actor", "x-crud-browser-actor"].includes(k))) { violation = "IdentityAliasHeaderObserved"; report.identityAliasesUsed = true; }
      if (actor !== "owner" && u.pathname === `${api}/${planId}`) violation = "ReviewerUiUsedOwnerOnlyGet";
      if (["GET", "HEAD", "OPTIONS"].includes(request.method())) return;
      const expected = armed; armed = null;
      report.startedCommands.push({ actor, operation: expected?.operation ?? "UNEXPECTED", path: u.pathname,
        method: request.method(), originalKey: request.headers()["idempotency-key"] ?? null, requestSha256: digest(request.postData() ?? "") });
      if (!expected || expected.actor !== actor || expected.path !== u.pathname || request.method() !== "POST") violation = "UnexpectedOrRepeatedBusinessCommand";
      persist(); // Passive recording only: no route.continue/fulfill/abort or response substitutions.
    });
    return { context, page };
  }
  async function command(page: Page, actor: ActorName, operation: string, path: string, status: number, click: () => Promise<unknown>) {
    need(!violation && !armed, violation ?? "PreviousCommandStillArmed");
    report.step = operation; report.commandIntent = { actor, operation, path }; persist(); armed = { actor, operation, path };
    const wait = page.waitForResponse(r => new URL(r.url()).pathname === path && r.request().method() === "POST");
    await click(); const response = await wait; const bytes = await response.body(), body: any = readPlanJson(bytes.toString("utf8"));
    need(!response.fromServiceWorker() && !violation && armed === null, violation ?? "ActualBusinessRequestNotObserved");
    const key = response.request().headers()["idempotency-key"] ?? null;
    report.commands.push({ actor, operation, path, status: response.status(), originalKey: key, responseSha256: digest(bytes),
      planId: body.id ?? body.planId, submissionId: body.submissionId ?? null, caseId: body.caseId ?? null,
      assignmentId: body.assignmentId ?? null, decisionId: body.decisionId ?? null, version: body.version ?? body.planVersion }); persist();
    need(response.status() === status && (operation === "Create" || guid(key)), "CommandResultNotConfirmedNoRetry");
    return body;
  }
  async function task(context: BrowserContext, code: "Review" | "Final") {
    const tasks = await read(context, `${api}/review-tasks?page=1&pageSize=25`);
    const found = tasks.items?.filter((x: any) => x.planId === planId && x.submissionId === submissionId && x.code === code);
    need(found?.length === 1 && guid(found[0].assignmentId), "ActualVerifiedSubmissionTaskMissing"); return found[0];
  }
  try {
    let { context, page } = await open("owner");
    report.step = "owner-original-draft-editor"; persist(); await page.goto("/procurement/workspace/plans/new");
    await page.getByLabel("Financial period", { exact: true }).fill(financialPeriod); await page.getByLabel("Need 1", { exact: true }).fill(description);
    await page.getByLabel("Quantity", { exact: true }).fill(quantity); await page.getByLabel("Estimated amount", { exact: true }).fill(amount);
    await expect(page.getByLabel("Currency", { exact: true })).toHaveValue(fixture.currencyCode);
    await expect(page.getByLabel("Currency", { exact: true })).toHaveJSProperty("readOnly", true);
    const created = await command(page, "owner", "Create", api, 201, () => page.getByRole("button", { name: "Save draft", exact: true }).click());
    need(guid(created.id) && guid(created.lines?.[0]?.id) && created.branchRef === fixture.branchId && created.currencyCode === fixture.currencyCode
      && sumPlanAmounts([created.lines[0].estimatedAmount]) === sumPlanAmounts([amount]), "CreatedPlanScopeOrExactAmountMismatch");
    planId = created.id; planNumber = created.number; report.assertions.planId = planId; report.assertions.lineId = created.lines[0].id; persist();
    await expect(page.getByRole("heading", { name: financialPeriod, exact: true })).toBeVisible(); await page.reload();
    const submitted = await command(page, "owner", "Submit", `${api}/${planId}/review-submissions`, 201, () => page.getByRole("button", { name: "Send plan for review", exact: true }).click());
    need(submitted.planId === planId && guid(submitted.submissionId) && guid(submitted.caseId), "SubmissionIdentifiersInvalid");
    submissionId = submitted.submissionId; caseId = submitted.caseId; report.assertions.submissionId = submissionId; report.assertions.caseId = caseId;
    const round = await read(context, `${api}/review-submissions/${submissionId}`); snapshotHash = round.snapshotSha256;
    need(round.planId === planId && round.submittedSnapshot?.lines?.[0]?.description === description && sumPlanAmounts([round.estimatedAmount]) === sumPlanAmounts([amount]), "SubmittedSnapshotMismatch");
    const history = await read(context, `${api}/${planId}/review-history`), retained = history.rounds?.find((r: any) => r.id === submissionId);
    need(retained?.policyVersionId === fixture.expectedPolicy.id && retained?.policyVersionNumber === fixture.expectedPolicy.versionNumber, "ActualPolicyPinMismatch");
    report.assertions.policyVersionId = retained.policyVersionId; report.assertions.policyVersionNumber = retained.policyVersionNumber; report.assertions.snapshotSha256 = snapshotHash; persist();
    await close(false); // Reuse the same original owner cookie for final history, never save a replacement state.
    ({ context, page } = await open("reviewer"));
    report.step = "reviewer-owner-endpoint-denied"; const denied = await read(context, `${api}/${planId}`, 403); report.assertions.reviewerOwnerGet = denied; persist();
    const reviewTask = await task(context, "Review"); report.assertions.reviewAssignmentId = reviewTask.assignmentId;
    await page.goto("/procurement/workspace/plans?view=review");
    await page.getByRole("row").filter({ hasText: planNumber }).getByRole("button", { name: "Review submitted plan", exact: true }).click();
    const reviewDialog = page.getByRole("dialog", { name: "Submitted purchase plan", exact: true }); await expect(reviewDialog.getByRole("cell", { name: description, exact: true })).toBeVisible();
    await reviewDialog.getByRole("button", { name: "Mark as reviewed", exact: true }).click();
    const reviewed = await command(page, "reviewer", "Review", `${api}/review-submissions/${submissionId}/assignments/${reviewTask.assignmentId}/decisions`, 200,
      () => page.getByRole("dialog", { name: "Approve plan", exact: true }).getByRole("button", { name: "Confirm decision", exact: true }).click());
    need(guid(reviewed.decisionId) && reviewed.status === "Reviewed" && reviewed.planId === planId && reviewed.submissionId === submissionId && reviewed.caseId === caseId, "ReviewResultMismatch");
    await close(true); ({ context, page } = await open("final"));
    const finalTask = await task(context, "Final"); report.assertions.finalAssignmentId = finalTask.assignmentId;
    await page.goto(`/procurement/workspace/plans?view=review&review=${submissionId}`);
    const finalDialog = page.getByRole("dialog", { name: "Submitted purchase plan", exact: true }); await expect(finalDialog.getByRole("cell", { name: description, exact: true })).toBeVisible();
    await finalDialog.getByRole("button", { name: "Approve plan", exact: true }).click();
    const approved = await command(page, "final", "FinalApprove", `${api}/review-submissions/${submissionId}/assignments/${finalTask.assignmentId}/decisions`, 200,
      () => page.getByRole("dialog", { name: "Approve plan", exact: true }).getByRole("button", { name: "Confirm decision", exact: true }).click());
    need(guid(approved.decisionId) && approved.status === "Active" && approved.roundState === "Approved" && approved.planId === planId && approved.submissionId === submissionId && approved.caseId === caseId, "FinalApprovalResultMismatch");
    await close(true); ({ context, page } = await open("owner"));
    report.step = "owner-approved-history-reload"; persist(); await page.goto(`/procurement/workspace/plans/${planId}`); await page.reload();
    await expect(page.getByRole("heading", { name: financialPeriod, exact: true })).toBeVisible(); await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Open submitted version", exact: true }).click();
    const savedDialog = page.getByRole("dialog", { name: "Submitted purchase plan", exact: true }); await expect(savedDialog.getByRole("cell", { name: description, exact: true })).toBeVisible();
    for (const name of ["Mark as reviewed", "Approve plan", "Withdraw from review"]) await expect(savedDialog.getByRole("button", { name, exact: true })).toHaveCount(0);
    const finalRound = await read(context, `${api}/review-submissions/${submissionId}`), finalHistory = await read(context, `${api}/${planId}/review-history`);
    need(finalRound.planStatus === "Active" && finalRound.state === "Approved" && finalRound.snapshotSha256 === snapshotHash && finalHistory.rounds?.length === 1
      && finalHistory.rounds[0].state === "Approved" && finalHistory.decisions?.length === 2 && report.commands.length === 4 && report.startedCommands.length === 4
      && new Set(report.commands.slice(1).map((x: any) => x.originalKey)).size === 3 && !violation && report.pageErrors.length === 0, "RetainedHistoryOrCommandBudgetMismatch");
    report.assertions.planStatus = finalRound.planStatus; report.assertions.roundState = finalRound.state;
    report.assertions.reviewDecisionId = reviewed.decisionId; report.assertions.finalDecisionId = approved.decisionId;
    report.status = "PASS_NATIVE_PLAN_UI_FOUR_COMMANDS_AWAIT_OWNER_AND_OUTER_CLEANUP"; report.step = "completed";
  } catch (error) { report.status = "FAILED_PRESERVE_EXISTING_RECORDS_NO_RETRY"; report.failure = { step: safeStep(report.step), ...safeError(error) }; }
  finally { try { await close(true); } catch { report.status = "FAILED_USED_ACTOR_LOGOUT_REVIEW_REQUIRED"; } report.outerCleanupProofRequired = true; persist(); }
  need(report.status === "PASS_NATIVE_PLAN_UI_FOUR_COMMANDS_AWAIT_OWNER_AND_OUTER_CLEANUP", "NativePlanFlowFailedInspectProtectedReportNoRerun");
});
