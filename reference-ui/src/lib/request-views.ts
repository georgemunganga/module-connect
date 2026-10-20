import type { AppRecord } from "./store";

export type RequestListTab = "pending" | "all";
export type RequestOwnerScope = "mine" | "all";

export const CURRENT_DEMO_REQUESTER = "You";

export function requesterFor(record: Pick<AppRecord, "meta">) {
  return record.meta?.requester?.trim() || CURRENT_DEMO_REQUESTER;
}

export function filterEmployeeRequests(
  records: AppRecord[],
  tab: RequestListTab,
  scope: RequestOwnerScope,
) {
  return records.filter(
    (record) =>
      record.kind === "requests" &&
      (scope === "all" || requesterFor(record) === CURRENT_DEMO_REQUESTER) &&
      (tab === "all" || record.status === "Pending Approval"),
  );
}

export function withDefaultRequestOwner(record: AppRecord): AppRecord {
  if (record.kind !== "requests" || record.meta?.requester?.trim())
    return record;
  return {
    ...record,
    meta: { ...record.meta, requester: CURRENT_DEMO_REQUESTER },
  };
}
