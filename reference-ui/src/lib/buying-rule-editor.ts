import { isBuyingRulePolicy } from "../features/policy-key-dispatch";
import { newCoreStep, parseCoreSteps, parseRequesterRoles, parseDepartmentIds, serializeCoreSteps, type CoreApprovalStep } from "./core-request-routing";
import { invoiceDecimal } from "../../../shared/procurement-decimal";
import { readExactDecimalJson } from "../../../shared/procurement-plan-json";

export type RuleRow = {
  code: string; priority: number; minimum: string; maximum: string;
  categoryCodes: string; purchaseType: string; budget: "Required" | "ExceptionReview";
  method: string; quotes: string; lineManager: boolean; budgetOwner: boolean;
  procurementManager: boolean; departmentIds: string[]; branchIds: string[]; requesterRoles: string[]; coreSteps: CoreApprovalStep[];
};
export const emptyRule = (): RuleRow => ({ code: "DEFAULT", priority: 0, minimum: "", maximum: "",
  categoryCodes: "", purchaseType: "", budget: "Required", method: "", quotes: "",
  lineManager: true, budgetOwner: false, procurementManager: false, departmentIds: [], branchIds: [], requesterRoles: [], coreSteps: [newCoreStep()] });
const codes = (value: string) => value.split(",").map((part) => part.trim().toUpperCase()).filter(Boolean);
const onlyKeys = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).every((name) => allowed.includes(name));

export function toRuleJson(key: string, currency: string, rows: RuleRow[], schema: 1 | 2 = 1): string {
  if (!isBuyingRulePolicy(key)) throw new Error("This policy needs its own settings editor.");
  if (schema === 2 && key !== "PURCHASE_REQUEST") throw new Error("Core approval steps apply to purchase requests only.");
  if (schema === 2 && rows.some(row => !parseCoreSteps(serializeCoreSteps(row.coreSteps)) || !parseRequesterRoles(row.requesterRoles) || !parseDepartmentIds(row.departmentIds) || !parseDepartmentIds(row.branchIds)))
    throw new Error("Choose a Core approver or role for each step, and check the step names.");
  return JSON.stringify({ schemaVersion: schema,
    transactionType: key === "PURCHASE_ORDER" ? "PurchaseOrder" : "PurchaseRequest",
    currencyCode: currency, amountBasis: key === "PURCHASE_ORDER" ? "ApprovedLineBase" : "EstimatedLineBase",
    rules: rows.map((row) => ({ code: row.code.trim().toUpperCase(), priority: Number(row.priority),
      when: { minimumAmountInclusive: row.minimum ? invoiceDecimal(row.minimum) : null,
        maximumAmountExclusive: row.maximum ? invoiceDecimal(row.maximum) : null,
        categoryCodes: codes(row.categoryCodes), purchaseTypes: row.purchaseType ? [row.purchaseType] : [],
        branchIds: schema === 2 ? row.branchIds : [], ...(schema === 2 ? { requesterRoleKeys: row.requesterRoles, departmentIds: row.departmentIds } : {}) },
      result: { budgetReservation: row.budget,
        sourcingMethodCode: row.method.trim().toUpperCase() || null,
        minimumQuoteCount: row.quotes === "" ? null : Number(row.quotes),
        approvalStages: schema === 2 ? serializeCoreSteps(row.coreSteps) : [
          ...(row.lineManager ? [{ code: "NEED", assignee: "LineManager", mode: "One" }] : []),
          ...(row.budgetOwner ? [{ code: "FUNDING", assignee: "BudgetOwner", mode: "One" }] : []),
          ...(row.procurementManager ? [{ code: "BUYING", assignee: "ProcurementManager", mode: "One" }] : []),
        ] },
    })) }, null, 2).replace(/("(?:minimumAmountInclusive|maximumAmountExclusive)"\s*:\s*)"([0-9.]+)"/g,
      (_, prefix: string, amount: string) => prefix + invoiceDecimal(amount));
}

export function fromRuleJson(json: string, key: string, currency: string): RuleRow[] | null {
  if (!isBuyingRulePolicy(key)) return null;
  try {
    const document = readExactDecimalJson(json, ["minimumAmountInclusive", "maximumAmountExclusive"]) as Record<string, unknown>;
    if ((document.schemaVersion !== 1 && !(document.schemaVersion === 2 && key === "PURCHASE_REQUEST")) || !Array.isArray(document.rules)
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
        || !onlyKeys(when, ["minimumAmountInclusive", "maximumAmountExclusive", "categoryCodes", "purchaseTypes", "branchIds", ...(document.schemaVersion === 2 ? ["requesterRoleKeys", "departmentIds"] : [])])
        || !onlyKeys(result, ["budgetReservation", "sourcingMethodCode", "minimumQuoteCount", "approvalStages"])
        || !Array.isArray(when.categoryCodes) || !Array.isArray(when.purchaseTypes)
        || !Array.isArray(when.branchIds) || document.schemaVersion === 1 && when.branchIds.length
        || when.purchaseTypes.length > 1
        || (when.purchaseTypes.length === 1 && !["GOODS", "SERVICES", "ASSETS", "SUBSCRIPTIONS"].includes(String(when.purchaseTypes[0])))
        || !["Required", "ExceptionReview"].includes(String(result.budgetReservation)))
        throw new Error("This draft uses more detailed conditions.");
      const stages = result.approvalStages as Array<Record<string, unknown>>;
      const coreSteps = document.schemaVersion === 2 ? parseCoreSteps(stages) : [];
      const requesterRoles = document.schemaVersion === 2 ? parseRequesterRoles(when.requesterRoleKeys) : [];
      const branchIds = document.schemaVersion === 2 ? parseDepartmentIds(when.branchIds) : [];
      const departmentIds = document.schemaVersion === 2 ? parseDepartmentIds(Object.hasOwn(when, "departmentIds") ? when.departmentIds : []) : [];
      if (!coreSteps || !requesterRoles || !departmentIds || !branchIds) throw new Error("This draft has unsupported Core routing fields.");
      if (document.schemaVersion === 1 && stages.some((stage) => !onlyKeys(stage, ["code", "assignee", "mode"])
        || stage.mode !== "One" || ![
          ["NEED", "LineManager"], ["FUNDING", "BudgetOwner"], ["BUYING", "ProcurementManager"],
        ].some(([code, assignee]) => stage.code === code && stage.assignee === assignee)))
        throw new Error("This draft uses a different approval assignment.");
      return { code: String(rule.code ?? ""), priority: Number(rule.priority ?? 0),
        minimum: when.minimumAmountInclusive == null ? "" : String(when.minimumAmountInclusive),
        maximum: when.maximumAmountExclusive == null ? "" : String(when.maximumAmountExclusive),
        categoryCodes: when.categoryCodes.join(", "), purchaseType: String(when.purchaseTypes[0] ?? ""),
        budget: result.budgetReservation === "ExceptionReview" ? "ExceptionReview" : "Required",
        method: String(result.sourcingMethodCode ?? ""),
        quotes: result.minimumQuoteCount == null ? "" : String(result.minimumQuoteCount),
        requesterRoles, coreSteps, departmentIds, branchIds,
        lineManager: stages.some((stage) => stage.assignee === "LineManager"),
        budgetOwner: stages.some((stage) => stage.assignee === "BudgetOwner"),
        procurementManager: stages.some((stage) => stage.assignee === "ProcurementManager"),
      } satisfies RuleRow;
    });
  } catch { return null; }
}

