import { boundedNonnegativeDecimal } from "../../../src/platform/procurement-invoice-exact";
import { parseFinancialJson } from "../../../src/platform/procurement-invoice-json";

export type RuleRow = {
  code: string; priority: number; minimum: string; maximum: string;
  categoryCodes: string; purchaseType: string; budget: "Required" | "ExceptionReview";
  method: string; quotes: string; stages: Array<{ code: string; assignee: string; mode: "" | "One" | "All"; principalIds?: string[] }>;
  sourcing?: { quotes: string; invited: string; pack: boolean | null; criteria: boolean | null; deadline: boolean | null; companyWide: boolean | null };
};
export const approvalAssigneesForPolicy = (key: string): readonly string[] => key === "PURCHASE_REQUEST"
  ? ["LineManager", "ProcurementManager"] : key === "PURCHASE_ORDER" ? ["ProcurementManager"] : [];
export const emptyRule = (key = "PURCHASE_REQUEST"): RuleRow => key === "SOURCING" ? {
  code: "DEFAULT", priority: 0, minimum: "", maximum: "", categoryCodes: "", purchaseType: "", budget: "Required", method: "", quotes: "",
  stages: [{ code: "PUBLICATION", assignee: "ProcurementManager", mode: "", principalIds: [] }],
  sourcing: { quotes: "", invited: "", pack: null, criteria: null, deadline: null, companyWide: null },
} : ({ code: "DEFAULT", priority: 0, minimum: "", maximum: "",
  categoryCodes: "", purchaseType: "", budget: "Required", method: "", quotes: "",
  stages: [{ code: key === "PURCHASE_ORDER" ? "COMMERCIAL" : "NEED", assignee: key === "PURCHASE_ORDER" ? "ProcurementManager" : "LineManager", mode: "One" }] });
const codes = (value: string) => value.split(",").map((part) => part.trim().toUpperCase()).filter(Boolean);
const onlyKeys = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).every((name) => allowed.includes(name));

export function toRuleJson(key: string, currency: string, rows: RuleRow[]): string {
  if (key === "SOURCING") return toSourcingJson(currency, rows);
  const assignees = approvalAssigneesForPolicy(key);
  if (!assignees.length) throw new Error("This purchase type is not supported by the editor. Keep its rules read-only.");
  const header = JSON.stringify({ schemaVersion: 1,
    transactionType: key === "PURCHASE_ORDER" ? "PurchaseOrder" : "PurchaseRequest",
    currencyCode: currency, amountBasis: key === "PURCHASE_ORDER" ? "ApprovedLineBase" : "EstimatedLineBase" });
  const rules = rows.map((row) => {
    if (row.stages.some((stage) => !assignees.includes(stage.assignee)))
      throw new Error("This approval assignment is not connected. Keep the saved rules read-only.");
    const identity = JSON.stringify({ code: row.code.trim().toUpperCase(), priority: Number(row.priority) });
    const conditions = JSON.stringify({ categoryCodes: codes(row.categoryCodes), purchaseTypes: row.purchaseType ? [row.purchaseType] : [], branchIds: [] });
    const result = JSON.stringify({ budgetReservation: row.budget,
        sourcingMethodCode: row.method.trim().toUpperCase() || null,
        minimumQuoteCount: row.quotes === "" ? null : Number(row.quotes),
        approvalStages: row.stages.map((stage) => ({ ...stage })) });
    // Only canonical, validated decimal tokens are emitted raw. All other fields use
    // JSON.stringify, so identifiers or descriptions cannot inject JSON syntax.
    return `${identity.slice(0, -1)},"when":{"minimumAmountInclusive":${row.minimum ? exactPolicyAmount(row.minimum) : "null"},"maximumAmountExclusive":${row.maximum ? exactPolicyAmount(row.maximum) : "null"},${conditions.slice(1)},"result":${result}}`;
  });
  return `${header.slice(0, -1)},"rules":[${rules.join(",")}]}`;
}

export function exactPolicyAmount(raw: string): string {
  if (raw.length > 128) throw new Error("Use an amount with up to four decimal places within the supported range.");
  const match = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(raw.trim());
  if (!match) throw new Error("Use a positive decimal amount or zero.");
  const exponent = match[3] ? Number(match[3]) : 0;
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) throw new Error("Amount is outside the supported range.");
  let digits = (match[1] + (match[2] ?? "")).replace(/^0+/, ""), scale = (match[2]?.length ?? 0) - exponent;
  if (!digits) return "0";
  while (scale > 0 && digits.endsWith("0")) { digits = digits.slice(0, -1); scale--; }
  if (scale > 4 || digits.length - scale > 14) throw new Error("Use up to four decimal places and no more than 14 whole-number digits.");
  if (scale < 0) { digits += "0".repeat(-scale); scale = 0; }
  if (!scale) return digits;
  digits = digits.padStart(scale + 1, "0");
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

