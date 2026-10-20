import type { ListFilterField } from "./ListTools";

export function ActiveFilterChips({ fields, filters, onChange }: {
  fields: ListFilterField[];
  filters: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const active = Object.entries(filters).filter(([, value]) => value);
  if (!active.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2 text-xs" aria-label="Active filters">
      <span className="mr-1 font-medium text-slate-500">Filtered by</span>
      {active.map(([key, value]) => (
        <button key={key} type="button" className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600 hover:border-slate-300" aria-label={`Remove ${fields.find((field) => field.key === key)?.label ?? key} filter`} onClick={() => {
          const next = { ...filters };
          delete next[key];
          onChange(next);
        }}>
          {fields.find((field) => field.key === key)?.label ?? key}: {value} <span aria-hidden>×</span>
        </button>
      ))}
      <button type="button" className="text-slate-500 underline underline-offset-2 hover:text-slate-800" onClick={() => onChange({})}>Clear all</button>
    </div>
  );
}
