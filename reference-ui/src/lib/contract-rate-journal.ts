const prefix = "erp.procurement.contract-rate-review.v1:";

/** A tab-local recovery lock. Rate bodies and prices are never stored here. */
export const contractRateJournal = {
  read(storage: Storage, scope: string): boolean {
    try {
      const value = storage.getItem(prefix + scope);
      if (value !== null && value !== "pending") throw new Error("Invalid recovery marker.");
      return value === "pending";
    }
    catch { throw new Error("Rate recovery storage is unavailable. Saving is paused."); }
  },
  claim(storage: Storage, scope: string): void {
    try {
      if (storage.getItem(prefix + scope) !== null)
        throw new Error("Review the earlier rate result before saving again.");
      storage.setItem(prefix + scope, "pending");
      if (storage.getItem(prefix + scope) !== "pending") throw new Error("Storage verification failed.");
    } catch { throw new Error("Rate recovery storage is unavailable or a result needs review. Saving is paused."); }
  },
  clear(storage: Storage, scope: string): void {
    try {
      if (storage.getItem(prefix + scope) !== "pending") throw new Error("Recovery lock changed.");
      storage.removeItem(prefix + scope);
      if (storage.getItem(prefix + scope) !== null) throw new Error("Recovery lock remained.");
    } catch { throw new Error("The rate recovery lock could not be cleared. Saving remains paused."); }
  },
};
