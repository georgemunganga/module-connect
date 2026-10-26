import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileUp } from "lucide-react";
import { Button, Field, Input, Modal, Select } from "../ui";
import { masterImportJournal, type ImportLocator } from "../../lib/master-import-journal";
import type { LiveImport } from "../../lib/useLiveMasterImport";
import {
  commitMasterImport, downloadMasterImportTemplate, getMasterImportTemplate,
  previewMasterImport, recoverMasterImport, MasterImportError, type MasterImportPreview, type MasterImportResult,
  type MasterDuplicatePolicy,
} from "../../../../src/platform/procurement-master-import";

type Stage = "configure" | "map" | "preview" | "done";
const maxBytes = 5 * 1024 * 1024;
const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
/** Inspect only the CSV header for mapping. The server parses every data row. */
export function csvHeaders(bytes: Uint8Array): string[] {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const headers: string[] = [];
  let cell = "", quoted = false, closed = false;
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else if (!cell && !closed) quoted = true;
      else if (quoted) { quoted = false; closed = true; }
      else throw Error("The CSV header has invalid quotes.");
    } else if (!quoted && (char === "," || char === "\r" || char === "\n")) {
      headers.push(cell.trim()); cell = ""; closed = false;
      if (char !== ",") {
        if (!headers.length || headers.length > 64 || headers.some(h => !h || h.length > 256)
          || new Set(headers).size !== headers.length) throw Error("The CSV headers are missing or duplicated.");
        return headers;
      }
    } else { if (closed) throw Error("The CSV header has invalid characters after a quote."); cell += char; }
  }
  throw Error("The CSV has no data rows.");
}
function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

