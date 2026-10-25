/** Supported company-wide subset of the owned SOURCING policy document. */
export type SourcingStage = { code: string; mode: "" | "One" | "All"; principalIds: string[] };
export type SourcingAudienceRow = {
  supplierLifecycle: "" | "RecordedActiveDecision";
  categoryMode: "" | "Ignore" | "CoverAllSelectedCategories";
  qualificationTypes: string[] | null;
  qualificationDocuments: "" | "NotRequired" | "CoreAvailableVersionRequired";
  validThrough: "" | "PreparationInstant" | "ClosingInstant";
  allowNoQualificationExpiry: boolean | null;
  allowOpenEndedSupplierValidity: boolean | null;
  contactSelection: "" | "OneActiveSelected" | "OneActivePrimarySelected";
  contactRequiredFields: Array<"Email" | "Phone"> | null;
};
export const emptySourcingAudience = (): SourcingAudienceRow => ({ supplierLifecycle: "", categoryMode: "",
  qualificationTypes: null, qualificationDocuments: "", validThrough: "",
  allowNoQualificationExpiry: null, allowOpenEndedSupplierValidity: null,
  contactSelection: "", contactRequiredFields: null });
export type SourcingRow = { code: string; priority: string; minimum: string; maximum: string;
  categoryCodes: string; purchaseType: string; companyWide: boolean | null;
  minimumQuoteCount: string; minimumInvitedSuppliers: string;
  requirementsPackRequired: boolean | null; evaluationCriteriaRequired: boolean | null;
  closingDateRequired: boolean | null; stages: SourcingStage[]; audience?: SourcingAudienceRow };
export const emptySourcingRow = (): SourcingRow => ({ code: "", priority: "", minimum: "", maximum: "",
  categoryCodes: "", purchaseType: "", companyWide: null, minimumQuoteCount: "", minimumInvitedSuppliers: "",
  requirementsPackRequired: null, evaluationCriteriaRequired: null, closingDateRequired: null,
  stages: [{ code: "", mode: "", principalIds: [] }] });
const code = /^[A-Z0-9_]{1,100}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exactly = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const splitCodes = (text: string) => text.split(",").map(value => value.trim().toUpperCase()).filter(Boolean);
function integer(text: string, limit: number): number {
  if (!/^\d+$/.test(text) || Number(text) > limit) throw new Error(`Choose a whole number from zero to ${limit}.`);
  return Number(text);
}
/** 18,4 exact decimal token, inserted as a number without JavaScript Number conversion. */
function threshold(text: string): string {
  if (!/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/.test(text))
    throw new Error("Use an amount with up to 14 whole digits and four decimal places.");
  return text;
}
function parseThresholds(json: string): Record<string, unknown> {
  const edits: Array<{ start: number; end: number; replacement: string }> = [];
  for (let i = 0; i < json.length; i++) {
    if (json[i] !== '"') continue;
    const begin = i++;
    for (; i < json.length; i++) { if (json[i] === "\\") i++; else if (json[i] === '"') break; }
    const name: unknown = JSON.parse(json.slice(begin, i + 1));
    if (name !== "minimumAmountInclusive" && name !== "maximumAmountExclusive") continue;
    let at = i + 1;
    while (/\s/.test(json[at] ?? "")) at++;
    if (json[at++] !== ":") continue;
    while (/\s/.test(json[at] ?? "")) at++;
    if (json.slice(at, at + 4) === "null") continue;
    const token = /^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(json.slice(at));
    if (!token) throw new Error("Unknown amount representation.");
    // This editor handles exact plain 18,4 amounts; other saved forms remain read-only.
    threshold(token[0]);
    edits.push({ start: at, end: at + token[0].length, replacement: JSON.stringify(token[0]) });
  }
  for (const edit of edits.reverse()) json = json.slice(0, edit.start) + edit.replacement + json.slice(edit.end);
  return JSON.parse(json) as Record<string, unknown>;
}

