import { useMemo, useState } from "react";
import { Download, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadCsv, mapTransferRows, parseCsv, suggestedMapping } from "@/platform/data-transfer";
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
  const problems = validate(rows);
  const ready = mappingIssue ? 0 : problems.filter((items) => items.length === 0).length;

  async function selectFile(file: File | undefined) {
    setHeaders([]); setSourceRows([]); setMapping({}); setDone(0); setError("");
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) return setError("Choose a CSV file. Excel can save a sheet as CSV first.");
    if (file.size > 1_000_000) return setError("Choose a CSV smaller than 1 MB.");
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.length < 2) throw new Error("Add at least one row below the headings.");
      if (parsed.length - 1 > maxRows) throw new Error(`Import up to ${maxRows} ${recordName} at a time.`);
      const headings = parsed[0].map((value) => value.trim());
      if (headings.some((value) => !value)) throw new Error("Every column needs a heading.");
      if (new Set(headings.map((value) => value.toLowerCase())).size !== headings.length) throw new Error("Column headings must be unique.");
      setHeaders(headings); setSourceRows(parsed.slice(1)); setMapping(suggestedMapping(headings, fields)); setFileName(file.name);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read the CSV."); }
  }

  function confirm() {
    if (!ready) return;
    try {
      const count = apply(rows.filter((_, index) => !problems[index]?.length));
      setDone(count); setHeaders([]); setSourceRows([]); setError("");
      onDone?.(count);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Import failed. Nothing was saved."); }
  }

  return <div className="space-y-4">
    <section className="rounded-lg border bg-surface p-5">
      <div className="flex items-start gap-3"><FileUp className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden /><div><h2 className="font-semibold">Choose your file</h2><p className="text-sm text-muted-foreground">CSV, up to {maxRows} rows and 1 MB. Review the columns and results before saving. This demo stores changes only in this browser.</p></div></div>
      <div className="mt-4 flex flex-wrap items-end gap-3"><div><Label htmlFor="transfer-file">{recordName} CSV</Label><Input id="transfer-file" type="file" accept=".csv,text/csv" className="mt-1 max-w-sm" onChange={(event) => void selectFile(event.target.files?.[0])} /></div><Button variant="outline" onClick={() => downloadCsv(`${recordName}-template.csv`, fields, [])}>Download template</Button></div>
    </section>
    {error ? <p role="alert" className="rounded-md border border-danger/40 bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}
    {done ? <p role="status" className="rounded-md border border-success/40 bg-success-soft p-3 text-sm"><strong>{done} {done === 1 ? oneName : recordName} added for review.</strong></p> : null}
    {headers.length ? <>
      <section className="rounded-lg border bg-surface p-5"><h2 className="font-semibold">Match your columns</h2><p className="mt-1 text-sm text-muted-foreground">Choose which column fills each field in {fileName}. Unused columns are ignored.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{fields.map((field) => <div key={field.key}><Label htmlFor={`map-${field.key}`}>{field.label}{field.required ? " *" : ""}</Label><select id={`map-${field.key}`} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={mapping[field.key] ?? -1} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: Number(event.target.value) }))}><option value={-1}>Leave blank</option>{headers.map((heading, index) => <option value={index} key={`${heading}-${index}`}>{heading}</option>)}</select></div>)}</div>
        {mappingIssue ? <p role="alert" className="mt-3 text-sm text-danger">Each file column can fill only one field. Check the matches above.</p> : null}
      </section>
      <section className="rounded-lg border bg-surface p-5"><h2 className="font-semibold">Review before saving</h2><p className="mt-1 text-sm text-muted-foreground">{ready} ready · {rows.length - ready} need attention. Only ready rows will be added.</p>
        <div className="mt-4 max-h-[28rem] overflow-auto"><table className="w-full min-w-[42rem] text-left text-sm"><thead><tr className="border-b"><th className="p-2">Row</th>{fields.filter((field) => field.required).map((field) => <th className="p-2" key={field.key}>{field.label}</th>)}<th className="p-2">Result</th></tr></thead><tbody>{rows.map((row, index) => <tr className="border-b" key={index}><td className="p-2">{index + 2}</td>{fields.filter((field) => field.required).map((field) => <td className="max-w-48 truncate p-2" title={row[field.key]} key={field.key}>{row[field.key] || "—"}</td>)}<td className={`p-2 ${problems[index]?.length ? "text-danger" : "text-success"}`}>{problems[index]?.length ? problems[index].join("; ") : "Ready"}</td></tr>)}</tbody></table></div>
        <div className="mt-4 flex flex-wrap gap-2"><Button disabled={!ready} onClick={confirm}>Add {ready} {ready === 1 ? oneName : recordName}</Button><Button variant="outline" onClick={() => { setHeaders([]); setSourceRows([]); setError(""); }}>Clear file</Button></div>
      </section>
    </> : null}
  </div>;
}
