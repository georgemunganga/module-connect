import type { ReactNode } from "react";
import { Select } from "../ui";
import { RecordTable } from "./RecordTable";

export type ImportStage = "configure" | "map" | "preview" | "done";
const stages: Array<{ key: ImportStage; label: string }> = [
  { key: "configure", label: "Configure" }, { key: "map", label: "Map Fields" }, { key: "preview", label: "Preview" },
];

/** The supplied demo wizard and the ERP adapter share this progress and heading surface. */
export function ImportStageHeading({ stage, title }: { stage: ImportStage; title: string }) {
  const index = stages.findIndex(item => item.key === stage);
  return <>
    <div className="flex items-center justify-center gap-3 border-b border-slate-100 pb-4">
      {stages.map((item, position) => <div key={item.key} className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${position <= index ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-400"}`}>{position + 1}</span>
        <span className={`text-xs ${position === index ? "font-semibold text-slate-800" : "text-slate-400"}`}>{item.label}</span>
        {position < stages.length - 1 && <span className="hidden h-px w-7 bg-slate-200 sm:block" />}
      </div>)}
    </div>
    <h3 className="text-center text-base font-semibold text-slate-800">{title} — {stages[index]?.label}</h3>
  </>;
}

export type ImportMapField = { key: string; label: string; required?: boolean };
export function ImportMappingTable({ headers, sample, mapping, fields, onMap }: {
  headers: string[]; sample: Record<string, string>; mapping: Record<string, string>; fields: ImportMapField[];
  onMap: (header: string, target: string) => void;
}) {
  return <div className="overflow-x-auto rounded-md border border-slate-200">
    <RecordTable variant="compact" className="w-full text-left text-sm"><thead className="table-head"><tr>
      <th className="table-cell">File column</th><th className="table-cell">Sample value</th><th className="table-cell">Map to field</th>
    </tr></thead><tbody>{headers.map(header => <tr key={header} className="border-t border-slate-100">
      <td className="table-cell font-medium">{header}</td>
      <td className="table-cell max-w-[220px] truncate text-slate-500">{sample[header] || "—"}</td>
      <td className="table-cell"><Select aria-label={`Map ${header}`} value={mapping[header] ?? ""} onChange={event => onMap(header, event.target.value)}>
        <option value="">Don't import this column</option>
        {fields.map(field => <option key={field.key} value={field.key}
          disabled={Object.entries(mapping).some(([source, target]) => source !== header && target === field.key)}>
          {field.label}{field.required ? " *" : ""}</option>)}
      </Select></td>
    </tr>)}</tbody></RecordTable>
  </div>;
}

export function ImportWizardTips({ children }: { children: ReactNode }) {
  return <details className="rounded-md border border-slate-200 px-4 py-3 text-xs text-slate-600">
    <summary className="cursor-pointer font-medium text-slate-700">Page Tips</summary>
    <ul className="mt-3 list-disc space-y-1 pl-5">{children}</ul>
  </details>;
}
