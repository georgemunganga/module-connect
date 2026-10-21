import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Native checkbox semantics with the ERP switch appearance. */
export function FormToggle({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <span className={cn(className, "relative inline-flex h-6 w-11 shrink-0 items-center align-middle")}>
    <input
      {...props}
      type="checkbox"
      role="switch"
      className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
    />
    <span aria-hidden="true" className="pointer-events-none h-6 w-11 rounded-full bg-input shadow-inner transition-colors peer-checked:bg-primary peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:opacity-50" />
    <span aria-hidden="true" className="pointer-events-none absolute left-0.5 top-0.5 size-5 rounded-full bg-background shadow transition-transform peer-checked:translate-x-5 peer-disabled:opacity-50" />
  </span>;
}
