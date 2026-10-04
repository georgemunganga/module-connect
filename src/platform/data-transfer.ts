/** Shared, schema-driven CSV transfer used by Procurement record types. */
export interface TransferField {
  key: string;
  label: string;
  required?: boolean;
  aliases?: string[];
}

export type TransferRow = Record<string, string>;

export function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const text = source.replace(/^\uFEFF/, "");
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index++; }
      else if (quoted) quoted = false;
      else if (!cell) quoted = true;
      else throw new Error("A quote appears inside an unquoted field.");
    } else if (char === "," && !quoted) {
      row.push(cell.trim()); cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("The CSV has an unfinished quoted field.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function normalizeColumn(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function suggestedMapping(headers: string[], fields: TransferField[]): Record<string, number> {
  return Object.fromEntries(fields.map((field) => {
    const names = [field.key, field.label, ...(field.aliases ?? [])].map(normalizeColumn);
    return [field.key, headers.findIndex((heading) => names.includes(normalizeColumn(heading)))];
  }));
}

export function mapTransferRows(source: string[][], fields: TransferField[], mapping: Record<string, number>): TransferRow[] {
  return source.map((values) => Object.fromEntries(fields.map((field) => [field.key, (values[mapping[field.key]] ?? "").trim()])));
}

function safeCsvCell(value: unknown): string {
  const raw = String(value ?? "");
  // Spreadsheet programs can execute formulas in CSV cells. Keep exported data literal.
  const escaped = /^[\s]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${escaped.replaceAll('"', '""')}"`;
}

export function serializeCsv(fields: TransferField[], rows: TransferRow[]): string {
  return [fields.map((field) => safeCsvCell(field.label)).join(","),
    ...rows.map((row) => fields.map((field) => safeCsvCell(row[field.key])).join(","))].join("\r\n") + "\r\n";
}

export function downloadCsv(fileName: string, fields: TransferField[], rows: TransferRow[]): void {
  const blob = new Blob(["\uFEFF", serializeCsv(fields, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
