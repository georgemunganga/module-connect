export const roundScheduleFields = ["opensAt", "closesAt", "technicalReleaseAt", "commercialReleaseAt"] as const;
export type RoundScheduleField = typeof roundScheduleFields[number];
export type RoundScheduleEdits = Partial<Record<RoundScheduleField, string>>;
/** Display only: the original exact instant remains the command value until explicitly edited. */
export function roundInstantToLocal(value: string | null): string {
  if (value === null) return "";
  const date = new Date(value); if (!Number.isFinite(date.getTime())) throw new Error("The saved date and time is unavailable.");
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 23);
}
export function roundLocalToUtc(value: string): string | null {
  if (value === "") return null;
  const parts = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!parts) throw new Error("Choose a valid local date and time.");
  const date = new Date(value), numbers = parts.slice(1, 7).map(part => Number(part ?? "0"));
  if (!Number.isFinite(date.getTime()) || date.getFullYear() !== numbers[0] || date.getMonth() + 1 !== numbers[1]
    || date.getDate() !== numbers[2] || date.getHours() !== numbers[3] || date.getMinutes() !== numbers[4] || date.getSeconds() !== numbers[5])
    throw new Error("Choose a valid local date and time.");
  return date.toISOString();
}
type Schedule = Record<RoundScheduleField, string | null>;
export function roundScheduleForCommand<T extends Schedule>(original: T, edits: RoundScheduleEdits = {}): Omit<T, RoundScheduleField> & Schedule {
  if (Object.keys(edits).some(key => !(roundScheduleFields as readonly string[]).includes(key))) throw new Error("The proposed schedule is invalid.");
  const schedule: Schedule = { opensAt: original.opensAt, closesAt: original.closesAt, technicalReleaseAt: original.technicalReleaseAt, commercialReleaseAt: original.commercialReleaseAt };
  for (const field of roundScheduleFields) if (edits[field] !== undefined) schedule[field] = roundLocalToUtc(edits[field]!);
  return { ...original, ...schedule };
}
export function roundBrowserTimeZone(): string { return Intl.DateTimeFormat().resolvedOptions().timeZone || "your browser's local time"; }
/** UTC ISO values are already validated; compare retained microseconds without millisecond rounding. */
export function compareRoundInstants(left: string, right: string): number {
  const key = (value: string) => value.slice(0, 19) + "." + (/\.(\d{1,6})(?:Z|\+00:00)$/.exec(value)?.[1] ?? "").padEnd(6, "0");
  const a = key(left), b = key(right); return a === b ? 0 : a < b ? -1 : 1;
}
