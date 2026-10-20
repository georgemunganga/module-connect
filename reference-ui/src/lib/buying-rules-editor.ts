export type RuleRow = {
  code: string; priority: number; minimum: string; maximum: string;
  categoryCodes: string; purchaseType: string; budget: "Required" | "ExceptionReview";
  method: string; quotes: string; stages: Array<{ code: string; assignee: string; mode: "One" | "All" }>;
};
export const emptyRule = (): RuleRow => ({ code: "DEFAULT", priority: 0, minimum: "", maximum: "",
  categoryCodes: "", purchaseType: "", budget: "Required", method: "", quotes: "",
  stages: [{ code: "NEED", assignee: "LineManager", mode: "One" }] });
const codes = (value: string) => value.split(",").map((part) => part.trim().toUpperCase()).filter(Boolean);
const onlyKeys = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).every((name) => allowed.includes(name));

export function toRuleJson(key: string, currency: string, rows: RuleRow[]): string {
  const header = JSON.stringify({ schemaVersion: 1,
    transactionType: key === "PURCHASE_ORDER" ? "PurchaseOrder" : "PurchaseRequest",
    currencyCode: currency, amountBasis: key === "PURCHASE_ORDER" ? "ApprovedLineBase" : "EstimatedLineBase" });
  const rules = rows.map((row) => {
    if (row.stages.some((stage) => !["LineManager", "ProcurementManager"].includes(stage.assignee)))
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
  try {
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
        || !["LineManager", "ProcurementManager"].includes(String(stage.assignee))))
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