/** Tokenise strings first so quoted text and escaped keys cannot be mistaken for numbers.
 * Replace only known monetary number tokens before JSON.parse can round them. */
function parseExactThresholds(json: string): Record<string, unknown> {
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  for (let i = 0; i < json.length; i++) {
    if (json[i] !== '"') continue;
    const start = i++;
    for (; i < json.length; i++) { if (json[i] === "\\") i++; else if (json[i] === '"') break; }
    const key: unknown = JSON.parse(json.slice(start, i + 1));
    if (key !== "minimumAmountInclusive" && key !== "maximumAmountExclusive") continue;
    let next = i + 1; while (/\s/.test(json[next] ?? "") && next < json.length) next++;
    if (json[next] !== ":") continue;
    next++; while (/\s/.test(json[next] ?? "") && next < json.length) next++;
    if (json.slice(next, next + 4) === "null") continue;
    const token = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(json.slice(next));
    if (!token) throw new Error("Unknown monetary field representation.");
    replacements.push({ start: next, end: next + token[0].length, value: JSON.stringify(exactPolicyAmount(token[0])) });
  }
  for (const replacement of replacements.reverse()) json = json.slice(0, replacement.start) + replacement.value + json.slice(replacement.end);
  return JSON.parse(json) as Record<string, unknown>;
}

export function fromRuleJson(json: string, key: string, currency: string): RuleRow[] | null {
  if (key === "SOURCING") return fromSourcingJson(json, currency);
  try {
    const assignees = approvalAssigneesForPolicy(key);
    if (!assignees.length) return null;
    const document = parseExactThresholds(json);
    if (document.schemaVersion !== 1 || !Array.isArray(document.rules)
      || !onlyKeys(document, ["schemaVersion", "transactionType", "currencyCode", "amountBasis", "rules"])
      || document.currencyCode !== currency
      || document.transactionType !== (key === "PURCHASE_ORDER" ? "PurchaseOrder" : "PurchaseRequest")
      || document.amountBasis !== (key === "PURCHASE_ORDER" ? "ApprovedLineBase" : "EstimatedLineBase")) return null;
    return document.rules.map((value: unknown) => {
      if (!value || typeof value !== "object") throw new Error("Unknown rule");
      const rule = value as Record<string, unknown>;
      const when = rule.when as Record<string, unknown>;
      const result = rule.result as Record<string, unknown>;
      if (!when || !result || !Array.isArray(result.approvalStages)
        || !onlyKeys(rule, ["code", "priority", "when", "result"])
        || !onlyKeys(when, ["minimumAmountInclusive", "maximumAmountExclusive", "categoryCodes", "purchaseTypes", "branchIds"])
        || !onlyKeys(result, ["budgetReservation", "sourcingMethodCode", "minimumQuoteCount", "approvalStages"])
        || !Array.isArray(when.categoryCodes) || !Array.isArray(when.purchaseTypes)
        || !Array.isArray(when.branchIds) || when.branchIds.length
        || when.purchaseTypes.length > 1
        || (when.purchaseTypes.length === 1 && !["GOODS", "SERVICES", "ASSETS", "SUBSCRIPTIONS"].includes(String(when.purchaseTypes[0])))
        || !["Required", "ExceptionReview"].includes(String(result.budgetReservation)))
        throw new Error("This draft uses more detailed conditions.");
      const stages = result.approvalStages as Array<Record<string, unknown>>;
      if (stages.some((stage) => !onlyKeys(stage, ["code", "assignee", "mode"])
        || !["One", "All"].includes(String(stage.mode)) || typeof stage.code !== "string"
        || !assignees.includes(String(stage.assignee))))
        throw new Error("This draft uses a different approval assignment.");
      return { code: String(rule.code ?? ""), priority: Number(rule.priority ?? 0),
        minimum: when.minimumAmountInclusive == null ? "" : String(when.minimumAmountInclusive),
        maximum: when.maximumAmountExclusive == null ? "" : String(when.maximumAmountExclusive),
        categoryCodes: when.categoryCodes.join(", "), purchaseType: String(when.purchaseTypes[0] ?? ""),
        budget: result.budgetReservation === "ExceptionReview" ? "ExceptionReview" : "Required",
        method: String(result.sourcingMethodCode ?? ""),
        quotes: result.minimumQuoteCount == null ? "" : String(result.minimumQuoteCount),
        stages: stages.map((stage) => ({ code: stage.code as string, assignee: stage.assignee as string, mode: stage.mode as "One" | "All" })),
      } satisfies RuleRow;
    });
  } catch { return null; }
}



