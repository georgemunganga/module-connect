import { procurementScopeHeaders } from "../../shared/shell-scope";
import { ContractApiError } from "./procurement-contracts-api";

export type ContractRate = {
  id: string; lineNumber: number; catalogItemId: string | null; description: string;
  unitCode: string; unitPriceExact: string; maximumQuantityExact: string | null;
  status: string; statusReason: string | null; version: number;
};
export type ContractRateDraft = {
  catalogItemId: string | null; description: string; unitCode: string;
  unitPriceExact: string; maximumQuantityExact: string | null;
};
export type ContractRates = {
  contractId: string; contractVersion: number; draftVersionId: string; items: ContractRate[];
};
export type ContractRateResult = { contractId: string; contractVersion: number; rate: ContractRate };

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const exact18x4 = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/;
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

/** Textual decimal fields remain strings through JSON transport and the server's exact parser. */
export function validContractRateDraft(input: ContractRateDraft): string | null {
  if (input.catalogItemId !== null && !guid.test(input.catalogItemId))
    return "Choose a valid catalog item or leave it blank.";
  if (!input.description.trim() || input.description.trim().length > 1000)
    return "Enter a rate description of up to 1,000 characters.";
  if (!input.unitCode.trim() || input.unitCode.trim().length > 40)
    return "Enter a unit of up to 40 characters.";
  if (!exact18x4.test(input.unitPriceExact))
    return "Enter a non-negative unit price with up to four decimal places.";
  if (input.maximumQuantityExact !== null && (!exact18x4.test(input.maximumQuantityExact)
    || !/[1-9]/.test(input.maximumQuantityExact)))
    return "Enter a positive maximum quantity with up to four decimal places.";
  return null;
}

function path(contractId: string, rateId?: string): string {
  if (!guid.test(contractId) || rateId && !guid.test(rateId))
    throw new ContractApiError(0, "The rate reference is invalid.");
  return "/" + contractId + "/rates" + (rateId ? "/" + rateId : "");
}

async function call(companyId: string, route: string, init: RequestInit = {}): Promise<unknown> {
  if (!guid.test(companyId)) throw new ContractApiError(0, "Choose an ERP company before opening contracts.");
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    Object.entries(procurementScopeHeaders(companyId)).forEach(([key, value]) => headers.set(key, value));
    if (init.body) headers.set("Content-Type", "application/json");
    response = await fetch("/api/procurement/v1/contracts" + route,
      { ...init, credentials: "include", cache: "no-store", headers });
  } catch { throw new ContractApiError(0, "The rate result was not confirmed. Review the contract before trying again."); }
  if (!response.ok) {
    let message = "";
    try {
      const body: unknown = await response.json();
      if (object(body) && typeof body.message === "string") message = body.message;
    } catch { /* Status remains authoritative. */ }
    throw new ContractApiError(response.status, response.status === 409
      ? message || "The contract changed. Review current rates before saving."
      : response.status === 403 ? "You cannot edit contract rates for this company."
        : message || "The rate action failed.");
  }
  try { return await response.json() as unknown; }
  catch { throw new ContractApiError(0, "The ERP returned an invalid rate response. Review the contract before trying again."); }
}

function rate(value: unknown): value is ContractRate {
  return object(value) && guid.test(String(value.id))
    && Number.isSafeInteger(value.lineNumber) && Number(value.lineNumber) > 0
    && (value.catalogItemId === null || guid.test(String(value.catalogItemId)))
    && typeof value.description === "string" && typeof value.unitCode === "string"
    && typeof value.unitPriceExact === "string" && exact18x4.test(value.unitPriceExact)
    && (value.maximumQuantityExact === null || typeof value.maximumQuantityExact === "string"
      && exact18x4.test(value.maximumQuantityExact))
    && typeof value.status === "string"
    && (value.statusReason === null || typeof value.statusReason === "string")
    && Number.isSafeInteger(value.version) && Number(value.version) > 0;
}
function result(value: unknown): value is ContractRateResult {
  return object(value) && guid.test(String(value.contractId))
    && Number.isSafeInteger(value.contractVersion) && Number(value.contractVersion) > 0
    && rate(value.rate);
}
function checked(input: ContractRateDraft) {
  const issue = validContractRateDraft(input);
  if (issue) throw new ContractApiError(422, issue);
  return { catalogItemId: input.catalogItemId, description: input.description.trim(),
    unitCode: input.unitCode.trim(), unitPrice: input.unitPriceExact,
    maximumQuantity: input.maximumQuantityExact };
}
function verified(value: unknown, contractId: string, expectedVersion?: number,
  rateId?: string, expectedRateVersion?: number): ContractRateResult {
  if (!result(value) || value.contractId !== contractId
    || expectedVersion !== undefined && value.contractVersion !== expectedVersion
    || rateId !== undefined && value.rate.id !== rateId
    || expectedRateVersion !== undefined && value.rate.version !== expectedRateVersion)
    throw new ContractApiError(0, "The ERP did not confirm the rate change. Review the contract before trying again.");
  return value;
}
export async function listOwnContractRates(companyId: string, contractId: string,
  signal?: AbortSignal): Promise<ContractRates> {
  const value = await call(companyId, path(contractId), { signal });
  if (!object(value) || value.contractId !== contractId || !guid.test(String(value.draftVersionId))
    || !Number.isSafeInteger(value.contractVersion) || Number(value.contractVersion) < 1
    || !Array.isArray(value.items) || !value.items.every(rate))
    throw new ContractApiError(0, "The ERP returned invalid contract rates.");
  return value as ContractRates;
}
export async function getOwnContractRate(companyId: string, contractId: string, rateId: string,
  signal?: AbortSignal): Promise<ContractRateResult> {
  return verified(await call(companyId, path(contractId, rateId), { signal }), contractId, undefined, rateId);
}
export async function addOwnContractRate(companyId: string, contractId: string,
  contractVersion: number, input: ContractRateDraft): Promise<ContractRateResult> {
  return verified(await call(companyId, path(contractId), { method: "POST",
    body: JSON.stringify({ contractVersion, rate: checked(input) }) }), contractId, contractVersion + 1);
}
export async function updateOwnContractRate(companyId: string, contractId: string, rateId: string,
  contractVersion: number, rateVersion: number, input: ContractRateDraft): Promise<ContractRateResult> {
  return verified(await call(companyId, path(contractId, rateId), { method: "PUT",
    body: JSON.stringify({ contractVersion, rateVersion, rate: checked(input) }) }),
  contractId, contractVersion + 1, rateId, rateVersion + 1);
}
export async function removeOwnContractRate(companyId: string, contractId: string, rateId: string,
  contractVersion: number, rateVersion: number, reason: string): Promise<ContractRateResult> {
  if (!reason.trim() || reason.trim().length > 1000)
    throw new ContractApiError(422, "Enter a removal reason of up to 1,000 characters.");
  const normalizedReason = reason.trim();
  const result = verified(await call(companyId, path(contractId, rateId) + "/remove", { method: "POST",
    body: JSON.stringify({ contractVersion, rateVersion, reason: normalizedReason }) }),
  contractId, contractVersion + 1, rateId, rateVersion + 1);
  if (result.rate.status !== "Removed" || result.rate.statusReason !== normalizedReason)
    throw new ContractApiError(0, "The ERP did not confirm the rate change. Review the contract before trying again.");
  return result;
}
