import { RecordTable } from "./RecordTable";
import { useMemo, useState, type ChangeEvent } from "react";
import { ArrowLeft, ArrowRight, Check, FileUp } from "lucide-react";
import { Button, Field, Input, Modal, Select } from "../ui";
import {
  downloadCsv,
  downloadSpreadsheetXml,
  parseNonNegativeAmount,
  parseDelimited,
} from "../../lib/csv";

export type ImportKind = "vendors" | "vendor_contacts" | "items";
export type DuplicateMode = "skip" | "overwrite" | "add";
export type ImportResult = { added: number; skipped: number; issues: number };
type Stage = "choose" | "configure" | "map" | "preview" | "done";
type FieldOption = {
  key: string;
  label: string;
  required?: boolean;
  nonNegative?: boolean;
};
type ImportSettings = { duplicateMode?: DuplicateMode; encoding?: string };

function readImportSettings(): ImportSettings {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem("procureui.import-settings") ?? "{}",
    );
    return value && typeof value === "object" ? (value as ImportSettings) : {};
  } catch {
    return {};
  }
}

const fieldsFor = (kind: ImportKind): FieldOption[] => {
  if (kind === "vendor_contacts")
    return [
      { key: "vendorName", label: "Vendor Name", required: true },
      { key: "firstName", label: "First Name", required: true },
      { key: "lastName", label: "Last Name" },
      { key: "email", label: "Email" },
      { key: "workPhone", label: "Work Phone" },
      { key: "mobile", label: "Mobile" },
    ];
  if (kind === "items")
    return [
      { key: "name", label: "Name", required: true },
      { key: "sku", label: "SKU" },
      { key: "description", label: "Purchase Description" },
      { key: "rate", label: "Purchase Rate", nonNegative: true },
      { key: "unit", label: "Unit" },
      { key: "type", label: "Type" },
      { key: "status", label: "Status" },
    ];
  return [
    { key: "displayName", label: "Display Name", required: true },
    { key: "company", label: "Company Name" },
    { key: "firstName", label: "First Name" },
    { key: "lastName", label: "Last Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Work Phone" },
    { key: "mobile", label: "Mobile" },
    { key: "status", label: "Status" },
  ];
};

const normalize = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");
function guessField(header: string, fields: FieldOption[]): string {
  const normalized = normalize(header);
  const match = fields.find(
    (field) =>
      normalize(field.label) === normalized ||
      normalize(field.key) === normalized,
  );
  return match?.key ?? "";
}

function sampleHeaders(kind: ImportKind): string[] {
  if (kind === "vendor_contacts")
    return ["Vendor Name", "First Name", "Last Name", "Email", "Work Phone"];
  if (kind === "items")
    return ["Name", "SKU", "Purchase Description", "Purchase Rate", "Unit"];
  return ["Display Name", "Company Name", "Email", "Work Phone"];
}

function stageTitle(kind: ImportKind): string {
  return kind === "vendor_contacts"
    ? "Vendor's Contact Persons"
    : kind === "items"
      ? "Items"
      : "Vendors";
}

