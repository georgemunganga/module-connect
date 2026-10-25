import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchScopedCsv } from "../../src/platform/procurement-scoped-export";

const company = "11111111-1111-4111-8111-111111111111";
const csvHeaders = { "Content-Type": "text/csv; charset=utf-8",
  "Content-Disposition": 'attachment; filename="vendors-20261025.csv"' };
afterEach(() => vi.unstubAllGlobals());

describe("server scoped CSV export", () => {
  it("sends only server search/status under the company cookie and accepts a CSV attachment", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("\ufeffnumber,displayName\r\n", { headers: csvHeaders }));
    vi.stubGlobal("fetch", fetch);
    const result = await fetchScopedCsv("vendors", company, { search: "  steel  ", status: "Active" }, new AbortController().signal);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe("/api/procurement/v1/vendors/export?search=steel&status=Active");
    expect(request.method).toBe("GET");
    expect(request.credentials).toBe("include");
    expect(request.headers["X-Shell-Entity"]).toBe(company);
    expect(request.body).toBeUndefined();
    expect(result.fileName).toBe("vendors-20261025.csv");
    expect(result.blob.size).toBeGreaterThan(0);
  });
  it("keeps the all-scope request free of page filters and selected IDs", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("\ufeffcode,name\r\n", { headers: {
      ...csvHeaders, "Content-Disposition": 'attachment; filename="items-20261025.csv"' } }));
    vi.stubGlobal("fetch", fetch);
    await fetchScopedCsv("items", company, {}, new AbortController().signal);
    expect(fetch.mock.calls[0][0]).toBe("/api/procurement/v1/items/export");
  });
  it("does not turn limits, denial, or malformed responses into downloads", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ code: "export-limit-exceeded" }), { status: 422 }))
      .mockResolvedValueOnce(new Response("", { status: 403 }))
      .mockResolvedValueOnce(new Response("secret", { headers: { ...csvHeaders,
        "Content-Disposition": 'attachment; filename="../../secret.csv"' } }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchScopedCsv("vendors", company, {}, new AbortController().signal)).rejects.toThrow("Too many records");
    await expect(fetchScopedCsv("vendors", company, {}, new AbortController().signal)).rejects.toThrow("permission");
    await expect(fetchScopedCsv("vendors", company, {}, new AbortController().signal)).rejects.toThrow("invalid CSV file name");
  });
  it("discards a response after scope cancellation", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      controller.abort();
      return new Response("\ufeffnumber,displayName\r\n", { headers: csvHeaders });
    }));
    await expect(fetchScopedCsv("vendors", company, {}, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
  it("discards a late CSV when the selected branch changed before download", async () => {
    const getItem = vi.fn().mockReturnValueOnce(JSON.stringify({ entityId: company, branch:
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" })).mockReturnValue(JSON.stringify({ entityId: company, branch:
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }));
    vi.stubGlobal("localStorage", { getItem });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("\ufeffnumber,displayName\r\n", { headers: csvHeaders })));
    await expect(fetchScopedCsv("vendors", company, {}, new AbortController().signal)).rejects.toThrow("branch changed");
  });
});
