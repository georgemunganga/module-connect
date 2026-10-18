import { forwardRef } from "react";
import type { TableHTMLAttributes } from "react";

/** Shared table surface; the parent keeps its filters, cells and actions. */
export const RecordTable = forwardRef<HTMLTableElement, TableHTMLAttributes<HTMLTableElement> & { variant?: "regular" | "compact" | "matrix" }>(
  ({ className = "", variant = "regular", ...props }, ref) => (
    <table ref={ref} className={`erp-record-table erp-record-table--${variant} w-full border-collapse text-left text-sm ${className}`} {...props} />
  ),
);

RecordTable.displayName = "RecordTable";
