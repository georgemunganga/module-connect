// Private test admission only. This continues an independently proved v1; it never creates or resets a plan.
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { digest, nativeInput } from "./input";
const invalid = () => new Error("Protected reviewed M7B1 v1 continuation inputs required");
function protectedInput(name: string) {
  const filename = process.env[name], expected = process.env[name + "_SHA256"];
  if (!filename || !/^[a-f0-9]{64}$/.test(expected ?? "") || realpathSync(filename) !== filename || !lstatSync(filename).isFile() || (lstatSync(filename).mode & 0o777) !== 0o600) throw invalid();
  const raw = readFileSync(filename); if (raw.length > 1048576 || digest(raw) !== expected) throw invalid();
  return { value: JSON.parse(raw.toString("utf8")), sha256: expected!, path: filename };
}
export function continuationInput() {
  if (process.env.M7B1_NATIVE_CONTINUATION_REVIEWED !== "1" || !process.env.M7B1_NATIVE_CONTINUATION_RESULT
    || process.env.M7B1_NATIVE_CONTINUATION_RESULT !== process.env.M7B1_NATIVE_FRESH_RESULT) throw invalid();
  // Reuse shared protected transport/fixture checks, whose zero counts describe the ORIGINAL clone preparation.
  // Current graph authority is the separately pinned v1 owner proof below; this is not a fresh-create admission.
  const current = nativeInput("fresh"), owner = protectedInput("M7B1_NATIVE_CONTINUATION_OWNER"), prior = protectedInput("M7B1_NATIVE_PRIOR_FRESH_RESULT");
  if (owner.sha256 !== "8751520e5c05c859c7c321b23d5a9113918851527713c1e12064139d08509bb9"
    || prior.sha256 !== "70810c4f8e30f02d4fccfe2691d20509dad6a3a930aea5f7fbb8f849377da763") throw invalid();
  const o = owner.value, before = prior.value;
  if (o.status !== "PASS_FAILED_UI_V1_BUSINESS_AND_AUTH_INTEGRITY_ONLY" || o.passed !== false || o.businessGraphIntegrityPassed !== true || o.wholeUiPassed !== false
    || o.databaseName !== current.fixture.database || o.backendSourceCommit !== current.backendSourceCommit || o.roundPlanVersion !== 1 || o.roundPlanStatus !== "Draft"
    || o.uiResult?.path !== prior.path || o.uiResult?.sha256 !== prior.sha256 || o.targetAfter?.sha256 !== "7208f2fd538973208e1d119fd7b964b3a75fa5f9ccd3b13f010e61af784aa6cb"
    || before.status !== "FAILED_NOT_ACCEPTANCE" || before.failure?.step !== "B-All-read-active-draft" || before.commands?.length !== 1 || o.commands?.length !== 1
    || JSON.stringify(before.commands) !== JSON.stringify(o.commands) || current.output === prior.path || current.output === owner.path) throw invalid();
  const command = o.commands[0];
  if (command.actorIndex !== 0 || command.operation !== "Create" || command.status !== 201 || command.version !== 1
    || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(command.originalKey) || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(command.originalKey)
    || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(command.revisionId) || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(command.revisionId)
    || !/^[a-f0-9]{64}$/.test(command.responseSha256)) throw invalid();
  return { ...current, originalCreate: command, originalPlanId: o.planId as string, ownerProofSha256: owner.sha256, priorUiSha256: prior.sha256,
    originalContentSha256: before.createdContentSha256 as string, originalNativeSha256: o.targetAfter.sha256 as string };
}
