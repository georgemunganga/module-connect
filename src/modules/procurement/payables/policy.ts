import type { PolicyVersion } from "./config-store";

export const CONFIG_SECTIONS = [
  "Purchasing preferences",
  "Methods & categories",
  "Thresholds & approvals",
  "Budget & tolerances",
  "Numbering",
  "Calendars & SLAs",
  "Supplier rules",
  "Document templates",
  "Portal preferences",
  "Validation",
  "Notifications",
  "Integrations & status",
] as const;
export type ConfigSection = (typeof CONFIG_SECTIONS)[number];
export const AVAILABLE_METHODS = ["Direct", "RFQ", "Contract", "Emergency"] as const;

export function newPolicyVersion(published: PolicyVersion): PolicyVersion {
  return {
    ...published,
    version: published.version + 1,
    status: "Draft",
    effective: new Date().toISOString().slice(0, 10),
    reason: "",
    author: "Mara Okafor · Procurement admin",
    reviewer: undefined,
    financeReference: undefined,
    methods: published.methods ?? [...AVAILABLE_METHODS],
    quoteCount: published.quoteCount ?? 3,
    numberPrefix: published.numberPrefix ?? "PO-",
    slaHours: published.slaHours ?? 48,
    supplierMustBeActive: published.supplierMustBeActive ?? true,
    portalEnabled: published.portalEnabled ?? true,
    requires3Way: published.requires3Way ?? true,
    approvalStrategy: published.approvalStrategy ?? "Hierarchical",
  };
}

export function validatePolicyVersion(
  draft: PolicyVersion,
  published: PolicyVersion,
  selectedEntity: string,
): string[] {
  const errors: string[] = [];
  if (draft.entityId !== selectedEntity || draft.entityId !== published.entityId)
    errors.push("Entity scope does not match the active policy or selected entity.");
  if (draft.category !== published.category)
    errors.push(
      "A narrower category needs an approved precedence model; this demo package covers All categories only.",
    );
  if (draft.currency !== published.currency)
    errors.push("Currency is owned by ERP Core and cannot be changed in this rule package.");
  if (!draft.effective || draft.effective <= published.effective)
    errors.push("Effective date collides with or precedes the published version.");
  if (!draft.reason.trim()) errors.push("Change reason is required.");
  if (!Number.isFinite(draft.threshold) || draft.threshold <= 0)
    errors.push("Competitive sourcing threshold must be positive.");
  if (!Number.isFinite(draft.tolerance) || draft.tolerance < 0 || draft.tolerance > 100)
    errors.push("Price tolerance must be between 0 and 100 percent.");
  if (
    !Number.isInteger(draft.quoteCount) ||
    (draft.quoteCount ?? 0) < 1 ||
    (draft.quoteCount ?? 0) > 10
  )
    errors.push("Required quote count must be from 1 to 10.");
  if (!draft.methods?.length) errors.push("At least one procurement method is required.");
  if (draft.threshold > 0 && !draft.methods.includes("RFQ"))
    errors.push("The competitive sourcing threshold needs an enabled RFQ method.");
  if (!/^[A-Z]{2,8}-$/.test(draft.numberPrefix ?? ""))
    errors.push("Number prefix must be 2–8 uppercase letters followed by a hyphen.");
  if (!Number.isInteger(draft.slaHours) || (draft.slaHours ?? 0) < 1 || (draft.slaHours ?? 0) > 720)
    errors.push("Approval SLA must be from 1 to 720 hours.");
  if (!draft.approvalStrategy) errors.push("An approval strategy is required.");
  return errors;
}

export function simulatePolicy(
  policy: PolicyVersion,
  input: { entityId: string; amount: number; category: string; risk: string; route: string },
): string[] {
  if (input.entityId !== policy.entityId || policy.status !== "Published")
    return ["Blocked: no published policy covers this entity."];
  if (!Number.isFinite(input.amount) || input.amount <= 0) return ["Enter a positive amount."];
  const outcome: string[] = [];
  if (!policy.methods?.includes(input.route))
    outcome.push(`Blocked: ${input.route} is not an enabled procurement method.`);
  if (input.risk === "Suspended" && policy.supplierMustBeActive)
    outcome.push("Blocked: supplier must be active and approved.");
  if (input.amount >= policy.threshold && input.route === "Direct")
    outcome.push(
      `Blocked: direct purchase at or above ${policy.currency} ${policy.threshold.toLocaleString()} needs competitive sourcing and ${policy.quoteCount ?? 3} quotations.`,
    );
  if (input.risk === "High") outcome.push("Enhanced supplier risk review required.");
  if (!outcome.length)
    outcome.push(
      `${policy.approvalStrategy ?? "Hierarchical"} manager approval expected for ${input.category}; Finance budget decision remains separate.`,
    );
  return outcome;
}
