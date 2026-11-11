import { procurementScopeHeaders } from "../../shared/shell-scope";

export type ScopedCsvKind = "vendors" | "items";
export type ScopedCsvFilters = { search?: string; status?: string; ids?: readonly string[] };
export type ScopedCsvFile = { blob: Blob; fileName: string };

export class ScopedCsvExportError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

const names = {
  vendors: /^vendors-\d{8}\.csv$/,
  items: /^items-\d{8}\.csv$/,
};

function fileNameFrom(header: string | null, kind: ScopedCsvKind): string {
  if (!header || !/^attachment\s*;/i.test(header))
    throw new ScopedCsvExportError(0, "The ERP did not return a CSV attachment.");
  const value = /(?:^|;)\s*filename="?([^";]+)"?/i.exec(header)?.[1];
  if (!value || !names[kind].test(value))
    throw new ScopedCsvExportError(0, "The ERP returned an invalid CSV file name.");
  return value;
}

/** Server-generated CSV only. This helper never serializes loaded list rows. */
export async function fetchScopedCsv(kind: ScopedCsvKind, companyId: string,
  filters: ScopedCsvFilters, signal: AbortSignal): Promise<ScopedCsvFile> {
  let headers: Record<string, string>;
  try { headers = procurementScopeHeaders(companyId); }
  catch (cause) { throw new ScopedCsvExportError(0, cause instanceof Error ? cause.message : "Choose an ERP company before exporting."); }
  const query = new URLSearchParams();
  if (filters.search?.trim()) query.set("search", filters.search.trim());
  if (filters.status?.trim()) query.set("status", filters.status.trim());
  if (filters.ids !== undefined) {
    const ids = filters.ids.map(id => id.toLowerCase());
    if (ids.length < 1 || ids.length > 100 || new Set(ids).size !== ids.length
      || ids.some(id => !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)
        || id === "00000000-0000-0000-0000-000000000000") || query.size)
      throw new ScopedCsvExportError(400, "Select up to 100 different records on this page and try again.");
    query.set("ids", ids.sort().join(","));
  }
  const suffix = query.size ? `?${query}` : "";
  let response: Response;
  try {
    response = await fetch(`/api/procurement/v1/${kind}/export${suffix}`, {
      method: "GET", credentials: "include", cache: "no-store",
      headers, signal,
    });
  } catch (cause) {
    if (signal.aborted) throw cause;
    throw new ScopedCsvExportError(0, "The CSV export is unavailable. Check your connection and try again.");
  }
  if (!response.ok) {
    if (response.status === 404 && filters.ids !== undefined)
      throw new ScopedCsvExportError(404, "This selection is no longer available. Refresh the list and select the records again.");
    if (response.status === 422) {
      let code = "";
      try { code = String((await response.json() as { code?: unknown }).code ?? ""); } catch { /* Safe generic error below. */ }
      if (code === "export-limit-exceeded")
        throw new ScopedCsvExportError(422, "Too many records match. Narrow your search and try again.");
    }
    throw new ScopedCsvExportError(response.status, response.status === 401 ? "Sign in to export records."
      : response.status === 403 ? "You do not have permission to export these records."
      : response.status === 404 ? "CSV export is not available in this ERP version."
      : response.status === 400 ? "This export search is invalid. Change the filters and try again."
      : "The CSV export is unavailable. Try again later.");
  }
  if (!/^text\/csv\s*;\s*charset=utf-8(?:\s*;|$)/i.test(response.headers.get("Content-Type") ?? ""))
    throw new ScopedCsvExportError(0, "The ERP did not return a CSV file.");
  const fileName = fileNameFrom(response.headers.get("Content-Disposition"), kind);
  let blob: Blob;
  try { blob = await response.blob(); }
  catch (cause) {
    if (signal.aborted) throw cause;
    throw new ScopedCsvExportError(0, "The CSV download was interrupted. Try again.");
  }
  if (signal.aborted) throw new DOMException("Export cancelled", "AbortError");
  let currentHeaders: Record<string, string>;
  try { currentHeaders = procurementScopeHeaders(companyId); }
  catch { throw new ScopedCsvExportError(0, "The ERP company or branch changed. Start this export again."); }
  if (JSON.stringify(currentHeaders) !== JSON.stringify(headers))
    throw new ScopedCsvExportError(0, "The ERP company or branch changed. Start this export again.");
  if (!blob.size) throw new ScopedCsvExportError(0, "The ERP returned an empty CSV file.");
  return { blob, fileName };
}

export function beginScopedCsvDownload(file: ScopedCsvFile): void {
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.fileName;
  try {
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
