import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
export const digest = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
export const guid = (v: unknown): v is string => typeof v === "string" && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/.test(v) && v !== "00000000-0000-0000-0000-000000000000";
const sha = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const commit = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{40}$/.test(v);
const invalid = () => new Error("Protected Root-reviewed native Plan inputs required");
export type ActorName = "owner" | "reviewer" | "final";
export type Actor = { principalId: string; storageState: { path: string; sha256: string } };
export type Fixture = { schemaVersion: 1; purpose: "PLAN_REVIEW_NATIVE_POSITIVE"; baseURL: string;
  databaseName: string; privatePgSystemIdentifier: string; tenantId: string; companyId: string; branchId: string;
  currencyCode: string; backendSourceCommit: string; uiSourceCommit: string; expiresAt: string;
  expectedPolicy: { id: string; versionNumber: number; key: "PROCUREMENT_PLAN_REVIEW" };
  actors: Record<ActorName, Actor>; genuineMigrationsAndNativeAdmissionAccepted: true; normalCoreCookieStates: true;
  freshPlanBusinessFixture: true; businessRouteInterception: false; injectedIdentityHeaders: false;
  rootApprovedFourBusinessCommands: true };
function protectedJson(filename: string, expected: string) {
  if (!path.isAbsolute(filename) || realpathSync(filename) !== filename || !lstatSync(filename).isFile()
    || (lstatSync(filename).mode & 0o777) !== 0o600 || !sha(expected)) throw invalid();
  const bytes = readFileSync(filename); if (bytes.length > 1048576 || digest(bytes) !== expected) throw invalid();
  return JSON.parse(bytes.toString("utf8"));
}
function readNativePlanInput() {
  if (process.env.PLAN_NATIVE_REVIEWED_EXECUTION !== "1" || process.env.DEBUG || process.env.PWDEBUG || process.env.NODE_DEBUG || process.versions.node.split(".")[0] !== "22") throw invalid();
  if (process.env.PLAN_NATIVE_OUTER_SCOPE_ADMITTED !== "1" || !process.env.PLAN_NATIVE_OUTER_SCOPE_SHA256
    || !sha(process.env.PLAN_NATIVE_OUTER_SCOPE_SHA256)) throw invalid();
  const filename = process.env.PLAN_NATIVE_FIXTURE, expected = process.env.PLAN_NATIVE_FIXTURE_SHA256, output = process.env.PLAN_NATIVE_RESULT;
  if (!filename || !expected || !output) throw invalid();
  const scopeFile = process.env.PLAN_NATIVE_OUTER_SCOPE_RECEIPT;
  if (!scopeFile) throw invalid();
  const scope = protectedJson(scopeFile, process.env.PLAN_NATIVE_OUTER_SCOPE_SHA256!);
  if (scope.purpose !== "PLAN_NATIVE_ROOT_OWNED_CGROUP_V2" || scope.authorized !== true || scope.fixtureSha256 !== expected
    || scope.killOwnedScopeOnEveryExit !== true || scope.verifyScopeEmptyAfter !== true || scope.cleanupAllThreeNormalCookies !== true
    || typeof scope.cgroupPath !== "string" || !scope.cgroupPath.startsWith("/sys/fs/cgroup/")
    || !path.basename(scope.cgroupPath).startsWith("procurement-plan-native-")
    || realpathSync(scope.cgroupPath) !== scope.cgroupPath
    || !readFileSync("/proc/self/cgroup", "utf8").split("\n").includes("0::" + scope.cgroupPath.slice("/sys/fs/cgroup".length))) throw invalid();
  const p = protectedJson(filename, expected) as Fixture, origin = new URL(p.baseURL);
  if (p.schemaVersion !== 1 || p.purpose !== "PLAN_REVIEW_NATIVE_POSITIVE" || origin.protocol !== "https:" || origin.hostname !== "127.0.0.1"
    || !origin.port || origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password
    || p.databaseName === "erp" || !/^proc_[a-z0-9_]+$/.test(p.databaseName) || !/^\d+$/.test(p.privatePgSystemIdentifier)
    || !p.tenantId || ![p.companyId, p.branchId, p.expectedPolicy?.id].every(guid) || !/^[A-Z]{3}$/.test(p.currencyCode)
    || p.expectedPolicy.key !== "PROCUREMENT_PLAN_REVIEW" || !Number.isSafeInteger(p.expectedPolicy.versionNumber) || p.expectedPolicy.versionNumber < 1
    || !commit(p.backendSourceCommit) || !commit(p.uiSourceCommit) || !Number.isFinite(Date.parse(p.expiresAt)) || Date.parse(p.expiresAt) <= Date.now()
    || p.genuineMigrationsAndNativeAdmissionAccepted !== true || p.normalCoreCookieStates !== true || p.freshPlanBusinessFixture !== true
    || p.businessRouteInterception !== false || p.injectedIdentityHeaders !== false || p.rootApprovedFourBusinessCommands !== true) throw invalid();
  const actors = [p.actors?.owner, p.actors?.reviewer, p.actors?.final];
  if (actors.some(a => !a || !guid(a.principalId)) || new Set(actors.map(a => a.principalId)).size !== 3) throw invalid();
  for (const actor of actors) {
    const state = protectedJson(actor.storageState.path, actor.storageState.sha256);
    if (!Array.isArray(state.cookies) || !state.cookies.some((c: any) => c.domain === origin.hostname && c.secure === true && c.httpOnly === true)
      || state.cookies.some((c: any) => c.domain !== origin.hostname) || !Array.isArray(state.origins) || state.origins.length !== 0) throw invalid();
  }
  if (!path.isAbsolute(output) || existsSync(output) || realpathSync(path.dirname(output)) !== path.dirname(output)
    || (statSync(path.dirname(output)).mode & 0o777) !== 0o700) throw invalid();
  return { fixture: p, origin: origin.origin, output, fixtureSha256: expected, outerScopeReceiptSha256: process.env.PLAN_NATIVE_OUTER_SCOPE_SHA256!, outerCleanupProofPath: scope.outerCleanupProofPath as string };
}

/** Admission errors must never echo JSON cookie contents or raw transport call logs. */
export function nativePlanInput() {
  try { return readNativePlanInput(); } catch { throw invalid(); }
}
