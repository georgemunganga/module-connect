import type { KeyboardEvent } from "react";

export function SettingsTabs<T extends string>({ id, label, tabs, value, onChange }: {
  id: string;
  label: string;
  tabs: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const target = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : -1;
    if (target < 0) return;
    event.preventDefault();
    onChange(tabs[target]);
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[target]?.focus();
  };
  return <div role="tablist" aria-label={label} className="mt-5 flex gap-1 overflow-x-auto border-b">
    {tabs.map((name, index) => <button key={name} id={`${id}-tab-${index}`} type="button" role="tab" aria-selected={value === name} aria-controls={`${id}-panel`} tabIndex={value === name ? 0 : -1} onClick={() => onChange(name)} onKeyDown={(event) => move(event, index)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary ${value === name ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{name}</button>)}
  </div>;
}

