import { useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  ChevronRight,
  Download,
  FileText,
  Filter,
  Inbox,
  Paperclip,
  Plus,
  Upload,
  WalletCards,
} from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Panel,
  Select,
} from "../components/ui";
import { billBalance } from "../lib/payables";
import { money, today, useApp, useStoredState } from "../lib/store";

type Budget = {
  id: string;
  name: string;
  owner: string;
  period: string;
  limit: number;
  spent: number;
  status: string;
  created: string;
};
type InboxFile = {
  id: string;
  filename: string;
  size: number;
  uploaded: string;
  status: string;
};

const initialBudgets: Budget[] = [
  {
    id: "BUD-001",
    name: "Q1 Office Operations",
    owner: "Finance",
    period: "Jan–Mar 2026",
    limit: 45000,
    spent: 12400,
    status: "Active",
    created: today(),
  },
  {
    id: "BUD-002",
    name: "Technology Refresh",
    owner: "IT",
    period: "Jan–Jun 2026",
    limit: 85000,
    spent: 31800,
    status: "Active",
    created: today(),
  },
];
function csvDownload(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) =>
      row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","),
    )
    .join("\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function Stat({
  label,
  value,
  tone = "blue",
}: {
  label: string;
  value: string;
  tone?: "blue" | "amber" | "green";
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${tone === "green" ? "border-emerald-100 bg-emerald-50/60" : tone === "amber" ? "border-amber-100 bg-amber-50/60" : "border-blue-100 bg-blue-50/60"}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export function Budgets() {
  const [budgets, setBudgets] = useStoredState<Budget[]>(
    "budgets.v1",
    initialBudgets,
  );
  const { records, notify } = useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [inspect, setInspect] = useState<Budget | null>(null);
  const [form, setForm] = useState({
    name: "",
    owner: "Finance",
    period: "Jan–Mar 2026",
    limit: "",
  });
  const totalLimit = budgets.reduce((sum, budget) => sum + budget.limit, 0);
  const totalSpent = budgets.reduce((sum, budget) => sum + budget.spent, 0);
  const createBudget = (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.limit || Number(form.limit) <= 0) {
      notify("Enter a budget name and a positive limit.");
      return;
    }
    const budget: Budget = {
      id: `BUD-${String(Date.now()).slice(-6)}`,
      name: form.name.trim(),
      owner: form.owner,
      period: form.period,
      limit: Number(form.limit),
      spent: 0,
      status: "Active",
      created: today(),
    };
    setBudgets((previous) => [budget, ...previous]);
    setCreateOpen(false);
    setForm({ name: "", owner: "Finance", period: "Jan–Mar 2026", limit: "" });
    notify("Budget created locally.");
  };
  const openBillBalance = records
    .filter((record) => record.kind === "bills")
    .reduce((sum, bill) => sum + billBalance(records, bill), 0);
  return (
    <div>
      <PageHeader
        title="Budgets"
        subtitle="Plan spend and compare your local records against approved limits."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> New budget
          </Button>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Total allocated" value={money(totalLimit)} />
        <Stat label="Budgeted spend" value={money(totalSpent)} tone="amber" />
        <Stat
          label="Open bill balance"
          value={money(openBillBalance)}
          tone="green"
        />
      </div>
      <Panel
        title="Budget register"
        action={
          <span className="text-xs text-slate-400">Browser-only workspace</span>
        }
      >
        {budgets.length === 0 ? (
          <EmptyState
            title="No budgets yet"
            description="Create a budget to start tracking planned spend."
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus size={15} /> Create budget
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="table-head">
                  <th className="table-cell text-left">Budget</th>
                  <th className="table-cell text-left">Owner</th>
                  <th className="table-cell text-left">Period</th>
                  <th className="table-cell text-right">Limit</th>
                  <th className="table-cell text-right">Spent</th>
                  <th className="table-cell text-left">Utilization</th>
                  <th className="table-cell text-left"> </th>
                </tr>
              </thead>
              <tbody>
                {budgets.map((budget) => {
                  const percent = Math.min(
                    100,
                    Math.round((budget.spent / budget.limit) * 100),
                  );
                  return (
                    <tr key={budget.id} className="hover:bg-blue-50/30">
                      <td className="table-cell">
                        <button
                          onClick={() => setInspect(budget)}
                          className="text-left font-medium text-blue-600 hover:text-blue-700"
                        >
                          {budget.name}
                        </button>
                        <div className="text-[11px] text-slate-400">
                          {budget.id}
                        </div>
                      </td>
                      <td className="table-cell">{budget.owner}</td>
                      <td className="table-cell">{budget.period}</td>
                      <td className="table-cell text-right font-medium">
                        {money(budget.limit)}
                      </td>
                      <td className="table-cell text-right">
                        {money(budget.spent)}
                      </td>
                      <td className="table-cell">
                        <div className="flex min-w-32 items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-slate-100">
                            <div
                              className={`h-2 rounded-full ${percent > 90 ? "bg-red-500" : "bg-blue-500"}`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-500">
                            {percent}%
                          </span>
                        </div>
                      </td>
                      <td className="table-cell">
                        <Button
                          variant="ghost"
                          onClick={() => setInspect(budget)}
                        >
                          Inspect <ChevronRight size={14} />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {createOpen && (
        <Modal title="Create budget" onClose={() => setCreateOpen(false)}>
          <form onSubmit={createBudget} className="space-y-4">
            <Field label="Budget name *">
              <Input
                autoFocus
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="e.g. Q2 Facilities"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Owner">
                <Select
                  value={form.owner}
                  onChange={(event) =>
                    setForm({ ...form, owner: event.target.value })
                  }
                >
                  <option>Finance</option>
                  <option>IT</option>
                  <option>Operations</option>
                  <option>Procurement</option>
                </Select>
              </Field>
              <Field label="Period">
                <Select
                  value={form.period}
                  onChange={(event) =>
                    setForm({ ...form, period: event.target.value })
                  }
                >
                  <option>Jan–Mar 2026</option>
                  <option>Apr–Jun 2026</option>
                  <option>Jul–Sep 2026</option>
                  <option>Oct–Dec 2026</option>
                </Select>
              </Field>
            </div>
            <Field label="Approved limit *">
              <Input
                type="number"
                min="1"
                step="0.01"
                value={form.limit}
                onChange={(event) =>
                  setForm({ ...form, limit: event.target.value })
                }
                placeholder="0.00"
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Create budget</Button>
            </div>
          </form>
        </Modal>
      )}
      {inspect && (
        <Modal title={inspect.name} onClose={() => setInspect(null)}>
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Limit" value={money(inspect.limit)} />
              <Stat label="Spent" value={money(inspect.spent)} tone="amber" />
            </div>
            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-slate-500">Utilization</span>
                <strong>
                  {Math.round((inspect.spent / inspect.limit) * 100)}%
                </strong>
              </div>
              <div className="h-3 rounded-full bg-slate-100">
                <div
                  className="h-3 rounded-full bg-blue-500"
                  style={{
                    width: `${Math.min(100, (inspect.spent / inspect.limit) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-400">Owner</dt>
                <dd className="mt-1 font-medium">{inspect.owner}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Period</dt>
                <dd className="mt-1 font-medium">{inspect.period}</dd>
              </div>
            </dl>
            <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
              Budget planning is simulated locally; no approvals or financial
              transactions are sent.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function Analytics() {
  const { records } = useApp();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const reportRows = useMemo(
    () =>
      records
        .filter(
          (record) => record.kind !== "items" && record.kind !== "vendors",
        )
        .filter((record) => category === "all" || record.kind === category)
        .filter((record) => status === "all" || record.status === status)
        .filter((record) =>
          `${record.title} ${record.party} ${record.id}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        ),
    [records, category, status, query],
  );
  const categories = [
    ...new Set(
      records
        .filter(
          (record) => record.kind !== "items" && record.kind !== "vendors",
        )
        .map((record) => record.kind),
    ),
  ];
  const statuses = [...new Set(reportRows.map((record) => record.status))];
  const total = reportRows.reduce((sum, record) => sum + record.amount, 0);
  const exportRows = [
    ["Record ID", "Report", "Category", "Party", "Date", "Amount", "Status"],
    ...reportRows.map((record) => [
      record.id,
      record.title,
      record.kind,
      record.party,
      record.date,
      String(record.amount),
      record.status,
    ]),
  ];
  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Reports center built from the records saved in this browser."
        actions={
          <Button
            variant="secondary"
            onClick={() => csvDownload("procureui-analytics.csv", exportRows)}
          >
            <Download size={15} /> Export CSV
          </Button>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Matching records" value={String(reportRows.length)} />
        <Stat label="Record value" value={money(total)} tone="green" />
        <Stat
          label="Report categories"
          value={String(categories.length)}
          tone="amber"
        />
      </div>
      <Panel
        title="All reports"
        action={
          <span className="text-xs text-slate-400">
            {reportRows.length} rows
          </span>
        }
      >
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Filter
              className="pointer-events-none absolute left-3 top-2.5 text-slate-400"
              size={15}
            />
            <Input
              className="pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search reports, parties, IDs..."
            />
          </div>
          <Select
            className="sm:w-44"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">All categories</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("-", " ")}
              </option>
            ))}
          </Select>
          <Select
            className="sm:w-40"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">All statuses</option>
            {statuses.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </div>
        {reportRows.length === 0 ? (
          <EmptyState
            title="No report rows match"
            description="Change the filters or create a local procurement record."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="table-head">
                  <th className="table-cell text-left">Report name</th>
                  <th className="table-cell text-left">Report category</th>
                  <th className="table-cell text-left">Party</th>
                  <th className="table-cell text-left">Date</th>
                  <th className="table-cell text-right">Amount</th>
                  <th className="table-cell text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.map((record) => (
                  <tr key={record.id} className="hover:bg-blue-50/30">
                    <td className="table-cell">
                      <span className="font-medium text-blue-600">
                        {record.title}
                      </span>
                      <div className="text-[11px] text-slate-400">
                        {record.id}
                      </div>
                    </td>
                    <td className="table-cell capitalize">
                      {record.kind.replaceAll("-", " ")}
                    </td>
                    <td className="table-cell">{record.party}</td>
                    <td className="table-cell">{record.date}</td>
                    <td className="table-cell text-right font-medium">
                      {money(record.amount)}
                    </td>
                    <td className="table-cell">
                      <Badge>{record.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

export function PayablesInbox() {
  const [files, setFiles] = useStoredState<InboxFile[]>(
    "payables.inbox.v1",
    [],
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const addFile = (file?: File) => {
    if (!file) return;
    const entry: InboxFile = {
      id: `INBOX-${String(Date.now()).slice(-6)}`,
      filename: file.name,
      size: file.size,
      uploaded: today(),
      status: "Ready to review",
    };
    setFiles((previous) => [entry, ...previous]);
  };
  return (
    <div>
      <PageHeader
        title="Payables inbox"
        subtitle="Drop vendor bill files here, then convert them into local bill drafts."
        actions={
          <Button onClick={() => inputRef.current?.click()}>
            <Upload size={15} /> Upload bill
          </Button>
        }
      />
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.csv"
        className="hidden"
        onChange={(event) => {
          addFile(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <Panel className="mb-5">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFile(event.dataTransfer.files[0]);
          }}
          className={`m-4 flex min-h-64 flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 text-center transition ${dragging ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50/40"}`}
        >
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <Inbox size={26} />
          </span>
          <h2 className="font-semibold text-slate-800">Upload bills</h2>
          <p className="mt-2 max-w-md text-sm text-slate-500">
            Drag and drop PDF or image files, or click upload to add invoice
            metadata to this local inbox.
          </p>
          <Button className="mt-5" onClick={() => inputRef.current?.click()}>
            <Paperclip size={15} /> Choose file
          </Button>
        </div>
      </Panel>
      <Panel
        title="Inbox files"
        action={
          <span className="text-xs text-slate-400">{files.length} files</span>
        }
      >
        {files.length === 0 ? (
          <EmptyState
            title="Your inbox is clear"
            description="Uploaded bill filenames and metadata will appear here."
            action={
              <Button onClick={() => inputRef.current?.click()}>
                <Upload size={15} /> Upload a bill
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-slate-100 p-2 text-slate-500">
                    <FileText size={18} />
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">
                      {file.filename}
                    </p>
                    <p className="text-xs text-slate-400">
                      {Math.max(1, Math.round(file.size / 1024))} KB · Uploaded{" "}
                      {file.uploaded} · <Badge>{file.status}</Badge>
                    </p>
                  </div>
                </div>
                <Link
                  to={`/bills/new?inbox=${encodeURIComponent(file.id)}&filename=${encodeURIComponent(file.filename)}&size=${file.size}`}
                >
                  <Button variant="secondary">
                    Create bill draft <ChevronRight size={14} />
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <p className="mt-4 text-xs text-slate-400">
        Service note: this prototype stores filename metadata only. It does not
        OCR, email, upload to ERP, or send bills.
      </p>
    </div>
  );
}
