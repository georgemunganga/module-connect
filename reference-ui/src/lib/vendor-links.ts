import type { AppRecord } from "./store";

/** Stable vendor IDs win; title/company matching supports older local fixtures. */
export function belongsToVendor(record: AppRecord, vendor: AppRecord): boolean {
  if (record.kind === "vendors") return false;
  if (record.meta?.vendorId) return record.meta.vendorId === vendor.id;
  return record.party === vendor.title || record.party === vendor.meta?.company;
}

export function inferVendorId(
  record: AppRecord,
  vendors: AppRecord[],
): string | undefined {
  if (record.meta?.vendorId) return record.meta.vendorId;
  return vendors.find((vendor) => belongsToVendor(record, vendor))?.id;
}
