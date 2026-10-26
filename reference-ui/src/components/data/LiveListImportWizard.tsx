import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileUp } from "lucide-react";
import { Button, Field, Input, Modal, Select, Switch } from "../ui";
import { RecordTable } from "./RecordTable";
import { ImportMappingTable, ImportStageHeading, ImportWizardTips } from "./ImportWizardPresentation";
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
/** Read the header and one display sample. The server alone validates data rows. */
export function csvHeaderSample(bytes: Uint8Array): { headers: string[]; sample: Record<string, string> } {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const records: string[][] = [];
  let cells: string[] = [];
  let cell = "", quoted = false, closed = false;
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i <= text.length; i++) {
    const char = text[i];
    if (i === text.length && quoted) throw Error("The CSV sample has an unfinished quote.");
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else if (!cell && !closed) quoted = true;
      else if (quoted) { quoted = false; closed = true; }
      else throw Error("The CSV header has invalid quotes.");
    } else if (!quoted && (char === "," || char === "\r" || char === "\n" || i === text.length)) {
      cells.push(cell.trim()); cell = ""; closed = false;
      if (char !== ",") {
        records.push(cells); cells = [];
        if (records.length === 2) {
          const headers = records[0];
          if (!headers.length || headers.length > 64 || headers.some(h => !h || h.length > 256)
            || new Set(headers).size !== headers.length) throw Error("The CSV headers are missing or duplicated.");
          if (records[1].every(value => !value)) throw Error("The CSV has no sample data row.");
          return { headers, sample: Object.fromEntries(headers.map((header, index) => [header, records[1][index] ?? ""])) };
        }
        if (char === "\r" && text[i + 1] === "\n") i++;
      }
    } else { if (closed) throw Error("The CSV header has invalid characters after a quote."); cell += char; }
  }
  throw Error("The CSV has no data rows.");
}
export const csvHeaders = (bytes: Uint8Array) => csvHeaderSample(bytes).headers;
function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

