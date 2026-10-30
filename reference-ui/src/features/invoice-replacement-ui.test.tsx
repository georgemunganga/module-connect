import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes, matchRoutes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InvoiceDetail, InvoiceIntakeInput } from "../../../src/platform/procurement-invoices-api";
import { canonicalRoutes } from "../data/modules";
import { InvoiceBillIdentityFields } from "./InvoiceBillIdentityFields";
const context = vi.hoisted(() => ({
  company: "11111111-1111-4111-8111-111111111111", branch: "22222222-2222-4222-8222-222222222222",
  principal: "33333333-3333-4333-8333-333333333333", invoice: "44444444-4444-4444-8444-444444444444",
}));
vi.mock("../lib/erpShell", () => ({ useErpShell: () => ({ authEpoch: 1,
  selection: { entityId: context.company, branch: context.branch } }) }));
vi.mock("../lib/ProcurementLiveGate", () => ({ useLiveReadiness: () => ({ tenantId: "tenant", principalId: context.principal,
  legalEntityId: context.company, effectiveBranchId: context.branch, defaultCurrencyCode: "USD", workerId: null,
  permissions: ["procurement-invoice-read", "procurement-invoice-capture"],
  capabilities: { invoiceCurrencyCalculationV2: true, invoiceReplacementRead: false } }) }));
import { LiveInvoiceReplacementRoute } from "./LiveInvoices";
const draft: InvoiceIntakeInput = { supplierId: "55555555-5555-4555-8555-555555555555",
  invoiceNumber: "", invoiceDate: "2026-10-30", currencyCode: "ZMW",
  purchaseOrderId: "66666666-6666-4666-8666-666666666666",
  lines: [{ description: "Original supplies", quantity: "1", unitPrice: "5.1234", taxAmount: "0" }] };
const original = { id: context.invoice, supplierId: draft.supplierId, supplierName: "Saved vendor",
  invoiceNumber: "ORIGINAL-01" } as InvoiceDetail;
const renderFields = (replacement: boolean, vendorLocked = true) => renderToStaticMarkup(createElement(MemoryRouter, {},
  createElement(InvoiceBillIdentityFields, { input: draft, onChange: () => undefined, vendorLocked, replacement,
    original: vendorLocked ? original : null, vendorSearch: "", onVendorSearch: () => undefined,
    vendors: [], loadingVendors: false, directoryLocked: false })));
const inputTag = (html: string, label: string) => html.match(new RegExp(`<input[^>]*aria-label="${label}"[^>]*>`, "i"))?.[0] ?? "";
afterEach(() => vi.unstubAllGlobals());
describe("shared Bill identity fields in correction mode", () => {
  it("keeps the original section labels and shared controls while locking saved vendor/currency/order", () => {
    const html = renderFields(true);
    for (const text of ["Find vendor", "Vendor Name", "Bill Date", "Bill #", "Due Date", "Currency", "Payment Terms"])
      expect(html).toContain(text);
    const currency = inputTag(html, "Currency");
    expect(currency).toContain('value="ZMW"'); expect(currency).toMatch(/readonly/i);
    const number = inputTag(html, "Invoice number");
    expect(number).toContain('value=""'); expect(number).toMatch(/maxlength="80"/i);
    expect(number).not.toContain("ORIGINAL-01"); expect(number).not.toMatch(/readonly/i);
    expect(inputTag(html, "Original purchase order")).toContain(draft.purchaseOrderId);
    expect(inputTag(html, "Original purchase order")).toMatch(/readonly/i);
    // Shared Radix Select populates its selected label during hydration; SSR
    // verifies the semantic disabled trigger, not portal-derived display text.
    const vendor = html.match(/<(?:button|select)[^>]*aria-label="Vendor"[^>]*>/i)?.[0] ?? "";
    expect(vendor).not.toBe(""); expect(vendor).toMatch(/disabled/i);
    expect(html).not.toContain("+ Add a vendor");
  });
  it("preserves editable currency and vendor-directory navigation on an ordinary new bill", () => {
    const html = renderFields(false, false);
    expect(inputTag(html, "Currency")).not.toMatch(/readonly/i);
    expect(html).not.toContain('aria-label="Original purchase order"');
    expect(html).toContain("Add a vendor in the shared directory");
  });
  it("retains the saved-vendor lock for ordinary editing without treating it as a correction", () => {
    const html = renderFields(false, true);
    expect(inputTag(html, "Currency")).not.toMatch(/readonly/i);
    expect(html).not.toContain("Original purchase order");
    expect(html).toContain("The saved supplier cannot be changed");
  });
});
describe("dedicated correction route uses the existing Bill editor", () => {
  it("registers the correction separately from new and ordinary edit in the canonical route inventory", () => {
    const matches = matchRoutes(canonicalRoutes.map(route => ({ path: route.path })), `/bills/${context.invoice}/replace`);
    expect(matches?.at(-1)?.route.path).toBe("/bills/:id/replace");
    for (const path of ["/bills/new", `/bills/${context.invoice}/edit`])
      expect(matchRoutes([{ path: "/bills/:id/replace" }], path)).toBeNull();
  });

  it("renders Correct Bill rather than an ordinary new/edit action before any source is loaded", () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const html = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [`/bills/${context.invoice}/replace`] },
      createElement(Routes, {}, createElement(Route, { path: "/bills/:id/replace", element: createElement(LiveInvoiceReplacementRoute) }))));
    expect(html).toContain("Correct"); expect(html).toContain("Bill"); expect(html).toContain("Loading invoice");
    expect(html).not.toContain("Record as received"); expect(html).not.toContain("Save changes");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
