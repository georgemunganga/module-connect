import type { ReactNode } from "react";
import { AlertTriangle, Clock3 } from "lucide-react";
import { Badge, Button, Modal } from "../ui";

export type DetailTab = { key: string; label: string };

export function DetailTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: DetailTab[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <nav
      aria-label="Record detail sections"
      className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2"
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onChange(tab.key)}
          className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm transition-colors ${active === tab.key ? "border-blue-500 font-semibold text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

export function DetailSection({
  title,
  action,
  children,
  className = "",
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-lg border border-slate-200 bg-white ${className}`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {action}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function DetailValue({
  label,
  value,
}: {
  label: string;
  value?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-700">
        {value ?? "—"}
      </dd>
    </div>
  );
}

export function ActivityTimeline({
  items,
}: {
  items: {
    id: string;
    title: string;
    detail?: string;
    date?: string;
    tone?: "neutral" | "success" | "warning";
  }[];
}) {
  if (!items.length)
    return <p className="text-sm text-slate-500">No activity recorded yet.</p>;
  return (
    <ol className="space-y-4">
      {items.map((item) => (
        <li key={item.id} className="flex gap-3">
          <span
            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${item.tone === "success" ? "bg-emerald-50 text-emerald-600" : item.tone === "warning" ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-500"}`}
          >
            <Clock3 size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-slate-700">{item.title}</p>
              {item.tone && item.tone !== "neutral" && (
                <Badge>
                  {item.tone === "success" ? "Completed" : "Updated"}
                </Badge>
              )}
            </div>
            {item.detail && (
              <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
            )}
            {item.date && (
              <p className="mt-1 text-[11px] text-slate-400">{item.date}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function DeleteConfirm({
  title,
  description,
  open,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="flex gap-3 rounded-md border border-amber-100 bg-amber-50 p-3 text-sm text-amber-900">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        <p>{description}</p>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        This removes the record only from this browser's fictional demo data.
        Nothing is deleted from ERP.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          Delete local record
        </Button>
      </div>
    </Modal>
  );
}
