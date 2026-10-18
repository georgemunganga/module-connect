import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type OptionHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { X, Check, ChevronDown, FileSearch } from "lucide-react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const colors = {
    primary: "bg-button-primary text-button-primary-foreground hover:bg-button-primary/90 border-button-primary shadow-sm",
    secondary: "bg-surface text-foreground hover:bg-secondary border-input",
    ghost:
      "bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground border-transparent",
    danger: "bg-danger-soft text-danger border-danger/20 hover:bg-danger/15",
  };
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 py-2 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${colors[variant]} ${className}`}
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
      <span className="mb-1.5 block text-sm font-medium text-foreground">
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
  value,
  defaultValue,
  onChange,
  disabled,
  name,
  required,
  id,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const choices = Children.toArray(children).flatMap((child) => {
    if (!isValidElement<OptionHTMLAttributes<HTMLOptionElement>>(child)) return [];
    const label = String(child.props.children ?? "");
    return [{ value: String(child.props.value ?? label), label, disabled: Boolean(child.props.disabled) }];
  });
  const [localValue, setLocalValue] = useState(String(defaultValue ?? choices[0]?.value ?? ""));
  const selectedValue = value === undefined ? localValue : String(value);
  const selected = choices.find((choice) => choice.value === selectedValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState({ left: 0, top: 0, width: 0, maxHeight: 300 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const position = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const desiredHeight = Math.min(320, choices.length * 38 + 12);
      const upward = below < desiredHeight && above > below;
      const maxHeight = Math.max(120, Math.min(320, upward ? above : below));
      setPlacement({ left: Math.max(12, Math.min(rect.left, window.innerWidth - rect.width - 12)), top: upward ? Math.max(8, rect.top - Math.min(desiredHeight, maxHeight) - 6) : rect.bottom + 6, width: rect.width, maxHeight });
    };
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    document.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); document.removeEventListener("pointerdown", outside); };
  }, [open, choices.length]);

  const choose = (next: string) => {
    setLocalValue(next);
    onChange?.({ target: { value: next, name }, currentTarget: { value: next, name } } as ChangeEvent<HTMLSelectElement>);
    setOpen(false);
    trigger.current?.focus();
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") { setOpen(false); return; }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const available = choices.map((choice, index) => ({ choice, index })).filter(({ choice }) => !choice.disabled);
      if (!available.length) return;
      const current = available.findIndex(({ index }) => index === active);
      const next = event.key === "Home" ? 0 : event.key === "End" ? available.length - 1 : event.key === "ArrowDown" ? (current + 1) % available.length : (current - 1 + available.length) % available.length;
      setActive(available[next].index);
      setOpen(true);
    } else if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      if (!choices[active]?.disabled) choose(choices[active].value);
    }
  };
  return (
    <span className="relative block">
      <button
        ref={trigger}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-label={props["aria-label"]}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => { setActive(Math.max(0, choices.findIndex((choice) => choice.value === selectedValue))); setOpen((current) => !current); }}
        onKeyDown={onKeyDown}
        className={`control flex items-center justify-between gap-2 text-left transition-shadow hover:border-primary/60 disabled:cursor-not-allowed ${className}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selectedValue === "" ? "text-muted-foreground" : ""}`}>{selected?.label ?? "Select"}</span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <select
        name={name}
        value={selectedValue}
        onChange={() => {}}
        aria-hidden="true"
        tabIndex={-1}
        className="sr-only"
      >
        {children}
      </select>
      {open && typeof document !== "undefined" ? createPortal(<div
        ref={menu}
        id={listId}
        role="listbox"
        aria-label={props["aria-label"]}
        className="fixed z-[100] overflow-y-auto rounded-xl border border-border bg-surface p-1.5 text-foreground shadow-2xl"
        style={{ left: placement.left, top: placement.top, width: placement.width, maxHeight: placement.maxHeight }}
      >
        {choices.map((choice, index) => <div
          key={`${choice.value}-${index}`}
          id={`${listId}-${index}`}
          role="option"
          aria-selected={choice.value === selectedValue}
          aria-disabled={choice.disabled || undefined}
          onMouseEnter={() => setActive(index)}
          onClick={() => { if (!choice.disabled) choose(choice.value); }}
          className={`flex min-h-9 cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${choice.disabled ? "cursor-not-allowed opacity-45" : index === active ? "bg-primary-soft text-primary" : "hover:bg-secondary"}`}
        >
          <span className="min-w-0 truncate">{choice.label}</span>
          {choice.value === selectedValue ? <Check className="size-4 shrink-0" aria-hidden /> : null}
        </div>)}
      </div>, document.body) : null}
    </span>
  );
}
export function Switch({ className = "", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return <span className={`relative inline-flex h-6 w-11 shrink-0 items-center ${className}`}>
    <input type="checkbox" role="switch" className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" {...props} />
    <span aria-hidden="true" className="pointer-events-none h-6 w-11 rounded-full bg-input shadow-inner transition-colors peer-checked:bg-primary peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:opacity-50" />
    <span aria-hidden="true" className="pointer-events-none absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5 peer-disabled:opacity-50" />
  </span>;
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
