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
import { Button, Panel, Select, Badge } from "../components/ui";

export type HomeMetric = { label: string; state: "ready" | "loading" | "error" | "unavailable"; count?: number; path: string };
export type HomeRow = { id: string; title: string; reference: string; status: string; path: string };
export type LiveDashboardData = {
  companyName: string; canCreateRequest: boolean; refresh: () => void;
  stats: HomeMetric[]; personal: HomeMetric[];
  attention: HomeMetric & { rows: HomeRow[] };
  recent: { state: HomeMetric["state"]; rows: HomeRow[] };
};
const metricMessage = (state: HomeMetric["state"]) => state === "loading" ? "Loading…"
  : state === "error" ? "Could not load. Refresh to try again."
  : state === "unavailable" ? "Unavailable for your access" : "Saved records you can access";

/** Original imported layout. Live data is supplied explicitly; demo records are never a live fallback. */
export function Dashboard({ live }: { live?: LiveDashboardData } = {}) {
  return live ? <DashboardLayout live={live} records={[]} /> : <DemoDashboard />;
}
function DemoDashboard() {
  const { records } = useApp();
  return <DashboardLayout records={records} />;
}
function DashboardLayout({ live, records }: { live?: LiveDashboardData; records: ReturnType<typeof useApp>["records"] }) {
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
      <div className="border-b border-border px-5 pt-7 sm:px-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
                <ShoppingBag size={20} />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {live ? "Welcome" : "Hello, Alex"}
                </h1>
                <p className="mt-1 text-xs text-muted-foreground">
                  {live ? `${live.companyName} · Your workspace at a glance` : "Meridian Procurement Demo · Your workspace at a glance"}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
          {live && <Button variant="secondary" onClick={live.refresh}>Refresh</Button>}
          {(!live || live.canCreateRequest) && <Link
            to="/requests/new"
            className="hidden items-center gap-2 text-xs font-medium text-primary sm:flex"
          >
            Create a purchase request <ArrowUpRight size={14} />
          </Link>}
          </div>
        </div>
        <div className="mt-6 flex gap-7 text-sm">
          <span className="border-b-2 border-primary pb-3 font-medium text-foreground">
            Dashboard
          </span>
          <Link to="/requests" className="pb-3 text-muted-foreground">
            My Requests
          </Link>
        </div>
      </div>
      <div className="px-5 py-6 sm:px-8">
        <div className="mb-5 flex items-center gap-3">
          <CalendarDays size={15} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Date Range:</span>
          <div className="w-36">
            <Select
              aria-label="Dashboard date range"
              value={period}
              disabled={Boolean(live)}
              title={live ? "Date filtering will be available with spend reporting." : undefined}
              onChange={(event) => setPeriod(event.target.value)}
            >
              <option>This Year</option>
              <option>This Quarter</option>
              <option>This Month</option>
            </Select>
          </div>
          <span className="ml-auto hidden text-[10px] text-muted-foreground sm:block">
            {live ? "Record counts cover all dates" : "Illustrative trend · Live demo totals"}
          </span>
        </div>
        <div className="flex flex-col gap-5 xl:flex-row">
          <Panel title="Spend Summary" className="min-w-0 flex-1">
            <div className="flex flex-wrap justify-between gap-4 px-5 pt-5">
              <div>
                <p className="text-xs text-muted-foreground">Total committed spend</p>
                <p className="mt-1.5 text-2xl font-semibold tracking-tight">
                  {live ? "—" : money((poSpend + billSpend) * factor)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">PO Spend</p>
                <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
                  <span className="h-2 w-2 rounded-sm bg-blue-400" />
                  {live ? "—" : money(poSpend * factor)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Non-PO Spend</p>
                <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
                  <span className="h-2 w-2 rounded-sm bg-amber-300" />
                  {live ? "—" : money(billSpend * factor)}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto px-3 pb-4 pt-4">
              {live ? <div className="flex h-[220px] flex-col items-center justify-center gap-3 rounded-lg bg-muted/30 px-5 text-center" role="status">
                <ShoppingBag size={28} className="text-muted-foreground" />
                <p className="text-sm font-medium">Your spending overview will appear here</p>
                <p className="max-w-sm text-sm text-muted-foreground">Spend reporting is not connected yet. You can still manage your purchasing records below.</p>
              </div> : <svg
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
              </svg>}
            </div>
          </Panel>
          <Panel title="Attention Required" className="xl:w-[31%]">
            <div className="p-5">
              {live ? <>
                <p className="mb-4 text-sm text-muted-foreground" role={live.attention.state === "error" ? "alert" : "status"}>
                  {live.attention.state === "ready" ? `${live.attention.count} requests waiting for your decision` : live.attention.state === "unavailable" ? "Approval updates will appear here when available." : metricMessage(live.attention.state)}
                </p>
                {live.attention.rows.map(row => <Link key={row.id} to={row.path} className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-4">
                  <div className="min-w-0"><span className="text-xs text-primary">{row.reference}</span><p className="mt-1 break-words text-sm">{row.title}</p></div><ChevronRight size={16} className="shrink-0 text-muted-foreground" />
                </Link>)}
                {live.attention.state === "ready" && <Link to="/approvals" className="text-sm font-medium text-primary">View all approvals →</Link>}
              </> : pending.length ? (
                <>
                  <div className="mb-5 flex items-center gap-3 rounded-lg border border-amber-100 bg-amber-50/50 p-4">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                      <Info size={18} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">
                        {pending.length} pending approval
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Requests need your attention
                      </p>
                    </div>
                  </div>
                  {pending.map((record) => (
                    <Link
                      to="/approvals"
                      key={record.id}
                      className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-4"
                    >
                      <div>
                        <span className="text-[11px] text-primary">
                          {record.id}
                        </span>
                        <p className="mt-1 text-sm text-foreground">
                          {record.title}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
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
                    className="text-xs font-medium text-primary"
                  >
                    View all approvals →
                  </Link>
                </>
              ) : (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  No attention required.
                </p>
              )}
            </div>
          </Panel>
        </div>
        <div className="my-5 grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-5">
          {(live ? live.stats.map((stat, index) => ({ ...stat, value: stat.state === "ready" ? stat.count : "—", icon: [FileText, ShoppingBag, Package, Store][index], to: stat.path })) : [
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
          ]).map((stat) => (
            <Link
              key={stat.label}
              to={stat.to}
              onClick={event => { if (live && live.stats.find(item => item.label === stat.label)?.state !== "ready") event.preventDefault(); }}
              aria-disabled={live && live.stats.find(item => item.label === stat.label)?.state !== "ready" || undefined}
              tabIndex={live && live.stats.find(item => item.label === stat.label)?.state !== "ready" ? -1 : undefined}
              aria-label={live ? `${stat.label}: ${live.stats.find(item => item.label === stat.label)?.state === "ready" ? stat.value : live.stats.find(item => item.label === stat.label)?.state}` : undefined}
              className="flex min-w-0 flex-col items-start gap-3 rounded-lg sm:flex-row sm:items-center border border-border bg-card p-4 transition-colors hover:border-blue-200 sm:p-5"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/5 text-primary">
                <stat.icon size={20} />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="mt-1 text-xl font-semibold">{stat.value}</p>
                {live && <p className="mt-1 text-xs text-muted-foreground">{metricMessage(live.stats.find(item => item.label === stat.label)!.state)}</p>}
              </div>
            </Link>
          ))}
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <Panel
            title="Payables Summary"
            action={
              <Link to="/bills" className="text-xs text-primary">
                View bills →
              </Link>
            }
          >
            <div className="flex justify-between gap-3 p-5">
              <div>
                <p className="text-xs text-muted-foreground">Outstanding bills</p>
                <p className="mt-2 text-xl font-semibold">
                  {live ? "—" : money(
                    bills
                      .filter((record) => record.status !== "Paid")
                      .reduce((sum, record) => sum + record.amount, 0),
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Recorded payments</p>
                <p className="mt-2 text-xl font-semibold">{live ? "—" : money(paid)}</p>
              </div>
            </div>
            <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
              {live ? "Payment and outstanding-balance updates are not connected yet." : "Local demo records. Amounts do not represent a real account."}
            </p>
          </Panel>
          <Panel title="Recent Activity">
            <div className="divide-y divide-slate-100">
              {live ? <>
                <p className="px-5 py-3 text-xs text-muted-foreground">Saved purchase requests from the current page.</p>
                {live.recent.rows.map(row => <Link key={row.id} to={row.path} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-muted/50">
                  <div className="min-w-0"><p className="break-words text-sm">{row.title}</p><p className="mt-1 text-xs text-muted-foreground">{row.reference}</p></div><Badge>{row.status}</Badge>
                </Link>)}
                {!live.recent.rows.length && <p className="px-5 py-10 text-center text-sm text-muted-foreground" role={live.recent.state === "error" ? "alert" : "status"}>{live.recent.state === "ready" ? "No purchase requests to show yet." : metricMessage(live.recent.state)}</p>}
              </> : records
                .filter((record) => !["items", "vendors"].includes(record.kind))
                .slice(0, 3)
                .map((record) => (
                  <Link
                    key={record.id}
                    to={`/${record.kind}/${record.id}/edit`}
                    className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-muted/50"
                  >
                    <div>
                      <p className="text-sm text-foreground">{record.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {record.id} · {record.party}
                      </p>
                    </div>
                    <Badge>{record.status}</Badge>
                  </Link>
                ))}
            </div>
          </Panel>
        </div>
        {live && <section aria-label="My purchasing records" className="mt-5">
          <h2 className="mb-3 text-base font-semibold">My purchasing records</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{live.personal.map(metric => <Panel key={metric.label} title={metric.label}>
            <div className="space-y-2 p-5"><p className="text-2xl font-semibold" aria-label={`${metric.label}: ${metric.state === "ready" ? metric.count : metric.state}`}>{metric.state === "ready" ? metric.count : "—"}</p>
              <p className="text-sm text-muted-foreground" role={metric.state === "error" ? "alert" : "status"}>{metricMessage(metric.state)}</p>
              {metric.state === "ready" && <Link to={metric.path} className="text-sm text-primary">Open records</Link>}
            </div></Panel>)}</div>
        </section>}
      </div>
    </div>
  );
}
