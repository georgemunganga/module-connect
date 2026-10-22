import { invoiceDecimal } from "./procurement-invoice-exact";

const financial = new Map<string, (value: string) => string>(["quantity", "unitPrice", "netAmount", "taxAmount", "grossAmount"].map(key => [key, invoiceDecimal] as const));
/** Proper bounded JSON token traversal. Only known original financial values become strings
 * BEFORE JSON.parse can round numeric lexemes; strings (including escaped money-like text)
 * are never searched/replaced. Metadata numbers keep their ordinary JSON types. */
export function parseInvoiceOriginalJson(text: string): unknown { return parseFinancialJson(text, financial); }
/** Shared lexer configured by each owner contract; no change to invoice's original-key defaults. */
export function parseFinancialJson(text: string, financial: ReadonlyMap<string, (value: string) => string>): unknown {
  const maxBytes = 2 * 1024 * 1024;
  if (text.length > maxBytes || new TextEncoder().encode(text).byteLength > maxBytes) throw new Error("Invoice response is too large.");
  let at = 0, nodes = 0;
  const numeric = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const invalid = () => { throw new Error("Invalid invoice JSON."); };
  const space = () => { while (at < text.length && /[\x20\x09\x0a\x0d]/.test(text[at])) at++; };
  function string(): { raw: string; value: string } {
    const start = at++;
    while (at < text.length) {
      const character = text[at++];
      if (character === "\\") { at++; continue; }
      if (character === '"') {
        const raw = text.slice(start, at), value: unknown = JSON.parse(raw);
        if (typeof value !== "string") return invalid();
        return { raw, value };
      }
    }
    return invalid();
  }
  function value(depth: number, key?: string): string {
    if (depth > 24 || ++nodes > 25_000) return invalid();
    space();
    if (text[at] === '"') {
      const token = string();
      return financial.has(key ?? "") ? JSON.stringify(financial.get(key ?? "")!(token.value)) : token.raw;
    }
    if (text[at] === "{" || text[at] === "[") {
      if (financial.has(key ?? "")) return invalid();
      const object = text[at++] === "{", close = object ? "}" : "]", parts: string[] = [], names = new Set<string>();
      space();
      if (text[at] === close) { at++; return object ? "{}" : "[]"; }
      while (at < text.length) {
        space();
        if (object) {
          if (text[at] !== '"') return invalid();
          const name = string(); if (names.has(name.value)) return invalid(); names.add(name.value);
          space(); if (text[at++] !== ":") return invalid();
          parts.push(name.raw + ":" + value(depth + 1, name.value));
        } else parts.push(value(depth + 1));
        space(); if (text[at] === close) { at++; return (object ? "{" : "[") + parts.join(",") + close; }
        if (text[at++] !== ",") return invalid();
      }
      return invalid();
    }
    numeric.lastIndex = at; const number = numeric.exec(text);
    if (number) {
      at = numeric.lastIndex;
      return financial.has(key ?? "") ? JSON.stringify(financial.get(key ?? "")!(number[0])) : number[0];
    }
    if (financial.has(key ?? "")) return invalid();
    for (const literal of ["true", "false", "null"]) if (text.startsWith(literal, at)) { at += literal.length; return literal; }
    return invalid();
  }
  const exact = value(0); space(); if (at !== text.length) return invalid();
  return JSON.parse(exact);
}
