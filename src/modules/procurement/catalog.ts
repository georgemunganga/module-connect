export type ItemKind = "Goods" | "Service" | "Asset" | "Subscription" | "Consumable";

export interface SupplierOffer {
  supplier: string;
  price: number;
  currency: string;
  source: "Contract" | "Catalog";
  validTo: string;
  leadTimeDays: number;
  preferred?: boolean;
}

export interface CatalogItem {
  id: string;
  name: string;
  kind: ItemKind;
  category: string;
  unit: string;
  spec: string;
  entities: string[];
  taxRef: string;
  status: "Active" | "Inactive";
  activeFrom: string;
  activeTo?: string;
  /** Another ERP module owns this classification (e.g. Inventory for stock, Asset register for assets). */
  authoritativeOwner?: string;
  offers: SupplierOffer[];
  /** Reason the item can't be requested, plus the next permitted route. */
  block?: string;
  versions: { version: number; date: string; by: string; change: string }[];
}

const today = "2026-10-03";

export const catalogItems: CatalogItem[] = [
  {
    id: "itm-laptop-14",
    name: "Laptop 14\" standard build",
    kind: "Asset",
    category: "IT hardware",
    unit: "each",
    spec: "14\" display, 16 GB memory, 512 GB storage, 3-year warranty",
    entities: ["Meridian Netherlands B.V.", "Meridian GmbH"],
    taxRef: "VAT-STD-21",
    status: "Active",
    activeFrom: "2026-01-01",
    authoritativeOwner: "Asset register (Accounting)",
    offers: [
      { supplier: "Northwind Devices B.V.", price: 1230, currency: "EUR", source: "Contract", validTo: "2027-06-30", leadTimeDays: 10, preferred: true },
      { supplier: "Contoso Tech GmbH", price: 1295, currency: "EUR", source: "Catalog", validTo: "2026-12-31", leadTimeDays: 7 },
    ],
    versions: [
      { version: 3, date: "2026-07-01", by: "Priya Raman", change: "Contract price €1,260 → €1,230" },
      { version: 2, date: "2026-03-15", by: "Priya Raman", change: "Added Meridian GmbH eligibility" },
    ],
  },
  {
    id: "itm-chair-ergo",
    name: "Ergonomic office chair",
    kind: "Goods",
    category: "Furniture",
    unit: "each",
    spec: "Adjustable lumbar support, EN 1335 certified",
    entities: ["Meridian Netherlands B.V."],
    taxRef: "VAT-STD-21",
    status: "Active",
    activeFrom: "2025-09-01",
    offers: [{ supplier: "Studio Zit", price: 360, currency: "EUR", source: "Catalog", validTo: "2026-09-30", leadTimeDays: 14, preferred: true }],
    versions: [{ version: 1, date: "2025-09-01", by: "Priya Raman", change: "Created" }],
  },
  {
    id: "itm-boots",
    name: "Safety boots, size range",
    kind: "Goods",
    category: "Safety equipment",
    unit: "pair",
    spec: "S3 toe protection, sizes 36–48",
    entities: ["Meridian Kenya Ltd"],
    taxRef: "KE-VAT-16",
    status: "Active",
    activeFrom: "2026-02-01",
    offers: [{ supplier: "Kifaru Safety Ltd", price: 7700, currency: "KES", source: "Contract", validTo: "2027-01-31", leadTimeDays: 5, preferred: true }],
    versions: [{ version: 1, date: "2026-02-01", by: "Grace Wanjiru", change: "Created" }],
  },
  {
    id: "itm-paper-a4",
    name: "Printer paper A4, 80 g (box of 5 reams)",
    kind: "Consumable",
    category: "Office supplies",
    unit: "box",
    spec: "FSC certified",
    entities: ["Meridian Netherlands B.V.", "Meridian GmbH", "Meridian Kenya Ltd"],
    taxRef: "VAT-STD-21",
    status: "Active",
    activeFrom: "2024-01-01",
    authoritativeOwner: "Inventory (stock item)",
    offers: [{ supplier: "Office Depot NL", price: 24.5, currency: "EUR", source: "Catalog", validTo: "2026-12-31", leadTimeDays: 2, preferred: true }],
    versions: [{ version: 1, date: "2024-01-01", by: "System import", change: "Created" }],
  },
  {
    id: "itm-design-licence",
    name: "Design tool licence (annual)",
    kind: "Subscription",
    category: "Software",
    unit: "seat / year",
    spec: "Named user licence",
    entities: ["Meridian Netherlands B.V."],
    taxRef: "VAT-STD-21",
    status: "Active",
    activeFrom: "2026-01-01",
    offers: [{ supplier: "Pixelworks SaaS", price: 540, currency: "EUR", source: "Catalog", validTo: "2026-12-31", leadTimeDays: 1 }],
    block: "Software needs an IT security review first. Raise an IT request, then add this item with the review reference.",
    versions: [{ version: 1, date: "2026-01-01", by: "Priya Raman", change: "Created" }],
  },
  {
    id: "itm-warranty-cover",
    name: "Warranty coverage subscription (annual)",
    kind: "Subscription",
    category: "Warranty services",
    unit: "year",
    spec: "Annual device support and replacement coverage",
    entities: ["Meridian Netherlands B.V."],
    taxRef: "VAT-STD-21",
    status: "Active",
    activeFrom: "2026-01-01",
    offers: [{ supplier: "Northwind Devices B.V.", price: 1200, currency: "EUR", source: "Contract", validTo: "2027-12-31", leadTimeDays: 0, preferred: true }],
    versions: [{ version: 1, date: "2026-01-01", by: "Priya Raman", change: "Added under signed warranty framework" }],
  },
  {
    id: "itm-freight-nbo-mba",
    name: "Freight, Nairobi → Mombasa",
    kind: "Service",
    category: "Logistics",
    unit: "trip",
    spec: "Up to 10 t, door to door",
    entities: ["Meridian Kenya Ltd"],
    taxRef: "KE-VAT-16",
    status: "Active",
    activeFrom: "2026-05-01",
    offers: [{ supplier: "Achieng & Partners Logistics", price: 188000, currency: "KES", source: "Catalog", validTo: "2026-12-31", leadTimeDays: 2 }],
    block: "Supplier isn't onboarded yet. Choose another freight item, or ask the supplier steward to finish onboarding.",
    versions: [{ version: 1, date: "2026-05-01", by: "Grace Wanjiru", change: "Created" }],
  },
  {
    id: "itm-cleaning",
    name: "Office cleaning, monthly",
    kind: "Service",
    category: "Facilities",
    unit: "month",
    spec: "5 days a week, 600 m²",
    entities: ["Meridian Netherlands B.V."],
    taxRef: "VAT-STD-21",
    status: "Active",
    activeFrom: "2025-01-01",
    offers: [{ supplier: "Sparkle Facilities", price: 820, currency: "EUR", source: "Contract", validTo: "2027-12-31", leadTimeDays: 0, preferred: true }],
    versions: [{ version: 1, date: "2025-01-01", by: "Priya Raman", change: "Created" }],
  },
  {
    id: "itm-fax",
    name: "Fax machine",
    kind: "Goods",
    category: "IT hardware",
    unit: "each",
    spec: "Discontinued",
    entities: ["Meridian GmbH"],
    taxRef: "VAT-DE-19",
    status: "Inactive",
    activeFrom: "2019-01-01",
    activeTo: "2025-12-31",
    offers: [],
    versions: [{ version: 2, date: "2025-12-31", by: "Priya Raman", change: "Deactivated" }],
  },
];

export const isExpired = (o: SupplierOffer) => o.validTo < today;
export const bestOffer = (i: CatalogItem) => i.offers.find((o) => o.preferred && !isExpired(o)) ?? i.offers.find((o) => !isExpired(o)) ?? i.offers[0];
export const money = (n: number, ccy: string) => new Intl.NumberFormat("en-IE", { style: "currency", currency: ccy, maximumFractionDigits: ccy === "KES" ? 0 : 2 }).format(n);
