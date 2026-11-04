import { invoiceDecimal } from "./procurement-decimal";

/** Preserve original decimal wire tokens before JSON.parse can round them. */
export function readPlanJson(text: string): unknown {
  return readExactDecimalJson(text, ["estimatedQuantity", "estimatedAmount"]);
}

export function readExactDecimalJson(text: string, fields: readonly string[]): unknown {
  if (text.length > 2_000_000) throw new Error("Plan response is too large.");
  let output = "", at = 0;
  while (at < text.length) {
    if (text[at] !== '"') { output += text[at++]; continue; }
    const start = at++;
    while (at < text.length) {
      if (text[at] === "\\") { at += 2; continue; }
      if (text[at++] === '"') break;
    }
    const token = text.slice(start, at); output += token;
    const key: unknown = JSON.parse(token);
    if (typeof key !== "string" || !fields.includes(key)) continue;
    const tail = /^(\s*:\s*)(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(at));
    if (tail) { output += tail[1] + JSON.stringify(invoiceDecimal(tail[2])); at += tail[0].length; }
  }
  return JSON.parse(output);
}
export function planAmount(value: unknown, positive = false): string {
  if (typeof value !== "string") throw new Error("An exact decimal amount is required.");
  return invoiceDecimal(value, positive);
}
export function sumPlanAmounts(values: readonly string[]): string {
  const scaled = values.reduce((sum, value) => {
    const [whole, fraction = ""] = planAmount(value).split(".");
    return sum + BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"));
  }, 0n);
  return `${scaled / 10000n}.${String(scaled % 10000n).padStart(4, "0")}`;
}
