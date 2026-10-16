export const settingsPanelProps = (id: string, tabs: readonly string[], selected: string) => ({
  id: `${id}-panel`,
  role: "tabpanel" as const,
  "aria-labelledby": `${id}-tab-${tabs.indexOf(selected)}`,
  tabIndex: 0,
});
