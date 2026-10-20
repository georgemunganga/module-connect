export type TabularData = {
  headers: string[];
  rows: Record<string, string>[];
};

export function parseNonNegativeAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const normalized = trimmed.replaceAll(",", "").replace(/[^\d.-]/g, "");
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function parseDelimited(text: string, delimiter?: string): TabularData {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const separator =
    delimiter ??
    (firstLine.split("\t").length > firstLine.split(",").length ? "\t" : ",");
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < clean.length; index += 1) {
    const character = clean[index];
    if (character === '"') {
      if (quoted && clean[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === separator) {
      row.push(cell);
      cell = "";
    } else if (!quoted && (character === "\n" || character === "\r")) {
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) matrix.push(row);
      row = [];
      cell = "";
      if (character === "\r" && clean[index + 1] === "\n") index += 1;
    } else {
      cell += character;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) matrix.push(row);

  if (matrix.length === 0) return { headers: [], rows: [] };
  const seen = new Map<string, number>();
  const headers = matrix[0].map((header, index) => {
    const base = header.trim() || `Column ${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
  const rows = matrix
    .slice(1)
    .map((values) =>
      Object.fromEntries(
        headers.map((header, index) => [header, values[index]?.trim() ?? ""]),
      ),
    );
  return { headers, rows };
}

function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (typeof value === "string" && /^[=+@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function downloadCsv(filename: string, rows: unknown[][]): void {
  const content = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(
    new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSpreadsheetXml(
  filename: string,
  headers: string[],
): void {
  const xmlEscape = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  const headingCells = headers
    .map(
      (header) =>
        `<Cell><Data ss:Type="String">${xmlEscape(header)}</Data></Cell>`,
    )
    .join("");
  const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Sample"><Table><Row>${headingCells}</Row></Table></Worksheet></Workbook>`;
  const url = URL.createObjectURL(
    new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
