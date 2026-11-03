/** One predicate for rendering and read admission; keep existing RFQ defaults unchanged. */
export function quotationRouteSelected(source: string | null, permissions: readonly string[]): boolean {
  const hasAdHocAccess = permissions.some(permission => ["procurement-sourcing-read", "procurement-sourcing-create", "procurement-sourcing-edit"].includes(permission));
  return source === "quotations" || source === null && !hasAdHocAccess && permissions.includes("procurement-quotation-read")
    && !permissions.includes("procurement-sourcing-convert") && !permissions.includes("procurement-sourcing-submit");
}