export function ListImportWizard({
  entity,
  onClose,
  onImport,
  notify,
}: {
  entity: "vendors" | "items";
  onClose: () => void;
  onImport: (
    rows: Record<string, string>[],
    kind: ImportKind,
    duplicateMode: DuplicateMode,
  ) => ImportResult;
  notify: (message: string) => void;
}) {
  const [kind, setKind] = useState<ImportKind>(
    entity === "items" ? "items" : "vendors",
  );
  const [stage, setStage] = useState<Stage>(
    entity === "items" ? "configure" : "choose",
  );
  const [fileName, setFileName] = useState("");
  const [sourceHeaders, setSourceHeaders] = useState<string[]>([]);
  const [sourceRows, setSourceRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>(
    () => readImportSettings().duplicateMode ?? "skip",
  );
  const [encoding, setEncoding] = useState(
    () => readImportSettings().encoding ?? "UTF-8 (Unicode)",
  );
  const [saveSettings, setSaveSettings] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const fields = useMemo(() => fieldsFor(kind), [kind]);
  const requiredFields = fields.filter((field) => field.required);
  const mappedTargets = Object.values(mapping).filter(Boolean);
  const hasMappingConflict =
    new Set(mappedTargets).size !== mappedTargets.length;
  const requiredMapped =
    !hasMappingConflict &&
    requiredFields.every((field) => mappedTargets.includes(field.key));
  const mappedRows = useMemo(
    () =>
      sourceRows.map((source) =>
        Object.fromEntries(
          sourceHeaders.flatMap((header) => {
            const target = mapping[header];
            return target ? [[target, source[header] ?? ""]] : [];
          }),
        ),
      ),
    [mapping, sourceHeaders, sourceRows],
  );
  const validRows = mappedRows.filter(
    (row) =>
      requiredFields.every((field) => String(row[field.key] ?? "").trim()) &&
      fields.every(
        (field) =>
          !field.nonNegative ||
          parseNonNegativeAmount(String(row[field.key] ?? "")) !== null,
      ),
  );
  const invalidCount = mappedRows.length - validRows.length;

  const selectKind = (next: ImportKind) => {
    setKind(next);
    setError("");
  };
  const processFile = async (file: File) => {
    setError("");
    setFileName(file.name);
    if (file.size > 25 * 1024 * 1024) {
      setSourceHeaders([]);
      setSourceRows([]);
      setError("Maximum file size is 25 MB.");
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension === "xls" || extension === "xlsx") {
      setSourceHeaders([]);
      setSourceRows([]);
      setError(
        "XLS is shown for reference, but this local-only prototype parses CSV and TSV files only.",
      );
      return;
    }
    if (extension !== "csv" && extension !== "tsv") {
      setSourceHeaders([]);
      setSourceRows([]);
      setError("Choose a CSV or TSV file for the local demo import.");
      return;
    }
    try {
      const parsed = parseDelimited(
        await file.text(),
        extension === "tsv" ? "\t" : ",",
      );
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setSourceHeaders([]);
        setSourceRows([]);
        setError("This file needs a header row and at least one data row.");
        return;
      }
      setSourceHeaders(parsed.headers);
      setSourceRows(parsed.rows);
      const usedTargets = new Set<string>();
      setMapping(
        Object.fromEntries(
          parsed.headers.map((header) => {
            const guessed = guessField(header, fieldsFor(kind));
            const target = guessed && !usedTargets.has(guessed) ? guessed : "";
            if (target) usedTargets.add(target);
            return [header, target];
          }),
        ),
      );
    } catch {
      setError(
        "The file could not be read in this browser. Try a UTF-8 CSV or TSV.",
      );
    }
  };
  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void processFile(file);
  };
  const close = () => {
    setStage(entity === "items" ? "configure" : "choose");
    onClose();
  };
  const title = `Import ${entity === "vendors" ? "Vendors" : "Items"}`;
  const stages: { key: Stage; label: string }[] = [
    { key: "configure", label: "Configure" },
    { key: "map", label: "Map Fields" },
    { key: "preview", label: "Preview" },
  ];
  const stageIndex = stages.findIndex((item) => item.key === stage);
  const makeSample = () => {
    const headers = sampleHeaders(kind);
    downloadCsv(`sample-${kind.replaceAll("_", "-")}.csv`, [headers]);
    notify("Sample CSV downloaded from the local preview.");
  };
  const makeExcelSample = () => {
    downloadSpreadsheetXml(
      `sample-${kind.replaceAll("_", "-")}.xls`,
      sampleHeaders(kind),
    );
    notify("Sample spreadsheet template downloaded from the local preview.");
  };
  const importNow = () => {
    const outcome = onImport(validRows, kind, duplicateMode);
    setResult({ ...outcome, issues: Math.max(outcome.issues, invalidCount) });
    setStage("done");
  };

  return (
    <Modal title={title} onClose={close} wide>
      {stage === "choose" ? (
        <div className="space-y-5">
          <p className="text-sm text-slate-600">
            Choose which local catalog records to import from a CSV or TSV file.
            This preview never uploads or imports data into ERP.
          </p>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-blue-200 bg-blue-50/50 p-4">
            <input
              type="radio"
              name="vendor-import-type"
              checked={kind === "vendors"}
              onChange={() => selectKind("vendors")}
            />
            <span>
              <strong className="block text-sm">Vendors</strong>
              <span className="text-xs text-slate-500">
                Import vendor records into this browser's demo catalog.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 p-4">
            <input
              type="radio"
              name="vendor-import-type"
              checked={kind === "vendor_contacts"}
              onChange={() => selectKind("vendor_contacts")}
            />
            <span>
              <strong className="block text-sm">
                Vendor's Contact Persons
              </strong>
              <span className="text-xs text-slate-500">
                Add contact-person details to matching local demo vendors.
              </span>
            </span>
          </label>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={() => setStage("configure")}>
              Continue <ArrowRight size={15} />
            </Button>
          </div>
        </div>
      ) : stage === "done" ? (
        <div className="space-y-5 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Check size={24} />
          </span>
          <div>
            <h3 className="text-lg font-semibold text-slate-800">
              Local demo import complete
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              {result?.added ?? 0} added · {result?.skipped ?? 0} skipped ·{" "}
              {result?.issues ?? invalidCount} rows need attention
            </p>
            <p className="mt-2 text-xs text-slate-400">
              No data was sent to ERP. This state is stored only in this
              browser.
            </p>
          </div>
          <Button onClick={close}>Done</Button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-center gap-3 border-b border-slate-100 pb-4">
            {stages.map((item, index) => (
              <div key={item.key} className="flex items-center gap-2">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${index <= stageIndex ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-400"}`}
                >
                  {index + 1}
                </span>
                <span
                  className={`text-xs ${index === stageIndex ? "font-semibold text-slate-800" : "text-slate-400"}`}
                >
                  {item.label}
                </span>
                {index < stages.length - 1 && (
                  <span className="hidden h-px w-7 bg-slate-200 sm:block" />
                )}
              </div>
            ))}
          </div>
          <h3 className="text-center text-base font-semibold text-slate-800">
            {stageTitle(kind)} — {stages[stageIndex]?.label}
          </h3>

          {stage === "configure" ? (
            <div className="space-y-5">
              <label
                className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-blue-200 bg-slate-50 px-5 py-6 text-center hover:bg-blue-50/40"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer.files[0];
                  if (file) void processFile(file);
                }}
              >
                <FileUp className="mb-3 text-blue-500" size={28} />
                <span className="text-sm font-medium text-slate-700">
                  Drag and drop a file to import
                </span>
                <span className="my-2 rounded-md bg-blue-500 px-4 py-2 text-xs font-semibold text-white">
                  {fileName || "Choose File"}
                </span>
                <span className="text-[11px] text-slate-500">
                  Maximum File Size: 25 MB · File Format: CSV or TSV or XLS
                </span>
                <Input
                  type="file"
                  accept=".csv,.tsv,.xls,.xlsx"
                  aria-label="Choose import file"
                  onChange={selectFile}
                  className="sr-only"
                />
              </label>
              <div className="flex flex-wrap gap-3 text-xs">
                <button
                  className="text-blue-600 hover:underline"
                  onClick={makeSample}
                >
                  Download a sample CSV file
                </button>
                <button
                  className="text-blue-600 hover:underline"
                  onClick={makeExcelSample}
                >
                  Download a sample XLS file
                </button>
              </div>
              <div className="rounded-md bg-blue-50/60 p-3 text-xs text-slate-600">
                <strong className="mb-2 block">
                  Duplicate Handling <span className="text-red-500">*</span>
                </strong>
                {(
                  [
                    [
                      "skip",
                      "Skip Duplicates",
                      "Keep existing local records and skip matching rows.",
                    ],
                    [
                      "overwrite",
                      kind === "vendor_contacts"
                        ? "Overwrite contact persons"
                        : entity === "vendors"
                          ? "Overwrite vendors"
                          : "Overwrite items",
                      "Update a matching local record from the import row.",
                    ],
                    [
                      "add",
                      kind === "vendor_contacts"
                        ? "Add duplicates as new contact persons"
                        : entity === "vendors"
                          ? "Add duplicates as new vendors"
                          : "Add duplicates as new items",
                      "Create a separate local demo record for every row.",
                    ],
                  ] as [DuplicateMode, string, string][]
                ).map(([value, label, description]) => (
                  <label
                    key={value}
                    className="mb-2 flex cursor-pointer items-start gap-2 last:mb-0"
                  >
                    <input
                      type="radio"
                      name="duplicate-mode"
                      checked={duplicateMode === value}
                      onChange={() => setDuplicateMode(value)}
                    />
                    <span>
                      <span className="block font-medium text-slate-700">
                        {label}
                      </span>
                      <span className="text-slate-500">{description}</span>
                    </span>
                  </label>
                ))}
              </div>
              <Field
                label="Character Encoding"
                hint="UTF-8 is the recommended choice for this local prototype."
              >
                <Select
                  value={encoding}
                  onChange={(event) => setEncoding(event.target.value)}
                  aria-label="Character Encoding"
                >
                  <option>UTF-8 (Unicode)</option>
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={saveSettings}
                  onChange={(event) => setSaveSettings(event.target.checked)}
                />
                Save these import settings in this browser for future demo
                imports
              </label>
              <p className="rounded-md border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
                The reference app accepts XLS files. This frontend-only
                prototype parses CSV and TSV locally; XLS is shown for UI parity
                but is not parsed.
              </p>
              <details className="rounded-md border border-slate-200 px-4 py-3 text-xs text-slate-600">
                <summary className="cursor-pointer font-medium text-slate-700">
                  Page Tips
                </summary>
                <ul className="mt-3 list-disc space-y-1 pl-5">
                  <li>
                    Use the sample CSV or XLS template to see the expected
                    column names.
                  </li>
                  <li>
                    Duplicate Handling decides whether matching local demo
                    records are skipped, overwritten, or added as new records.
                  </li>
                  <li>
                    Only UTF-8 CSV and TSV files are parsed in this browser-only
                    prototype.
                  </li>
                  <li>
                    Saved import settings are stored in this browser and do not
                    sync to ERP.
                  </li>
                </ul>
              </details>
              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}
            </div>
          ) : stage === "map" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>
                  {fileName} · {sourceRows.length} data rows
                </span>
                <span>
                  Map each file column to a local{" "}
                  {stageTitle(kind).toLowerCase()} field.
                </span>
              </div>
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <RecordTable variant="compact" className="w-full text-left text-sm">
                  <thead className="table-head">
                    <tr>
                      <th className="table-cell">File column</th>
                      <th className="table-cell">Sample value</th>
                      <th className="table-cell">Map to field</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sourceHeaders.map((header) => (
                      <tr key={header} className="border-t border-slate-100">
                        <td className="table-cell font-medium">{header}</td>
                        <td className="table-cell max-w-[220px] truncate text-slate-500">
                          {sourceRows[0]?.[header] || "—"}
                        </td>
                        <td className="table-cell">
                          <Select
                            aria-label={`Map ${header}`}
                            value={mapping[header] ?? ""}
                            onChange={(event) =>
                              setMapping((previous) => ({
                                ...previous,
                                [header]: event.target.value,
                              }))
                            }
                          >
                            <option value="">Don't import this column</option>
                            {fields.map((field) => {
                              const usedElsewhere = Object.entries(
                                mapping,
                              ).some(
                                ([source, target]) =>
                                  source !== header && target === field.key,
                              );
                              return (
                                <option
                                  key={field.key}
                                  value={field.key}
                                  disabled={usedElsewhere}
                                >
                                  {field.label}
                                  {field.required ? " *" : ""}
                                </option>
                              );
                            })}
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </RecordTable>
              </div>
              <p className="text-xs text-slate-500">
                Required fields:{" "}
                {requiredFields.map((field) => field.label).join(", ") ||
                  "None"}
                .{" "}
                {hasMappingConflict
                  ? "Each destination field can be mapped from only one file column."
                  : requiredMapped
                    ? "Required mappings are present."
                    : "Map the required field before continuing."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap justify-between gap-2 rounded-md bg-slate-50 p-3 text-xs">
                <span>{validRows.length} rows ready for local import</span>
                <span>
                  {invalidCount} rows missing required fields or containing
                  invalid values
                </span>
              </div>
              {validRows.length === 0 ? (
                <p className="rounded-md border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
                  No rows meet the required fields. Go back to Map Fields or
                  choose a different file.
                </p>
              ) : (
                <div className="max-h-72 overflow-auto rounded-md border border-slate-200">
                  <RecordTable variant="compact" className="w-full min-w-[560px] text-left text-xs">
                    <thead className="table-head">
                      <tr>
                        {fields
                          .filter((field) =>
                            Object.values(mapping).includes(field.key),
                          )
                          .map((field) => (
                            <th className="table-cell" key={field.key}>
                              {field.label}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody>
                      {validRows.slice(0, 10).map((row, index) => (
                        <tr className="border-t border-slate-100" key={index}>
                          {fields
                            .filter((field) =>
                              Object.values(mapping).includes(field.key),
                            )
                            .map((field) => (
                              <td className="table-cell" key={field.key}>
                                {row[field.key] || "—"}
                              </td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </RecordTable>
                </div>
              )}
              <p className="text-xs text-slate-500">
                This is a local preview of the rows that would be added to your
                demo catalog. Nothing will be sent to ERP.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
            <div>
              {stage !== "configure" && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    setStage(stage === "preview" ? "map" : "configure")
                  }
                >
                  <ArrowLeft size={14} /> Back
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={close}>
                Cancel
              </Button>
              {stage === "configure" ? (
                <Button
                  disabled={!sourceRows.length}
                  onClick={() => {
                    if (saveSettings)
                      localStorage.setItem(
                        "procureui.import-settings",
                        JSON.stringify({ duplicateMode, encoding }),
                      );
                    setStage("map");
                  }}
                >
                  Next <ArrowRight size={14} />
                </Button>
              ) : stage === "map" ? (
                <Button
                  disabled={!requiredMapped}
                  onClick={() => setStage("preview")}
                >
                  Next <ArrowRight size={14} />
                </Button>
              ) : (
                <Button disabled={!validRows.length} onClick={importNow}>
                  Import to Local Demo
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
