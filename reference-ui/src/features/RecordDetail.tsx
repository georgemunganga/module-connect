import { useState, type FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import {
  ActivityTimeline,
  DeleteConfirm,
  DetailSection,
  DetailTabs,
  DetailValue,
} from "../components/data/DetailPrimitives";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  Textarea,
} from "../components/ui";
import { modules, type ModuleKey } from "../data/modules";
import { billBalance } from "../lib/payables";
import { money, today, useApp, type AppRecord } from "../lib/store";

function parseJson<T>(raw: string | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function dateLabel(value?: string) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
}
function statusTone(status: string) {
  return /approved|paid|received|active|completed|closed|credited/i.test(status)
    ? "success"
    : /rejected|cancelled|overdue/i.test(status)
      ? "danger"
      : "neutral";
}
function recordLabel(kind: string) {
  return (
    modules[kind as ModuleKey]?.singular ??
    (kind === "batch-payments"
      ? "Batch Payment"
      : kind === "rfqs"
        ? "Request for Quote"
        : kind)
  );
}
function recordPath(kind: string) {
  return kind === "batch-payments" ? "/batch-payments" : `/${kind}`;
}
function editPath(kind: string, id: string) {
  return kind === "rfqs"
    ? `/rfqs/${id}/edit`
    : kind === "batch-payments"
      ? `/batch-payments/${id}/edit`
      : `/${kind}/${id}/edit`;
}
function isApproved(status: string) {
  return /^approved(?:\s|$)/i.test(status);
}
function safeMetaValue(key: string, value: string) {
  if (
    [
      "draft",
      "comments",
      "localMails",
      "bankAccounts",
      "contactPersons",
      "billingAddress",
      "shippingAddress",
      "reportingTags",
      "history",
      "activity",
      "billIds",
      "allocations",
      "source",
      "inboxId",
      "inboxFilename",
      "inboxSize",
      "vendorId",
    ].includes(key)
  )
    return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") return null;
  } catch {
    /* Display readable scalar metadata. */
  }
  return { key, value };
}

