import { roundScheduleForCommand, compareRoundInstants, type RoundScheduleEdits } from "../../shared/procurement-round-schedule";
import { invoiceDecimal } from "../../shared/procurement-decimal";
import { procurementScopeHeaders } from "../../shared/shell-scope";
export const roundGuid = (x: unknown): x is string => typeof x === "string" && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/.test(x) && x !== "00000000-0000-0000-0000-000000000000";
const object = (x: unknown): x is Record<string, any> => !!x && typeof x === "object" && !Array.isArray(x);
const version = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) > 0;
export type RoundCriterion = { logicalId: string; order: number; code: string; stage: "Mandatory" | "Technical" | "Commercial"; kind: "PassFail" | "Weighted";
  description: string | null; rubric: string | null; weight: string | null; maximumScore: string | null; minimumScore: string | null };
export type RoundParticipant = { logicalId: string; order: number; principalId: string; duty: "Planner" | "Reviewer" | "OpeningOfficer" | "TechnicalEvaluator" | "CommercialEvaluator" | "ConflictReviewer"; conflictNote: string | null };
export type RoundDraft = { requirements: string | null; proposedPolicyReference: string | null; disclosureProposal: string | null; documentRequirements: string | null;
  opensAt: string | null; closesAt: string | null; technicalReleaseAt: string | null; commercialReleaseAt: string | null; criteria: RoundCriterion[]; participants: RoundParticipant[] };
export type RoundContent = RoundDraft & { schemaVersion: 1; companyTimeZoneId: string };
export type RoundSource = { id: string; number: string; title: string; currencyCode: string; branchId: string; status: string; version: number;
  method: { id: string; revision: number; code: string; label: string };
  lines: { id: string; purchaseRequestId: string; purchaseRequestLineId: string; description: string; unitCode: string; categoryCode: string | null; quantity: string; approvedUnitEstimate: string; estimatedValue: string; allocationState: string }[];
  supplierFacingWorkflowAvailable: false };
export type RoundRecord = { allowedActions: string[]; enrolled: boolean; source: RoundSource; plan: { id: string; status: "Draft" | "Cancelled"; version: number; makerPrincipalId: string } | null;
  revision?: { id: string; version: number; operation: "Create" | "Revise" | "Cancel"; status: "Draft" | "Cancelled"; actorPrincipalId: string; recordedAt: string; reason: string | null; contentSha256: string };
  content?: RoundContent; people?: { id: string; displayName: string }[]; reviewAvailable: false; publicationAvailable: false; contentIsIncompleteProposal?: true };
