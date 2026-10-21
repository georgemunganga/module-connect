import { forwardRef } from "react";
import type { TableHTMLAttributes } from "react";
import { Table } from "@amizopower/erp-ui";

/** Shared table surface; the parent keeps its filters, cells and actions. */
export const RecordTable = forwardRef<HTMLTableElement, TableHTMLAttributes<HTMLTableElement> & { variant?: "regular" | "compact" | "matrix" }>(
  ({ className = "", variant = "regular", ...props }, ref) => (
    <Table ref={ref} bare variant={variant} className={className} {...props} />
  ),
);

RecordTable.displayName = "RecordTable";