const canonicalId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const policyCode = /^[A-Z0-9_]{1,100}$/;
const keysExactly = (row: Record<string, unknown>, keys: string[]) => Object.keys(row).sort().join("|") === [...keys].sort().join("|");
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const boundedInteger = (value: string, max: number) => {
  if (!/^\d+$/.test(value) || Number(value) > max) throw new Error(`Choose a whole number from 0 to ${max}.`);
  return Number(value);
};

function toSourcingJson(currency: string, rows: RuleRow[]): string {
  if (!/^[A-Z]{3}$/.test(currency) || !rows.length || rows.length > 100) throw new Error("Choose a company currency and one to 100 rules.");
  if (new Set(rows.flatMap(row => row.stages.flatMap(stage => stage.principalIds ?? []))).size > 100) throw new Error("Use at most 100 distinct named reviewers in a policy version.");
  const rules = rows.map(row => {
    const controls = row.sourcing;
    if (!controls || controls.companyWide !== true || controls.pack == null || controls.criteria == null || controls.deadline == null)
      throw new Error("Choose every sourcing control and the company-wide branch scope explicitly.");
    if (!policyCode.test(row.code) || !Number.isInteger(row.priority) || row.priority < 0 || row.priority > 100000
      || !row.stages.length || row.stages.length > 20 || new Set(row.stages.map(s => s.code)).size !== row.stages.length)
      throw new Error("Check the rule code, priority and ordered review steps.");
    const stages = row.stages.map(stage => {
      const ids = stage.principalIds ?? [];
      if (stage.assignee !== "ProcurementManager" || !["One", "All"].includes(stage.mode) || !policyCode.test(stage.code)
        || !ids.length || ids.length > 100 || ids.some(id => !canonicalId.test(id)) || new Set(ids).size !== ids.length)
        throw new Error("Choose named reviewers and an explicit One or All decision rule for each step.");
      return { code: stage.code, assignee: stage.assignee, mode: stage.mode, principalIds: ids };
    });
    const categoryCodes = codes(row.categoryCodes);
    if (categoryCodes.some(code => !policyCode.test(code))) throw new Error("Use valid category codes.");
    const conditions = JSON.stringify({ categoryCodes, purchaseTypes: row.purchaseType ? [row.purchaseType] : [], branchIds: [] });
    const result = JSON.stringify({ publication: { minimumQuoteCount: boundedInteger(controls.quotes, 20),
      minimumInvitedSuppliers: boundedInteger(controls.invited, 100), requirementsPackRequired: controls.pack,
      evaluationCriteriaRequired: controls.criteria, closingDateRequired: controls.deadline }, approvalStages: stages });
    return `${JSON.stringify({ code: row.code, priority: row.priority }).slice(0,-1)},"when":{"minimumAmountInclusive":${row.minimum ? exactPolicyAmount(row.minimum) : "null"},"maximumAmountExclusive":${row.maximum ? exactPolicyAmount(row.maximum) : "null"},${conditions.slice(1)},"result":${result}}`;
  });
  if (new Set(rows.map(row => row.code)).size !== rows.length) throw new Error("Use a different code for each rule.");
  const header = JSON.stringify({ schemaVersion: 1, policyKey: "SOURCING", transactionType: "SourcingPublication",
    action: "SourcingEvent.Publish", permission: "procurement-sourcing-publish", currencyCode: currency, amountBasis: "ApprovedLineBase" });
  const json = `${header.slice(0,-1)},"rules":[${rules.join(",")}]}`;
  if (new TextEncoder().encode(json).byteLength > 65536) throw new Error("Keep the policy definition within 64 KB.");
  return json;
}