function audienceDocument(value: SourcingAudienceRow | undefined) {
  if (!value) throw new Error("Choose the supplier audience controls for this sourcing rule.");
  const choice = (actual: string, allowed: string[]) => {
    if (actual && !allowed.includes(actual)) throw new Error("Choose a supported supplier audience option.");
    return actual || null;
  };
  if (value.qualificationTypes !== null && (value.qualificationTypes.length > 100
    || value.qualificationTypes.some(type => !type || type.length > 80 || type !== type.trim() || /[\x00-\x1f\x7f]/.test(type))
    || new Set(value.qualificationTypes.map(type => type.toLowerCase())).size !== value.qualificationTypes.length)
    || value.contactRequiredFields !== null && (value.contactRequiredFields.length > 2
      || value.contactRequiredFields.some(field => field !== "Email" && field !== "Phone")
      || new Set(value.contactRequiredFields).size !== value.contactRequiredFields.length))
    throw new Error("Check the qualification types and required contact fields.");
  return { supplierLifecycle: choice(value.supplierLifecycle, ["RecordedActiveDecision"]),
    categoryMode: choice(value.categoryMode, ["Ignore", "CoverAllSelectedCategories"]),
    qualificationTypes: value.qualificationTypes,
    qualificationDocuments: choice(value.qualificationDocuments, ["NotRequired", "CoreAvailableVersionRequired"]),
    validThrough: choice(value.validThrough, ["PreparationInstant", "ClosingInstant"]),
    allowNoQualificationExpiry: value.allowNoQualificationExpiry,
    allowOpenEndedSupplierValidity: value.allowOpenEndedSupplierValidity,
    contactSelection: choice(value.contactSelection, ["OneActiveSelected", "OneActivePrimarySelected"]),
    contactRequiredFields: value.contactRequiredFields };
}
export function serializeSourcingPolicy(currency: string, rows: SourcingRow[], schemaVersion: 1 | 2 = 1): string {
  if (!/^[A-Z]{3}$/.test(currency) || rows.length < 1 || rows.length > 100) throw new Error("Choose one to 100 sourcing rules.");
  const seen = new Set<string>();
  const serialized = rows.map(row => {
    const ruleCode = row.code.trim().toUpperCase();
    const categories = splitCodes(row.categoryCodes);
    if (!code.test(ruleCode) || seen.has(ruleCode) || categories.some(value => !code.test(value))
      || row.companyWide !== true || typeof row.requirementsPackRequired !== "boolean"
      || typeof row.evaluationCriteriaRequired !== "boolean" || typeof row.closingDateRequired !== "boolean"
      || row.stages.length < 1 || row.stages.length > 20
      || row.purchaseType && !["GOODS", "SERVICES", "ASSETS", "SUBSCRIPTIONS"].includes(row.purchaseType))
      throw new Error("Complete the sourcing rule, company scope and all publication controls.");
    seen.add(ruleCode);
    const stageCodes = new Set<string>();
    const approvalStages = row.stages.map(stage => {
      const stageCode = stage.code.trim().toUpperCase();
      if (!code.test(stageCode) || stageCodes.has(stageCode) || !["One", "All"].includes(stage.mode)
        || stage.principalIds.length < 1 || stage.principalIds.length > 100
        || stage.principalIds.some(id => !uuid.test(id)) || new Set(stage.principalIds).size !== stage.principalIds.length)
        throw new Error("Choose named reviewers and an explicit decision rule for every step.");
      stageCodes.add(stageCode);
      return { code: stageCode, assignee: "ProcurementManager", mode: stage.mode, principalIds: stage.principalIds };
    });
    const identity = JSON.stringify({ code: ruleCode, priority: integer(row.priority, 100000) });
    const conditions = JSON.stringify({ categoryCodes: categories,
      purchaseTypes: row.purchaseType ? [row.purchaseType] : [], branchIds: [] });
    const result = JSON.stringify({ publication: { minimumQuoteCount: integer(row.minimumQuoteCount, 20),
      minimumInvitedSuppliers: integer(row.minimumInvitedSuppliers, 100),
      requirementsPackRequired: row.requirementsPackRequired,
      evaluationCriteriaRequired: row.evaluationCriteriaRequired,
      closingDateRequired: row.closingDateRequired }, approvalStages,
      ...(schemaVersion === 2 ? { audience: audienceDocument(row.audience) } : {}) });
    return `${identity.slice(0, -1)},"when":{"minimumAmountInclusive":${row.minimum ? threshold(row.minimum) : "null"},"maximumAmountExclusive":${row.maximum ? threshold(row.maximum) : "null"},${conditions.slice(1)},"result":${result}}`;
  });
  const header = JSON.stringify({ schemaVersion, policyKey: "SOURCING", transactionType: "SourcingPublication",
    action: "SourcingEvent.Publish", permission: "procurement-sourcing-publish", currencyCode: currency,
    amountBasis: "ApprovedLineBase" });
  const json = `${header.slice(0, -1)},"rules":[${serialized.join(",")}]}`;
  if (new TextEncoder().encode(json).byteLength > 65536) throw new Error("Keep the policy under 64 KB.");
  return json;
}

