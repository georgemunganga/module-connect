/** Kuubu's selected-workspace projection. Browser state is a precondition only;
 * the ERP rechecks the opaque HttpOnly session and permissions on every request. */
export const kuubuProductMode = (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
  .env?.VITE_KUUBU_PRODUCT_MODE === "1";
export const kuubuCompaniesHref = "https://www.kuubuerp.com/account/#/companies";
type Projection = { principalId: string; companyId: string; marker: string };
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const zero = "00000000-0000-0000-0000-000000000000";
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function invalid(): never { throw new Error("Return to Kuubu and open your company workspace again."); }
function projection(value: unknown): Projection {
  if (!object(value) || value.contextKind !== "product" || value.schemaVersion !== 1
    || value.selectedModule !== "procurement" || typeof value.principalId !== "string" || !guid.test(value.principalId)
    || typeof value.selectedCompanyId !== "string" || !guid.test(value.selectedCompanyId)
    || value.principalId === zero || value.selectedCompanyId === zero
    || typeof value.sessionContext !== "string" || !/^[0-9a-f]{64}$/.test(value.sessionContext)
    || !Array.isArray(value.companies) || value.companies.length !== 1
    || !object(value.companies[0]) || value.companies[0].id !== value.selectedCompanyId) invalid();
  return { principalId: value.principalId, companyId: value.selectedCompanyId, marker: value.sessionContext };
}
export function createProductWorkspaceBridge() {
  let current: (Projection & { csrf: string }) | null = null;
  let generation = 0;
  return {
    clear() { generation++; current = null; },
    async load(signal: AbortSignal, fetcher: typeof fetch = fetch) {
      const started = ++generation; current = null;
      const response = await fetcher("/api/core/v1/workspace-context", { credentials: "include", cache: "no-store", signal });
      if (!response.ok) throw Object.assign(new Error("Workspace access unavailable."), { status: response.status });
      const context = projection(await response.json());
      const operational = await fetcher("/api/core/product-identity/operational/session", { credentials: "include", cache: "no-store", signal });
      if (!operational.ok) throw Object.assign(new Error("Workspace access unavailable."), { status: operational.status });
      const browser: unknown = await operational.json();
      if (!object(browser) || typeof browser.csrf_token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(browser.csrf_token)) invalid();
      if (signal.aborted || generation !== started) throw new DOMException("Workspace changed.", "AbortError");
      current = { ...context, csrf: browser.csrf_token };
      return { id: context.principalId, isActive: true, roles: [] as string[] };
    },
    acceptContext(value: unknown) {
      let next: Projection;
      try { next = projection(value); } catch (error) { this.clear(); throw error; }
      if (!current || current.principalId !== next.principalId || current.companyId !== next.companyId) {
        this.clear(); invalid();
      }
      current = { ...current, marker: next.marker };
    },
    async changed(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<boolean> {
      if (!current) return false;
      const captured = current;
      try {
        const response = await fetcher("/api/core/v1/workspace-context", {
          credentials: "include", cache: "no-store", signal,
          headers: { "X-Kuubu-Session-Context": captured.marker },
        });
        if (signal.aborted || current !== captured) return false;
        if ([401, 403, 409].includes(response.status)) { this.clear(); return true; }
        if (!response.ok) return false;
        const next = projection(await response.json());
        if (next.companyId !== captured.companyId || next.principalId !== captured.principalId || next.marker !== captured.marker) {
          this.clear(); return true;
        }
        return false;
      } catch { return false; }
    },
    headers(company: string): Record<string, string> {
      if (!current || current.companyId !== company) invalid();
      return { "X-Kuubu-Session-Context": current.marker, "X-Kuubu-Operational-CSRF": current.csrf };
    },
    assertOwner(company: string, person: string) {
      if (!current || current.companyId !== company || current.principalId !== person) { this.clear(); invalid(); }
    },
  };
}
export const productWorkspaceBridge = createProductWorkspaceBridge();
export const productWorkspaceHeaders = (company: string) => kuubuProductMode ? productWorkspaceBridge.headers(company) : {};
