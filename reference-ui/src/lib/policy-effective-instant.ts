/** Date input is UTC calendar day; saved policy instants may have non-midnight time. */
export function utcPolicyDay(instant: string | null): string {
  if (!instant) return "";
  const timestamp = Date.parse(instant);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : "";
}

export function selectedPolicyInstant(selectedDay: string, original: string | null): string | null {
  if (!selectedDay) return null;
  const midnight = new Date(`${selectedDay}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDay) || !Number.isFinite(midnight.getTime())
    || midnight.toISOString().slice(0, 10) !== selectedDay)
    throw new Error("Choose a valid UTC effective date.");
  return original && utcPolicyDay(original) === selectedDay ? original : midnight.toISOString();
}

export function samePolicyInstant(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return left === right;
  const a = Date.parse(left), b = Date.parse(right);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}
