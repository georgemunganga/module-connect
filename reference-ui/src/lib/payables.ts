import type { AppRecord } from "./store";

export function appliedAmounts(
  records: AppRecord[],
  billId: string,
  excludeId?: string,
) {
  const settled = records.filter(
    (record) => record.id !== excludeId && record.status !== "Draft",
  );
  const paid = settled
    .filter(
      (record) => record.kind === "payments" && record.meta?.billId === billId,
    )
    .reduce((sum, record) => sum + record.amount, 0);
  const credited = settled
    .filter(
      (record) =>
        record.kind === "vendor-credits" &&
        record.meta?.appliedBillId === billId,
    )
    .reduce((sum, record) => sum + record.amount, 0);
  return { paid, credited };
}

export function billBalance(
  records: AppRecord[],
  bill: AppRecord | undefined,
  excludeId?: string,
) {
  if (!bill || bill.kind !== "bills" || bill.status === "Draft") return 0;
  const { paid, credited } = appliedAmounts(records, bill.id, excludeId);
  return Math.max(0, Math.round((bill.amount - paid - credited) * 100) / 100);
}
