import { useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  X,
  Paperclip,
  ArrowLeft,
  Save,
  Send,
  ShoppingBag,
  Link2,
} from "lucide-react";
import { modules, type ModuleKey } from "../data/modules";
import {
  useApp,
  useStoredState,
  today,
  money,
  type AppRecord,
  type Line,
} from "../lib/store";
import { transactionTotals, validateLines } from "../lib/calculations";
import { appliedAmounts, billBalance } from "../lib/payables";
import { VendorSelect, LineEditor } from "../components/data/LineEditor";
import {
  Button,
  Field,
  Input,
  Select,
  Switch,
  Textarea,
  Modal,
} from "../components/ui";

type Draft = {
  title: string;
  party: string;
  vendorId: string;
  date: string;
  expectedDate: string;
  reference: string;
  reason: string;
  creditReason: string;
  applyToBill: string;
  notes: string;
  terms: string;
  address: string;
  deliveryTo: string;
  shipment: string;
  paymentTerms: string;
  frequency: string;
  endDate: string;
  source: string;
  billId: string;
  paymentMode: string;
  account: string;
  amount: number;
  discount: number;
  tax: number;
  inclusive: boolean;
  files: string[];
  lines: Line[];
};
export function TransactionEditor({
  kind,
}: {
  kind: Exclude<ModuleKey, "rfqs">;
}) {
  const config = modules[kind];
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { records, saveRecord, updateRecord, notify } = useApp();
  const existing = records.find(
    (record) => record.id === id && record.kind === kind,
  );
  const inboxId = searchParams.get("inbox") || existing?.meta?.inboxId || "";
  const inboxFilename =
    searchParams.get("filename") || existing?.meta?.inboxFilename || "";
  const inboxSize = searchParams.get("size") || existing?.meta?.inboxSize || "";
  const sourceId =
    searchParams.get("source") || inboxId || existing?.meta?.source || "";
  const source = records.find((record) => record.id === sourceId);
  const meta = existing?.meta || {};
  let savedDraft: Partial<Draft> = {};
  try {
    savedDraft = JSON.parse(meta.draft || "{}");
  } catch {
    /* Use readable record defaults. */
  }
  const queryVendorId = searchParams.get("vendor") || "";
  const queryVendor = records.find(
    (record) => record.id === queryVendorId && record.kind === "vendors",
  );
  const partyHint =
    typeof savedDraft.party === "string"
      ? savedDraft.party
      : existing?.party ||
        queryVendor?.title ||
        (source && source.kind !== "requests" ? source.party : "");
  const vendorFromParty = records.find(
    (record) => record.kind === "vendors" && record.title === partyHint,
  );
  const savedVendorById = records.find(
    (record) =>
      record.kind === "vendors" &&
      typeof savedDraft.vendorId === "string" &&
      record.id === savedDraft.vendorId &&
      (!savedDraft.party || record.title === savedDraft.party),
  );
  const preferredVendorId = existing?.meta?.vendorId || queryVendorId;
  const preferredVendor = records.find(
    (record) => record.kind === "vendors" && record.id === preferredVendorId,
  );
  const linkedVendor =
    vendorFromParty || savedVendorById || preferredVendor || queryVendor;
  const fallbackLines = existing?.lines?.length
    ? existing.lines
    : source?.lines?.length
      ? source.lines
      : [
          {
            id: crypto.randomUUID(),
            name: existing?.title || source?.title || "",
            quantity: 1,
            rate: existing?.amount ?? source?.amount ?? 0,
            unit: "pcs",
          },
        ];
  const initial: Draft = {
    title:
      existing?.title ||
      source?.title ||
      inboxFilename.replace(/\.[^.]+$/, "") ||
      "",
    party:
      linkedVendor?.title ||
      existing?.party ||
      (source && source.kind !== "requests" ? source.party : "") ||
      "",
    date: existing?.date || today(),
    expectedDate: existing?.meta?.dueDate ?? "",
    reference: existing?.meta?.reference ?? sourceId,
    reason: existing?.meta?.reason ?? "",
    creditReason: existing?.meta?.creditReason ?? "",
    applyToBill: existing?.meta?.appliedBillId ?? "",
    notes: existing?.meta?.notes ?? "",
    terms: existing?.meta?.terms ?? "",
    address: "Main Office, Lusaka, Zambia",
    deliveryTo: "Organization",
    shipment: "Standard delivery",
    paymentTerms: existing?.meta?.paymentTerms ?? "Due on Receipt",
    frequency: existing?.meta?.frequency ?? "Monthly",
    endDate: existing?.meta?.endDate ?? "",
    source: sourceId,
    billId:
      existing?.meta?.billId ??
      (kind === "payments" && source?.kind === "bills" ? sourceId : ""),
    paymentMode: existing?.meta?.paymentMode ?? "Bank Transfer",
    account: existing?.meta?.account ?? "Operating Account",
    amount: existing?.amount ?? source?.amount ?? 0,
    discount: 0,
    tax: 0,
    inclusive: false,
    files: inboxFilename ? [inboxFilename] : [],
    ...savedDraft,
    lines:
      Array.isArray(savedDraft.lines) && savedDraft.lines.length
        ? savedDraft.lines
        : kind === "payments"
          ? (existing?.lines ?? [])
          : fallbackLines,
    vendorId:
      typeof savedDraft.vendorId === "string"
        ? (savedVendorById?.id ??
          (savedDraft.vendorId === "" ? "" : (linkedVendor?.id ?? "")))
        : (linkedVendor?.id ?? ""),
  };
  const key = `editor.${kind}.${id || sourceId || queryVendorId || "new"}`;
  const [draft, setDraft] = useStoredState<Draft>(key, initial);
  const [errors, setErrors] = useState<Record<string, string>>({}),
    [dirty, setDirty] = useState(false),
    [cancel, setCancel] = useState(false);
  const isRequest = kind === "requests",
    isReceive = kind === "purchase-receives",
    isPayment = kind === "payments",
    isRecurring = kind === "recurring-bills",
    isCredit = kind === "vendor-credits";
  const currentVendorId =
    draft.vendorId ??
    records.find(
      (record) => record.kind === "vendors" && record.title === draft.party,
    )?.id ??
    "";
  const vendorIdForRecord = (record?: AppRecord) =>
    record?.meta?.vendorId ||
    records.find(
      (vendor) => vendor.kind === "vendors" && vendor.title === record?.party,
    )?.id ||
    "";
  const totals = transactionTotals(
    draft.lines,
    draft.discount,
    draft.tax,
    draft.inclusive,
  );
  const dueBill = records.find(
    (record) => record.id === draft.billId && record.kind === "bills",
  );
  const balance = billBalance(records, dueBill, id);
  const creditBill = records.find(
    (record) => record.id === draft.applyToBill && record.kind === "bills",
  );
  const existingCreditsForBill = appliedAmounts(
    records,
    draft.applyToBill,
    id,
  ).credited;
  const creditBillBalance = billBalance(records, creditBill, id);
  const patch = (updates: Partial<Draft>) => {
    setDraft((previous) => ({ ...previous, ...updates }));
    setDirty(true);
    setErrors({});
  };
  const entry = searchParams.get("entry");
  const originVendorId =
    searchParams.get("fromVendor") || searchParams.get("vendor") || "";
  const requestedVendorTab = searchParams.get("vendorTab") || "transactions";
  const vendorTab = [
    "overview",
    "comments",
    "transactions",
    "mails",
    "statement",
  ].includes(requestedVendorTab)
    ? requestedVendorTab
    : "transactions";
  const backTo =
    !isRequest && originVendorId
      ? `/vendors/${encodeURIComponent(originVendorId)}/${vendorTab}`
      : entry === "procurement" && isRequest
        ? "/procurement-requests"
        : entry === "approvals" && isRequest
          ? "/approvals"
          : `/${kind}`;
  const cancelEditor = () => {
    if (dirty) setCancel(true);
    else navigate(backTo);
  };
  const selectSource = (value: string) => {
    const selected = records.find((record) => record.id === value);
    patch({
      source: value,
      reference: value,
      party: selected?.party || draft.party,
      vendorId: selected ? vendorIdForRecord(selected) : currentVendorId,
      lines: selected?.lines?.length ? selected.lines : draft.lines,
      title: selected?.title || draft.title,
    });
  };
  const save = (submit: boolean) => {
    if (submit) {
      const nextErrors: Record<string, string> = {};
      if (!draft.date) nextErrors.date = "Choose a date.";
      if (isRequest && !draft.expectedDate)
        nextErrors.expectedDate = "Expected date is required.";
      if (!isRequest && !draft.party.trim())
        nextErrors.party = "Select a vendor.";
      if (isRequest && !draft.reason.trim() && !draft.title.trim())
        nextErrors.title = "Add a title or a reason for the request.";
      if (isReceive && !draft.source)
        nextErrors.source = "Select the purchase order being received.";
      if (isPayment) {
        if (!Number.isFinite(draft.amount) || draft.amount <= 0)
          nextErrors.amount = "Enter an amount greater than zero.";
        if (!dueBill || dueBill.status === "Draft")
          nextErrors.billId = "Select a posted bill for this payment.";
        if (dueBill && dueBill.party !== draft.party)
          nextErrors.party = "Payment and bill must use the same vendor.";
        if (dueBill && draft.amount > balance)
          nextErrors.amount = `Amount exceeds the bill balance of ${money(balance)}.`;
      } else {
        const lineError = validateLines(draft.lines, !isReceive);
        if (lineError) nextErrors.lines = lineError;
      }
      if (isCredit && draft.applyToBill && !creditBill)
        nextErrors.applyToBill =
          "Select a valid bill or leave this credit unapplied.";
      if (isCredit && creditBill && creditBill.party !== draft.party)
        nextErrors.applyToBill = "Credit and bill must use the same vendor.";
      if (isCredit && creditBill && totals.total > creditBillBalance)
        nextErrors.applyToBill = `The credit exceeds the remaining bill balance of ${money(creditBillBalance)}.`;
      if (isRecurring && draft.endDate && draft.endDate < draft.date)
        nextErrors.endDate = "End date must be after the start date.";
      if (draft.expectedDate && !isRequest && draft.expectedDate < draft.date)
        nextErrors.expectedDate =
          "Delivery / due date must not be before the transaction date.";
      if (isReceive && source?.lines) {
        const excessive = draft.lines.some((line) => {
          const ordered = source.lines!.find((item) => item.name === line.name);
          return ordered && line.quantity > ordered.quantity;
        });
        if (excessive)
          nextErrors.lines =
            "Received quantities cannot exceed this source order’s quantities.";
      }
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length) {
        notify(
          "Complete the highlighted fields before submitting this local demo record.",
        );
        return;
      }
    } else setErrors({});
    const recordId = id || `${config.prefix}-${String(Date.now()).slice(-8)}`;
    const status = submit
      ? isRequest
        ? "Pending Approval"
        : isReceive
          ? "Received (demo)"
          : isPayment
            ? "Paid (demo)"
            : isRecurring
              ? "Active (demo)"
              : kind === "purchase-orders"
                ? "Ready to Send (demo)"
                : isCredit
                  ? draft.applyToBill
                    ? "Applied (demo)"
                    : "Available (demo)"
                  : "Open (demo)"
      : (existing?.status ?? "Draft");
    const record: AppRecord = {
      id: recordId,
      kind,
      title:
        draft.title ||
        draft.reason ||
        (isCredit
          ? `Credit for ${draft.party}`
          : `${config.singular} for ${draft.party}`),
      party: isRequest ? "Operations" : draft.party,
      date: draft.date,
      amount: isPayment ? draft.amount : totals.total,
      status,
      lines: isPayment ? [] : draft.lines,
      meta: {
        ...meta,
        source: draft.source,
        vendorId: currentVendorId,
        reference: draft.reference,
        paymentMode: draft.paymentMode,
        account: draft.account,
        billId: draft.billId,
        appliedBillId: draft.applyToBill,
        creditReason: draft.creditReason,
        frequency: draft.frequency,
        dueDate: draft.expectedDate,
        inboxId,
        inboxFilename,
        inboxSize,
        draft: JSON.stringify(draft),
      },
    };
    saveRecord(record);
    if (isPayment && submit && dueBill)
      updateRecord(dueBill.id, {
        status:
          draft.amount >= balance ? "Paid (demo)" : "Partially Paid (demo)",
      });
    if (isCredit && submit && creditBill)
      updateRecord(creditBill.id, {
        status:
          totals.total >= creditBillBalance
            ? "Credited (demo)"
            : "Partially Credited (demo)",
        meta: {
          ...creditBill.meta,
          creditApplied: String(existingCreditsForBill + totals.total),
        },
      });
    try {
      localStorage.removeItem(`procureui.${key}`);
    } catch {
      /* Optional storage. */
    }
    notify(
      submit
        ? `${config.singular} ${recordId} simulated locally. Nothing was sent to ERP or a vendor.`
        : `${config.singular} draft saved in this browser.`,
    );
    navigate(backTo);
  };
  const formField = (
    label: string,
    field: keyof Draft,
    type = "text",
    hint?: string,
  ) => (
    <Field label={label} hint={hint} error={errors[field]}>
      <Input
        type={type}
        value={String(draft[field] ?? "")}
        onChange={(event) => patch({ [field]: event.target.value })}
      />
    </Field>
  );
  if (id && !existing)
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-xl font-semibold">{config.singular} not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          This record ID is not available in the local demo workspace.
        </p>
        <Link to={backTo} className="mt-5 inline-flex text-sm text-blue-600">
          Return to {config.key} →
        </Link>
      </div>
    );
  return (
    <div className="pb-20">
      <header className="flex items-center justify-between border-b border-slate-200 px-5 py-5 sm:px-8">
        <h1 className="flex items-center gap-2 text-xl font-medium tracking-tight">
          <ShoppingBag size={23} strokeWidth={1.4} />
          {id ? "Edit" : "New"} {config.singular}
        </h1>
        <button
          onClick={cancelEditor}
          aria-label="Close editor"
          className="rounded p-2 text-slate-400 hover:bg-slate-100"
        >
          <X size={21} />
        </button>
      </header>
      <div className="max-w-[1260px] space-y-7 px-5 py-6 sm:px-8">
        {draft.source && (
          <div className="flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50/50 px-4 py-3 text-xs text-blue-700">
            <Link2 size={14} />
            {inboxFilename ? (
              <>
                Inbox file <strong>{inboxFilename}</strong> · filename metadata
                only; no file contents were imported.
              </>
            ) : (
              <>
                Opened from {draft.source}. Same canonical{" "}
                {config.singular.toLowerCase()} editor, with source context.
              </>
            )}
          </div>
        )}
        {!isRequest && (
          <div className="-mx-5 bg-[#f8f9fc] px-5 py-5 sm:-mx-8 sm:px-8">
            <div className="max-w-xl">
              <Field label="Vendor Name *" error={errors.party}>
                <VendorSelect
                  value={currentVendorId}
                  fallbackLabel={draft.party}
                  onChange={(vendorId) => {
                    const vendor = records.find(
                      (record) =>
                        record.kind === "vendors" && record.id === vendorId,
                    );
                    patch({ vendorId, party: vendor?.title ?? "" });
                  }}
                />
              </Field>
              <Link
                to={`/vendors/new?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`}
                className="mt-2 block text-xs text-blue-500"
              >
                + Add a vendor in the shared directory
              </Link>
            </div>
          </div>
        )}
        <div className="grid max-w-4xl gap-x-8 gap-y-5 sm:grid-cols-2">
          {formField(
            isRequest
              ? "Expected Date *"
              : isRecurring
                ? "Start Date *"
                : "Date *",
            isRequest ? "expectedDate" : "date",
            "date",
          )}
          {formField(
            isRequest
              ? "Reason / Request Title *"
              : isCredit
                ? "Vendor Credit # / Title"
                : "Transaction Title",
            "title",
          )}
          {(isRequest || kind === "purchase-orders") && (
            <Field label="Delivery Address">
              <Select
                value={draft.deliveryTo}
                onChange={(event) => patch({ deliveryTo: event.target.value })}
              >
                <option>Organization</option>
                <option>Customer</option>
                <option>Warehouse</option>
              </Select>
              <Input
                aria-label="Delivery address details"
                className="mt-2"
                value={draft.address}
                onChange={(event) => patch({ address: event.target.value })}
              />
            </Field>
          )}
          {formField(
            `${config.singular} #`,
            "reference",
            "text",
            id
              ? `Record ${id}. Reference can be changed locally.`
              : "A unique demo record number will be generated when saved.",
          )}
          {isReceive && (
            <Field label="Source Purchase Order *" error={errors.source}>
              <Select
                value={draft.source}
                onChange={(event) => selectSource(event.target.value)}
              >
                <option value="">Select a purchase order</option>
                {records
                  .filter((record) => record.kind === "purchase-orders")
                  .map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.id} · {record.party}
                    </option>
                  ))}
              </Select>
            </Field>
          )}
          {!isRequest &&
            !isPayment &&
            !isReceive &&
            !isRecurring &&
            !isCredit &&
            formField(
              kind === "purchase-orders" ? "Delivery Date" : "Due Date",
              "expectedDate",
              "date",
            )}
          {(kind === "purchase-orders" || kind === "bills" || isRecurring) && (
            <Field label="Payment Terms">
              <Select
                value={draft.paymentTerms}
                onChange={(event) =>
                  patch({ paymentTerms: event.target.value })
                }
              >
                <option>Due on Receipt</option>
                <option>Net 15</option>
                <option>Net 30</option>
                <option>Net 60</option>
              </Select>
            </Field>
          )}
          {kind === "purchase-orders" && (
            <Field label="Shipment Preference">
              <Select
                value={draft.shipment}
                onChange={(event) => patch({ shipment: event.target.value })}
              >
                <option>Standard delivery</option>
                <option>Express delivery</option>
                <option>Vendor collection</option>
              </Select>
            </Field>
          )}
          {isRequest && (
            <Field label="Notes to Approver">
              <Textarea
                value={draft.notes}
                onChange={(event) => patch({ notes: event.target.value })}
                placeholder="Include the business reason and any context for approval."
              />
            </Field>
          )}
          {isRecurring && (
            <>
              <Field label="Repeat Every">
                <Select
                  value={draft.frequency}
                  onChange={(event) => patch({ frequency: event.target.value })}
                >
                  <option>Weekly</option>
                  <option>Monthly</option>
                  <option>Quarterly</option>
                  <option>Yearly</option>
                </Select>
              </Field>
              {formField("Ends On (optional)", "endDate", "date")}
              <div className="sm:col-span-2 rounded-md bg-blue-50 px-4 py-3 text-xs text-blue-600">
                Recurrence is a local schedule preview. No future bills are
                generated automatically.
              </div>
            </>
          )}
          {isPayment && (
            <>
              <Field label="Bill to Pay *" error={errors.billId}>
                <Select
                  value={draft.billId}
                  onChange={(event) => {
                    const bill = records.find(
                      (record) => record.id === event.target.value,
                    );
                    patch({
                      billId: event.target.value,
                      source: event.target.value,
                      party: bill?.party || draft.party,
                      vendorId: bill
                        ? vendorIdForRecord(bill)
                        : currentVendorId,
                      amount: billBalance(records, bill, id),
                    });
                  }}
                >
                  <option value="">Select a bill</option>
                  {records
                    .filter(
                      (record) =>
                        record.kind === "bills" &&
                        record.status !== "Draft" &&
                        billBalance(records, record, id) > 0,
                    )
                    .map((record) => (
                      <option key={record.id} value={record.id}>
                        {record.id} · {record.party} · {money(record.amount)}
                      </option>
                    ))}
                </Select>
                {dueBill && (
                  <span className="mt-2 block text-xs text-slate-400">
                    Balance: {money(balance)}
                  </span>
                )}
              </Field>
              <Field label="Amount *" error={errors.amount}>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={draft.amount}
                  onChange={(event) =>
                    patch({ amount: Number(event.target.value) })
                  }
                />
              </Field>
              <Field label="Payment Mode">
                <Select
                  value={draft.paymentMode}
                  onChange={(event) =>
                    patch({ paymentMode: event.target.value })
                  }
                >
                  <option>Bank Transfer</option>
                  <option>Cash</option>
                  <option>Cheque</option>
                  <option>Other</option>
                </Select>
              </Field>
              <Field label="Paid Through">
                <Select
                  value={draft.account}
                  onChange={(event) => patch({ account: event.target.value })}
                >
                  <option>Operating Account</option>
                  <option>Petty Cash</option>
                </Select>
              </Field>
            </>
          )}
          {isCredit && (
            <>
              <Field label="Credit Reason">
                <Select
                  value={draft.creditReason}
                  onChange={(event) =>
                    patch({ creditReason: event.target.value })
                  }
                >
                  <option value="">Select a reason</option>
                  <option>Returned goods</option>
                  <option>Pricing adjustment</option>
                  <option>Overpayment</option>
                  <option>Other</option>
                </Select>
              </Field>
              <Field
                label="Apply to Bill (optional)"
                error={errors.applyToBill}
              >
                <Select
                  value={draft.applyToBill}
                  onChange={(event) =>
                    patch({ applyToBill: event.target.value })
                  }
                >
                  <option value="">Leave credit unapplied</option>
                  {records
                    .filter(
                      (record) =>
                        record.kind === "bills" &&
                        record.party === draft.party &&
                        billBalance(records, record, id) > 0,
                    )
                    .map((record) => (
                      <option key={record.id} value={record.id}>
                        {record.id} · {money(record.amount)}
                      </option>
                    ))}
                </Select>
                {creditBill && (
                  <span className="mt-2 block text-xs text-slate-400">
                    Available balance: {money(creditBillBalance)}
                  </span>
                )}
              </Field>
            </>
          )}
        </div>
        {!isPayment && (
          <>
            {!isRequest && !isReceive && (
              <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 pt-5">
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <Switch
                    checked={draft.inclusive}
                    onChange={(event) =>
                      patch({ inclusive: event.target.checked })
                    }
                    aria-label="Prices include tax"
                  />
                  Tax inclusive
                </label>
                <div className="w-44">
                  <Select
                    aria-label="Transaction tax rate"
                    value={draft.tax}
                    onChange={(event) =>
                      patch({ tax: Number(event.target.value) })
                    }
                  >
                    <option value="0">No Tax</option>
                    <option value="16">VAT · 16% (demo)</option>
                  </Select>
                </div>
              </div>
            )}
            <LineEditor
              lines={draft.lines}
              onChange={(lines) => patch({ lines })}
              receiving={isReceive}
              request={isRequest}
            />
            {errors.lines && (
              <p role="alert" className="text-sm text-red-600">
                {errors.lines}
              </p>
            )}
            {!isReceive && (
              <div className="ml-auto max-w-md space-y-3 rounded-md bg-[#f8f9fc] p-5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Sub Total</span>
                  <span>{money(totals.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <label htmlFor="discount" className="text-slate-500">
                    Discount (%)
                  </label>
                  <input
                    id="discount"
                    className="w-20 rounded border border-slate-200 px-2 py-1 text-right"
                    type="number"
                    min="0"
                    max="100"
                    value={draft.discount}
                    onChange={(event) =>
                      patch({
                        discount: Math.min(
                          100,
                          Math.max(0, Number(event.target.value)),
                        ),
                      })
                    }
                  />
                  <span>{money(totals.discountAmount)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Tax {draft.inclusive && "(included)"}</span>
                  <span>{money(totals.tax)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-semibold">
                  <span>{isCredit ? "Credit Total (ZMW)" : "Total (ZMW)"}</span>
                  <span>{money(totals.total)}</span>
                </div>
              </div>
            )}
          </>
        )}
        <div className="grid gap-6 border-t border-slate-100 pt-6 sm:grid-cols-2">
          {!isRequest && (
            <Field label={isReceive ? "Receiving Notes" : "Notes"}>
              <Textarea
                value={draft.notes}
                onChange={(event) => patch({ notes: event.target.value })}
                placeholder="Optional notes for this local record."
              />
            </Field>
          )}
          {!isReceive && !isRequest && !isPayment && !isCredit && (
            <Field label="Terms and Conditions">
              <Textarea
                value={draft.terms}
                onChange={(event) => patch({ terms: event.target.value })}
                placeholder="Enter the terms and conditions."
              />
            </Field>
          )}
          <div className="sm:col-span-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 px-4 py-3 text-xs text-slate-500">
              <Paperclip size={16} />
              Attach Files (local filenames only)
              <input
                aria-label="Attach transaction files"
                type="file"
                multiple
                className="sr-only"
                onChange={(event) =>
                  patch({
                    files: [
                      ...draft.files,
                      ...Array.from(event.target.files || []).map(
                        (file) => file.name,
                      ),
                    ],
                  })
                }
              />
            </label>
            {draft.files.map((file, index) => (
              <div
                className="mt-2 flex max-w-lg items-center justify-between gap-3 rounded bg-slate-50 px-3 py-2 text-xs"
                key={`${file}-${index}`}
              >
                <span className="truncate">{file}</span>
                <button
                  aria-label={`Remove ${file}`}
                  onClick={() =>
                    patch({ files: draft.files.filter((_, i) => i !== index) })
                  }
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <footer className="sticky bottom-10 z-10 flex flex-wrap items-center gap-2 border-y border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-8">
        <Button variant="secondary" onClick={() => save(false)}>
          <Save size={14} />
          Save as Draft
        </Button>
        <Button onClick={() => save(true)}>
          {kind === "purchase-orders" ? <Send size={14} /> : <Save size={14} />}{" "}
          {isRequest
            ? "Submit for Approval"
            : isReceive
              ? "Record Receive"
              : isPayment
                ? "Record Payment"
                : isCredit
                  ? "Save Credit"
                  : isRecurring
                    ? "Save Schedule"
                    : kind === "purchase-orders"
                      ? "Save and Send"
                      : "Save"}{" "}
          (demo)
        </Button>
        <Button variant="ghost" onClick={cancelEditor}>
          Cancel
        </Button>
        <span className="ml-auto hidden text-[10px] text-slate-400 lg:block">
          Canonical {kind}.editor · Reference{" "}
          {config.editorReference.slice(0, 2)}
        </span>
      </footer>
      {cancel && (
        <Modal
          title="Discard unsaved changes?"
          onClose={() => setCancel(false)}
        >
          <p className="text-sm text-slate-500">
            You have changed this local draft. Do you want to leave without
            saving?
          </p>
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" onClick={() => setCancel(false)}>
              Keep editing
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                try {
                  localStorage.removeItem(`procureui.${key}`);
                } catch {
                  /* optional */
                }
                navigate(backTo);
              }}
            >
              Discard and leave
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
