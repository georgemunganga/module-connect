import { RecordTable } from "../components/data/RecordTable";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Panel,
  Textarea,
} from "../components/ui";
import { billBalance } from "../lib/payables";
import { money, today, useApp } from "../lib/store";

function batchBills(raw: string | undefined) {
  return (raw ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function BatchPaymentEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { records, updateRecord, notify } = useApp();
  const batch = records.find(
    (record) => record.kind === "batch-payments" && record.id === id,
  );
  const existingBillIds = batchBills(batch?.meta?.billIds);
  const candidates = records.filter(
    (record) =>
      record.kind === "bills" &&
      (existingBillIds.includes(record.id) ||
        (!["Draft", "Pending Approval"].includes(record.status) &&
          billBalance(records, record) > 0)),
  );
  const [title, setTitle] = useState(batch?.title ?? "");
  const [date, setDate] = useState(batch?.date ?? today());
  const [note, setNote] = useState(batch?.meta?.notes ?? "");
  const [selected, setSelected] = useState<string[]>(existingBillIds);
  if (!batch) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8">
        <h1 className="text-xl font-semibold">Batch not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          This prepared batch is not available in local demo data.
        </p>
        <Link
          to="/batch-payments"
          className="mt-4 inline-flex text-sm text-blue-600"
        >
          Return to Batch Payments →
        </Link>
      </div>
    );
  }
  const chosen = candidates.filter((bill) => selected.includes(bill.id));
  const total = chosen.reduce(
    (sum, bill) => sum + billBalance(records, bill),
    0,
  );
  const toggle = (billId: string) =>
    setSelected((previous) =>
      previous.includes(billId)
        ? previous.filter((value) => value !== billId)
        : [...previous, billId],
    );
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      notify("Enter a batch name.");
      return;
    }
    if (!chosen.length) {
      notify("Select at least one eligible bill.");
      return;
    }
    updateRecord(batch.id, {
      title: title.trim(),
      date,
      amount: total,
      meta: {
        ...batch.meta,
        notes: note.trim(),
        billIds: chosen.map((bill) => bill.id).join(","),
        allocations: JSON.stringify(
          chosen.map((bill) => ({
            id: bill.id,
            party: bill.party,
            amount: billBalance(records, bill),
          })),
        ),
      },
    });
    notify("Prepared batch updated in this browser only. No payment was sent.");
    navigate(`/batch-payments/${encodeURIComponent(batch.id)}`);
  };
  return (
    <div className="p-5 sm:p-8">
      <PageHeader
        title="Edit prepared batch"
        subtitle={`${batch.id} · local demo record`}
        actions={
          <Link to={`/batch-payments/${encodeURIComponent(batch.id)}`}>
            <Button variant="secondary">
              <ArrowLeft size={14} /> Cancel
            </Button>
          </Link>
        }
      />
      <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Local-only preview:</strong> editing this prepared batch will
        not initiate a transfer or contact a payment service.
      </div>
      <form onSubmit={save} className="space-y-5">
        <Panel title="Batch details" action={<Badge>{batch.status}</Badge>}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Batch name">
              <Input
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <Field label="Payment date">
              <Input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
            <Field label="Internal note" className="md:col-span-2">
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional local note"
              />
            </Field>
          </div>
        </Panel>
        <Panel
          title="Bills included"
          action={
            <span className="text-xs text-slate-400">
              {chosen.length} selected · {money(total)}
            </span>
          }
        >
          {candidates.length ? (
            <div className="overflow-x-auto">
              <RecordTable variant="compact" className="w-full min-w-[680px] text-left text-sm">
                <thead className="table-head">
                  <tr>
                    {[
                      "Select",
                      "Bill",
                      "Vendor",
                      "Date",
                      "Balance due",
                      "Status",
                    ].map((label) => (
                      <th key={label} className="table-cell">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((bill) => (
                    <tr key={bill.id} className="border-b border-slate-100">
                      <td className="table-cell">
                        <input
                          type="checkbox"
                          aria-label={`Select ${bill.id}`}
                          checked={selected.includes(bill.id)}
                          onChange={() => toggle(bill.id)}
                        />
                      </td>
                      <td className="table-cell">
                        <span className="font-medium">{bill.id}</span>
                        <span className="mt-1 block text-xs text-slate-400">
                          {bill.title}
                        </span>
                      </td>
                      <td className="table-cell">{bill.party}</td>
                      <td className="table-cell">{bill.date}</td>
                      <td className="table-cell font-medium">
                        {money(billBalance(records, bill))}
                      </td>
                      <td className="table-cell">
                        <Badge>{bill.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </RecordTable>
            </div>
          ) : (
            <EmptyState
              title="No eligible bills"
              description="Only non-draft local bills with a remaining balance can be included."
            />
          )}
        </Panel>
        <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
          <span className="text-sm text-slate-500">
            Batch total{" "}
            <strong className="ml-2 text-slate-900">{money(total)}</strong>
          </span>
          <div className="flex gap-2">
            <Link to={`/batch-payments/${encodeURIComponent(batch.id)}`}>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
            <Button type="submit">
              <Save size={14} /> Save changes locally
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