export type RoundHistory = { items: { id: string; version: number; operation: "Create" | "Revise" | "Cancel"; status: "Draft" | "Cancelled"; actorPrincipalId: string; recordedAt: string; reason: string | null }[]; nextVersion: number | null };
export type RoundLocator = { eventId: string; key: string; operation: "Create" | "Revise" | "Cancel" };
export type RoundCommand = RoundLocator & { body: string };
export type RoundReceipt = { schemaVersion: 1; eventId: string; planId: string; revisionId: string; version: number; status: "Draft" | "Cancelled"; operation: RoundLocator["operation"]; commandKey: string; reviewAvailable: false; publicationAvailable: false; httpStatus: number };
export class RoundPlanError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const invalid = () => new RoundPlanError(0, "The evaluation plan could not be verified. Keep the original save reference and refresh.");
function text(x: unknown, max: number): boolean { return x === null || typeof x === "string" && x.length <= max && !!x.trim() && x === x.trim() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(x); }
const instant = (x: unknown): x is string | null => x === null || typeof x === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(x) && Number.isFinite(Date.parse(x));
export function validateRoundDraft(x: unknown): asserts x is RoundDraft {
  if (!object(x) || !text(x.requirements, 10000) || !text(x.proposedPolicyReference, 200) || !text(x.disclosureProposal, 10000) || !text(x.documentRequirements, 10000)
    || ![x.opensAt, x.closesAt, x.technicalReleaseAt, x.commercialReleaseAt].every(instant)
    || x.opensAt && x.closesAt && compareRoundInstants(x.opensAt, x.closesAt) >= 0
    || x.closesAt && [x.technicalReleaseAt, x.commercialReleaseAt].some(at => at && compareRoundInstants(at, x.closesAt) < 0)
    || !Array.isArray(x.criteria) || !Array.isArray(x.participants) || x.criteria.length > 100 || x.participants.length > 100) throw invalid();
  const orders = (rows: any[]) => rows.every(r => object(r) && roundGuid(r.logicalId) && version(r.order) && r.order <= 100)
    && new Set(rows.map(r => r.logicalId)).size === rows.length && new Set(rows.map(r => r.order)).size === rows.length;
  if (!orders(x.criteria) || !orders(x.participants) || new Set(x.criteria.map(c => String(c.code).toLowerCase())).size !== x.criteria.length
    || new Set(x.participants.map(p => p.principalId + ":" + p.duty)).size !== x.participants.length) throw invalid();
  try {
    for (const c of x.criteria) {
      if (typeof c.code !== "string" || !text(c.code, 80) || !["Mandatory", "Technical", "Commercial"].includes(c.stage) || !["PassFail", "Weighted"].includes(c.kind)
        || !text(c.description, 2000) || !text(c.rubric, 10000)) throw invalid();
      for (const v of [c.weight, c.maximumScore, c.minimumScore]) if (v !== null) { if (typeof v !== "string") throw invalid(); invoiceDecimal(v); }
      if (c.kind === "PassFail" && [c.weight, c.maximumScore, c.minimumScore].some(v => v !== null)) throw invalid();
      const scaled = (v: string) => { const [whole, part = ""] = v.split("."); return BigInt(whole) * 10000n + BigInt(part.padEnd(4, "0")); };
      if (c.minimumScore !== null && c.maximumScore !== null && scaled(c.minimumScore) > scaled(c.maximumScore)) throw invalid();
    }
    for (const p of x.participants) if (!roundGuid(p.principalId) || !["Planner", "Reviewer", "OpeningOfficer", "TechnicalEvaluator", "CommercialEvaluator", "ConflictReviewer"].includes(p.duty) || !text(p.conflictNote, 2000)) throw invalid();
  } catch { throw invalid(); }
}
export type RoundIdentity = { tenantId: string; companyId: string; principalId: string; branchId: string | null; authEpoch: number };
export type RoundScope = { identity: Readonly<RoundIdentity>; headers: Readonly<Record<string, string>>; current(): boolean; assertCurrent(): void };
export function captureRoundScope(identity: RoundIdentity, currentIdentity: () => RoundIdentity | null): RoundScope {
  if (!identity.tenantId || !roundGuid(identity.companyId) || !roundGuid(identity.principalId) || identity.branchId !== null && !roundGuid(identity.branchId)) throw invalid();
  const captured = JSON.stringify(identity), headers = procurementScopeHeaders(identity.companyId);
  if ((headers["X-Shell-Location"] ?? null) !== identity.branchId || identity.branchId && headers["X-Shell-Branch-Scope"]) throw invalid();
  const current = () => { try { return captured === JSON.stringify(currentIdentity()) && JSON.stringify(headers) === JSON.stringify(procurementScopeHeaders(identity.companyId)); } catch { return false; } };
  return { identity: Object.freeze({ ...identity }), headers: Object.freeze(headers), current, assertCurrent() { if (!current()) throw new RoundPlanError(0, "Your account or organisation changed. Open the RFQ again."); } };
}
async function roundRequest(scope: RoundScope, path: string, init: RequestInit = {}): Promise<{ body: unknown; status: number }> {
  scope.assertCurrent();
  const headers = new Headers(scope.headers); if (init.body) headers.set("Content-Type", "application/json");
  new Headers(init.headers).forEach((v, k) => { if (k.toLowerCase() !== "idempotency-key") throw invalid(); headers.set(k, v); });
  let response: Response;
  try { response = await fetch(`/api/procurement/v1/sourcing${path}`, { ...init, headers, credentials: "include", cache: "no-store" }); }
  catch { throw new RoundPlanError(0, "The save response was not confirmed. Check the original saved result before another change."); }
  scope.assertCurrent(); let body: unknown;
  try { const raw = await response.text(); if (raw.length > 2_000_000) throw invalid(); body = JSON.parse(raw); } catch { throw invalid(); }
  scope.assertCurrent();
  if (!response.ok) throw new RoundPlanError(response.status, response.status === 404 ? "This evaluation plan or saved result is unavailable in your current scope."
    : object(body) && typeof body.message === "string" ? body.message : "The evaluation plan is unavailable. Check your access and refresh.");
  return { body, status: response.status };
}
function request(scope: RoundScope, eventId: string, path: string, init: RequestInit = {}) {
  if (!roundGuid(eventId)) throw invalid(); return roundRequest(scope, `/${eventId}/round-plan${path}`, init);
}
function record(x: unknown, eventId: string, scope: RoundScope, resultVersion?: number): RoundRecord {
  if (!object(x) || typeof x.enrolled !== "boolean" || !object(x.source) || x.source.id !== eventId || !roundGuid(x.source.branchId)
    || scope.identity.branchId !== null && x.source.branchId !== scope.identity.branchId || typeof x.source.number !== "string" || typeof x.source.title !== "string"
    || typeof x.source.currencyCode !== "string" || !version(x.source.version) || typeof x.source.status !== "string"
    || !object(x.source.method) || !roundGuid(x.source.method.id) || !version(x.source.method.revision) || typeof x.source.method.code !== "string" || typeof x.source.method.label !== "string"
    || !Array.isArray(x.source.lines) || !x.source.lines.length || x.source.lines.length > 200 || !x.source.lines.every((line: unknown) => object(line) && roundGuid(line.id) && roundGuid(line.purchaseRequestId) && roundGuid(line.purchaseRequestLineId)
      && typeof line.description === "string" && typeof line.unitCode === "string" && [line.quantity, line.approvedUnitEstimate, line.estimatedValue].every(v => typeof v === "string" && /^(?:0|[1-9]\d*)(?:\.\d+)?(?:E[+-]?\d+)?$/.test(v)) && typeof line.allocationState === "string")
    || !Array.isArray(x.allowedActions) || !x.allowedActions.every((a: unknown) => typeof a === "string")
    || x.source.supplierFacingWorkflowAvailable !== false || x.reviewAvailable !== false || x.publicationAvailable !== false) throw invalid();
  if (!x.enrolled) { if (x.plan !== null || resultVersion !== undefined || x.allowedActions.some((a: string) => a !== "Create")) throw invalid(); return x as RoundRecord; }
  if (!object(x.plan) || !roundGuid(x.plan.id) || !version(x.plan.version) || !["Draft", "Cancelled"].includes(x.plan.status) || !roundGuid(x.plan.makerPrincipalId)
    || !object(x.revision) || !roundGuid(x.revision.id) || !version(x.revision.version) || x.revision.version > x.plan.version || resultVersion !== undefined && x.revision.version !== resultVersion
    || !["Create", "Revise", "Cancel"].includes(x.revision.operation) || !["Draft", "Cancelled"].includes(x.revision.status) || !roundGuid(x.revision.actorPrincipalId)
    || typeof x.revision.recordedAt !== "string" || !instant(x.revision.recordedAt) || !text(x.revision.reason, 2000)
    || !/^[a-f\d]{64}$/.test(x.revision.contentSha256) || !object(x.content) || x.content.schemaVersion !== 1 || typeof x.content.companyTimeZoneId !== "string"
    || resultVersion === undefined && (x.revision.version !== x.plan.version || x.revision.status !== x.plan.status)
    || x.contentIsIncompleteProposal !== true || !Array.isArray(x.people) || !x.people.every(p => object(p) && roundGuid(p.id) && typeof p.displayName === "string")) throw invalid();
  if (x.allowedActions.includes("Create") || x.plan.status !== "Draft" && x.allowedActions.length
    || resultVersion !== undefined && x.allowedActions.length || scope.headers["X-Shell-Branch-Scope"] && x.allowedActions.length) throw invalid();
  validateRoundDraft(x.content); return x as RoundRecord;
}
export async function getRoundPlan(scope: RoundScope, eventId: string, signal?: AbortSignal): Promise<RoundRecord> { const { body } = await request(scope, eventId, "", { signal }); return record(body, eventId, scope); }
export async function getRoundPlanVersion(scope: RoundScope, eventId: string, resultVersion: number, signal?: AbortSignal): Promise<RoundRecord> {
  if (!version(resultVersion)) throw invalid(); const { body } = await request(scope, eventId, `/versions/${resultVersion}`, { signal }); return record(body, eventId, scope, resultVersion);
}
export async function getRoundPlanHistory(scope: RoundScope, eventId: string, afterVersion = 0, signal?: AbortSignal): Promise<RoundHistory> {
  if (!Number.isSafeInteger(afterVersion) || afterVersion < 0) throw invalid(); const { body: x } = await request(scope, eventId, `/history?afterVersion=${afterVersion}&limit=25`, { signal });
  if (!object(x) || !Array.isArray(x.items) || x.items.length > 25 || !(x.nextVersion === null || version(x.nextVersion))
    || !x.items.every(r => object(r) && roundGuid(r.id) && version(r.version) && r.version > afterVersion && ["Create", "Revise", "Cancel"].includes(r.operation) && ["Draft", "Cancelled"].includes(r.status) && roundGuid(r.actorPrincipalId) && typeof r.recordedAt === "string" && instant(r.recordedAt) && text(r.reason, 2000))
    || new Set(x.items.map((r: any) => r.id)).size !== x.items.length || !x.items.every((r: any, i: number) => i === 0 || r.version > x.items[i - 1].version)
    || x.nextVersion !== null && x.nextVersion !== x.items.at(-1)?.version) throw invalid();
  return x as RoundHistory;
}
export function roundCommand(eventId: string, expectedEventVersion: number, expectedPlanVersion: number | null, operation: RoundLocator["operation"], key: string, draft?: RoundDraft, reason?: string, scheduleEdits: RoundScheduleEdits = {}): RoundCommand {
  if (!roundGuid(eventId) || !roundGuid(key) || !version(expectedEventVersion) || operation !== "Create" && !version(expectedPlanVersion)) throw invalid();
  if (operation === "Cancel") { if (!text(reason, 2000) || !reason) throw invalid(); }
  else { if (draft) draft = roundScheduleForCommand(draft, scheduleEdits); validateRoundDraft(draft); }
  return { eventId, key, operation, body: JSON.stringify({ expectedEventVersion, ...(operation !== "Create" ? { expectedPlanVersion } : {}),
    ...(operation === "Cancel" ? { draft: null, reason } : { draft, ...(operation === "Revise" ? { reason: null } : {}) }) }) };
}
function receipt(x: unknown, status: number, locator: RoundLocator): RoundReceipt {
  if (!object(x) || x.schemaVersion !== 1 || x.eventId !== locator.eventId || x.commandKey !== locator.key || x.operation !== locator.operation
    || !roundGuid(x.planId) || !roundGuid(x.revisionId) || !version(x.version) || x.status !== (locator.operation === "Cancel" ? "Cancelled" : "Draft")
    || x.reviewAvailable !== false || x.publicationAvailable !== false || status !== (locator.operation === "Create" ? 201 : 200)) throw invalid();
  return { ...x, httpStatus: status } as RoundReceipt;
}
export async function sendRoundPlan(scope: RoundScope, command: RoundCommand): Promise<RoundReceipt> {
  if (!roundGuid(command.key) || !roundGuid(command.eventId) || !["Create", "Revise", "Cancel"].includes(command.operation)) throw invalid();
  if (!scope.identity.branchId || scope.headers["X-Shell-Branch-Scope"]) throw new RoundPlanError(400, "Choose the RFQ's permitted branch before changing its evaluation plan.");
  const { body, status } = await request(scope, command.eventId, command.operation === "Create" ? "" : `/${command.operation.toLowerCase()}`,
    { method: "POST", headers: { "Idempotency-Key": command.key }, body: command.body }); return receipt(body, status, command);
}
export async function recoverRoundPlan(scope: RoundScope, locator: RoundLocator): Promise<RoundReceipt> {
  if (!roundGuid(locator.key)) throw invalid(); const { body, status } = await request(scope, locator.eventId, `/commands/${locator.key}`); return receipt(body, status, locator);
}

