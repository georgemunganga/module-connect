import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

const fail = () => new Error("Protected reviewed M7A native-read inputs required");
export const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const guid = (value: unknown): value is string => typeof value === "string" && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
function pinned(name: string) {
  const file = process.env[name], hash = process.env[`${name}_SHA256`];
  if (!file || !path.isAbsolute(file) || realpathSync(file) !== file || !lstatSync(file).isFile() || (lstatSync(file).mode & 0o777) !== 0o600 || !hash || !/^[a-f0-9]{64}$/.test(hash)) throw fail();
  const bytes = readFileSync(file); if (bytes.length > 1048576 || digest(bytes) !== hash) throw fail();
  return { value: JSON.parse(bytes.toString("utf8")), hash };
}
export type NativeReadActor = { id: string; email: string; password: string; workerId: string | null };
export function nativeReadInput(resultName = "M7A_NATIVE_READ_RESULT") {
  if (process.env.DEBUG || process.env.PWDEBUG || process.env.NODE_DEBUG || process.versions.node.split(".")[0] !== "22") throw fail();
  const fixture = pinned("M7A_NATIVE_CLONE"), runtime = pinned("M7A_NATIVE_RUNTIME"), proxy = pinned("M7A_NATIVE_PROXY_RECEIPT");
  const p = fixture.value, r = runtime.value, receipt = proxy.value;
  const origin = new URL(receipt.origin);
  const uiSourceCommit = process.env.M7A_NATIVE_UI_SOURCE_COMMIT;
  if (!uiSourceCommit || !/^[a-f0-9]{40}$/.test(uiSourceCommit)) throw fail();
  if (origin.protocol !== "https:" || origin.hostname !== "127.0.0.1" || !origin.port || origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password
    || receipt.transport !== "normal-local-cookie-https-v1" || receipt.injectsIdentityHeaders !== false || receipt.mocksBusinessResponses !== false
    || receipt.backendContainerId !== r.id || receipt.uiSourceCommit !== uiSourceCommit
    || !Number.isFinite(Date.parse(receipt.expiresAt)) || Date.parse(receipt.expiresAt) <= Date.now()
    || typeof p.database !== "string" || p.database !== process.env.M7A_NATIVE_EXPECTED_DATABASE || receipt.databaseName !== p.database
    || ![p.companyId, p.branchId, p.eventId].every(guid) || typeof p.tenantId !== "string"
    || !Array.isArray(p.users) || p.users.length !== 2 || p.users.some((x: NativeReadActor) => !guid(x.id) || typeof x.email !== "string" || !x.email || typeof x.password !== "string" || !x.password || x.workerId !== null)) throw fail();
  const output = process.env[resultName];
  if (!output || !path.isAbsolute(output) || existsSync(output) || realpathSync(path.dirname(output)) !== path.dirname(output) || (statSync(path.dirname(output)).mode & 0o777) !== 0o700) throw fail();
  const expectedStatus = process.env.M7A_NATIVE_EXPECTED_STATUS ?? "Cancelled";
  if (!["Draft", "Cancelled"].includes(expectedStatus)) throw fail();
  return { fixture: p as { database: string; tenantId: string; companyId: string; branchId: string; eventId: string; users: NativeReadActor[] }, origin: origin.origin, output,
    uiSourceCommit, fixtureSha256: fixture.hash, runtimeSha256: runtime.hash, proxySha256: proxy.hash, expectedStatus, expectDroppedLine: process.env.M7A_NATIVE_EXPECT_DROPPED_LINE === "1" };
}
