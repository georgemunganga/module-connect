import { FormSelect } from "@/components/ui/form-select";
import { RecordTable } from "./RecordTable";
import { useMemo, useState } from "react";
import { Download, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadCsv, mapTransferRows, parseDelimited, suggestedMapping } from "@/platform/data-transfer";
import type { TransferField, TransferRow } from "@/platform/data-transfer";

export function DataExportButton({ fileName, fields, rows, label = "Export CSV" }: {
  fileName: string; fields: TransferField[]; rows: TransferRow[]; label?: string;
}) {
  return <Button variant="outline" onClick={() => downloadCsv(fileName, fields, rows)}><Download className="size-4" aria-hidden />{label}</Button>;
}

export function DataImportPanel({ recordName, fields, validate, apply, onDone, maxRows = 200 }: {
  recordName: string;
  fields: TransferField[];
  validate: (rows: TransferRow[]) => string[][];
  apply: (rows: TransferRow[]) => number;
  onDone?: (count: number) => void;
  maxRows?: number;
}) {
  const [stage, setStage] = useState<"configure" | "map" | "preview">("configure");
  const [headers, setHeaders] = useState<string[]>([]);
  const [sourceRows, setSourceRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(0);
  const oneName = recordName.endsWith("s") ? recordName.slice(0, -1) : recordName;
  const rows = useMemo(() => mapTransferRows(sourceRows, fields, mapping), [sourceRows, fields, mapping]);
  const mappedColumns = Object.values(mapping).filter((index) => index >= 0);
  const mappingIssue = mappedColumns.length !== new Set(mappedColumns).size;
  const requiredMissing = fields.filter((field) => field.required && (mapping[field.key] ?? -1) < 0);
  const problems = validate(rows);
  const ready = mappingIssue || requiredMissing.length ? 0 : problems.filter((items) => items.length === 0).length;

  function clearFile() {
    setStage("configure"); setHeaders([]); setSourceRows([]); setMapping({}); setFileName(""); setError("");
  }

  async function selectFile(file: File | undefined) {
    clearFile(); setDone(0);
    if (!file) return;
    const delimiter = /\.csv$/i.test(file.name) ? "," : /\.tsv$/i.test(file.name) ? "\t" : null;
    if (!delimiter) return setError("Choose a CSV or TSV file. Save an Excel sheet as CSV first.");
    if (file.size > 1_000_000) return setError("Choose a file smaller than 1 MB.");
    try {
      const parsed = parseDelimited(await file.text(), delimiter);
      if (parsed.length < 2) throw new Error("Add at least one row below the headings.");
      if (parsed.length - 1 > maxRows) throw new Error(`Import up to ${maxRows} ${recordName} at a time.`);
      const headings = parsed[0].map((value) => value.trim());
      if (headings.some((value) => !value)) throw new Error("Every column needs a heading.");
      if (new Set(headings.map((value) => value.toLowerCase())).size !== headings.length) throw new Error("Column headings must be unique.");
      if (parsed.slice(1).some((row) => row.length !== headings.length)) throw new Error("Each row must have the same number of columns as the headings.");
      setHeaders(headings); setSourceRows(parsed.slice(1)); setMapping(suggestedMapping(headings, fields)); setFileName(file.name);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read the file."); }
  }

  function confirm() {
    if (!ready) return;
    try {
      const count = apply(rows.filter((_, index) => !problems[index]?.length));
      setDone(count); clearFile();
      onDone?.(count);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Import failed. Nothing was saved."); }
  }

  return <div className="space-y-4">
    <ol aria-label="Import steps" className="flex flex-wrap gap-2 text-sm">
      {(["configure", "map", "preview"] as const).map((step, index) => <li key={step} aria-current={stage === step ? "step" : undefined} className={`rounded-full border px-3 py-1 ${stage === step ? "border-primary bg-primary-soft font-medium text-primary" : "text-muted-foreground"}`}>{index + 1}. {step === "configure" ? "Choose file" : step === "map" ? "Match columns" : "Review and add"}</li>)}
    </ol>
    {error ? <p role="alert" className="rounded-md border border-danger/40 bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}
    {done ? <p role="status" className="rounded-md border border-success/40 bg-success-soft p-3 text-sm"><strong>{done} {done === 1 ? oneName : recordName} added for review.</strong></p> : null}
    {stage === "configure" ? <>
    <section className="rounded-lg border bg-surface p-5">
      <div className="flex items-start gap-3"><FileUp className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden /><div><h2 className="font-semibold">1. Choose your file</h2><p className="text-sm text-muted-foreground">CSV or TSV, up to {maxRows} rows and 1 MB. Save an Excel sheet as CSV first. This demo stores changes only in this browser.</p></div></div>
      <div className="mt-4 flex flex-wrap items-end gap-3"><div><Label htmlFor="transfer-file">{recordName} file</Label><Input id="transfer-file" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" className="mt-1 max-w-sm" onChange={(event) => void selectFile(event.target.files?.[0])} /></div><Button variant="outline" onClick={() => downloadCsv(`${recordName}-template.csv`, fields, [])}>Download sample CSV</Button></div>
      {headers.length ? <div className="mt-4"><p className="text-sm">{fileName}: {sourceRows.length} rows and {headers.length} columns found.</p><Button className="mt-3" onClick={() => setStage("map")}>Match columns</Button></div> : null}
    </section>
    </> : null}
    {stage === "map" ? <>
      <section className="rounded-lg border bg-surface p-5"><h2 className="font-semibold">2. Match your columns</h2><p className="mt-1 text-sm text-muted-foreground">Choose which column fills each field in {fileName}. Unused columns are ignored.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{fields.map((field) => <div key={field.key}><Label htmlFor={`map-${field.key}`}>{field.label}{field.required ? " *" : ""}</Label><FormSelect id={`map-${field.key}`} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={mapping[field.key] ?? -1} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: Number(event.target.value) }))}><option value={-1}>Leave blank</option>{headers.map((heading, index) => <option value={index} key={`${heading}-${index}`}>{heading}</option>)}</FormSelect></div>)}</div>
        {mappingIssue ? <p role="alert" className="mt-3 text-sm text-danger">Each file column can fill only one field. Check the matches above.</p> : null}
        {requiredMissing.length ? <p role="alert" className="mt-3 text-sm text-danger">Match the required fields: {requiredMissing.map((field) => field.label).join(", ")}.</p> : null}
        <div className="mt-4 flex gap-2"><Button variant="outline" onClick={() => setStage("configure")}>Back</Button><Button disabled={mappingIssue || requiredMissing.length > 0} onClick={() => setStage("preview")}>Review rows</Button></div>
      </section>
    </> : null}
    {stage === "preview" ? <>
      <section className="rounded-lg border bg-surface p-5"><h2 className="font-semibold">3. Review before saving</h2><p className="mt-1 text-sm text-muted-foreground">{ready} ready · {rows.length - ready} need attention. Rows with errors or duplicate names/IDs are skipped; only ready rows will be added.</p>
        <div className="mt-4 max-h-[28rem] overflow-auto"><RecordTable variant="compact" className="w-full min-w-[42rem] text-left text-sm"><thead><tr className="border-b"><th className="p-2">Row</th>{fields.filter((field) => field.required).map((field) => <th className="p-2" key={field.key}>{field.label}</th>)}<th className="p-2">Result</th></tr></thead><tbody>{rows.map((row, index) => <tr className="border-b" key={index}><td className="p-2">{index + 2}</td>{fields.filter((field) => field.required).map((field) => <td className="max-w-48 truncate p-2" title={row[field.key]} key={field.key}>{row[field.key] || "—"}</td>)}<td className={`p-2 ${problems[index]?.length ? "text-danger" : "text-success"}`}>{problems[index]?.length ? problems[index].join("; ") : "Ready"}</td></tr>)}</tbody></RecordTable></div>
        <div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" onClick={() => setStage("map")}>Back to columns</Button><Button disabled={!ready} onClick={confirm}>Add {ready} {ready === 1 ? oneName : recordName}</Button><Button variant="outline" onClick={clearFile}>Clear file</Button></div>
      </section>
    </> : null}
  </div>;
}
