/** Compare nonnegative decimal text exactly, without binary floating point conversion. */
export function compareExactDecimal(a: number | string, b: number | string): number {
  const parts = (value: number | string) => {
    const text = String(value);
    const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(text);
    return match ? { whole: match[1], fraction: match[2] ?? "" } : null;
  };
  const left = parts(a), right = parts(b);
  if (!left || !right) return String(a).localeCompare(String(b));
  if (left.whole.length !== right.whole.length) return left.whole.length - right.whole.length;
  const whole = left.whole.localeCompare(right.whole);
  if (whole) return whole;
  return left.fraction.padEnd(Math.max(left.fraction.length, right.fraction.length), "0")
    .localeCompare(right.fraction.padEnd(Math.max(left.fraction.length, right.fraction.length), "0"));
}