export type RoundSourceChoice = { id: string; number: string; title: string; currencyCode: string; branchId: string; status: "Draft"; version: number; enrollmentCandidate: true; eligibilityIsProvisional: true };
export async function listRoundPlanSources(scope: RoundScope, page = 1, q = "", signal?: AbortSignal): Promise<{ items: RoundSourceChoice[]; total: number; page: number; pageSize: number }> {
  if (!version(page) || page > 10000 || q.length > 100 || /[\u0000-\u001f]/.test(q)) throw invalid();
  const { body: x } = await roundRequest(scope, `/round-plan-sources?page=${page}&pageSize=25&q=${encodeURIComponent(q)}`, { signal });
  if (!object(x) || !Array.isArray(x.items) || !Number.isSafeInteger(x.total) || x.total < 0 || x.page !== page || x.pageSize !== 25
    || !x.items.every((r: unknown) => object(r) && roundGuid(r.id) && roundGuid(r.branchId) && (scope.identity.branchId === null || r.branchId === scope.identity.branchId)
      && typeof r.number === "string" && typeof r.title === "string" && typeof r.currencyCode === "string" && version(r.version) && r.status === "Draft" && r.enrollmentCandidate === true && r.eligibilityIsProvisional === true)) throw invalid();
  return x as { items: RoundSourceChoice[]; total: number; page: number; pageSize: number };
}
export async function listRoundPlans(scope: RoundScope, page = 1, signal?: AbortSignal): Promise<{ items: { id: string; eventId: string; number: string; title: string; branchRef: string; status: string; version: number }[]; total: number; page: number; pageSize: number }> {
  if (!version(page) || page > 10000) throw invalid(); const { body: x } = await roundRequest(scope, `/round-plans?page=${page}`, { signal });
  if (!object(x) || !Array.isArray(x.items) || !Number.isSafeInteger(x.total) || x.total < 0 || x.page !== page || x.pageSize !== 25 || !x.items.every((r: unknown) => object(r) && roundGuid(r.id) && roundGuid(r.eventId) && roundGuid(r.branchRef)
    && (scope.identity.branchId === null || r.branchRef === scope.identity.branchId) && typeof r.number === "string" && typeof r.title === "string" && typeof r.status === "string" && version(r.version))) throw invalid();
  return x as { items: { id: string; eventId: string; number: string; title: string; branchRef: string; status: string; version: number }[]; total: number; page: number; pageSize: number };
}
export async function searchRoundPeople(scope: RoundScope, eventId: string, q: string, after: string | null = null, signal?: AbortSignal): Promise<{ items: { principalId: string; displayName: string; branchId: string }[]; nextCursor: string | null }> {
  if (!scope.identity.branchId || scope.headers["X-Shell-Branch-Scope"]) throw new RoundPlanError(400, "Choose the RFQ branch before selecting colleagues.");
  if (q.length > 100 || after !== null && !roundGuid(after)) throw invalid();
  const { body: x } = await request(scope, eventId, `/people?limit=25&q=${encodeURIComponent(q)}${after ? `&after=${after}` : ""}`, { signal });
  if (!object(x) || !Array.isArray(x.items) || x.items.length > 25 || !(x.nextCursor === null || roundGuid(x.nextCursor))
    || !x.items.every((r: unknown) => object(r) && roundGuid(r.principalId) && typeof r.displayName === "string" && roundGuid(r.branchId) && (scope.identity.branchId === null || r.branchId === scope.identity.branchId))) throw invalid();
  return x as { items: { principalId: string; displayName: string; branchId: string }[]; nextCursor: string | null };
}