export function LiveListImportWizard({ config, onClose }: { config: LiveImport; onClose: () => void }) {
  const { kind, companyId, scope, schema } = config;
  const [stage, setStage] = useState<Stage>("configure");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [duplicatePolicy, setDuplicatePolicy] = useState<MasterDuplicatePolicy>("reject");
  const [preview, setPreview] = useState<MasterImportPreview | null>(null);
  const [acknowledged, setAcknowledged] = useState<number[]>([]);
  const [result, setResult] = useState<MasterImportResult | null>(null);
  const [pending, setPending] = useState<ImportLocator | null>(null);
  const [definiteDenial, setDefiniteDenial] = useState(false);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true; lock.current = false; controller.current = null; setBusy(false); setPending(null);
    try { const saved = masterImportJournal.read(scope); if (saved) { setPending(saved); setNotice("Check whether the earlier import was saved before making another change."); } }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Import recovery is unavailable."); }
    return () => { active.current = false; controller.current?.abort(); };
  }, [scope.tenantId, scope.companyId, scope.principalId, scope.branch, scope.kind]);
  function begin(): AbortController | null {
    if (lock.current) return null;
    const request = new AbortController(); lock.current = true; controller.current = request; setBusy(true); setError(""); return request;
  }
  function end(request: AbortController) {
    if (controller.current === request) { controller.current = null; lock.current = false; if (active.current) setBusy(false); }
  }
  async function chooseFile(next: File) {
    if (next.size < 1 || next.size > maxBytes || !/\.csv$/i.test(next.name)
      || new TextEncoder().encode(next.name).length > 128) { setError("Choose a CSV file up to 5 MB with a short filename."); return; }
    try {
      const values = csvHeaders(new Uint8Array(await next.arrayBuffer()));
      if (!active.current) return;
      const mapped = Object.fromEntries(values.map(header => [header,
        schema.fields.find(field => normalize(field.key) === normalize(header) || normalize(field.label) === normalize(header))?.key ?? ""]));
      setFile(next); setHeaders(values); setMapping(mapped); setPreview(null); setAcknowledged([]); setError(""); setStage("map");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The CSV header could not be read."); }
  }
  async function template() {
    const request = begin(); if (!request) return;
    try { const downloaded = await getMasterImportTemplate(kind, companyId, request.signal); if (active.current && !request.signal.aborted) downloadMasterImportTemplate(downloaded); }
    catch (cause) { if (active.current && !request.signal.aborted) setError(cause instanceof Error ? cause.message : "The template is unavailable."); }
    finally { end(request); }
  }
  async function makePreview(rows: number[]) {
    if (!file || pending) return;
    const chosen = Object.values(mapping).filter(Boolean);
    if (new Set(chosen).size !== chosen.length || !schema.fields.filter(field => field.required).every(field => chosen.includes(field.key))) {
      setError("Map each required ERP field once before previewing."); return;
    }
    const request = begin(); if (!request) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (request.signal.aborted || !active.current) return;
      const next = await previewMasterImport(kind, companyId, { schemaVersion: schema.schemaVersion,
        fileName: file.name, csvBase64: base64(bytes), mapping: Object.fromEntries(Object.entries(mapping).filter(([, target]) => target)),
        duplicatePolicy, acknowledgedSimilarityRows: rows }, request.signal);
      if (request.signal.aborted || !active.current) return;
      setPreview(next); setAcknowledged(rows); setStage("preview");
    } catch (cause) { if (active.current && !request.signal.aborted) setError(cause instanceof Error ? cause.message : "The ERP preview is unavailable."); }
    finally { end(request); }
  }
  async function checkSaved(locator: ImportLocator) {
    const request = begin(); if (!request) return;
    setChecking(true);
    try {
      const saved = await recoverMasterImport(kind, companyId, locator.batchId, request.signal);
      if (!active.current || request.signal.aborted) return;
      if (saved.state === "Committed") {
        if (saved.result.batchId !== locator.batchId) throw Error("The saved import reference did not match.");
        masterImportJournal.clear(scope, locator); setPending(null); setResult(saved.result); setStage("done"); config.onCommitted();
      } else if (saved.previewSha256 === locator.previewSha256) {
        if (definiteDenial) {
          masterImportJournal.clear(scope, locator); setPending(null); setPreview(null); setStage("map"); setDefiniteDenial(false);
          setNotice("The ERP rejected that import. Correct the mapping or CSV and request a new preview.");
        } else setNotice("The import has not been committed. You can retry with the same saved key.");
      } else throw Error("The saved preview changed. Contact an administrator before retrying.");
    } catch (cause) { if (active.current && !request.signal.aborted) setError(cause instanceof Error ? cause.message : "The saved result could not be checked."); }
    finally { if (active.current) setChecking(false); end(request); }
  }
  async function commit() {
    if (pending || !preview || preview.willError || preview.willCreate + preview.willSkip === 0
      || Date.parse(preview.expiresAt) <= Date.now()) return;
    const locator = { batchId: preview.batchId, previewSha256: preview.previewSha256,
      commandKey: crypto.randomUUID(), expiresAt: preview.expiresAt };
    const request = begin(); if (!request) return;
    try {
      masterImportJournal.claim(scope, locator); setPending(locator);
      const written = await commitMasterImport(kind, companyId, locator, request.signal);
      if (!active.current || request.signal.aborted) return;
      if (written.batchId !== locator.batchId) throw Error("The import acknowledgement did not match the saved preview.");
      const saved = await recoverMasterImport(kind, companyId, locator.batchId, request.signal);
      if (!active.current || request.signal.aborted) return;
      if (saved.state !== "Committed" || JSON.stringify(saved.result) !== JSON.stringify(written))
        throw Error("Check the saved import before another change.");
      masterImportJournal.clear(scope, locator); setPending(null); setResult(written); setStage("done"); config.onCommitted();
    } catch (cause) { if (active.current && !request.signal.aborted) {
      if (cause instanceof MasterImportError && [400, 403, 413, 422].includes(cause.status)) setDefiniteDenial(true);
      setError(cause instanceof Error ? cause.message : "Check the saved import before another change.");
    } }
    finally { end(request); }
  }
  async function retrySaved() {
    if (!pending || checking) return;
    const request = begin(); if (!request) return;
    try {
      const saved = await recoverMasterImport(kind, companyId, pending.batchId, request.signal);
      if (request.signal.aborted || !active.current) return;
      if (saved.state === "Committed") {
        masterImportJournal.clear(scope, pending); setPending(null); setResult(saved.result); setStage("done"); config.onCommitted(); return;
      }
      if (saved.previewSha256 !== pending.previewSha256 || Date.parse(pending.expiresAt) <= Date.now())
        throw Error("The saved preview expired or changed. Contact an administrator before retrying.");
      const written = await commitMasterImport(kind, companyId, pending, request.signal);
      if (request.signal.aborted || !active.current || written.batchId !== pending.batchId) return;
      const confirmed = await recoverMasterImport(kind, companyId, pending.batchId, request.signal);
      if (confirmed.state !== "Committed" || JSON.stringify(confirmed.result) !== JSON.stringify(written))
        throw Error("Check the saved import before another change.");
      masterImportJournal.clear(scope, pending); setPending(null); setResult(written); setStage("done"); config.onCommitted();
    } catch (cause) { if (active.current && !request.signal.aborted) setError(cause instanceof Error ? cause.message : "The saved import could not be checked."); }
    finally { end(request); }
  }
  return <Modal title={`Import ${kind}`} onClose={() => { controller.current?.abort(); onClose(); }} wide>
    <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-slate-500" aria-label="Import progress">
      {(["configure", "map", "preview", "done"] as Stage[]).map((step, index) => <span key={step} className={`rounded-full border px-3 py-1 ${stage === step ? "border-primary text-primary" : "border-slate-200"}`}>{index + 1}. {step === "configure" ? "Choose CSV" : step === "map" ? "Map fields" : step === "preview" ? "Review" : "Result"}</span>)}
    </div>
    {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mb-3 text-sm">{notice}</p>}
    {pending ? <div className="space-y-3"><p className="text-sm">Check whether this import was saved before another change.</p>
      <Button disabled={busy} onClick={() => void checkSaved(pending)}>Check saved import</Button>
      {checking ? <span role="status">Checking…</span> : <Button variant="secondary" disabled={busy} onClick={() => void retrySaved()}>Retry saved command</Button>}
    </div> : stage === "configure" ? <div className="space-y-4">
      <p className="text-sm text-slate-600">Upload a UTF-8 CSV. The ERP will validate every row before any records are created.</p>
      <Button variant="secondary" disabled={busy} onClick={() => void template()}>Download ERP CSV template</Button>
      <Field label="CSV file"><Input type="file" accept=".csv,text/csv" onChange={event => { const chosen = event.target.files?.[0]; if (chosen) void chooseFile(chosen); }} /></Field>
      <p className="text-xs text-slate-500">CSV only · up to 5 MB and 1,000 rows</p>
    </div> : stage === "map" ? <div className="space-y-4">
      <p className="text-sm">{file?.name} · Choose the ERP field for each CSV column.</p>
      <div className="grid gap-3 sm:grid-cols-2">{headers.map(header => <Field key={header} label={header}><Select value={mapping[header] ?? ""}
        onChange={event => setMapping(current => ({ ...current, [header]: event.target.value }))}>
        <option value="">Do not import</option>{schema.fields.map(field => <option key={field.key} value={field.key}>{field.label}{field.required ? " · required" : ""}</option>)}
      </Select></Field>)}</div>
      <Field label="Duplicate records"><Select value={duplicatePolicy} onChange={event => setDuplicatePolicy(event.target.value as MasterDuplicatePolicy)}>
        <option value="reject">Reject duplicates</option><option value="skip">Skip exact duplicates</option>
      </Select></Field>
      <div className="flex gap-2"><Button variant="secondary" onClick={() => setStage("configure")}><ArrowLeft size={14} /> Back</Button>
        <Button disabled={busy} onClick={() => void makePreview([])}>Preview on ERP <ArrowRight size={14} /></Button></div>
    </div> : stage === "preview" && preview ? <div className="space-y-4">
      <p className="text-sm">{preview.willCreate} to create · {preview.willSkip} to skip · {preview.willError} need attention</p>
      <div className="max-h-72 overflow-auto rounded border"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">CSV row</th><th className="p-2">Lines</th><th className="p-2">Outcome</th><th className="p-2">Details</th></tr></thead><tbody>{preview.rows.map(row => <tr key={row.rowNumber} className="border-t"><td className="p-2">{row.rowNumber}</td><td className="p-2">{row.startLine}–{row.endLine}</td><td className="p-2">{row.disposition}</td><td className="p-2">{row.message ?? row.code ?? "—"}</td></tr>)}</tbody></table></div>
      {preview.rows.some(row => row.code === "similar-vendor") && <div className="rounded border p-3 text-sm"><p>Review similar vendor names. They are never merged automatically.</p>
        {preview.rows.filter(row => row.code === "similar-vendor").map(row => <label key={row.rowNumber} className="mt-2 flex gap-2"><input type="checkbox"
          checked={acknowledged.includes(row.rowNumber)} onChange={event => setAcknowledged(current => event.target.checked ? [...current, row.rowNumber] : current.filter(number => number !== row.rowNumber))} />
          I reviewed CSV row {row.rowNumber} and want a new preview.</label>)}
        <Button variant="secondary" disabled={busy || !preview.rows.filter(row => row.code === "similar-vendor").every(row => acknowledged.includes(row.rowNumber))}
          onClick={() => void makePreview(acknowledged)}>Preview acknowledged rows</Button></div>}
      <div className="flex gap-2"><Button variant="secondary" onClick={() => { setPreview(null); setStage("map"); }}><ArrowLeft size={14} /> Change mapping</Button>
        <Button disabled={busy || preview.willError > 0 || preview.willCreate + preview.willSkip === 0 || Date.parse(preview.expiresAt) <= Date.now()}
          onClick={() => void commit()}>Confirm import</Button></div>
    </div> : <div className="space-y-3"><p role="status" className="flex gap-2 text-sm"><Check size={16} /> ERP saved this import.</p>
      <p className="text-sm">{result?.created ?? 0} created · {result?.skipped ?? 0} skipped</p><Button onClick={onClose}>Done</Button></div>}
    <p className="mt-5 flex items-center gap-2 border-t pt-3 text-xs text-slate-500"><FileUp size={14} /> Records are created only after ERP confirmation.</p>
  </Modal>;
}
