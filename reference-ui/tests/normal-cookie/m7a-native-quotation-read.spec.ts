import { test, expect, type APIResponse } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { digest, nativeReadInput } from "./m7a-native-read-input";
const input = nativeReadInput(), fixture = input.fixture;
const need = (value: unknown, code: string) => { if (!value) throw new Error(code); };
async function json(response: APIResponse) { try { return await response.json(); } catch { throw new Error("Native quotation read returned invalid JSON"); } }
const retained = (snapshot: any) => JSON.stringify({ offer: snapshot.header.offer, receivedAt: snapshot.header.receivedAt, lines: snapshot.lines, documentPins: snapshot.documentPins, totals: snapshot.totals });

// PREPARED, NOT EXECUTED. Root must bind a reviewed private TLS proxy first.
// Normal password/session-cookie login only. The request guard forwards every
// business GET unchanged and aborts every attempted business write; no business
// response is fulfilled or replaced. Authentication sessions are the sole writes.
test("B and C read native quotation history through the committed original UI without business writes", async ({ browser }) => {
  need(test.info().project.use.trace === "off" && test.info().project.use.screenshot === "off" && test.info().project.use.video === "off", "Credential capture must remain disabled");
  const evidence: any = { schemaVersion: 1, status: "RUNNING_NOT_ACCEPTANCE", uiSourceCommit: input.uiSourceCommit, fixtureSha256: input.fixtureSha256, runtimeSha256: input.runtimeSha256, proxySha256: input.proxySha256,
    authentication: "NORMAL_LOCAL_PASSWORD_AND_SESSION_COOKIE", businessResponsesMocked: false, identityHeadersInjected: false, businessWritesAttempted: 0, authenticationCommands: [], actors: [], droppedLineAcceptanceRequired: input.expectDroppedLine,
    productionTouched: false, nativeMutationAcceptanceClaimed: false };
  let failed = false;
  try {
    for (const [actorIndex, account] of fixture.users.entries()) {
      evidence.step = `actor-${actorIndex}-login`;
      const context = await browser.newContext({ baseURL: input.origin, ignoreHTTPSErrors: true });
      let loggedIn = false;
      try {
        const login = await context.request.post("/api/hrm/auth/login", { data: { email: account.email, password: account.password }, failOnStatusCode: false });
        evidence.authenticationCommands.push({ actorIndex, action: "Login", status: login.status() }); need(login.status() === 200, "Native normal login failed"); loggedIn = true;
        const me = await context.request.get("/api/hrm/auth/me"); need(me.status() === 200 && (await json(me)).user?.id === account.id, "Native session principal mismatch");
        evidence.step = `actor-${actorIndex}-scope`;
        const headers = { "X-Shell-Entity": fixture.companyId, "X-Shell-Location": fixture.branchId };
        const current = await context.request.get("/api/procurement/v1/context", { headers }); need(current.status() === 200, "Native scoped context unavailable"); const scope = await json(current);
        need(scope.principalId === account.id && scope.workerId === null && scope.tenantId === fixture.tenantId && scope.legalEntityId === fixture.companyId && scope.permissions?.includes("procurement-quotation-read"), "Workerless quotation READ scope was not confirmed");
        const sources = await context.request.get("/api/procurement/v1/sourcing/quotation-sources", { headers }); need(sources.status() === 200, "Native handler discovery failed"); need((await json(sources)).items?.some((x: any) => x.id === fixture.eventId), "Native fixture source missing from bounded assigned work");
        evidence.step = `actor-${actorIndex}-native-history`;
        const list = await context.request.get(`/api/procurement/v1/sourcing/${fixture.eventId}/quotation-drafts`, { headers }); need(list.status() === 200, "Native source quotation list failed"); const listed = await json(list);
        need(listed.source?.lines?.length > 0 && listed.items?.length === 1 && listed.invitations?.some((x: any) => x.status === "ManualContactRecorded"), "Native retained source/offer/contact was not confirmed");
        const bid = listed.items[0];
        const detailReply = await context.request.get(`/api/procurement/v1/sourcing/${fixture.eventId}/quotation-drafts/${bid.id}`, { headers }); need(detailReply.status() === 200, "Native quotation detail failed"); const detail = await json(detailReply);
        need(detail.status === input.expectedStatus && detail.version >= 2 && detail.historyTotal === detail.version && detail.history?.length > 0 && detail.snapshot?.schemaVersion === 3, "Native retained quotation state/history mismatch");
        const olderReply = await context.request.get(`/api/procurement/v1/sourcing/${fixture.eventId}/quotation-drafts/${bid.id}/versions/1`, { headers }); need(olderReply.status() === 200, "Native original version unavailable"); const older = await json(olderReply);
        const dropped = older.snapshot.lines.filter((x: any) => !detail.snapshot.lines.some((y: any) => x.sourcingLineId === y.sourcingLineId)).length;
        if (input.expectDroppedLine) need(dropped > 0, "Expected native dropped-line revision not present");
        let cancellationRetention = false;
        if (detail.status === "Cancelled") {
          const priorReply = await context.request.get(`/api/procurement/v1/sourcing/${fixture.eventId}/quotation-drafts/${bid.id}/versions/${detail.version - 1}`, { headers }); need(priorReply.status() === 200, "Native pre-cancellation version unavailable");
          cancellationRetention = retained((await json(priorReply)).snapshot) === retained(detail.snapshot); need(cancellationRetention, "Native cancellation changed retained terms or evidence");
        }
        const entry: any = { actorIndex, workerless: true, sourceDiscoveryStatus: sources.status(), currentReadStatus: detailReply.status(), originalVersionStatus: olderReply.status(), version: detail.version, currentSnapshotSha256: digest(JSON.stringify(detail.snapshot)), originalSnapshotSha256: digest(JSON.stringify(older.snapshot)), currentLineCount: detail.snapshot.lines.length, originalLineCount: older.snapshot.lines.length, droppedLineCount: dropped, cancellationRetention, businessNetwork: [], pageErrors: 0, branchReadVerified: false, allReadVerified: false };
        evidence.actors.push(entry);
        evidence.step = `actor-${actorIndex}-ui-branch`;
        await context.route("**/api/**", async route => {
          const request = route.request();
          if (!["GET", "HEAD"].includes(request.method())) { evidence.businessWritesAttempted++; await route.abort("blockedbyclient"); return; }
          // Never inject role/principal headers or manufacture an API response.
          need(!Object.keys(request.headers()).some(key => key.startsWith("x-private-") || key.startsWith("x-test-") || key === "x-crud-actor" || key === "x-crud-browser-actor"), "Identity aliases forbidden");
          await route.continue();
        });
        await context.addInitScript(({ companyId, branchId }) => { if (localStorage.getItem("erp.shell.state.v1") === null) localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: companyId, branch: branchId })); }, { companyId: fixture.companyId, branchId: fixture.branchId });
        const page = await context.newPage(); page.on("pageerror", () => entry.pageErrors++);
        page.on("response", response => { const url = new URL(response.url()); if (url.pathname.startsWith("/api/procurement/") && entry.businessNetwork.length < 100) entry.businessNetwork.push({ path: url.pathname.replace(/[a-f\d]{8}-[a-f\d-]{27}/gi, ":id"), method: response.request().method(), status: response.status() }); });
        await page.goto(`/procurement/workspace/rfqs/${fixture.eventId}?source=quotations`);
        await expect(page.getByRole("heading", { name: listed.source.title, exact: true })).toBeVisible();
        await page.getByRole("button", { name: "View draft and history", exact: true }).first().click();
        await expect(page.getByRole("heading", { name: "Quotation history", exact: true })).toBeVisible();
        await expect(page.getByText(detail.snapshot.totals.payable, { exact: true }).first()).toBeVisible();
        await page.getByRole("textbox", { name: "Historical version", exact: true }).fill("1"); await page.getByRole("button", { name: "Open version", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Retained version 1", exact: true })).toBeVisible(); entry.branchReadVerified = true;
        await page.getByRole("tab", { name: "Related", exact: true }).click(); await expect(page.getByText("Contact recorded", { exact: true }).last()).toBeVisible();
        evidence.step = `actor-${actorIndex}-ui-all`;
        await page.getByRole("button", { name: "Organisation context", exact: true }).click(); await page.getByRole("button", { name: "All permitted branches", exact: true }).click();
        await expect(page.getByRole("heading", { name: listed.source.title, exact: true })).toBeVisible();
        await page.getByRole("button", { name: "View draft and history", exact: true }).first().click();
        await expect(page.getByRole("heading", { name: "Quotation history", exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Revise draft", exact: true })).toHaveCount(0); await expect(page.getByRole("button", { name: "Cancel supplier draft", exact: true })).toHaveCount(0);
        await page.reload(); await page.getByRole("button", { name: "View draft and history", exact: true }).first().click(); await expect(page.getByRole("heading", { name: "Quotation history", exact: true })).toBeVisible(); entry.allReadVerified = true;
        need(entry.pageErrors === 0 && evidence.businessWritesAttempted === 0, "Native UI errors or attempted business mutation");
      } finally {
        try { if (loggedIn) { const logout = await context.request.post("/api/hrm/auth/logout", { failOnStatusCode: false }); evidence.authenticationCommands.push({ actorIndex, action: "Logout", status: logout.status() }); need([200, 204].includes(logout.status()), "Native session logout failed"); } } finally { await context.close(); }
      }
    }
    need(evidence.actors.length === 2 && evidence.businessWritesAttempted === 0, "Native read cohort incomplete"); evidence.status = "PASS_NATIVE_QUOTATION_UI_READ_HISTORY_ONLY"; evidence.step = "completed";
  } catch (error) { const failure = error as Error; failed = true; evidence.status = "FAILED_NOT_ACCEPTANCE"; evidence.failure = { step: evidence.step, name: failure.name, code: /strict mode violation/.test(failure.message) ? "StrictLocator" : /Timeout/.test(failure.message) ? "LocatorTimeout" : "HarnessAssertion", messageSha256: digest(String(failure.message)) }; }
  finally { writeFileSync(input.output, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600, flag: "wx" }); }
  need(!failed, "Native read-only quotation UI journey did not pass; inspect protected receipt");
});
