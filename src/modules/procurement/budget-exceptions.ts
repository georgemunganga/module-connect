import { useEffect, useState } from "react";

export type BudgetExceptionStatus =
  "Pending budget owner" | "Denied" | "Supported — Finance review needed";

export interface BudgetException {
  id: string;
  taskId: string;
  requestId: string;
  policyVersion: string;
  requestedBy: string;
  owner: string;
  reason: string;
  evidenceReference: string;
  status: BudgetExceptionStatus;
  requestedAt: string;
  decidedAt?: string;
  decisionReason?: string;
  decidedBy?: string;
}

const KEY = "erp.procurement.budget-exceptions.v1";
const seed: BudgetException[] = [];
let current: BudgetException[] | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const stamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

export function getBudgetExceptions() {
  if (!current) {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
      current = raw ? (JSON.parse(raw) as BudgetException[]) : seed;
    } catch {
      current = seed;
    }
  }
  return current;
}

export function useBudgetExceptions() {
  const [records, setRecords] = useState<BudgetException[]>(seed);
  useEffect(() => {
    const listener = () => setRecords(getBudgetExceptions());
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return records;
}

function save(records: BudgetException[]) {
  current = records;
  if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(records));
  notify();
}

export function requestBudgetException(
  input: Omit<
    BudgetException,
    "id" | "status" | "requestedAt" | "decidedAt" | "decisionReason" | "decidedBy"
  >,
) {
  if (!input.reason.trim() || !input.evidenceReference.trim())
    throw new Error("Enter a reason and an evidence reference.");
  if (
    getBudgetExceptions().some(
      (record) => record.taskId === input.taskId && record.status === "Pending budget owner",
    )
  )
    throw new Error("This request already has a pending budget review.");
  const record: BudgetException = {
    ...input,
    reason: input.reason.trim(),
    evidenceReference: input.evidenceReference.trim(),
    id: crypto.randomUUID(),
    status: "Pending budget owner",
    requestedAt: stamp(),
  };
  save([record, ...getBudgetExceptions()]);
  return record;
}

export function decideBudgetException(
  id: string,
  actor: string,
  decision: "Denied" | "Supported — Finance review needed",
  reason: string,
) {
  const record = getBudgetExceptions().find((item) => item.id === id);
  if (!record || record.status !== "Pending budget owner")
    throw new Error("This review is no longer pending.");
  if (record.owner !== actor) throw new Error("This decision belongs to the named budget owner.");
  if (record.requestedBy === actor) throw new Error("The person who requested an exception cannot decide it.");
  if (!reason.trim()) throw new Error("Record a reason for the decision.");
  save(
    getBudgetExceptions().map((item) =>
      item.id === id
        ? {
            ...item,
            status: decision,
            decidedAt: stamp(),
            decidedBy: actor,
            decisionReason: reason.trim(),
          }
        : item,
    ),
  );
}
