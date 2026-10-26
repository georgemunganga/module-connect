/** Core shell selection shared by module API adapters. Authorization remains on the server. */
export const ERP_SHELL_STORAGE_KEY = "erp.shell.state.v1";
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ScopeStorage = Pick<Storage, "getItem">;

/** Capture scope when a request starts; never silently save under a changed company. */
export function procurementScopeHeaders(companyId: string, storage?: ScopeStorage): Record<string, string> {
  if (!guid.test(companyId)) throw new Error("Choose an ERP company first.");
  const headers: Record<string, string> = { "X-Shell-Entity": companyId };
  let selection: { entityId?: unknown; branch?: unknown; branchScope?: unknown } = {};
  try {
    const source = storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
    const parsed: unknown = JSON.parse(source?.getItem(ERP_SHELL_STORAGE_KEY) || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) selection = parsed;
  } catch { /* Without stored scope the API resolves the user's permitted default. */ }
  if (typeof selection.entityId !== "string" || !guid.test(selection.entityId)) return headers;
  if (selection.entityId.toLowerCase() !== companyId.toLowerCase())
    throw new Error("The company changed. Refresh this page before continuing.");
  if (selection.branchScope !== undefined && selection.branchScope !== "all")
    throw new Error("Choose a valid ERP branch scope before continuing.");
  if (selection.branchScope === "all") {
    if (selection.branch) throw new Error("All branches cannot also select a branch.");
    headers["X-Shell-Branch-Scope"] = "all";
    return headers;
  }
  if (selection.branch) {
    if (typeof selection.branch !== "string" || !guid.test(selection.branch))
      throw new Error("Choose a valid ERP branch before continuing.");
    headers["X-Shell-Location"] = selection.branch;
  }
  return headers;
}
