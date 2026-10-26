import { procurementScopeHeaders } from "../../shared/shell-scope";

export type MasterImportKind = "vendors" | "items";
export type MasterDuplicatePolicy = "reject" | "skip";
export type MasterImportField = { key: string; label: string; required: boolean };
export type MasterImportSchema = { schemaVersion: number; kind: MasterImportKind; fields: MasterImportField[] };
export type MasterPreviewRow = { rowNumber: number; startLine: number; endLine: number;
  disposition: string; code?: string; message?: string };
export type MasterImportPreview = { batchId: string; previewSha256: string; expiresAt: string;
  rows: MasterPreviewRow[]; willCreate: number; willSkip: number; willError: number };
export type MasterImportResult = { batchId: string; created: number; skipped: number;
  rows: Array<{ rowNumber: number; disposition: string; recordId?: string }> };
export type MasterImportRecovery = ({ state: "Previewed" } & MasterImportPreview)
  | { state: "Committed"; batchId: string; result: MasterImportResult };

export class MasterImportError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha256 = /^[0-9a-f]{64}$/i;
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const nonnegative = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const field = (v: unknown): v is MasterImportField => object(v) && typeof v.key === "string"
  && /^[a-z][A-Za-z0-9]{0,79}$/.test(v.key) && typeof v.label === "string"
  && v.label.length > 0 && v.label.length <= 120 && typeof v.required === "boolean";
const previewRow = (v: unknown): v is MasterPreviewRow => object(v)
  && typeof v.rowNumber === "number" && Number.isSafeInteger(v.rowNumber) && v.rowNumber > 0
  && typeof v.startLine === "number" && Number.isSafeInteger(v.startLine) && v.startLine > 0
  && typeof v.endLine === "number" && Number.isSafeInteger(v.endLine) && v.endLine >= v.startLine
  && ["create", "skip", "error"].includes(String(v.disposition))
  && (v.code === undefined || typeof v.code === "string")
  && (v.message === undefined || typeof v.message === "string");

function parseSchema(value: unknown, kind: MasterImportKind): MasterImportSchema {
  if (!object(value) || value.schemaVersion !== 1 || value.kind !== kind || !Array.isArray(value.fields)
      || value.fields.length < 1 || value.fields.length > 64 || !value.fields.every(field)
      || new Set(value.fields.map((f: MasterImportField) => f.key)).size !== value.fields.length)
    throw new MasterImportError(0, "invalid-schema", "The ERP import fields could not be verified.");
  return value as MasterImportSchema;
}
function parsePreview(value: unknown): MasterImportPreview {
  if (!object(value) || !guid.test(String(value.batchId)) || !sha256.test(String(value.previewSha256))
      || typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt))
      || !Array.isArray(value.rows) || value.rows.length > 1000 || !value.rows.every(previewRow)
      || !nonnegative(value.willCreate) || !nonnegative(value.willSkip) || !nonnegative(value.willError)
      || Number(value.willCreate) + Number(value.willSkip) + Number(value.willError) !== value.rows.length
      || value.rows.filter((row: MasterPreviewRow) => row.disposition === "create").length !== value.willCreate
      || value.rows.filter((row: MasterPreviewRow) => row.disposition === "skip").length !== value.willSkip
      || value.rows.filter((row: MasterPreviewRow) => row.disposition === "error").length !== value.willError
      || new Set(value.rows.map((row: MasterPreviewRow) => row.rowNumber)).size !== value.rows.length)
    throw new MasterImportError(0, "invalid-preview", "The ERP import preview could not be verified.");
  return value as MasterImportPreview;
}
function parseResult(value: unknown): MasterImportResult {
  if (!object(value) || !guid.test(String(value.batchId)) || !nonnegative(value.created)
      || !nonnegative(value.skipped) || !Array.isArray(value.rows) || value.rows.length > 1000
      || value.rows.length !== value.created + value.skipped
      || !value.rows.every((row: unknown) => object(row) && typeof row.rowNumber === "number" && Number.isSafeInteger(row.rowNumber)
        && (row.rowNumber as number) > 0 && ["create", "skip"].includes(String(row.disposition))
        && (row.recordId === undefined || guid.test(String(row.recordId))))
      || value.rows.filter((row: { disposition: string }) => row.disposition === "create").length !== value.created
      || value.rows.filter((row: { disposition: string }) => row.disposition === "skip").length !== value.skipped
      || new Set(value.rows.map((row: { rowNumber: number }) => row.rowNumber)).size !== value.rows.length)
    throw new MasterImportError(0, "invalid-result", "The ERP import result could not be verified.");
  return value as MasterImportResult;
}

