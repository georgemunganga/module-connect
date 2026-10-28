/** Only the assigned collection is admitted in company All; detail and writes need a selected branch. */
export function manualUnitQueueAllRead(pathname: string, readReady: boolean, permissions: readonly string[]): boolean {
  return pathname === "/approvals" && readReady && permissions.includes("procurement-invoice-unit-review");
}
