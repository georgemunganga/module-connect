import { Link } from "react-router-dom";
import { Field, Input, Select } from "../components/ui";
import type { InvoiceDetail, InvoiceIntakeInput } from "../../../src/platform/procurement-invoices-api";
import type { VendorSummary } from "../../../src/platform/procurement-vendors-api";

/** Shared identity section of the original Bill editor. Correction mode locks
 * its saved vendor/currency/order without introducing a second editor layout. */
export function InvoiceBillIdentityFields({ input, onChange, vendorLocked, replacement, original,
  vendorSearch, onVendorSearch, vendors, loadingVendors, directoryLocked, purchaseOrderHref }: {
  input: InvoiceIntakeInput; onChange: (input: InvoiceIntakeInput) => void; vendorLocked: boolean;
  replacement: boolean; original: InvoiceDetail | null; vendorSearch: string; onVendorSearch: (value: string) => void;
  vendors: VendorSummary[]; loadingVendors: boolean; directoryLocked: boolean; purchaseOrderHref?: string;
}) {
  return <>
          <div className="-mx-5 bg-surface-muted px-5 py-5 sm:-mx-8 sm:px-8">
            <div className="max-w-xl space-y-3">
              <Field label="Find vendor"><Input value={vendorSearch} disabled={vendorLocked} onChange={event => onVendorSearch(event.target.value)} placeholder="Search vendor name" /></Field>
              <Field label="Vendor Name *"><Select aria-label="Vendor" required value={input.supplierId} disabled={loadingVendors || vendorLocked}
                onChange={event => onChange({ ...input, supplierId: event.target.value })}>
                <option value="">{loadingVendors ? "Loading vendors…" : "Choose vendor"}</option>
                {vendorLocked && original && !vendors.some(vendor => vendor.id === original.supplierId) && <option value={original.supplierId}>{original.supplierName || "Saved vendor"}</option>}
                {vendors.map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.displayName}{vendor.status !== "Active" ? ` · ${vendor.status}` : ""}</option>)}
              </Select></Field>
              {vendorLocked ? <p className="text-xs text-muted-foreground">The saved supplier cannot be changed on this invoice.</p>
                : directoryLocked ? <p className="text-xs text-muted-foreground">Finish or discard this bill before opening the vendor directory.</p>
                  : <Link className="block text-sm text-primary hover:underline" to={`/vendors/new?returnTo=${encodeURIComponent("/bills/new")}`}>+ Add a vendor in the shared directory</Link>}
            </div>
          </div>
          <div className="grid max-w-4xl gap-x-8 gap-y-5 sm:grid-cols-2">
            <Field label="Bill Date *"><Input aria-label="Invoice date" required type="date" value={input.invoiceDate} onChange={event => onChange({ ...input, invoiceDate: event.target.value })} /></Field>
            <Field label="Bill # *"><Input aria-label="Invoice number" required maxLength={80} value={input.invoiceNumber} onChange={event => onChange({ ...input, invoiceNumber: event.target.value })} /></Field>
            <Field label="Due Date"><Input aria-label="Due date" type="date" min={input.invoiceDate} value={input.dueDate || ""} onChange={event => onChange({ ...input, dueDate: event.target.value || null })} /></Field>
            <Field label="Currency *"><Input aria-label="Currency" required readOnly={replacement} maxLength={3} value={input.currencyCode} onChange={event => onChange({ ...input, currencyCode: event.target.value.toUpperCase() })} /></Field>
            {replacement && <Field label="Original purchase order"><Input aria-label="Original purchase order" readOnly value={original?.replacementContext?.purchaseOrderNumber ?? ""} />
              {purchaseOrderHref && <Link className="mt-2 inline-block text-xs text-primary underline" to={purchaseOrderHref}>View original purchase order</Link>}
            </Field>}
            <Field label="Payment Terms"><Select aria-label="Payment Terms" disabled value="unavailable"><option value="unavailable">Not available yet</option></Select></Field>
          </div>
          <p className="text-xs text-muted-foreground">Payment terms cannot be saved on bills yet. Use the due date above.</p>
  </>;
}