export function RecordDetail({ kind }: { kind: string }) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { records, updateRecord, deleteRecord, notify } = useApp();
  const record = records.find((item) => item.id === id && item.kind === kind);
  const [active, setActive] = useState("overview");
  const [menu, setMenu] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [comment, setComment] = useState("");
  const entry = params.get("entry");
  const fromVendor = params.get("fromVendor") || "";
  const requestedVendorTab = params.get("vendorTab") || "transactions";
  const vendorTab = [
    "overview",
    "comments",
    "transactions",
    "mails",
    "statement",
  ].includes(requestedVendorTab)
    ? requestedVendorTab
    : "transactions";
  const vendorReturn = fromVendor
    ? `/vendors/${encodeURIComponent(fromVendor)}/${vendorTab}`
    : "";
  const listPath =
    vendorReturn ||
    (kind === "requests" && entry === "procurement"
      ? "/procurement-requests"
      : kind === "requests" && entry === "approvals"
        ? "/approvals"
        : recordPath(kind));
  const editContext = new URLSearchParams();
  if (entry) editContext.set("entry", entry);
  if (fromVendor) {
    editContext.set("fromVendor", fromVendor);
    editContext.set("vendorTab", vendorTab);
  }
  const editTo = `${editPath(kind, record?.id ?? id ?? "")}${editContext.size ? `?${editContext.toString()}` : ""}`;
  if (!record)
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8">
        <h1 className="text-xl font-semibold">{recordLabel(kind)} not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          This record ID is not available in the local demo workspace.
        </p>
        <Link to={listPath} className="mt-5 inline-flex text-sm text-blue-600">
          Return to {recordLabel(kind)} →
        </Link>
      </div>
    );
  const label = recordLabel(kind);
  const draft = parseJson<Record<string, unknown>>(record.meta?.draft, {});
  const comments = parseJson<{ id: string; text: string; date: string }[]>(
    record.meta?.comments,
    [],
  );
  const attachments = Array.isArray(draft.files)
    ? draft.files.filter((item): item is string => typeof item === "string")
    : [];
  const batchBillIds = (record.meta?.billIds ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const related = records.filter(
    (item) =>
      item.id !== record.id &&
      (item.meta?.source === record.id ||
        item.meta?.billId === record.id ||
        item.meta?.appliedBillId === record.id ||
        item.meta?.inboxId === record.id ||
        item.meta?.requestId === record.id ||
        item.meta?.sourceRequestId === record.id ||
        (kind === "batch-payments" && batchBillIds.includes(item.id))),
  );
  const tabs = [
    { key: "overview", label: "Overview" },
    ...(record.lines?.length
      ? [{ key: "items", label: `Items (${record.lines.length})` }]
      : []),
    { key: "related", label: `Related (${related.length})` },
    {
      key: "comments",
      label: `Comments${comments.length ? ` (${comments.length})` : ""}`,
    },
    { key: "history", label: "History" },
  ];
  const saveComment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!comment.trim()) return;
    const next = [
      ...comments,
      { id: crypto.randomUUID(), text: comment.trim(), date: today() },
    ];
    updateRecord(record.id, {
      meta: { ...record.meta, comments: JSON.stringify(next) },
    });
    setComment("");
    notify("Comment saved in this browser only.");
  };
  const changeStatus = (status: string) => {
    updateRecord(record.id, {
      status,
      meta: { ...record.meta, lastLocalAction: `${status} · ${today()}` },
    });
    notify(`${record.id} marked ${status.toLowerCase()} in the local demo.`);
  };
  const remove = () => {
    deleteRecord(record.id);
    setDeleteOpen(false);
    notify(
      `${record.id} removed from local demo data. Linked records remain unchanged.`,
    );
    navigate(listPath);
  };
  const nextPath =
    kind === "requests" && isApproved(record.status)
      ? `/purchase-orders/new?source=${record.id}`
      : kind === "purchase-orders"
        ? `/purchase-receives/new?source=${record.id}`
        : kind === "purchase-receives"
          ? `/bills/new?source=${record.id}`
          : kind === "bills"
            ? `/payments/new?source=${record.id}`
            : null;
  const contextualNextPath =
    nextPath && fromVendor
      ? `${nextPath}&fromVendor=${encodeURIComponent(fromVendor)}&vendorTab=${encodeURIComponent(vendorTab)}`
      : nextPath;
  const detailFields = [
    ["Date", dateLabel(record.date)],
    ["Party / Vendor", record.party],
    ["Status", record.status],
    ["Amount", money(record.amount)],
    ["Reference", record.meta?.reference ?? record.id],
    ["Due / expected date", record.meta?.dueDate ?? "—"],
    ["Payment terms", record.meta?.paymentTerms ?? "—"],
    ["Source record", record.meta?.source ?? "—"],
    ...(kind === "bills"
      ? ([["Balance due", money(billBalance(records, record))]] as [
          string,
          string,
        ][])
      : []),
    ...(kind === "payments"
      ? ([
          ["Payment mode", record.meta?.paymentMode ?? "—"],
          ["Paid through", record.meta?.account ?? "—"],
        ] as [string, string][])
      : []),
    ...(kind === "vendor-credits"
      ? ([
          ["Credit reason", record.meta?.creditReason ?? "—"],
          ["Applied to bill", record.meta?.appliedBillId ?? "Unapplied"],
        ] as [string, string][])
      : []),
    ...(kind === "recurring-bills"
      ? ([
          ["Frequency", record.meta?.frequency ?? "Monthly"],
          ["End date", record.meta?.endDate ?? "—"],
        ] as [string, string][])
      : []),
  ];
  const visibleMeta = Object.entries(record.meta ?? {}).flatMap(
    ([key, value]) => {
      const item = safeMetaValue(key, value);
      return item ? [item] : [];
    },
  );
  return (
    <div className="-mx-5 -mt-5 min-h-[calc(100dvh-5rem)] bg-[#f7f8fb] sm:-mx-8 sm:-mt-8">
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
        <div className="min-w-0">
          <Link
            to={listPath}
            className="mb-1 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600"
          >
            <ArrowLeft size={13} />
            {label}
            {entry === "procurement"
              ? " · Procurement"
              : entry === "approvals"
                ? " · Approvals"
                : ""}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold text-slate-900">
              {record.title}
            </h1>
            <Badge>{record.status}</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {record.id} · {label}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={editTo}>
            <Button variant="secondary">
              <Pencil size={14} /> Edit
            </Button>
          </Link>
          {kind === "requests" &&
            entry &&
            record.status === "Pending Approval" && (
              <>
                <Button onClick={() => changeStatus("Approved")}>
                  Approve (demo)
                </Button>
                <Button
                  variant="danger"
                  onClick={() => changeStatus("Rejected")}
                >
                  Reject (demo)
                </Button>
              </>
            )}
          {contextualNextPath && (
            <Link to={contextualNextPath}>
              <Button>
                <ArrowRight size={14} />
                {kind === "requests"
                  ? "Create purchase order"
                  : kind === "purchase-orders"
                    ? "Record receive"
                    : kind === "purchase-receives"
                      ? "Create bill"
                      : "Record payment"}{" "}
                (demo)
              </Button>
            </Link>
          )}
          <div className="relative">
            <Button
              variant="secondary"
              aria-expanded={menu}
              onClick={() => setMenu((v) => !v)}
            >
              <MoreHorizontal size={16} /> More
            </Button>
            {menu && (
              <div
                role="menu"
                className="absolute right-0 top-full z-30 mt-1 w-48 rounded-md border border-slate-200 bg-white p-1 shadow-lg"
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    setDeleteOpen(true);
                  }}
                  className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} /> Delete {label}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <DetailTabs tabs={tabs} active={active} onChange={setActive} />
      <div className="space-y-4 p-4 sm:p-6">
        {active === "overview" && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(270px,0.85fr)]">
            <DetailSection
              title={`${label} Overview`}
              action={<Badge>{record.status}</Badge>}
            >
              <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                {detailFields.map(([field, value]) => (
                  <DetailValue key={field} label={field} value={value} />
                ))}
              </dl>
              {record.meta?.notes && (
                <div className="mt-5 rounded-md bg-slate-50 p-3">
                  <h3 className="text-xs font-semibold text-slate-500">
                    Notes
                  </h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                    {record.meta.notes}
                  </p>
                </div>
              )}
              {visibleMeta.length > 0 && (
                <details className="mt-5 rounded-md border border-slate-100">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-500">
                    Additional record fields
                  </summary>
                  <dl className="grid gap-4 border-t border-slate-100 p-3 sm:grid-cols-2">
                    {visibleMeta.map((item) => (
                      <DetailValue
                        key={item.key}
                        label={item.key
                          .replace(/[A-Z]/g, (letter) => ` ${letter}`)
                          .replace(/^./, (letter) => letter.toUpperCase())}
                        value={item.value}
                      />
                    ))}
                  </dl>
                </details>
              )}
            </DetailSection>
            <div className="space-y-4">
              <DetailSection title="Record Activity">
                <ActivityTimeline
                  items={[
                    {
                      id: "created",
                      title: `${label} saved in this local demo`,
                      date: dateLabel(record.date),
                      detail: "No ERP record or external service was changed.",
                    },
                    ...(record.meta?.lastLocalAction
                      ? [
                          {
                            id: "last",
                            title: "Local status action",
                            detail: record.meta.lastLocalAction,
                            date: dateLabel(
                              record.meta.lastLocalAction.slice(-10),
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              </DetailSection>
              <DetailSection title="Workflow context">
                <div className="space-y-3 text-sm text-slate-600">
                  <p>
                    This is the canonical {label.toLowerCase()} detail screen.
                    Opened workflows reuse this record and its data rather than
                    creating a duplicate page.
                  </p>
                  {record.meta?.source && (
                    <p>
                      Source record:{" "}
                      <Link
                        to={linkForRecord(records, record.meta.source)}
                        className="text-blue-600"
                      >
                        {record.meta.source}
                      </Link>
                    </p>
                  )}
                  {attachments.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-semibold text-slate-500">
                        Attachments · names only
                      </p>
                      {attachments.map((file, index) => (
                        <p
                          key={`${file}-${index}`}
                          className="flex items-center gap-2 text-xs"
                        >
                          <FileText size={13} />
                          {file}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </DetailSection>
            </div>
          </div>
        )}
        {active === "items" && (
          <DetailSection title="Items / Line Details">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="table-head">
                  <tr>
                    {[
                      "Item",
                      "Account",
                      "Quantity",
                      "Rate",
                      "Unit",
                      "Amount",
                    ].map((label) => (
                      <th key={label} className="table-cell">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {record.lines?.map((line) => (
                    <tr key={line.id} className="border-b border-slate-100">
                      <td className="table-cell font-medium">
                        {line.name || "Unspecified item"}
                      </td>
                      <td className="table-cell">{line.account ?? "—"}</td>
                      <td className="table-cell">{line.quantity}</td>
                      <td className="table-cell">{money(line.rate)}</td>
                      <td className="table-cell">{line.unit}</td>
                      <td className="table-cell font-medium">
                        {money(line.quantity * line.rate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ml-auto mt-4 max-w-xs space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span>
                  {money(
                    record.lines?.reduce(
                      (sum, line) => sum + line.quantity * line.rate,
                      0,
                    ) ?? record.amount,
                  )}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold">
                <span>Total</span>
                <span>{money(record.amount)}</span>
              </div>
            </div>
          </DetailSection>
        )}
        {active === "related" && (
          <DetailSection title="Related Records">
            {related.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="table-head">
                    <tr>
                      {[
                        "Record",
                        "Type",
                        "Party",
                        "Date",
                        "Amount",
                        "Status",
                      ].map((label) => (
                        <th key={label} className="table-cell">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {related.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="table-cell">
                          <Link
                            to={linkForRecord(records, item.id)}
                            className="font-medium text-blue-600"
                          >
                            {item.id}
                          </Link>
                        </td>
                        <td className="table-cell">{recordLabel(item.kind)}</td>
                        <td className="table-cell">{item.party}</td>
                        <td className="table-cell">{dateLabel(item.date)}</td>
                        <td className="table-cell">{money(item.amount)}</td>
                        <td className="table-cell">
                          <Badge>{item.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No related records"
                description="Linked local requests, orders, bills, receives, credits and payments appear here when their source metadata matches."
              />
            )}
          </DetailSection>
        )}
        {active === "comments" && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <DetailSection title="Add Comment">
              <form onSubmit={saveComment} className="space-y-3">
                <Textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Add an internal comment to this demo record…"
                />
                <Button type="submit" disabled={!comment.trim()}>
                  <Plus size={14} /> Add Comment
                </Button>
                <p className="text-xs text-slate-400">
                  Local browser data only.
                </p>
              </form>
            </DetailSection>
            <DetailSection title="All Comments">
              {comments.length ? (
                [...comments].reverse().map((item) => (
                  <article
                    key={item.id}
                    className="border-b border-slate-100 py-3 last:border-0"
                  >
                    <p className="whitespace-pre-wrap text-sm text-slate-700">
                      {item.text}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Local demo user · {dateLabel(item.date)}
                    </p>
                  </article>
                ))
              ) : (
                <EmptyState
                  title="No comments yet"
                  description="The real service is not connected; comments you add here remain in the browser."
                />
              )}
            </DetailSection>
          </div>
        )}
        {active === "history" && (
          <DetailSection title="History">
            <ActivityTimeline
              items={[
                {
                  id: "created",
                  title: `${label} created`,
                  date: dateLabel(record.date),
                },
                ...(record.meta?.lastLocalAction
                  ? [
                      {
                        id: "action",
                        title: "Local workflow action",
                        detail: record.meta.lastLocalAction,
                        date: dateLabel(record.meta.lastLocalAction.slice(-10)),
                      },
                    ]
                  : []),
                ...comments.map((item) => ({
                  id: item.id,
                  title: "Comment added",
                  detail: item.text,
                  date: dateLabel(item.date),
                })),
              ]}
            />
          </DetailSection>
        )}
      </div>
      <DeleteConfirm
        open={deleteOpen}
        title={`Delete ${label.toLowerCase()}?`}
        description={`Delete ${record.id} from local demo data? Any linked records remain unchanged and nothing is deleted from ERP.`}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={remove}
      />
      <div className="sr-only">
        <Send />
        <Trash2 />
      </div>
    </div>
  );
}

function linkForRecord(records: AppRecord[], id: string) {
  const record = records.find((item) => item.id === id);
  if (!record) return "/";
  return record.kind === "items" || record.kind === "vendors"
    ? `/${record.kind}/${record.id}`
    : record.kind === "batch-payments"
      ? `/batch-payments/${record.id}`
      : `/${record.kind}/${record.id}`;
}
