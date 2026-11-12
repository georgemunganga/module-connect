import { describe, expect, it } from "vitest";
import { createProductWorkspaceBridge } from "../../../shared/product-workspace-session";

const company = "11111111-1111-1111-1111-111111111111";
const person = "22222222-2222-2222-2222-222222222222";
const other = "33333333-3333-3333-3333-333333333333";
const marker = "a".repeat(64), csrf = "b".repeat(43);
const context = () => ({ schemaVersion: 1, contextKind: "product", principalId: person,
  selectedModule: "procurement", selectedCompanyId: company, sessionContext: marker, companies: [{ id: company }] });
function fetcher(body: unknown = context()) {
  return (async (url: string | URL | Request) => Response.json(String(url).includes("operational/session") ? { csrf_token: csrf } : body)) as typeof fetch;
}
describe("selected Kuubu Procurement workspace", () => {
  it("keeps CSRF and session marker in memory and narrows headers to the selected company", async () => {
    const bridge = createProductWorkspaceBridge();
    await bridge.load(new AbortController().signal, fetcher());
    expect(bridge.headers(company)).toEqual({ "X-Kuubu-Session-Context": marker, "X-Kuubu-Operational-CSRF": csrf });
    expect(() => bridge.headers(other)).toThrow(/Kuubu/);
    bridge.clear(); expect(() => bridge.headers(company)).toThrow();
  });
  it("refuses the wrong module, company list, malformed proof or identity change", async () => {
    for (const value of [{ ...context(), selectedModule: "hrm" }, { ...context(), companies: [{ id: other }] },
      { ...context(), sessionContext: "untrusted" }]) {
      const bridge = createProductWorkspaceBridge();
      await expect(bridge.load(new AbortController().signal, fetcher(value))).rejects.toThrow();
      expect(() => bridge.headers(company)).toThrow();
    }
    const bridge = createProductWorkspaceBridge(); await bridge.load(new AbortController().signal, fetcher());
    expect(() => bridge.acceptContext({ ...context(), principalId: other })).toThrow();
    expect(() => bridge.headers(company)).toThrow();
  });
  it("does not restore credentials after a cancelled bootstrap or malformed second context", async () => {
    const bridge = createProductWorkspaceBridge(); const controller = new AbortController(); controller.abort();
    await expect(bridge.load(controller.signal, fetcher())).rejects.toThrow();
    await bridge.load(new AbortController().signal, fetcher());
    expect(() => bridge.acceptContext({})).toThrow(); expect(() => bridge.headers(company)).toThrow();
  });
  it("clears changed sessions without treating a temporary provider failure as logout", async () => {
    const bridge = createProductWorkspaceBridge(); await bridge.load(new AbortController().signal, fetcher());
    expect(await bridge.changed(new AbortController().signal, (async () => new Response(null, { status: 503 })) as typeof fetch)).toBe(false);
    expect(bridge.headers(company)["X-Kuubu-Session-Context"]).toBe(marker);
    expect(await bridge.changed(new AbortController().signal, (async () => new Response(null, { status: 409 })) as typeof fetch)).toBe(true);
    expect(() => bridge.headers(company)).toThrow();
  });
});
