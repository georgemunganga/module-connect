/** A missing or malformed principal lock signal never authorizes new work. */
export const principalHistoryLock = (value: unknown): boolean => value !== false;

export type PrincipalHistoryState = { locked: boolean; currentMappingSchema: 3 | null };

/** Legacy invoice actions keep their own permissions and readiness checks. */
export const principalNewWorkBlocked = (principalFlow: boolean, lock: boolean | null): boolean =>
  principalFlow && lock !== false;

/** Document review also serves legacy mappings; only source 3 inherits this lock. */
export const documentNewWorkBlocked = (history: PrincipalHistoryState | null, principalEnabled: boolean): boolean =>
  history?.currentMappingSchema === 3 ? history.locked : history === null && principalEnabled;

export const principalHistoryCorrection =
  "This invoice has a recorded comparison that needs correction. Review its saved history or check an original command; new line links and reviews are paused.";
