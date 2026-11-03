import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
export const productCommit = "8dca4943bbe5b5ea4993a7eecb0e7a40fecb53c1";
export const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const invalid = () => new Error("Protected reviewed M7B1 native inputs required");
const guid = (x: unknown): x is string => typeof x === "string" && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/.test(x) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(x);
const sha = (x: unknown): x is string => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const filePins = (files: any) => {
  if (!files || typeof files !== "object" || Array.isArray(files)) throw invalid();
  return JSON.stringify(Object.keys(files).sort().map(name => {
    const pin = files[name]; if (!pin || Object.keys(pin).length !== 2 || !sha(pin.sha256) || !Number.isSafeInteger(pin.size) || pin.size < 0) throw invalid();
    return [name, pin.sha256, pin.size];
  }));
};
const commit = (x: unknown): x is string => typeof x === "string" && /^[a-f0-9]{40}$/.test(x);
function pinned(name: string) {
  const filename = process.env[name], expected = process.env[name + "_SHA256"];
  if (!filename || !path.isAbsolute(filename) || !sha(expected) || realpathSync(filename) !== filename || !lstatSync(filename).isFile() || (lstatSync(filename).mode & 0o777) !== 0o600) throw invalid();
  const bytes = readFileSync(filename); if (bytes.length > 1048576 || digest(bytes) !== expected) throw invalid();
  try { return { value: JSON.parse(bytes.toString("utf8")), sha256: expected }; } catch { throw invalid(); }
}
export type Actor = { id: string; email: string; password: string; displayName: string; workerId: null };
export function nativeInput(mode: "fresh" | "retained") {
  if (process.env.M7B1_NATIVE_REVIEWED_EXECUTION !== "1" || process.env.DEBUG || process.env.PWDEBUG || process.env.NODE_DEBUG || process.versions.node.split(".")[0] !== "22") throw invalid();
  if (mode === "fresh" && process.env.M7B1_PREPARED_CLIENT_RECOVERY !== "1") throw invalid();
  const fixture = pinned("M7B1_NATIVE_FIXTURE"), runtime = pinned("M7B1_NATIVE_RUNTIME"), proxy = pinned("M7B1_NATIVE_PROXY_RECEIPT"), manifest = pinned("M7B1_NATIVE_UI_MANIFEST");
  const p = fixture.value, r = runtime.value, receipt = proxy.value, build = manifest.value;
  const expectedBackend = process.env.M7B1_NATIVE_BACKEND_SOURCE_COMMIT, expectedDb = process.env.M7B1_NATIVE_EXPECTED_DATABASE;
  const origin = new URL(receipt.origin);
  const tables = ["commercial_round_enrollments", "commercial_round_plans", "commercial_round_plan_revisions", "commercial_round_criteria", "commercial_round_participants", "commercial_round_plan_receipts"];
  if (p.schemaVersion !== 1 || p.purpose !== "M7B1_FRESH_UI_CLONE" || typeof p.database !== "string" || p.database !== expectedDb
    || typeof p.privatePgSystemIdentifier !== "string" || !/^\d+$/.test(p.privatePgSystemIdentifier) || receipt.databaseName !== p.database || receipt.privatePgSystemIdentifier !== p.privatePgSystemIdentifier
    || p.clonedFromOriginalSource231 !== true || p.copiedFromMutatedNativeGraph !== false || p.sqlSeededRoundBusinessRows !== false
    || p.originalSourceTableCount !== 231 || tables.some(name => p.beforeUiRoundCounts?.[name] !== 0)
    || p.genuineUpApplied !== true || p.expectedOwnerErp !== true || p.erpProcurementSchemaUsageVerified !== true || p.finiteProfile !== "107"
    || !sha(p.preparationReceiptSha256) || !sha(p.sourceBusinessBaselineSha256) || ![p.companyId, p.branchId, p.eventId, p.originalMakerPrincipalId].every(guid)
    || typeof p.tenantId !== "string" || !Number.isSafeInteger(p.originalEventVersion) || p.originalEventVersion < 1
    || !Array.isArray(p.users) || p.users.length !== 2 || p.users[0].id === p.users[1].id || p.users.some((a: Actor) => !guid(a.id) || a.id === p.originalMakerPrincipalId || a.workerId !== null || !a.email || !a.password || !a.displayName)
    || !commit(expectedBackend) || r.backendSourceCommit !== expectedBackend || !sha(r.publishManifestSha256) || !sha(r.id)
    || !Number.isSafeInteger(r.networkNamespaceOwnerPid) || r.networkNamespaceOwnerPid <= 0 || receipt.backendContainerId !== r.id
    || receipt.uiSourceCommit !== productCommit || build.uiSourceCommit !== productCommit || build.liveMode !== true
    || !build.files || Object.keys(build.files).length < 3 || filePins(receipt.files) !== filePins(build.files)
    || origin.protocol !== "https:" || origin.hostname !== "127.0.0.1" || !origin.port || origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password
    || receipt.transport !== "normal-local-cookie-https-v1" || receipt.injectsIdentityHeaders !== false || receipt.mocksBusinessResponses !== false
    || !Number.isFinite(Date.parse(receipt.expiresAt)) || Date.parse(receipt.expiresAt) <= Date.now()) throw invalid();
  if (readlinkSync("/proc/self/ns/net") !== readlinkSync(`/proc/${r.networkNamespaceOwnerPid}/ns/net`)) throw invalid();
  const result = process.env[mode === "fresh" ? "M7B1_NATIVE_FRESH_RESULT" : "M7B1_NATIVE_READ_RESULT"];
  if (!result || !path.isAbsolute(result) || existsSync(result) || realpathSync(path.dirname(result)) !== path.dirname(result) || (statSync(path.dirname(result)).mode & 0o777) !== 0o700) throw invalid();
  let owner: any = null;
  if (mode === "retained") {
    const proof = pinned("M7B1_NATIVE_OWNER_RECONCILIATION"); owner = proof.value;
    if (owner.passed !== true || owner.databaseName !== p.database || owner.uiSourceCommit !== productCommit || owner.backendSourceCommit !== expectedBackend
      || owner.exactlyThreeBrowserCommands !== true || owner.roundPlanVersion !== 3 || owner.roundPlanStatus !== "Cancelled" || !Array.isArray(owner.commands) || owner.commands.length !== 3
      || owner.commands.some((c: any) => !guid(c.originalKey) || !sha(c.responseSha256) || !["Create", "Revise", "Cancel"].includes(c.operation) || c.actorIndex !== (c.operation === "Create" ? 0 : 1))
      || new Set(owner.commands.map((c: any) => c.originalKey)).size !== 3 || new Set(owner.commands.map((c: any) => c.operation)).size !== 3) throw invalid();
  }
  return { fixture: p as { database: string; tenantId: string; companyId: string; branchId: string; eventId: string; originalMakerPrincipalId: string; originalEventVersion: number; users: Actor[] }, origin: origin.origin,
    output: result, backendSourceCommit: expectedBackend, fixtureSha256: fixture.sha256, runtimeSha256: runtime.sha256, proxySha256: proxy.sha256, manifestSha256: manifest.sha256, owner,
    preparedClientRecoveryApproved: process.env.M7B1_PREPARED_CLIENT_RECOVERY === "1", expectRecordOff: process.env.M7B1_EXPECT_RECORD_OFF === "1" };
}
