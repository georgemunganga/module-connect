import { procurementScopeHeaders } from "../../../shared/shell-scope";

const base = "/api/procurement/v1/sourcing";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digest = /^[a-f0-9]{64}$/;
const quantityPattern = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/;
const valuePattern = /^(?:0|[1-9]\d{0,21})(?:\.\d{1,8})?$/;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === "string" && uuid.test(value) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value);
const sha = (value: unknown): value is string => typeof value === "string" && digest.test(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const fail = (): never => { throw new RecommendationError(0, "ERP could not confirm this recommendation draft. Check the saved result before another change."); };
export class RecommendationError extends Error { constructor(readonly status: number, message: string) { super(message); } }

export type RecommendationLine = { offerId: string; sourcingLineId: string; quantityExact: string; proposedValueExact: string; rationale: string };
export type RecommendationCommand = { key: string; roundId: string; draftId: string | null; expectedRevision: number; expectedSnapshotSha256: string | null; body: string };
export type RecommendationAck = { draftId: string; roundId: string; revisionId: string; revision: number; state: "Draft"; snapshotSha256: string;
  awardCreatedByThisCommand: false; purchaseOrderCreatedByThisCommand: false };
export type RecommendationSource = { roundId: string; unsealingId: string; rfqTitle: string;
  sourceLines: { sourceLineId: string; lineLabel: string }[];
  offers: { offerId: string; offerSha256: string; offerLabel: string; supplierLabel: string | null;
    lines: { sourceLineId: string; lineLabel: string; offeredQuantityExact: string; currencyCode: string }[] }[] };
export type OpenedRound = { roundId: string; sourcingEventId: string; branchId: string; openedAt: string; unsealingId: string };
export type OwnRecommendation = { draftId: string; roundId: string; revision: number; revisionId: string; snapshotSha256: string; state: "Draft" };
export type OwnRecommendationPage = { items: OwnRecommendation[]; total: number; offset: number; hasMore: boolean };
export type RecommendationDetail = { draftId: string; roundId: string; currentRevision: number; currentRevisionId: string;
  currentSnapshotSha256: string; lines: RecommendationLine[]; revisions: { id: string; revision: number; recordedAt: string; snapshotSha256: string }[] };

export function recommendationQuantity(value: string): string {
  if (!quantityPattern.test(value) || !/[1-9]/.test(value)) throw new RecommendationError(422, "Enter a positive quantity with up to four decimal places.");
  return value;
}
export function recommendationValue(value: string): string {
  if (!valuePattern.test(value) || !/[1-9]/.test(value)) throw new RecommendationError(422, "Enter a positive proposed value with up to eight decimal places.");
  return value;
}
export function recommendationLines(value: unknown): RecommendationLine[] {
  if (!Array.isArray(value) || value.length > 500) return fail();
  const seen = new Set<string>();
  return value.map((line): RecommendationLine => {
    if (!record(line) || !id(line.offerId) || !id(line.sourcingLineId) || typeof line.quantityExact !== "string"
      || typeof line.proposedValueExact !== "string" || typeof line.rationale !== "string"
      || line.rationale.length < 1 || line.rationale.length > 2000 || line.rationale.trim() !== line.rationale) return fail();
    recommendationQuantity(line.quantityExact); recommendationValue(line.proposedValueExact);
    const pair = `${line.offerId}:${line.sourcingLineId}`;
    if (seen.has(pair)) return fail(); seen.add(pair);
    return { offerId: line.offerId, sourcingLineId: line.sourcingLineId, quantityExact: line.quantityExact,
      proposedValueExact: line.proposedValueExact, rationale: line.rationale };
  });
}
export function recommendationCommand(roundId: string, draftId: string | null, expectedRevision: number,
  expectedSnapshotSha256: string | null, lines: RecommendationLine[], key: string): RecommendationCommand {
  if (!id(roundId) || !id(key) || !integer(expectedRevision) || expectedRevision > 99
    || (draftId === null ? expectedRevision !== 0 || expectedSnapshotSha256 !== null
      : !id(draftId) || expectedRevision < 1 || !sha(expectedSnapshotSha256))) return fail();
  const selected = recommendationLines(lines);
  return { key, roundId, draftId, expectedRevision, expectedSnapshotSha256,
    body: JSON.stringify({ draftId, expectedRevision, expectedSnapshotSha256, lines: selected }) };
}
export function validateRecommendationCommand(value: unknown): RecommendationCommand {
  if (!record(value) || !id(value.key) || !id(value.roundId) || typeof value.body !== "string" || value.body.length > 1048576) return fail();
  let body: unknown; try { body = JSON.parse(value.body); } catch { return fail(); }
  if (!record(body) || Object.keys(body).sort().join() !== "draftId,expectedRevision,expectedSnapshotSha256,lines"
    || body.draftId !== value.draftId || body.expectedRevision !== value.expectedRevision
    || body.expectedSnapshotSha256 !== value.expectedSnapshotSha256 || !Array.isArray(body.lines)) return fail();
  const rebuilt = recommendationCommand(value.roundId, value.draftId as string | null,
    value.expectedRevision as number, value.expectedSnapshotSha256 as string | null,
    recommendationLines(body.lines), value.key);
  if (rebuilt.body !== value.body || Object.keys(value).sort().join() !== "body,draftId,expectedRevision,expectedSnapshotSha256,key,roundId") return fail();
  return rebuilt;
}
export function recommendationAck(value: unknown, command: RecommendationCommand): RecommendationAck {
  if (!record(value) || !id(value.draftId) || value.roundId !== command.roundId || !id(value.revisionId)
    || value.revision !== command.expectedRevision + 1 || value.state !== "Draft" || !sha(value.snapshotSha256)
    || value.awardCreatedByThisCommand !== false || value.purchaseOrderCreatedByThisCommand !== false
    || command.draftId !== null && value.draftId !== command.draftId) return fail();
  return { draftId: value.draftId, roundId: command.roundId, revisionId: value.revisionId,
    revision: value.revision as number, state: "Draft", snapshotSha256: value.snapshotSha256,
    awardCreatedByThisCommand: false, purchaseOrderCreatedByThisCommand: false };
}
async function request(company: string, path: string, init: RequestInit = {}): Promise<unknown> {
  if (!id(company)) return fail();
  const headers = new Headers(init.headers);
  Object.entries(procurementScopeHeaders(company)).forEach(([name, value]) => headers.set(name, value));
  if (!id(headers.get("X-Shell-Location"))) throw new RecommendationError(0, "Choose a permitted branch before opening recommendations.");
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try { response = await fetch(base + path, { ...init, headers, credentials: "include", cache: "no-store" }); }
  catch { throw new RecommendationError(0, "The response was interrupted. Check the original saved result before another change."); }
  if (!response.ok) throw new RecommendationError(response.status, response.status === 403 ? "Current recommendation access is unavailable."
    : response.status === 404 ? "This opened round or saved result is unavailable in your current scope."
      : response.status === 409 ? "The opened offers or draft changed. Refresh and compare before another change."
        : response.status === 422 ? "Check the recommendation lines before saving."
          : "Recommendation drafts are unavailable or the response could not be confirmed.");
  try { return await response.json(); } catch { return fail(); }
}
const path = (roundId: string) => id(roundId) ? `/commercial-rounds/${roundId}` : fail();
export async function openedRecommendationRounds(company: string, offset: number, signal?: AbortSignal): Promise<{ items: OpenedRound[]; hasMore: boolean }> {
  if (!integer(offset) || offset > 100000) return fail();
  const value = await request(company, `/commercial-opened-rounds?offset=${offset}&limit=3`, { signal });
  if (!record(value) || !Array.isArray(value.items) || value.items.length > 3 || !integer(value.total)
    || value.total < offset + value.items.length
    || value.offset !== offset || value.limit !== 3 || value.priceReadRequiresRetainedProof !== true
    || value.evaluationAvailable !== false || value.awardAvailable !== false || value.purchaseOrderAvailable !== false) return fail();
  const items = value.items.map((item): OpenedRound => {
    if (!record(item) || !id(item.roundId) || !id(item.sourcingEventId) || !id(item.branchId)
      || !id(item.unsealingId) || typeof item.openedAt !== "string" || Number.isNaN(Date.parse(item.openedAt))) return fail();
    return item as OpenedRound;
  });
  if (new Set(items.map(item => item.roundId)).size !== items.length) return fail();
  return { items, hasMore: offset + items.length < value.total };
}
export async function recommendationSource(company: string, roundId: string, signal?: AbortSignal): Promise<RecommendationSource> {
  const value = await request(company, path(roundId) + "/recommendation-source", { signal });
  if (!record(value) || value.roundId !== roundId || !id(value.unsealingId) || typeof value.rfqTitle !== "string"
    || !value.rfqTitle.trim() || value.rfqTitle.length > 200 || !Array.isArray(value.sourceLines)
    || !Array.isArray(value.offers) || value.sourceLines.length > 500 || value.offers.length > 500
    || value.canSubmit !== false || value.awardAvailable !== false || value.purchaseOrderAvailable !== false) return fail();
  const lines = value.sourceLines.map((line): RecommendationSource["sourceLines"][number] => {
    if (!record(line) || !id(line.sourceLineId) || typeof line.lineLabel !== "string" || !line.lineLabel.trim()) return fail();
    return line as RecommendationSource["sourceLines"][number];
  });
  const offers = value.offers.map((offer): RecommendationSource["offers"][number] => {
    if (!record(offer) || !id(offer.offerId) || !sha(offer.offerSha256) || typeof offer.offerLabel !== "string"
      || !offer.offerLabel.trim() || !(offer.supplierLabel === null || typeof offer.supplierLabel === "string")
      || !Array.isArray(offer.lines) || offer.lines.length > 500) return fail();
    const rows = offer.lines.map((line): RecommendationSource["offers"][number]["lines"][number] => {
      if (!record(line) || !id(line.sourceLineId) || !lines.some(source => source.sourceLineId === line.sourceLineId && source.lineLabel === line.lineLabel)
        || typeof line.offeredQuantityExact !== "string"
        || typeof line.currencyCode !== "string" || !/^[A-Z]{3}$/.test(line.currencyCode)) return fail();
      recommendationQuantity(line.offeredQuantityExact);
      return line as RecommendationSource["offers"][number]["lines"][number];
    });
    return { offerId: offer.offerId, offerSha256: offer.offerSha256, offerLabel: offer.offerLabel,
      supplierLabel: offer.supplierLabel, lines: rows };
  });
  if (new Set(lines.map(line => line.sourceLineId)).size !== lines.length
    || new Set(offers.map(offer => offer.offerId)).size !== offers.length
    || new Set(offers.flatMap(offer => offer.lines.map(line => `${offer.offerId}:${line.sourceLineId}`))).size
      !== offers.reduce((count, offer) => count + offer.lines.length, 0)) return fail();
  return { roundId, unsealingId: value.unsealingId, rfqTitle: value.rfqTitle, sourceLines: lines, offers };
}
export async function ownRecommendations(company: string, roundId: string, offset = 0, signal?: AbortSignal): Promise<OwnRecommendationPage> {
  if (!integer(offset) || offset > 100000) return fail();
  const value = await request(company, path(roundId) + `/recommendation-drafts/own?offset=${offset}&limit=25`, { signal });
  if (!record(value) || !Array.isArray(value.items) || value.items.length > 25 || !integer(value.total)
    || value.total < offset + value.items.length || value.offset !== offset || value.limit !== 25) return fail();
  const items = value.items.map((item): OwnRecommendation => {
    if (!record(item) || !id(item.draftId) || item.roundId !== roundId || !integer(item.revision) || item.revision < 1
      || !id(item.revisionId) || !sha(item.snapshotSha256) || item.state !== "Draft"
      || item.canSubmit !== false || item.awardCreatedByThisCommand !== false || item.purchaseOrderCreatedByThisCommand !== false) return fail();
    return item as OwnRecommendation;
  });
  if (new Set(items.map(item => item.draftId)).size !== items.length) return fail();
  return { items, total: value.total, offset, hasMore: offset + items.length < value.total };
}
export async function recommendationDetail(company: string, roundId: string, draftId: string, signal?: AbortSignal): Promise<RecommendationDetail> {
  if (!id(draftId)) return fail();
  const value = await request(company, path(roundId) + `/recommendation-drafts/${draftId}`, { signal });
  if (!record(value) || value.draftId !== draftId || value.roundId !== roundId || value.state !== "Draft"
    || !integer(value.currentRevision) || value.currentRevision < 1 || !id(value.currentRevisionId)
    || !sha(value.currentSnapshotSha256) || !Array.isArray(value.lines) || !Array.isArray(value.revisions)
    || value.assessmentCoverageComplete !== null || value.canSubmit !== false
    || value.awardCreatedByThisCommand !== false || value.purchaseOrderCreatedByThisCommand !== false) return fail();
  const lines = recommendationLines(value.lines);
  const revisions = value.revisions.map((item): RecommendationDetail["revisions"][number] => {
    if (!record(item) || !id(item.id) || !integer(item.revision) || item.revision < 1
      || !sha(item.snapshotSha256) || typeof item.recordedAt !== "string" || Number.isNaN(Date.parse(item.recordedAt))) return fail();
    return item as RecommendationDetail["revisions"][number];
  });
  if (revisions.length !== value.currentRevision || revisions.at(-1)?.id !== value.currentRevisionId
    || revisions.at(-1)?.snapshotSha256 !== value.currentSnapshotSha256) return fail();
  return { draftId, roundId, currentRevision: value.currentRevision, currentRevisionId: value.currentRevisionId,
    currentSnapshotSha256: value.currentSnapshotSha256, lines, revisions };
}
export async function saveRecommendation(company: string, command: RecommendationCommand): Promise<RecommendationAck> {
  const checked = validateRecommendationCommand(command);
  const value = await request(company, path(checked.roundId) + "/recommendation-drafts", {
    method: "POST", headers: { "Idempotency-Key": checked.key }, body: checked.body });
  return recommendationAck(value, checked);
}
export async function recoverRecommendation(company: string, command: RecommendationCommand): Promise<RecommendationAck> {
  const checked = validateRecommendationCommand(command);
  return recommendationAck(await request(company,
    path(checked.roundId) + `/recommendation-commands/${checked.key}`), checked);
}
const canonical = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
};
/** The original command receipt and current retained revision must agree on every proposed line. */
export function recommendationMatchesSavedDetail(command: RecommendationCommand, ack: RecommendationAck, detail: RecommendationDetail): boolean {
  const checked = validateRecommendationCommand(command);
  if (detail.roundId !== command.roundId || detail.draftId !== ack.draftId
    || detail.currentRevision !== ack.revision || detail.currentSnapshotSha256 !== ack.snapshotSha256
    || detail.currentRevisionId !== ack.revisionId) return false;
  const submitted = recommendationLines(JSON.parse(checked.body).lines);
  const ordered = (lines: RecommendationLine[]) => lines.map(line => JSON.stringify([
    line.sourcingLineId, line.offerId, canonical(line.quantityExact), canonical(line.proposedValueExact), line.rationale]))
    .sort();
  return JSON.stringify(ordered(submitted)) === JSON.stringify(ordered(detail.lines));
}
