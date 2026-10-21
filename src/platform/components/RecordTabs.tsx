import type { KeyboardEvent, ReactNode } from "react";

/** Shared record-detail tabs, adapted from the Procurement UI reference to ERP tokens. */
export function RecordTabs<T extends string>({ label, idPrefix, tabs, value, onChange }: {
  label: string;
  idPrefix: string;
  tabs: readonly T[];
  value: T;
  onChange: (tab: T) => void;
}) {
  const key = (tab: T) => `${idPrefix}-${tab.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
      : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length
        : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(tabs[next]);
    document.getElementById(`${key(tabs[next])}-tab`)?.focus();
  };
  return <div role="tablist" aria-label={label} className="mb-4 flex gap-1 overflow-x-auto border-b">
    {tabs.map((tab, index) => <button
      key={tab}
      id={`${key(tab)}-tab`}
      type="button"
      role="tab"
      aria-selected={value === tab}
      aria-controls={`${key(tab)}-panel`}
      tabIndex={value === tab ? 0 : -1}
      onClick={() => onChange(tab)}
      onKeyDown={(event) => move(event, index)}
      className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${value === tab ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
    >{tab}</button>)}
  </div>;
}

export function RecordTabPanel({ idPrefix, tab, children }: { idPrefix: string; tab: string; children: ReactNode }) {
  const key = `${idPrefix}-${tab.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return <div id={`${key}-panel`} role="tabpanel" aria-labelledby={`${key}-tab`} tabIndex={0}>{children}</div>;
}
