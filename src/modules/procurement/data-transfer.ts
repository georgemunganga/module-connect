import type { TransferField, TransferRow } from "@/platform/data-transfer";
import { getProcurement, saveProcurement } from "./store";
import { getCatalog, saveCatalog } from "./catalog";
import type { CatalogItem, ItemKind } from "./catalog";
import type { SupplierRecord } from "./suppliers";

const normalized = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
const emailValid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const vendorFields: TransferField[] = [
  { key: "name", label: "Company name", required: true, aliases: ["vendor", "supplier", "company"] },
  { key: "registration", label: "Company ID", required: true, aliases: ["registration number", "business registration"] },
  { key: "contact_name", label: "Contact name", aliases: ["primary contact"] },
  { key: "contact_email", label: "Contact email", aliases: ["email", "email address"] },
  { key: "category", label: "Category", required: true, aliases: ["products or services"] },
];

export function validateVendorRows(rows: TransferRow[], country: string): string[][] {
  const existing = getProcurement().suppliers.filter((item) => item.country === country);
  const names = new Set<string>();
  const registrations = new Set<string>();
  return rows.map((row) => {
    const errors: string[] = [];
    const name = normalized(row.name);
    const registration = normalized(row.registration);
    if (!name) errors.push("Company name is required");
    if (!registration) errors.push("Company ID is required");
    if (!row.category) errors.push("Category is required");
    if (Boolean(row.contact_name) !== Boolean(row.contact_email)) errors.push("Enter both contact name and email");
    if (row.contact_email && !emailValid(row.contact_email)) errors.push("Check contact email");
    if (name && (names.has(name) || existing.some((item) => normalized(item.name) === name))) errors.push("Company name already exists");
    if (registration && (registrations.has(registration) || existing.some((item) => normalized(item.registration) === registration))) errors.push("Company ID already exists");
    if (name) names.add(name);
    if (registration) registrations.add(registration);
    return errors;
  });
}

export function applyVendorRows(rows: TransferRow[], country: string, actor: string): number {
  if (validateVendorRows(rows, country).some((errors) => errors.length)) throw new Error("Vendor data changed after preview. Review the file again.");
  const timestamp = new Date().toISOString();
  const owner = country === "Kenya" ? "Grace Wanjiru" : "Priya Raman";
  const imported: SupplierRecord[] = rows.map((row) => ({
    id: `sup-import-${crypto.randomUUID()}`, name: row.name, legalName: row.name, country,
    registration: row.registration, status: "Proposed", owner,
    nextAction: "Review identity, contacts and required evidence", dueDate: "—",
    categories: [row.category], sites: [],
    contacts: row.contact_name ? [{ name: row.contact_name, role: "Main contact", email: row.contact_email }] : [],
    qualifications: [], documents: [], procurementDecision: { state: "Pending" },
    openPOs: 0, openInvoices: 0, reviewVersion: 1,
    timeline: [{ id: crypto.randomUUID(), at: timestamp, actor: `${actor} (demo)`, event: "Imported for review", reason: "Vendor remains Proposed until normal onboarding approval" }],
  }));
  saveProcurement((state) => ({ ...state, suppliers: [...imported, ...state.suppliers] }));
  return imported.length;
}

export function vendorExportRows(country: string): TransferRow[] {
  return getProcurement().suppliers.filter((item) => item.country === country).map((item) => ({
    name: item.name, registration: item.registration, contact_name: item.contacts[0]?.name ?? "",
    contact_email: item.contacts[0]?.email ?? "", category: item.categories[0] ?? "",
  }));
}

export const itemFields: TransferField[] = [
  { key: "name", label: "Item name", required: true, aliases: ["product", "service"] },
  { key: "kind", label: "Type", required: true, aliases: ["item type"] },
  { key: "category", label: "Category", required: true },
  { key: "unit", label: "Unit", required: true, aliases: ["unit of measure", "uom"] },
  { key: "spec", label: "Description", aliases: ["specification", "details"] },
  { key: "tax_ref", label: "Tax code", aliases: ["tax", "tax reference"] },
];

const itemKinds: ItemKind[] = ["Goods", "Service", "Asset", "Consumable", "Subscription"];

export function validateItemRows(rows: TransferRow[], entityName: string): string[][] {
  const existing = getCatalog().filter((item) => item.entities.includes(entityName));
  const names = new Set<string>();
  return rows.map((row) => {
    const errors: string[] = [];
    const name = normalized(row.name);
    if (!name) errors.push("Item name is required");
    if (!itemKinds.some((kind) => normalized(kind) === normalized(row.kind))) errors.push("Type must be Goods, Service, Asset, Consumable or Subscription");
    if (!row.category) errors.push("Category is required");
    if (!row.unit) errors.push("Unit is required");
    if (name && (names.has(name) || existing.some((item) => normalized(item.name) === name))) errors.push("Item already exists");
    if (name) names.add(name);
    return errors;
  });
}

export function applyItemRows(rows: TransferRow[], entityName: string, actor: string): number {
  if (validateItemRows(rows, entityName).some((errors) => errors.length)) throw new Error("Item data changed after preview. Review the file again.");
  const today = new Date().toISOString().slice(0, 10);
  const imported: CatalogItem[] = rows.map((row) => ({
    id: `itm-import-${crypto.randomUUID()}`, name: row.name,
    kind: itemKinds.find((kind) => normalized(kind) === normalized(row.kind))!,
    category: row.category, unit: row.unit, spec: row.spec,
    entities: [entityName], taxRef: row.tax_ref, status: "Inactive", activeFrom: today,
    offers: [], versions: [{ version: 1, date: today, by: `${actor} (demo)`, change: "Imported for review; not available to request" }],
  }));
  saveCatalog((items) => [...imported, ...items]);
  return imported.length;
}

export function itemExportRows(entityName: string): TransferRow[] {
  return getCatalog().filter((item) => item.entities.includes(entityName)).map((item) => ({
    name: item.name, kind: item.kind, category: item.category, unit: item.unit,
    spec: item.spec, tax_ref: item.taxRef,
  }));
}
