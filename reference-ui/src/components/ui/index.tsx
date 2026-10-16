import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { X, ChevronDown, FileSearch } from "lucide-react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const colors = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90 border-primary shadow-sm",
    secondary: "bg-surface text-foreground hover:bg-secondary border-input",
    ghost:
      "bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground border-transparent",
    danger: "bg-danger-soft text-danger border-danger/20 hover:bg-danger/15",
  };
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${colors[variant]} ${className}`}
      {...props}
    />
  );
}
export function Field({
  label,
  hint,
  error,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[13px] font-medium text-slate-700">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs text-slate-400">{hint}</span>
      )}
      {error && (
        <span className="mt-1 block text-xs text-red-600" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`control ${className}`} {...props} />;
}
export function Select({
  children,
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select
        className={`control appearance-none pr-9 ${className}`}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-3 text-slate-400"
        size={14}
      />
    </span>
  );
}
export function Textarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={`control min-h-24 resize-y ${className}`} {...props} />
  );
}
export function Badge({ children }: { children: ReactNode }) {
  const text = String(children).toLowerCase();
  const color =
    text.includes("pending") || text.includes("open")
      ? "bg-amber-50 text-amber-700"
      : text.includes("approv") ||
          text === "paid" ||
          text.startsWith("active") ||
          text.includes("receiv")
        ? "bg-emerald-50 text-emerald-700"
        : text.includes("reject")
          ? "bg-red-50 text-red-600"
          : "bg-slate-100 text-slate-500";
  return (
    <span
      className={`inline-flex rounded px-2 py-1 text-[11px] font-semibold ${color}`}
    >
      {children}
    </span>
  );
}
export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-border bg-surface ${className}`}
    >
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="font-semibold text-foreground">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </header>
  );
}
export function EmptyState({
  title = "No records yet",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-400">
        <FileSearch size={25} />
      </span>
      <h3 className="font-medium text-slate-700">{title}</h3>
      {description && (
        <p className="mb-4 mt-2 max-w-sm text-sm text-slate-400">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
      if (event.key === "Tab") {
        const elements = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, select, textarea, a[href], [tabindex="0"]',
        );
        if (!elements?.length) return;
        const first = elements[0],
          last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = scroll;
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`max-h-[92dvh] w-full overflow-y-auto rounded-lg bg-white shadow-2xl outline-none ${wide ? "max-w-4xl" : "max-w-xl"}`}
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-medium">{title}</h2>
          <button
            aria-label="Close dialog"
            onClick={onClose}
            className="rounded p-2 text-slate-400 hover:bg-slate-100"
          >
            <X size={19} />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
