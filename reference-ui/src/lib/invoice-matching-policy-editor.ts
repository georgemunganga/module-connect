/** The exact, owner-defined INVOICE_MATCHING policy schema. Amounts remain strings. */
export type MatchTolerance = { absolute: string; percent: string; combination: "" | "AllLimits" | "AnyLimit" };
export type MatchRow = { categoryCode: string; method: "" | "TwoWay" | "ThreeWay";
  acceptanceKind: "" | "Goods" | "Service"; quantity: MatchTolerance;
  unitPrice: MatchTolerance; tax: MatchTolerance; total: MatchTolerance };
export type MatchForm = { moneyScale: string; rounding: "" | "ToEven" | "AwayFromZero"; rows: MatchRow[] };
const tolerance = (): MatchTolerance => ({ absolute: "", percent: "", combination: "" });
export const emptyMatchRow = (): MatchRow => ({ categoryCode: "", method: "", acceptanceKind: "",
  quantity: tolerance(), unitPrice: tolerance(), tax: tolerance(), total: tolerance() });
export const emptyMatchForm = (): MatchForm => ({ moneyScale: "", rounding: "", rows: [emptyMatchRow()] });
const own = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exactly = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const code = /^[A-Z0-9_\-]{1,64}$/;
const decimal = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/;
const percent = /^(?:0|[1-9]\d?|100)(?:\.\d{1,4})?$/;
const validTolerance = (value: MatchTolerance): boolean => decimal.test(value.absolute)
  && percent.test(value.percent) && Number(value.percent) <= 100
  && ["AllLimits", "AnyLimit"].includes(value.combination);

export function serializeMatchPolicy(currency: string, form: MatchForm): string {
  if (!/^[A-Z]{3}$/.test(currency) || !/^[0-4]$/.test(form.moneyScale)
    || !["ToEven", "AwayFromZero"].includes(form.rounding)
    || form.rows.length < 1 || form.rows.length > 64)
    throw new Error("Choose currency, rounding, money scale and one to 64 category rules.");
  const seen = new Set<string>();
  const rules = form.rows.map(row => {
    const categoryCode = row.categoryCode.trim().toUpperCase();
    if (!code.test(categoryCode) || seen.has(categoryCode)
      || !["TwoWay", "ThreeWay"].includes(row.method)
      || row.method === "TwoWay" && row.acceptanceKind !== ""
      || row.method === "ThreeWay" && !["Goods", "Service"].includes(row.acceptanceKind)
      || ![row.quantity, row.unitPrice, row.tax, row.total].every(validTolerance))
      throw new Error("Complete each category, match method, acceptance type and exact tolerance. Categories must be unique.");
    seen.add(categoryCode);
    return { categoryCode, method: row.method, acceptanceKind: row.method === "TwoWay" ? null : row.acceptanceKind,
      quantity: row.quantity, unitPrice: row.unitPrice, tax: row.tax, total: row.total };
  });
  return JSON.stringify({ schemaVersion: 1, transactionType: "InvoiceMatching", currencyCode: currency,
    moneyScale: Number(form.moneyScale), rounding: form.rounding, rules });
}

/** Unrepresentable policies stay read-only; editing never silently drops fields. */
export function parseMatchPolicy(json: string, currency: string): MatchForm | null {
  try {
    if (new TextEncoder().encode(json).byteLength > 65536) return null;
    const doc: unknown = JSON.parse(json);
    if (!own(doc) || !exactly(doc, ["schemaVersion", "transactionType", "currencyCode", "moneyScale", "rounding", "rules"])
      || doc.schemaVersion !== 1 || doc.transactionType !== "InvoiceMatching" || doc.currencyCode !== currency
      || !Array.isArray(doc.rules)) return null;
    const rows = doc.rules.map((item: unknown) => {
      if (!own(item) || !exactly(item, ["categoryCode", "method", "acceptanceKind", "quantity", "unitPrice", "tax", "total"]))
        throw new Error("Unrepresentable rule");
      for (const field of ["quantity", "unitPrice", "tax", "total"] as const)
        if (!own(item[field]) || !exactly(item[field] as Record<string, unknown>, ["absolute", "percent", "combination"])
          || typeof (item[field] as Record<string, unknown>).absolute !== "string"
          || typeof (item[field] as Record<string, unknown>).percent !== "string")
          throw new Error("Unrepresentable tolerance");
      return { categoryCode: item.categoryCode, method: item.method,
        acceptanceKind: item.acceptanceKind === null ? "" : item.acceptanceKind,
        quantity: item.quantity, unitPrice: item.unitPrice, tax: item.tax, total: item.total } as MatchRow;
    });
    const form: MatchForm = { moneyScale: String(doc.moneyScale), rounding: doc.rounding as MatchForm["rounding"], rows };
    serializeMatchPolicy(currency, form);
    return form;
  } catch { return null; }
}