function fromSourcingJson(json: string, currency: string): RuleRow[] | null {
  try {
    if (new TextEncoder().encode(json).byteLength > 65536) return null;
    // Reuse the existing bounded lexer for duplicate-property rejection, then the existing exact threshold decoder.
    parseFinancialJson(json, new Map());
    const doc = parseExactThresholds(json);
    if (!keysExactly(doc, ["schemaVersion","policyKey","transactionType","action","permission","currencyCode","amountBasis","rules"])
      || doc.schemaVersion !== 1 || doc.policyKey !== "SOURCING" || doc.transactionType !== "SourcingPublication"
      || doc.action !== "SourcingEvent.Publish" || doc.permission !== "procurement-sourcing-publish"
      || doc.amountBasis !== "ApprovedLineBase" || doc.currencyCode !== currency || !Array.isArray(doc.rules)) return null;
    const result = doc.rules.map((value): RuleRow => {
      if (!record(value) || !keysExactly(value,["code","priority","when","result"]) || !record(value.when) || !record(value.result)) throw new Error("Unknown rule");
      const when = value.when, output = value.result;
      if (!keysExactly(when,["minimumAmountInclusive","maximumAmountExclusive","categoryCodes","purchaseTypes","branchIds"])
        || !keysExactly(output,["publication","approvalStages"]) || !record(output.publication)
        || !Array.isArray(output.approvalStages) || !Array.isArray(when.branchIds) || when.branchIds.length
        || !Array.isArray(when.categoryCodes) || when.categoryCodes.some(c => typeof c !== "string" || !policyCode.test(c))
        || !Array.isArray(when.purchaseTypes) || when.purchaseTypes.length > 1
        || when.purchaseTypes.some(p => !["GOODS","SERVICES","ASSETS","SUBSCRIPTIONS"].includes(String(p)))) throw new Error("Unsupported conditions");
      const controls = output.publication;
      if (!keysExactly(controls,["minimumQuoteCount","minimumInvitedSuppliers","requirementsPackRequired","evaluationCriteriaRequired","closingDateRequired"])
        || typeof controls.minimumQuoteCount !== "number" || !Number.isInteger(controls.minimumQuoteCount)
        || typeof controls.minimumInvitedSuppliers !== "number" || !Number.isInteger(controls.minimumInvitedSuppliers)
        || typeof controls.requirementsPackRequired !== "boolean" || typeof controls.evaluationCriteriaRequired !== "boolean"
        || typeof controls.closingDateRequired !== "boolean" || typeof value.code !== "string" || typeof value.priority !== "number") throw new Error("Unknown controls");
      const stages = output.approvalStages.map(stage => {
        if (!record(stage) || !keysExactly(stage,["code","assignee","mode","principalIds"]) || typeof stage.code !== "string"
          || stage.assignee !== "ProcurementManager" || !["One","All"].includes(String(stage.mode))
          || !Array.isArray(stage.principalIds) || stage.principalIds.some(id => typeof id !== "string")) throw new Error("Unknown reviewers");
        return { code: stage.code, assignee: stage.assignee, mode: stage.mode as "One"|"All", principalIds: stage.principalIds as string[] };
      });
      return { ...emptyRule("SOURCING"), code: value.code, priority: value.priority,
        minimum: when.minimumAmountInclusive == null ? "" : String(when.minimumAmountInclusive),
        maximum: when.maximumAmountExclusive == null ? "" : String(when.maximumAmountExclusive),
        categoryCodes: when.categoryCodes.join(", "), purchaseType: String(when.purchaseTypes[0] ?? ""), stages,
        sourcing: { quotes: String(controls.minimumQuoteCount), invited: String(controls.minimumInvitedSuppliers),
          pack: controls.requirementsPackRequired, criteria: controls.evaluationCriteriaRequired, deadline: controls.closingDateRequired, companyWide: true } };
    });
    toSourcingJson(currency, result); // Reject out-of-bounds/unknown semantics rather than rewriting them on Save.
    return result;
  } catch { return null; }
}


/** Sample transport is legacy numeric JSON: reject values that would change through Number, never round saved rules. */
export function exactPolicySample(raw: string, sourcing: boolean): number {
  const normalize = (value: string) => sourcing ? boundedNonnegativeDecimal(value, 38, 8) : exactPolicyAmount(value);
  try {
    const exact = normalize(raw), numeric = Number(exact);
    if (normalize(JSON.stringify(numeric)) !== exact) throw new Error("Rounded sample");
    return numeric;
  } catch { throw new Error("This sample amount cannot be sent without changing its value. Your saved rules remain unchanged."); }
}