export function parseSourcingPolicy(json: string, currency: string): SourcingRow[] | null {
  try {
    if (new TextEncoder().encode(json).byteLength > 65536) return null;
    const doc = parseThresholds(json);
    if (!object(doc) || !exactly(doc, ["schemaVersion", "policyKey", "transactionType", "action", "permission", "currencyCode", "amountBasis", "rules"])
      || (doc.schemaVersion !== 1 && doc.schemaVersion !== 2) || doc.policyKey !== "SOURCING" || doc.transactionType !== "SourcingPublication"
      || doc.action !== "SourcingEvent.Publish" || doc.permission !== "procurement-sourcing-publish"
      || doc.currencyCode !== currency || doc.amountBasis !== "ApprovedLineBase" || !Array.isArray(doc.rules)) return null;
    const schemaVersion = doc.schemaVersion as 1 | 2;
    const rows = doc.rules.map((item: unknown) => {
      if (!object(item) || !exactly(item, ["code", "priority", "when", "result"])
        || !object(item.when) || !object(item.result) || !object(item.result.publication)
        || !exactly(item.when, ["minimumAmountInclusive", "maximumAmountExclusive", "categoryCodes", "purchaseTypes", "branchIds"])
        || !exactly(item.result, schemaVersion === 2 ? ["publication", "approvalStages", "audience"] : ["publication", "approvalStages"])
        || !exactly(item.result.publication, ["minimumQuoteCount", "minimumInvitedSuppliers", "requirementsPackRequired", "evaluationCriteriaRequired", "closingDateRequired"])
        || !Array.isArray(item.when.categoryCodes) || !Array.isArray(item.when.purchaseTypes)
        || item.when.purchaseTypes.length > 1
        || !Array.isArray(item.when.branchIds) || item.when.branchIds.length
        || !Array.isArray(item.result.approvalStages)) throw new Error("Unrepresentable sourcing rule");
      const stages = item.result.approvalStages.map((stage: unknown) => {
        if (!object(stage) || !exactly(stage, ["code", "assignee", "mode", "principalIds"])
          || stage.assignee !== "ProcurementManager" || !Array.isArray(stage.principalIds)) throw new Error("Unrepresentable reviewers");
        return { code: stage.code, mode: stage.mode, principalIds: stage.principalIds } as SourcingStage;
      });
      let audience: SourcingAudienceRow | undefined;
      if (schemaVersion === 2) {
        const raw = item.result.audience;
        if (!object(raw) || !exactly(raw, ["supplierLifecycle", "categoryMode", "qualificationTypes", "qualificationDocuments",
          "validThrough", "allowNoQualificationExpiry", "allowOpenEndedSupplierValidity", "contactSelection", "contactRequiredFields"]))
          throw new Error("Unrepresentable supplier audience");
        audience = { supplierLifecycle: raw.supplierLifecycle ?? "", categoryMode: raw.categoryMode ?? "",
          qualificationTypes: raw.qualificationTypes as string[] | null,
          qualificationDocuments: raw.qualificationDocuments ?? "", validThrough: raw.validThrough ?? "",
          allowNoQualificationExpiry: raw.allowNoQualificationExpiry as boolean | null,
          allowOpenEndedSupplierValidity: raw.allowOpenEndedSupplierValidity as boolean | null,
          contactSelection: raw.contactSelection ?? "", contactRequiredFields: raw.contactRequiredFields as Array<"Email" | "Phone"> | null } as SourcingAudienceRow;
        if ((raw.qualificationTypes !== null && (!Array.isArray(raw.qualificationTypes) || raw.qualificationTypes.some(type => typeof type !== "string")))
          || (raw.contactRequiredFields !== null && (!Array.isArray(raw.contactRequiredFields) || raw.contactRequiredFields.some(field => typeof field !== "string")))
          || (raw.allowNoQualificationExpiry !== null && typeof raw.allowNoQualificationExpiry !== "boolean")
          || (raw.allowOpenEndedSupplierValidity !== null && typeof raw.allowOpenEndedSupplierValidity !== "boolean"))
          throw new Error("Unrepresentable supplier audience");
        audienceDocument(audience);
      }
      return { code: item.code, priority: String(item.priority),
        minimum: item.when.minimumAmountInclusive === null ? "" : String(item.when.minimumAmountInclusive),
        maximum: item.when.maximumAmountExclusive === null ? "" : String(item.when.maximumAmountExclusive),
        categoryCodes: item.when.categoryCodes.join(", "), purchaseType: String(item.when.purchaseTypes[0] ?? ""),
        companyWide: true, minimumQuoteCount: String(item.result.publication.minimumQuoteCount),
        minimumInvitedSuppliers: String(item.result.publication.minimumInvitedSuppliers),
        requirementsPackRequired: item.result.publication.requirementsPackRequired,
        evaluationCriteriaRequired: item.result.publication.evaluationCriteriaRequired,
        closingDateRequired: item.result.publication.closingDateRequired, stages,
        ...(audience ? { audience } : {}) } as SourcingRow;
    });
    serializeSourcingPolicy(currency, rows, schemaVersion);
    return rows;
  } catch { return null; }
}
