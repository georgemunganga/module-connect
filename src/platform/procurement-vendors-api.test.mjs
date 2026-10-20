import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  VendorApiError,
  createVendorDraft,
  listVendorDrafts,
  updateVendorDraft,
} from "./procurement-vendors-api.ts";

const entityId = "11111111-1111-4111-8111-111111111111";
const vendorId = "22222222-2222-4222-8222-222222222222";
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("vendor list sends ERP company scope and never uses demo rows", async () => {
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /\/api\/procurement\/v1\/vendors\?page=1&pageSize=25/);
    assert.equal(options.credentials, "include");
    assert.equal(new Headers(options.headers).get("X-Shell-Entity"), entityId);
    return Response.json({ items: [{ id: vendorId, number: "VEN-1", displayName: "Green", legalName: "Green Ltd", countryCode: "ZM", status: "Draft", isOrderable: false, version: 1, createdAt: "2026-10-18T00:00:00Z" }], total: 1, page: 1, pageSize: 25 });
  };
  const result = await listVendorDrafts(entityId);
  assert.equal(result.items[0].displayName, "Green");
  assert.equal(result.items[0].isOrderable, false);
});

test("create and update preserve draft status and optimistic version", async () => {
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    calls.push(options);
    return Response.json(calls.length === 1
      ? { id: vendorId, number: "VEN-1", version: 1, status: "Draft", possibleDuplicate: false }
      : { id: vendorId, version: 2, status: "Draft" });
  };
  const draft = { legalName: "Green Ltd", displayName: "Green", countryCode: "ZM", isLocal: true, portalAccessRequested: false };
  await createVendorDraft(entityId, draft);
  await updateVendorDraft(entityId, vendorId, 1, draft);
  assert.equal(JSON.parse(calls[1].body).version, 1);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[1].method, "PUT");
  assert.equal(new Headers(calls[0].headers).get("Content-Type"), "application/json");
});

test("conflict and network failure do not invent a successful record", async () => {
  globalThis.fetch = async () => Response.json({ detail: "A vendor with this company ID already exists." }, { status: 409 });
  await assert.rejects(listVendorDrafts(entityId), (error) => error instanceof VendorApiError && error.status === 409);
  globalThis.fetch = async () => { throw new Error("offline"); };
  await assert.rejects(listVendorDrafts(entityId), (error) => error instanceof VendorApiError && error.status === 0);
});
