import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ShoppingBag,
  FileText,
  Package,
  Store,
  Info,
  ArrowUpRight,
  ChevronRight,
  CalendarDays,
} from "lucide-react";
import { useApp, money } from "../lib/store";
import { Panel, Select, Badge } from "../components/ui";

export function Dashboard() {
  const { records } = useApp();
  const [period, setPeriod] = useState("This Year");
  const pending = records.filter(
    (record) =>
      record.kind === "requests" && record.status === "Pending Approval",
  );
  const purchaseOrders = records.filter(
    (record) => record.kind === "purchase-orders",
  );
  const bills = records.filter((record) => record.kind === "bills");
  const paid = records
    .filter((record) => record.kind === "payments")
    .reduce((sum, record) => sum + record.amount, 0);
  const poSpend = purchaseOrders.reduce(
    (sum, record) => sum + record.amount,
    0,
  );
  const billSpend = bills.reduce((sum, record) => sum + record.amount, 0);
  const factor =
    period === "This Month" ? 0.28 : period === "This Quarter" ? 0.65 : 1;
  const monthly = [
    0.08, 0.13, 0.1, 0.22, 0.17, 0.28, 0.19, 0.43, 0.38, 0.66, 0.58, 0.9,
  ].map((value) => value * (poSpend + billSpend) * factor);
  const max = Math.max(...monthly, 1);
  const points = monthly
    .map((value, index) => `${45 + index * 53},${160 - (value / max) * 130}`)
    .join(" ");
  return (
    <div>
      <div className="border-b border-slate-200 px-5 pt-7 sm:px-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400">
                <ShoppingBag size={20} />
              </span>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  Hello, Alex
                </h1>
                <p className="mt-1 text-xs text-slate-400">
                  Meridian Procurement Demo · Your workspace at a glance
                </p>
              </div>
            </div>
          </div>
          <Link
            to="/requests/new"
            className="hidden items-center gap-2 text-xs font-medium text-blue-500 sm:flex"
          >
            Create a purchase request <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="mt-6 flex gap-7 text-sm">
          <span className="border-b-2 border-blue-500 pb-3 font-medium text-slate-800">
            Dashboard
          </span>
          <Link to="/requests" className="pb-3 text-slate-500">
            My Requests
          </Link>
        </div>
      </div>
      <div className="px-5 py-6 sm:px-8">
        <div className="mb-5 flex items-center gap-3">
          <CalendarDays size={15} className="text-slate-400" />
          <span className="text-xs text-slate-500">Date Range:</span>
          <div className="w-36">
            <Select
              aria-label="Dashboard date range"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
            >
              <option>This Year</option>
              <option>This Quarter</option>
              <option>This Month</option>
            </Select>
          </div>
          <span className="ml-auto hidden text-[10px] text-slate-400 sm:block">
            Illustrative trend · Live demo totals
          </span>
        </div>
        <div className="flex flex-col gap-5 xl:flex-row">
          <Panel title="Spend Summary" className="min-w-0 flex-1">
            <div className="flex flex-wrap justify-between gap-4 px-5 pt-5">
              <div>
                <p className="text-xs text-slate-400">Total committed spend</p>
                <p className="mt-1.5 text-2xl font-semibold tracking-tight">
                  {money((poSpend + billSpend) * factor)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">PO Spend</p>
                <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
                  <span className="h-2 w-2 rounded-sm bg-blue-400" />
                  {money(poSpend * factor)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Non-PO Spend</p>
                <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
                  <span className="h-2 w-2 rounded-sm bg-amber-300" />
                  {money(billSpend * factor)}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto px-3 pb-4 pt-4">
              <svg
                viewBox="0 0 680 205"
                className="h-[220px] w-full min-w-[420px]"
                role="img"
                aria-label="Illustrative monthly spend trend, not production data"
              >
                <defs>
                  <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3987f6" stopOpacity=".16" />
                    <stop offset="100%" stopColor="#3987f6" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[30, 73, 116, 160].map((y, index) => (
                  <g key={y}>
                    <line
                      x1="45"
                      x2="650"
                      y1={y}
                      y2={y}
                      stroke="#edf0f5"
                      strokeDasharray="3 4"
                    />
                    <text
                      x="32"
                      y={y + 4}
                      textAnchor="end"
                      fill="#9ca6b6"
                      fontSize="10"
                    >
                      {Math.round((max * (3 - index)) / 3 / 1000)}K
                    </text>
                  </g>
                ))}
                <polygon
                  points={`45,160 ${points} 628,160`}
                  fill="url(#chart-fill)"
                />
                <polyline
                  points={points}
                  fill="none"
                  stroke="#3987f6"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {monthly.map((value, index) => (
                  <circle
                    key={index}
                    cx={45 + index * 53}
                    cy={160 - (value / max) * 130}
                    r="3"
                    fill="white"
                    stroke="#3987f6"
                    strokeWidth="2"
                  />
                ))}
                {[
                  "Jan",
                  "Feb",
                  "Mar",
                  "Apr",
                  "May",
                  "Jun",
                  "Jul",
                  "Aug",
                  "Sep",
                  "Oct",
                  "Nov",
                  "Dec",
                ].map((month, index) => (
                  <text
                    key={month}
                    x={45 + index * 53}
                    y="185"
                    textAnchor="middle"
                    fontSize="10"
                    fill="#8d97a7"
                  >
                    {month}
                  </text>
                ))}
              </svg>
            </div>
          </Panel>
          <Panel title="Attention Required" className="xl:w-[31%]">
            <div className="p-5">
              {pending.length ? (
                <>
                  <div className="mb-5 flex items-center gap-3 rounded-lg border border-amber-100 bg-amber-50/50 p-4">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                      <Info size={18} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">
                        {pending.length} pending approval
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Requests need your attention
                      </p>
                    </div>
                  </div>
                  {pending.map((record) => (
                    <Link
                      to="/approvals"
                      key={record.id}
                      className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-4"
                    >
                      <div>
                        <span className="text-[11px] text-blue-500">
                          {record.id}
                        </span>
                        <p className="mt-1 text-sm text-slate-600">
                          {record.title}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {money(record.amount)}
                        </p>
                      </div>
                      <ChevronRight
                        size={16}
                        className="shrink-0 text-slate-300"
                      />
                    </Link>
                  ))}
                  <Link
                    to="/approvals"
                    className="text-xs font-medium text-blue-500"
                  >
                    View all approvals →
                  </Link>
                </>
              ) : (
                <p className="py-16 text-center text-sm text-slate-400">
                  No attention required.
                </p>
              )}
            </div>
          </Panel>
        </div>
        <div className="my-5 grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-5">
          {[
            {
              label: "Orders Issued",
              value: purchaseOrders.length,
              icon: FileText,
              to: "/purchase-orders",
            },
            {
              label: "Bills Processed",
              value: bills.length,
              icon: ShoppingBag,
              to: "/bills",
            },
            {
              label: "Catalog Items",
              value: records.filter((record) => record.kind === "items").length,
              icon: Package,
              to: "/items",
            },
            {
              label: "Active Vendors",
              value: records.filter((record) => record.kind === "vendors")
                .length,
              icon: Store,
              to: "/vendors",
            },
          ].map((stat) => (
            <Link
              key={stat.label}
              to={stat.to}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-blue-200 sm:p-5"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#e0e5f2] bg-[#f4f6fd] text-blue-400">
                <stat.icon size={20} />
              </span>
              <div>
                <p className="text-xs text-slate-400">{stat.label}</p>
                <p className="mt-1 text-xl font-semibold">{stat.value}</p>
              </div>
            </Link>
          ))}
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <Panel
            title="Payables Summary"
            action={
              <Link to="/bills" className="text-xs text-blue-500">
                View bills →
              </Link>
            }
          >
            <div className="flex justify-between gap-3 p-5">
              <div>
                <p className="text-xs text-slate-400">Outstanding bills</p>
                <p className="mt-2 text-xl font-semibold">
                  {money(
                    bills
                      .filter((record) => record.status !== "Paid")
                      .reduce((sum, record) => sum + record.amount, 0),
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Recorded payments</p>
                <p className="mt-2 text-xl font-semibold">{money(paid)}</p>
              </div>
            </div>
            <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
              Local demo records. Amounts do not represent a real account.
            </p>
          </Panel>
          <Panel title="Recent Activity">
            <div className="divide-y divide-slate-100">
              {records
                .filter((record) => !["items", "vendors"].includes(record.kind))
                .slice(0, 3)
                .map((record) => (
                  <Link
                    key={record.id}
                    to={`/${record.kind}/${record.id}/edit`}
                    className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50"
                  >
                    <div>
                      <p className="text-sm text-slate-600">{record.title}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {record.id} · {record.party}
                      </p>
                    </div>
                    <Badge>{record.status}</Badge>
                  </Link>
                ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
