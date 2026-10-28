/** Receiving schema 2 names current Core principals. Legacy worker rules stay in their own editor. */
export type PrincipalReceivingRow = {
  code: string; categoryCode: string; purchaseType: string; kind: "" | "Goods" | "Service";
  siteIds: string[]; inspectionRequired: boolean | null; checklistReference: string;
  inspectorPrincipalIds: string[]; acceptorPrincipalIds: string[]; serviceOwnerPrincipalIds: string[];
  allowRequesterCertification: boolean | null; allowBuyerCertification: boolean | null;
  allowReceiverCertification: boolean | null; requireIndependentInspector: boolean | null;
  evidenceMode: "" | "ControlledManualReference"; evidenceReferencePrefix: string;
};
export const emptyPrincipalReceivingRow = (): PrincipalReceivingRow => ({
  code: "", categoryCode: "", purchaseType: "", kind: "", siteIds: [], inspectionRequired: null,
  checklistReference: "", inspectorPrincipalIds: [], acceptorPrincipalIds: [], serviceOwnerPrincipalIds: [],
  allowRequesterCertification: null, allowBuyerCertification: null, allowReceiverCertification: null,
  requireIndependentInspector: null, evidenceMode: "", evidenceReferencePrefix: "",
});
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exactly = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const rowKeys = ["code", "categoryCode", "purchaseType", "kind", "siteIds", "inspectionRequired", "checklistReference",
  "inspectorPrincipalIds", "acceptorPrincipalIds", "serviceOwnerPrincipalIds", "allowRequesterCertification",
  "allowBuyerCertification", "allowReceiverCertification", "requireIndependentInspector", "evidenceMode", "evidenceReferencePrefix"];
const text = (value: string, max: number) => typeof value === "string" && value.length > 0 && value.length <= max && value === value.trim();
const ids = (values: string[], required: boolean, max: number) => Array.isArray(values) && values.length <= max
  && (!required || values.length > 0) && values.every(value => typeof value === "string" && guid.test(value))
  && new Set(values).size === values.length;
const explicit = (value: boolean | null) => typeof value === "boolean";

export function serializePrincipalReceivingPolicy(currency: string, rows: PrincipalReceivingRow[]): string {
  if (!/^[A-Z]{3}$/.test(currency) || rows.length < 1 || rows.length > 64)
    throw new Error("Choose a company currency and one to 64 receiving rules.");
  const classifications = new Set<string>(), codes = new Set<string>();
  const rules = rows.map(row => {
    if (!text(row.code, 64) || !text(row.categoryCode, 64)
      || !["GOODS", "SERVICES", "ASSETS", "SUBSCRIPTIONS"].includes(row.purchaseType)
      || !["Goods", "Service"].includes(row.kind) || !ids(row.siteIds, true, 64)
      || !ids(row.inspectorPrincipalIds, false, 64) || !ids(row.acceptorPrincipalIds, false, 64)
      || !ids(row.serviceOwnerPrincipalIds, false, 64) || !explicit(row.inspectionRequired)
      || !explicit(row.allowRequesterCertification) || !explicit(row.allowBuyerCertification)
      || !explicit(row.allowReceiverCertification) || !explicit(row.requireIndependentInspector)
      || row.evidenceMode !== "ControlledManualReference" || !text(row.evidenceReferencePrefix, 100)
      || codes.has(row.code) || classifications.has(`${row.categoryCode}:${row.purchaseType}`))
      throw new Error("Complete every receiving classification, site, named Core account and control choice.");
    if (row.kind === "Goods" && (!row.acceptorPrincipalIds.length || row.serviceOwnerPrincipalIds.length
      || row.inspectionRequired && (!text(row.checklistReference, 200) || !row.inspectorPrincipalIds.length)
      || !row.inspectionRequired && (row.checklistReference || row.inspectorPrincipalIds.length))
      || row.kind === "Service" && (row.inspectionRequired || row.checklistReference || row.inspectorPrincipalIds.length
        || row.acceptorPrincipalIds.length || !row.serviceOwnerPrincipalIds.length))
      throw new Error("Goods inspection, goods acceptance and service ownership must match the selected receiving type.");
    codes.add(row.code); classifications.add(`${row.categoryCode}:${row.purchaseType}`);
    return { code: row.code, categoryCode: row.categoryCode, purchaseType: row.purchaseType, kind: row.kind,
      siteIds: row.siteIds, inspectionRequired: row.inspectionRequired,
      checklistReference: row.inspectionRequired ? row.checklistReference : null,
      inspectorPrincipalIds: row.inspectorPrincipalIds, acceptorPrincipalIds: row.acceptorPrincipalIds,
      serviceOwnerPrincipalIds: row.serviceOwnerPrincipalIds,
      allowRequesterCertification: row.allowRequesterCertification, allowBuyerCertification: row.allowBuyerCertification,
      allowReceiverCertification: row.allowReceiverCertification, requireIndependentInspector: row.requireIndependentInspector,
      evidenceMode: row.evidenceMode, evidenceReferencePrefix: row.evidenceReferencePrefix };
  });
  const json = JSON.stringify({ schemaVersion: 2, transactionType: "Receiving", currencyCode: currency, rules });
  if (new TextEncoder().encode(json).byteLength > 65536) throw new Error("Keep receiving rules under 64 KB.");
  return json;
}

/** Only a complete schema-2 document can be reopened for editing. */
export function parsePrincipalReceivingPolicy(json: string, currency: string): PrincipalReceivingRow[] | null {
  try {
    if (new TextEncoder().encode(json).byteLength > 65536) return null;
    const value: unknown = JSON.parse(json);
    if (!object(value) || !exactly(value, ["schemaVersion", "transactionType", "currencyCode", "rules"])
      || value.schemaVersion !== 2 || value.transactionType !== "Receiving" || value.currencyCode !== currency
      || !Array.isArray(value.rules)) return null;
    const rows = value.rules.map((entry: unknown) => {
      if (!object(entry) || !exactly(entry, rowKeys)) throw new Error("Unknown receiving rule");
      return { ...entry, checklistReference: entry.checklistReference === null ? "" : entry.checklistReference } as PrincipalReceivingRow;
    });
    serializePrincipalReceivingPolicy(currency, rows);
    return rows;
  } catch { return null; }
}
