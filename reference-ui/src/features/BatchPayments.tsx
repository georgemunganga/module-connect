import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Check,
  ChevronRight,
  Eye,
  Inbox,
  Pencil,
  Trash2,
  WalletCards,
} from "lucide-react";
import { billBalance } from "../lib/payables";
import { DeleteConfirm } from "../components/data/DetailPrimitives";
import {
  Badge,
  Button,
  EmptyState,
  Modal,
  PageHeader,
  Panel,
} from "../components/ui";
import { money, today, useApp, type AppRecord } from "../lib/store";

export function BatchPayments() {
  const { records, saveRecord, deleteRecord, notify } = useApp();
  const navigate = useNavigate();
  const bills = records.filter(
    (record) =>
      record.kind === "bills" &&
      !["Draft", "Pending Approval"].includes(record.status) &&
      billBalance(records, record) > 0,
  );
  const batches = records
    .filter((record) => record.kind === "batch-payments")
    .sort((a, b) => b.id.localeCompare(a.id));
  const [selected, setSelected] = useState<string[]>([]);
  const [review, setReview] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AppRecord | null>(null);
  const selectedBills = bills.filter((bill) => selected.includes(bill.id));
  const total = selectedBills.reduce(
    (sum, bill) => sum + billBalance(records, bill),
    0,
  );
  const allSelected = bills.length > 0 && selected.length === bills.length;
  const toggle = (id: string) =>
    setSelected((previous) =>
      previous.includes(id)
        ? previous.filter((value) => value !== id)
        : [...previous, id],
    );
  const confirmBatch = () => {
    const record: AppRecord = {
      id: `BATCH-${String(Date.now()).slice(-6)}`,
      kind: "batch-payments",
      title: `Batch payment · ${selectedBills.length} bills`,
      party: "Local payment run",
      date: today(),
      amount: total,
      status: "Prepared (demo)",
      meta: {
        billIds: selectedBills.map((bill) => bill.id).join(","),
        allocations: JSON.stringify(
          selectedBills.map((bill) => ({
            id: bill.id,
            party: bill.party,
            amount: billBalance(records, bill),
          })),
        ),
      },
    };
    saveRecord(record);
    setReview(false);
    setSelected([]);
    notify("Batch payment prepared locally. No payment was sent.");
    navigate(`/batch-payments/${encodeURIComponent(record.id)}`);
  };
  const deleteBatch = () => {
    if (!pendingDelete) return;
    deleteRecord(pendingDelete.id);
    notify(
      `${pendingDelete.id} removed from local demo data. Linked bills remain unchanged.`,
    );
    setPendingDelete(null);
  };

  return (
    <div>
      <PageHeader
        title="Batch payments"
        subtitle="Select open vendor bills and review a simulated payment batch."
        actions={
          <Button disabled={!selected.length} onClick={() => setReview(true)}>
            <WalletCards size={15} />
            Review batch ({selected.length})
          </Button>
        }
      />
      <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <strong>Local-only preview:</strong> preparing a batch creates an
        internal record for review. Bank transfers and payment gateways are not
        connected.
      </div>
      <Panel
        title="Open vendor bills"
        action={
          <span className="text-xs text-slate-400">
            {bills.length} eligible
          </span>
        }
      >
        {bills.length === 0 ? (
          <EmptyState
            title="No open bills"
            description="Open bill records will appear here when they are ready for payment."
            action={
              <Link to="/inbox">
                <Button>
                  <Inbox size={15} />
                  Go to inbox
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="table-head">
                  <th className="table-cell w-12 text-left">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() =>
                        setSelected(
                          allSelected ? [] : bills.map((bill) => bill.id),
                        )
                      }
                      aria-label="Select all open bills"
                    />
                  </th>
                  <th className="table-cell text-left">Bill</th>
                  <th className="table-cell text-left">Vendor</th>
                  <th className="table-cell text-left">Due date</th>
                  <th className="table-cell text-right">Amount</th>
                  <th className="table-cell text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => (
                  <tr
                    key={bill.id}
                    className={`${selected.includes(bill.id) ? "bg-blue-50/60" : ""} hover:bg-blue-50/30`}
                  >
                    <td className="table-cell">
                      <input
                        type="checkbox"
                        checked={selected.includes(bill.id)}
                        onChange={() => toggle(bill.id)}
                        aria-label={`Select ${bill.id}`}
                      />
                    </td>
                    <td className="table-cell font-medium text-slate-800">
                      {bill.id}
                      <div className="text-[11px] text-slate-400">
                        {bill.title}
                      </div>
                    </td>
                    <td className="table-cell">{bill.party}</td>
                    <td className="table-cell">
                      {bill.meta?.dueDate || bill.date}
                    </td>
                    <td className="table-cell text-right">
                      {money(billBalance(records, bill))}
                    </td>
                    <td className="table-cell">
                      <Badge>{bill.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <div className="mt-5 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-slate-500">
          Selected bills:{" "}
          <strong className="text-slate-800">{selected.length}</strong>
        </span>
        <span className="text-lg font-semibold text-slate-900">
          Total {money(total)}
        </span>
      </div>
      <Panel
        className="mt-5"
        title="Prepared batches"
        action={
          <span className="text-xs text-slate-400">Local demo records</span>
        }
      >
        {batches.length === 0 ? (
          <EmptyState
            title="No batches prepared"
            description="Reviewed batches will be recorded here without initiating bank transfers."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {batches.map((item) => (
              <article
                key={item.id}
                className="flex flex-col gap-3 px-5 py-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <Link
                  to={`/batch-payments/${encodeURIComponent(item.id)}`}
                  aria-label={`Open batch summary ${item.id}`}
                  className="flex min-w-0 flex-1 items-center justify-between gap-4"
                >
                  <span className="min-w-0">
                    <span className="font-medium text-blue-600">{item.id}</span>
                    <span className="ml-2 text-sm text-slate-700">
                      {item.title}
                    </span>
                    <span className="mt-1 block text-xs text-slate-400">
                      {item.date} ·{" "}
                      {item.meta?.billIds?.split(",").filter(Boolean).length ||
                        0}{" "}
                      bills
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <Badge>{item.status}</Badge>
                    <strong>{money(item.amount)}</strong>
                    <ChevronRight size={15} className="text-slate-400" />
                  </span>
                </Link>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Link
                    to={`/batch-payments/${encodeURIComponent(item.id)}`}
                    aria-label={`View batch ${item.id}`}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Eye size={14} /> View
                  </Link>
                  <Link
                    to={`/batch-payments/${encodeURIComponent(item.id)}/edit`}
                    aria-label={`Edit batch ${item.id}`}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Pencil size={14} /> Edit
                  </Link>
                  <Button
                    variant="danger"
                    aria-label={`Delete batch ${item.id}`}
                    className="!px-3 !py-2 text-xs"
                    onClick={() => setPendingDelete(item)}
                  >
                    <Trash2 size={14} /> Delete
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
      <DeleteConfirm
        open={Boolean(pendingDelete)}
        title="Delete prepared batch?"
        description={`${pendingDelete?.id ?? "This batch"} will be removed from local demo data. Linked bills remain unchanged.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={deleteBatch}
      />
      {review && (
        <Modal title="Review batch payment" onClose={() => setReview(false)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              This creates a local review record for the selected bills.
            </p>
            <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {selectedBills.map((bill) => (
                <div
                  key={bill.id}
                  className="flex items-center justify-between px-3 py-2.5 text-sm"
                >
                  <span>
                    {bill.id}
                    <span className="ml-2 text-xs text-slate-400">
                      {bill.party}
                    </span>
                  </span>
                  <strong>{money(billBalance(records, bill))}</strong>
                </div>
              ))}
              <div className="flex items-center justify-between bg-slate-50 px-3 py-3 font-semibold">
                <span>Total</span>
                <span>{money(total)}</span>
              </div>
            </div>
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              No money moves and no bank or payment service is contacted.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setReview(false)}>
                Cancel
              </Button>
              <Button onClick={confirmBatch}>
                <Check size={15} />
                Prepare batch
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