async function request(kind: MasterImportKind, companyId: string, path: string,
  init: RequestInit = {}): Promise<{ response: Response; scope: Record<string, string> }> {
  let original: Record<string, string>;
  try { original = procurementScopeHeaders(companyId); }
  catch { throw new MasterImportError(0, "scope-changed", "Choose your ERP company again before importing."); }
  const headers = new Headers(init.headers);
  Object.entries(original).forEach(([key, value]) => headers.set(key, value));
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`/api/procurement/v1/${kind}/import${path}`, {
      ...init, credentials: "include", cache: "no-store", headers,
    });
  } catch (cause) {
    if (init.signal?.aborted) throw cause;
    throw new MasterImportError(0, "network-unknown", "The import response was interrupted. Check the saved result before another change.");
  }
  let current: Record<string, string>;
  try { current = procurementScopeHeaders(companyId); }
  catch { throw new MasterImportError(0, "scope-changed", "The ERP company changed. Start this import again."); }
  if (init.signal?.aborted || JSON.stringify(current) !== JSON.stringify(original))
    throw new MasterImportError(0, "scope-changed", "The ERP company or branch changed. Start this import again.");
  if (!response.ok) {
    let code = "";
    try { const body: unknown = await response.json(); if (object(body) && typeof body.code === "string") code = body.code; }
    catch { /* Safe status message below. */ }
    throw new MasterImportError(response.status, code, response.status === 401 ? "Sign in to import records."
      : response.status === 403 ? "You no longer have permission to import these records."
      : response.status === 409 ? "This import changed or expired. Check its saved result."
      : response.status === 413 ? "The CSV is too large for the ERP import limit."
      : response.status === 422 ? "The import has invalid rows. Review the server preview."
      : response.status === 503 ? "ERP import is unavailable for this company."
      : "The ERP import is unavailable. Try again later.");
  }
  return { response, scope: original };
}
function verifyScope(companyId: string, expected: Record<string, string>, signal?: AbortSignal): void {
  let current: Record<string, string>;
  try { current = procurementScopeHeaders(companyId); }
  catch { throw new MasterImportError(0, "scope-changed", "The ERP company changed. Start this import again."); }
  if (signal?.aborted || JSON.stringify(current) !== JSON.stringify(expected))
    throw new MasterImportError(0, "scope-changed", "The ERP company or branch changed. Start this import again.");
}
async function json(scoped: { response: Response; scope: Record<string, string> }, companyId: string,
  signal?: AbortSignal): Promise<unknown> {
  let value: unknown;
  try { value = await scoped.response.json(); }
  catch { throw new MasterImportError(0, "invalid-response", "The ERP response could not be verified. Check the saved result."); }
  verifyScope(companyId, scoped.scope, signal);
  return value;
}
export async function getMasterImportSchema(kind: MasterImportKind, companyId: string,
  signal?: AbortSignal): Promise<MasterImportSchema> {
  return parseSchema(await json(await request(kind, companyId, "/schema", { signal }), companyId, signal), kind);
}
export async function getMasterImportTemplate(kind: MasterImportKind, companyId: string,
  signal?: AbortSignal): Promise<{ blob: Blob; fileName: string }> {
  const { response, scope } = await request(kind, companyId, "/template", { signal });
  if (!/^text\/csv\b/i.test(response.headers.get("Content-Type") ?? ""))
    throw new MasterImportError(0, "invalid-template", "The ERP did not return a CSV template.");
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const name = /(?:^|;)\s*filename="?([A-Za-z0-9._-]+\.csv)"?/i.exec(disposition)?.[1];
  if (!/^attachment\s*;/i.test(disposition) || !name)
    throw new MasterImportError(0, "invalid-template", "The ERP did not return a CSV attachment.");
  const blob = await response.blob();
  verifyScope(companyId, scope, signal);
  if (!blob.size) throw new MasterImportError(0, "invalid-template", "The CSV template was interrupted.");
  return { blob, fileName: name };
}
export function downloadMasterImportTemplate(file: { blob: Blob; fileName: string }): void {
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = file.fileName;
  try { document.body.appendChild(anchor); anchor.click(); }
  finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 30_000); }
}
export async function previewMasterImport(kind: MasterImportKind, companyId: string, input: {
  schemaVersion: number; fileName: string; csvBase64: string; mapping: Record<string, string>;
  duplicatePolicy: MasterDuplicatePolicy; acknowledgedSimilarityRows: number[];
}, signal?: AbortSignal): Promise<MasterImportPreview> {
  return parsePreview(await json(await request(kind, companyId, "/preview", {
    method: "POST", body: JSON.stringify(input), signal,
  }), companyId, signal));
}
export async function commitMasterImport(kind: MasterImportKind, companyId: string,
  input: { batchId: string; previewSha256: string; commandKey: string }, signal?: AbortSignal): Promise<MasterImportResult> {
  if (!guid.test(input.batchId) || !sha256.test(input.previewSha256) || !guid.test(input.commandKey))
    throw new MasterImportError(0, "invalid-command", "The import command is invalid.");
  return parseResult(await json(await request(kind, companyId, "/commit", {
    method: "POST", body: JSON.stringify({ batchId: input.batchId,
      previewSha256: input.previewSha256, commandKey: input.commandKey }), signal,
  }), companyId, signal));
}
export async function recoverMasterImport(kind: MasterImportKind, companyId: string,
  batchId: string, signal?: AbortSignal): Promise<MasterImportRecovery> {
  if (!guid.test(batchId)) throw new MasterImportError(0, "invalid-batch", "The import reference is invalid.");
  const value = await json(await request(kind, companyId, `/${batchId}`, { signal }), companyId, signal);
  if (!object(value) || value.batchId !== batchId)
    throw new MasterImportError(0, "invalid-recovery", "The saved import result could not be verified.");
  if (value.state === "Previewed") return { ...parsePreview(value), state: "Previewed" };
  if (value.state === "Committed") {
    const result = parseResult(value.result);
    if (result.batchId === batchId) return { state: "Committed", batchId, result };
  }
  throw new MasterImportError(0, "invalid-recovery", "The saved import result could not be verified.");
}