export function LiveListImportWizard({ config, onClose }: { config: LiveImport; onClose: () => void }) {
  const { kind, companyId, scope, schema, scopeKey } = config;
  const [stage, setStage] = useState<Stage>("configure");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sample, setSample] = useState<Record<string, string>>({});
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
  const generation = useRef(0);
  const renderedScope = useRef(scopeKey);
  if (renderedScope.current !== scopeKey) {
    renderedScope.current = scopeKey;
    generation.current += 1;
    controller.current?.abort();
  }
  const current = (token: number) => active.current && generation.current === token;
  useEffect(() => {
    const token = ++generation.current;
    active.current = true; lock.current = false; controller.current = null;
    setBusy(false); setPending(null); setFile(null); setHeaders([]); setSample({}); setMapping({});
    setPreview(null); setResult(null); setAcknowledged([]); setDefiniteDenial(false); setChecking(false);
    setDuplicatePolicy("reject"); setError(""); setNotice(""); setStage("configure");
    try { const saved = masterImportJournal.read(scope); if (saved) { setPending(saved); setNotice("Check whether the earlier import was saved before making another change."); } }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Import recovery is unavailable."); }
    return () => { if (generation.current === token) generation.current += 1; active.current = false; controller.current?.abort(); };
  }, [scopeKey, scope.tenantId, scope.companyId, scope.principalId, scope.kind]);
  function begin(): AbortController | null {
    if (lock.current) return null;
    const request = new AbortController(); lock.current = true; controller.current = request; setBusy(true); setError(""); return request;
  }
  function end(request: AbortController) {
    if (controller.current === request) { controller.current = null; lock.current = false; if (active.current) setBusy(false); }
  }
  async function chooseFile(next: File) {
    const token = generation.current;
    if (next.size < 1 || next.size > maxBytes || !/\.csv$/i.test(next.name)
      || new TextEncoder().encode(next.name).length > 128) { setError("Choose a CSV file up to 5 MB with a short filename."); return; }
    try {
      const { headers: values, sample: firstRow } = csvHeaderSample(new Uint8Array(await next.arrayBuffer()));
      if (!current(token)) return;
      const mapped = Object.fromEntries(values.map(header => [header,
        schema.fields.find(field => normalize(field.key) === normalize(header) || normalize(field.label) === normalize(header))?.key ?? ""]));
      setFile(next); setHeaders(values); setSample(firstRow); setMapping(mapped);
      setPreview(null); setAcknowledged([]); setError(""); setStage("configure");
    } catch (cause) { if (current(token)) setError(cause instanceof Error ? cause.message : "The CSV header could not be read."); }
  }
  async function template() {
    const request = begin(); if (!request) return;
    const token = generation.current;
    try { const downloaded = await getMasterImportTemplate(kind, companyId, request.signal); if (current(token) && !request.signal.aborted) downloadMasterImportTemplate(downloaded); }
    catch (cause) { if (current(token) && !request.signal.aborted) setError(cause instanceof Error ? cause.message : "The template is unavailable."); }
    finally { end(request); }
  }
  async function makePreview(rows: number[]) {
    if (!file || pending) return;
    const chosen = Object.values(mapping).filter(Boolean);
    if (new Set(chosen).size !== chosen.length || !schema.fields.filter(field => field.required).every(field => chosen.includes(field.key))) {
      setError("Map each required ERP field once before previewing."); return;
    }
    const request = begin(); if (!request) return;
    const token = generation.current;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (request.signal.aborted || !current(token)) return;
      const next = await previewMasterImport(kind, companyId, { schemaVersion: schema.schemaVersion,
        fileName: file.name, csvBase64: base64(bytes), mapping: Object.fromEntries(Object.entries(mapping).filter(([, target]) => target)),
        duplicatePolicy, acknowledgedSimilarityRows: rows }, request.signal);
      if (request.signal.aborted || !current(token)) return;
      setPreview(next); setAcknowledged(rows); setStage("preview");
    } catch (cause) { if (current(token) && !request.signal.aborted) setError(cause instanceof Error ? cause.message : "The ERP preview is unavailable."); }
    finally { end(request); }
  }
  async function checkSaved(locator: ImportLocator) {
    const request = begin(); if (!request) return;
    const token = generation.current;
    setChecking(true);
    try {
      const saved = await recoverMasterImport(kind, companyId, locator.batchId, request.signal);
      if (!current(token) || request.signal.aborted) return;
      if (saved.state === "Committed") {
        if (saved.result.batchId !== locator.batchId) throw Error("The saved import reference did not match.");
        masterImportJournal.clear(scope, locator); setPending(null); setResult(saved.result); setStage("done"); config.onCommitted();
      } else if (saved.previewSha256 === locator.previewSha256) {
        if (definiteDenial) {
          masterImportJournal.clear(scope, locator); setPending(null); setPreview(null); setStage("map"); setDefiniteDenial(false);
          setNotice("The ERP rejected that import. Correct the mapping or CSV and request a new preview.");
        } else setNotice("The import has not been committed. You can retry with the same saved key.");
      } else throw Error("The saved preview changed. Contact an administrator before retrying.");
    } catch (cause) { if (current(token) && !request.signal.aborted) setError(cause instanceof Error ? cause.message : "The saved result could not be checked."); }
    finally { if (current(token)) setChecking(false); end(request); }
  }
  async function commit() {
    if (pending || !preview || preview.willError || preview.willCreate + preview.willSkip === 0
      || Date.parse(preview.expiresAt) <= Date.now()) return;
    const locator = { batchId: preview.batchId, previewSha256: preview.previewSha256,
      commandKey: crypto.randomUUID(), expiresAt: preview.expiresAt };
    const request = begin(); if (!request) return;
    const token = generation.current;
    try {
      masterImportJournal.claim(scope, locator); setPending(locator);
      const written = await commitMasterImport(kind, companyId, {
        batchId: locator.batchId, previewSha256: locator.previewSha256, commandKey: locator.commandKey,
      }, request.signal);
      if (!current(token) || request.signal.aborted) return;
      if (written.batchId !== locator.batchId) throw Error("The import acknowledgement did not match the saved preview.");
      const saved = await recoverMasterImport(kind, companyId, locator.batchId, request.signal);
      if (!current(token) || request.signal.aborted) return;
      if (saved.state !== "Committed" || JSON.stringify(saved.result) !== JSON.stringify(written))
        throw Error("Check the saved import before another change.");
      masterImportJournal.clear(scope, locator); setPending(null); setResult(written); setStage("done"); config.onCommitted();
    } catch (cause) { if (current(token) && !request.signal.aborted) {
      if (cause instanceof MasterImportError && [400, 403, 413, 422].includes(cause.status)) setDefiniteDenial(true);
      setError(cause instanceof Error ? cause.message : "Check the saved import before another change.");
    } }
    finally { end(request); }
  }
  async function retrySaved() {
    if (!pending || checking) return;
    const request = begin(); if (!request) return;
    const token = generation.current;
    try {
      const saved = await recoverMasterImport(kind, companyId, pending.batchId, request.signal);
      if (request.signal.aborted || !current(token)) return;
      if (saved.state === "Committed") {
        masterImportJournal.clear(scope, pending); setPending(null); setResult(saved.result); setStage("done"); config.onCommitted(); return;
      }
      if (saved.previewSha256 !== pending.previewSha256 || Date.parse(pending.expiresAt) <= Date.now())
        throw Error("The saved preview expired or changed. Contact an administrator before retrying.");
      const written = await commitMasterImport(kind, companyId, {
        batchId: pending.batchId, previewSha256: pending.previewSha256, commandKey: pending.commandKey,
      }, request.signal);
      if (request.signal.aborted || !current(token) || written.batchId !== pending.batchId) return;
      const confirmed = await recoverMasterImport(kind, companyId, pending.batchId, request.signal);
      if (confirmed.state !== "Committed" || JSON.stringify(confirmed.result) !== JSON.stringify(written))
        throw Error("Check the saved import before another change.");
      masterImportJournal.clear(scope, pending); setPending(null); setResult(written); setStage("done"); config.onCommitted();
    } catch (cause) { if (current(token) && !request.signal.aborted) setError(cause instanceof Error ? cause.message : "The saved import could not be checked."); }
    finally { end(request); }
  }
  const close = () => { controller.current?.abort(); onClose(); };
  const title = kind === "vendors" ? "Vendors" : "Items";
  return <Modal title={`Import ${title}`} onClose={close} wide>
    {stage === "done" && !pending ? <div className="space-y-5 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Check size={24} /></span>
      <div><h3 className="text-lg font-semibold text-slate-800">ERP import complete</h3>
        <p role="status" className="mt-2 text-sm text-slate-500">ERP saved this import. {result?.created ?? 0} created · {result?.skipped ?? 0} skipped.</p>
        <p className="mt-2 text-xs text-slate-400">The confirmed records are now available in the company catalog.</p></div>
      <Button onClick={close}>Done</Button>
    </div> : <div className="space-y-5">
      <ImportStageHeading stage={stage} title={title} />
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {pending ? <div className="space-y-4 rounded-md border border-amber-100 bg-amber-50 p-4 text-sm">
        <p>Check whether this import was saved before another change.</p>
        <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void checkSaved(pending)}>Check saved import</Button>
          {checking ? <span role="status">Checking…</span> : <Button variant="secondary" disabled={busy} onClick={() => void retrySaved()}>Retry saved command</Button>}</div>
      </div> : stage === "configure" ? <div className="space-y-5">
        <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-blue-200 bg-slate-50 px-5 py-6 text-center hover:bg-blue-50/40"
          onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const next = event.dataTransfer.files[0]; if (next) void chooseFile(next); }}>
          <FileUp className="mb-3 text-blue-500" size={28} />
          <span className="text-sm font-medium text-slate-700">Drag and drop a file to import</span>
          <span className="my-2 rounded-md bg-blue-500 px-4 py-2 text-xs font-semibold text-white">{file?.name || "Choose File"}</span>
          <span className="text-[11px] text-slate-500">Maximum File Size: 5 MB · File Format: UTF-8 CSV</span>
          <Input type="file" accept=".csv,text/csv" aria-label="Choose import file" className="sr-only"
            onChange={event => { const next = event.target.files?.[0]; if (next) void chooseFile(next); }} />
        </label>
        <div className="flex flex-wrap gap-3 text-xs"><button className="text-blue-600 hover:underline" disabled={busy}
          onClick={() => void template()}>Download the ERP sample CSV file</button>
          <span className="text-slate-500">XLS and contact imports are unavailable for live records.</span></div>
        <div className="rounded-md bg-blue-50/60 p-3 text-xs text-slate-600">
          <strong className="mb-2 block">Duplicate Handling <span className="text-red-500">*</span></strong>
          <Field label="Matching records"><Select value={duplicatePolicy} aria-label="Duplicate Handling"
            onChange={event => setDuplicatePolicy(event.target.value as MasterDuplicatePolicy)}>
            <option value="reject">Reject duplicates</option><option value="skip">Skip exact duplicates</option>
          </Select></Field>
          <p className="mt-2">Overwriting or adding matching records as duplicates is unavailable.</p>
        </div>
        <Field label="Character Encoding" hint="The ERP accepts UTF-8 CSV for this import."><Select aria-label="Character Encoding" value="UTF-8 (Unicode)" disabled><option>UTF-8 (Unicode)</option></Select></Field>
        <ImportWizardTips><li>Download the ERP sample CSV to see the required column names.</li>
          <li>Duplicate Handling determines whether exact matches stop or are skipped.</li>
          <li>The ERP validates all rows; the sample value shown during mapping is for display only.</li>
          <li>Confirming saves a batch. If the response is interrupted, check the saved import before another change.</li></ImportWizardTips>
      </div> : stage === "map" ? <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>{file?.name}</span>
          <span>Map each file column to an ERP {kind === "vendors" ? "vendor" : "item"} field.</span></div>
        <ImportMappingTable headers={headers} sample={sample} mapping={mapping} fields={schema.fields}
          onMap={(header, target) => setMapping(previous => ({ ...previous, [header]: target }))} />
        <p className="text-xs text-slate-500">Required fields: {schema.fields.filter(field => field.required).map(field => field.label).join(", ")}.
          {new Set(Object.values(mapping).filter(Boolean)).size !== Object.values(mapping).filter(Boolean).length
            ? " Each ERP field can be mapped only once." : " The ERP will validate every row in the preview."}</p>
      </div> : stage === "preview" && preview ? <div className="space-y-4">
        <div className="flex flex-wrap justify-between gap-2 rounded-md bg-slate-50 p-3 text-xs">
          <span>{preview.willCreate} to create · {preview.willSkip} to skip</span><span>{preview.willError} need attention</span></div>
        <div className="max-h-72 overflow-auto rounded-md border border-slate-200">
          <RecordTable variant="compact" className="w-full min-w-[560px] text-left text-xs"><thead className="table-head"><tr>
            <th className="table-cell">CSV row</th><th className="table-cell">Physical lines</th><th className="table-cell">Outcome</th><th className="table-cell">Details</th>
          </tr></thead><tbody>{preview.rows.map(row => <tr key={row.rowNumber} className="border-t border-slate-100">
            <td className="table-cell">{row.rowNumber}</td><td className="table-cell">{row.startLine}–{row.endLine}</td>
            <td className="table-cell">{row.disposition}</td><td className="table-cell">{row.message ?? row.code ?? "—"}</td>
          </tr>)}</tbody></RecordTable>
        </div>
        {preview.rows.some(row => row.code === "similar-vendor") && <div className="rounded-md border border-amber-100 bg-amber-50 p-4 text-sm">
          <p>Review similar vendor names. They are never merged automatically.</p>
          {preview.rows.filter(row => row.code === "similar-vendor").map(row => <label key={row.rowNumber} className="mt-2 flex items-center gap-2">
            <Switch checked={acknowledged.includes(row.rowNumber)} aria-label={`I reviewed CSV row ${row.rowNumber} and want a new preview`}
              onChange={event => setAcknowledged(current => event.target.checked ? [...current, row.rowNumber] : current.filter(number => number !== row.rowNumber))} />
            I reviewed CSV row {row.rowNumber} and want a new preview.</label>)}
          <Button variant="secondary" disabled={busy || !preview.rows.filter(row => row.code === "similar-vendor").every(row => acknowledged.includes(row.rowNumber))}
            onClick={() => void makePreview(acknowledged)}>Preview acknowledged rows</Button></div>}
        <ImportWizardTips><li>Review each error before confirming. Any error blocks this batch.</li>
          <li>Only the ERP preview determines which rows can be created or skipped.</li>
          <li>Revising similarity acknowledgements creates a new preview and batch reference.</li></ImportWizardTips>
      </div> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
        <div>{!pending && stage !== "configure" && <Button variant="secondary" onClick={() => {
          setStage(stage === "preview" ? "map" : "configure"); if (stage === "preview") setPreview(null);
        }}><ArrowLeft size={14} /> Back</Button>}</div>
        <div className="flex gap-2"><Button variant="secondary" onClick={close}>Cancel</Button>
          {!pending && stage === "configure" && <Button disabled={!file || busy} onClick={() => setStage("map")}>Next <ArrowRight size={14} /></Button>}
          {!pending && stage === "map" && <Button disabled={!file || busy} onClick={() => void makePreview([])}>Preview on ERP <ArrowRight size={14} /></Button>}
          {!pending && stage === "preview" && preview && <Button disabled={busy || preview.willError > 0 || preview.willCreate + preview.willSkip === 0 || Date.parse(preview.expiresAt) <= Date.now()}
            onClick={() => void commit()}>Confirm import</Button>}</div>
      </div>
    </div>}
  </Modal>;
}
