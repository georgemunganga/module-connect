/** Owned RECEIVING schema 1. References are canonical IDs selected through purpose lookups. */
export type ReceivingRow = { code: string; categoryCode: string; purchaseType: string; kind: "" | "Goods" | "Service";
  siteIds: string[]; inspectionRequired: boolean | null; checklistReference: string; inspectorWorkerIds: string[];
  serviceOwnerWorkerIds: string[]; allowRequesterCertification: boolean | null;
  allowBuyerCertification: boolean | null; allowReceiverCertification: boolean | null;
  requireIndependentInspector: boolean | null; evidenceReferencePrefix: string;
  evidenceMode: "" | "ControlledManualReference" };
export const emptyReceivingRow = (): ReceivingRow => ({ code: "", categoryCode: "", purchaseType: "", kind: "",
  siteIds: [], inspectionRequired: null, checklistReference: "", inspectorWorkerIds: [], serviceOwnerWorkerIds: [],
  allowRequesterCertification: null, allowBuyerCertification: null, allowReceiverCertification: null,
  requireIndependentInspector: null, evidenceReferencePrefix: "", evidenceMode: "" });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exactly = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const rowKeys = ["code", "categoryCode", "purchaseType", "kind", "siteIds", "inspectionRequired", "checklistReference",
  "inspectorWorkerIds", "serviceOwnerWorkerIds", "allowRequesterCertification", "allowBuyerCertification",
  "allowReceiverCertification", "requireIndependentInspector", "evidenceMode", "evidenceReferencePrefix"];
const text = (value: string, max: number) => value.length > 0 && value.length <= max && value === value.trim();
const ids = (values: string[], required: boolean) => Array.isArray(values) && (!required || values.length > 0)
  && values.length <= 100 && values.every(value => typeof value === "string" && uuid.test(value))
  && new Set(values).size === values.length;
const explicit = (value: boolean | null) => typeof value === "boolean";

export function serializeReceivingPolicy(currency: string, rows: ReceivingRow[]): string {
  if (!/^[A-Z]{3}$/.test(currency) || rows.length < 1 || rows.length > 64)
    throw new Error("Choose a company currency and one to 64 receiving rules.");
  const classifications = new Set<string>(), codes = new Set<string>();
  const rules = rows.map(row => {
    if (!text(row.code, 64) || !text(row.categoryCode, 64)
      || !["GOODS", "SERVICES", "ASSETS", "SUBSCRIPTIONS"].includes(row.purchaseType)
      || !["Goods", "Service"].includes(row.kind) || !ids(row.siteIds, true)
      || !ids(row.inspectorWorkerIds, false) || !ids(row.serviceOwnerWorkerIds, false)
      || !explicit(row.inspectionRequired) || !explicit(row.allowRequesterCertification)
      || !explicit(row.allowBuyerCertification) || !explicit(row.allowReceiverCertification)
      || !explicit(row.requireIndependentInspector) || row.evidenceMode !== "ControlledManualReference"
      || !text(row.evidenceReferencePrefix, 100) || codes.has(row.code)
      || classifications.has(`${row.categoryCode}:${row.purchaseType}`))
      throw new Error("Complete every receiving classification, site, owner and control choice using current ERP records.");
    if (row.kind === "Service" && (row.inspectionRequired || row.checklistReference || row.inspectorWorkerIds.length
      || !row.serviceOwnerWorkerIds.length)
      || row.kind === "Goods" && (row.serviceOwnerWorkerIds.length
        || (row.inspectionRequired && (!text(row.checklistReference, 200) || !row.inspectorWorkerIds.length))
        || (!row.inspectionRequired && (row.checklistReference || row.inspectorWorkerIds.length))))
      throw new Error("Goods inspection and service ownership must match the selected receiving type.");
    codes.add(row.code); classifications.add(`${row.categoryCode}:${row.purchaseType}`);
    return { code: row.code, categoryCode: row.categoryCode, purchaseType: row.purchaseType,
      kind: row.kind, siteIds: row.siteIds, inspectionRequired: row.inspectionRequired,
      checklistReference: row.inspectionRequired ? row.checklistReference : null,
      inspectorWorkerIds: row.inspectorWorkerIds, serviceOwnerWorkerIds: row.serviceOwnerWorkerIds,
      allowRequesterCertification: row.allowRequesterCertification,
      allowBuyerCertification: row.allowBuyerCertification,
      allowReceiverCertification: row.allowReceiverCertification,
      requireIndependentInspector: row.requireIndependentInspector,
      evidenceMode: row.evidenceMode, evidenceReferencePrefix: row.evidenceReferencePrefix };
  });
  const json = JSON.stringify({ schemaVersion: 1, transactionType: "Receiving", currencyCode: currency, rules });
  if (new TextEncoder().encode(json).byteLength > 65536) throw new Error("Keep receiving rules under 64 KB.");
  return json;
}

/** Unknown shape is displayed as retained read-only history, never silently edited. */
export function parseReceivingPolicy(json: string, currency: string): ReceivingRow[] | null {
  try {
    if (new TextEncoder().encode(json).byteLength > 65536) return null;
    const value: unknown = JSON.parse(json);
    if (!object(value) || !exactly(value, ["schemaVersion", "transactionType", "currencyCode", "rules"])
      || value.schemaVersion !== 1 || value.transactionType !== "Receiving" || value.currencyCode !== currency
      || !Array.isArray(value.rules)) return null;
    const rows = value.rules.map((entry: unknown) => {
      if (!object(entry) || !exactly(entry, rowKeys)) throw new Error("Unknown receiving rule");
      return { ...entry, checklistReference: entry.checklistReference === null ? "" : entry.checklistReference } as ReceivingRow;
    });
    serializeReceivingPolicy(currency, rows);
    return rows;
  } catch { return null; }
}
