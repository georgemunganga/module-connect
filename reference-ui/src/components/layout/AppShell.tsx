import { useState, useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Hexagon,
  Home,
  ShoppingBag,
  CheckCircle2,
  Package,
  Store,
  FileText,
  Wallet,
  PieChart,
  BarChart3,
  Settings,
  Search,
  Bell,
  Plus,
  Menu,
  ChevronDown,
  ChevronRight,
  X,
  CircleHelp,
  PanelLeftClose,
  Sparkles,
} from "lucide-react";
import { useApp, money } from "../../lib/store";
import { modules } from "../../data/modules";
import { Modal, Button, Badge } from "../ui";

const procurement = [
  ["/procurement-requests", "Purchase Requests"],
  ["/rfqs", "Request for Quotes"],
  ["/purchase-orders", "Purchase Orders"],
  ["/purchase-receives", "Purchase Receives"],
];
const payables = [
  ["/inbox", "Inbox"],
  ["/bills", "Bills"],
  ["/recurring-bills", "Recurring Bills"],
  ["/batch-payments", "Batch Payments"],
  ["/payments", "Payments Made"],
  ["/vendor-credits", "Vendor Credits"],
];
export function AppShell() {
  const location = useLocation();
  const { records, notify } = useApp();
  const [mobile, setMobile] = useState(false),
    [query, setQuery] = useState(""),
    [searchOpen, setSearchOpen] = useState(false),
    [quick, setQuick] = useState(false),
    [notifications, setNotifications] = useState(false),
    [account, setAccount] = useState(false),
    [help, setHelp] = useState(false),
    [compact, setCompact] = useState(false);
  const [procOpen, setProcOpen] = useState(true),
    [payOpen, setPayOpen] = useState(true);
  useEffect(() => {
    setMobile(false);
    setSearchOpen(false);
    setQuick(false);
    setAccount(false);
  }, [location.pathname]);
  const results = records
    .filter((record) =>
      `${record.id} ${record.title} ${record.party}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .slice(0, 7);
  const nav = (
    to: string,
    label: string,
    icon: React.ReactNode,
    child = false,
  ) => (
    <NavLink
      key={to}
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] transition-colors ${child ? "pl-10" : ""} ${isActive ? "bg-blue-500 font-medium text-white shadow-sm" : "text-slate-600 hover:bg-slate-200/60"}`
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
  return (
    <div className="min-h-dvh bg-white">
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center bg-[#20263e] px-3 text-slate-100 sm:px-5">
        <button
          className="mr-3 p-1 lg:hidden"
          aria-label="Open navigation"
          onClick={() => setMobile(true)}
        >
          <Menu size={22} />
        </button>
        <Link to="/" className="flex items-center gap-2.5 lg:w-[205px]">
          <Hexagon size={27} strokeWidth={1.5} />
          <span className="whitespace-nowrap text-lg font-medium tracking-tight">Meridian ERP</span>
        </Link>
        <div className="relative ml-auto hidden w-[min(28vw,360px)] md:block lg:ml-5">
          <Search
            className="absolute left-3 top-2.5 text-slate-400"
            size={17}
          />
          <input
            aria-label="Search demo records"
            value={query}
            onFocus={() => setSearchOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setSearchOpen(true);
            }}
            className="w-full rounded-md border border-white/15 bg-white/5 py-2 pl-10 pr-3 text-xs outline-none focus:border-blue-400"
            placeholder="Search in Procurement ( / )"
          />
          {searchOpen && (
            <div className="absolute left-0 top-11 w-full rounded-md border border-slate-200 bg-white py-2 text-slate-800 shadow-xl">
              <div className="px-3 py-2 text-[11px] text-slate-400">
                {query ? "Matching records" : "Recent records"}
                <button
                  onClick={() => setSearchOpen(false)}
                  aria-label="Close search"
                  className="float-right"
                >
                  <X size={14} />
                </button>
              </div>
              {results.map((record) => (
                <Link
                  key={record.id}
                  to={`/${record.kind}/${encodeURIComponent(record.id)}`}
                  className="block px-3 py-2 hover:bg-blue-50"
                >
                  <strong className="block text-xs text-blue-500">
                    {record.id}
                  </strong>
                  <span className="block truncate text-xs">{record.title}</span>
                </Link>
              ))}
              {!results.length && (
                <p className="p-3 text-xs text-slate-400">
                  No matching records.
                </p>
              )}
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2 sm:gap-4">
          <span className="hidden rounded border border-white/15 px-2 py-1 text-[10px] uppercase tracking-wider text-slate-300 xl:block">
            Frontend demo
          </span>
          <div className="relative">
            <button
              onClick={() => setQuick(!quick)}
              aria-label="Quick create"
              className="rounded bg-blue-500 p-1.5"
            >
              <Plus size={21} />
            </button>
            {quick && (
              <div className="absolute right-0 top-11 w-56 rounded-lg border border-slate-200 bg-white p-2 text-slate-700 shadow-xl">
                <span className="block px-2 py-2 text-xs font-semibold text-slate-400">
                  QUICK CREATE
                </span>
                {[
                  ["/requests/new", "Purchase Request"],
                  ["/rfqs/new", "Request for Quote"],
                  ["/purchase-orders/new", "Purchase Order"],
                  ["/bills/new", "Bill"],
                  ["/vendors/new", "Vendor"],
                ].map(([to, label]) => (
                  <Link
                    to={to}
                    key={to}
                    className="block rounded px-2 py-2 text-sm hover:bg-blue-50"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setNotifications(true)}
            aria-label="View notifications"
            className="relative p-1"
          >
            <Bell size={19} />
            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#20263e] bg-red-400" />
          </button>
          <Link to="/settings" aria-label="Open settings" className="p-1">
            <Settings size={19} />
          </Link>
          <div className="relative">
            <button
              aria-label="Open demo account"
              onClick={() => setAccount(!account)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-500/60 text-xs font-medium"
            >
              AC
            </button>
            {account && (
              <div className="absolute right-0 top-11 w-60 rounded-lg bg-white p-4 text-slate-700 shadow-xl">
                <p className="font-semibold">Meridian Procurement Demo</p>
                <p className="mt-1 text-xs text-slate-400">
                  Fictional demo organization
                </p>
                <Badge>Procurement admin</Badge>
                <Link
                  to="/settings/profile"
                  className="mt-3 block text-sm text-blue-500"
                >
                  Organization profile
                </Link>
                <a href="/" className="mt-3 block text-sm text-blue-500">Back to ERP</a>
              </div>
            )}
          </div>
        </div>
      </header>
      {mobile && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        aria-label="Main navigation"
        className={`fixed bottom-0 top-0 z-40 flex w-[224px] flex-col border-r border-slate-200 bg-[#f7f8fd] pt-4 transition-transform lg:top-14 lg:z-20 lg:pt-0 ${mobile ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} ${compact ? "lg:hidden" : ""}`}
      >
        <div className="flex items-center justify-between px-4 pb-4 lg:hidden">
          <span className="font-semibold">Procurement</span>
          <button
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-3 py-4">
          <button
            onClick={() => setHelp(true)}
            className="flex w-full items-center gap-2 rounded-md border border-[#e0e2f0] bg-[#ecebf9] px-3 py-3 text-xs"
          >
            <Sparkles size={16} className="text-amber-400" />
            <span>Workflow guide</span>
            <ChevronRight size={14} className="ml-auto" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-5">
          {nav("/", "Home", <Home size={17} />)}
          {nav("/requests", "My Requests", <ShoppingBag size={17} />)}
          {nav("/approvals", "Approvals", <CheckCircle2 size={17} />)}
          <div className="h-3" />
          {nav("/items", "Items", <Package size={17} />)}
          {nav("/vendors", "Vendors", <Store size={17} />)}
          <button
            onClick={() => setProcOpen(!procOpen)}
            className="mt-3 flex w-full items-center gap-3 px-3 py-2.5 text-[13px] text-slate-600"
          >
            <ShoppingBag size={17} />
            <span>Procurement</span>
            {procOpen ? (
              <ChevronDown size={13} className="ml-auto" />
            ) : (
              <ChevronRight size={13} className="ml-auto" />
            )}
          </button>
          {procOpen &&
            procurement.map(([to, label]) => nav(to, label, null, true))}
          <button
            onClick={() => setPayOpen(!payOpen)}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-[13px] text-slate-600"
          >
            <Wallet size={17} />
            <span>Payables</span>
            {payOpen ? (
              <ChevronDown size={13} className="ml-auto" />
            ) : (
              <ChevronRight size={13} className="ml-auto" />
            )}
          </button>
          {payOpen && payables.map(([to, label]) => nav(to, label, null, true))}
          <div className="h-2" />
          {nav("/budgets", "Budgets", <PieChart size={17} />)}
          {nav("/analytics", "Analytics", <BarChart3 size={17} />)}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <Link
            to="/settings"
            className="flex items-center gap-3 px-3 py-2 text-xs text-slate-500"
          >
            <Settings size={16} />
            Settings
          </Link>
          <button
            onClick={() => setCompact(true)}
            className="hidden items-center gap-3 px-3 py-2 text-xs text-slate-400 lg:flex"
          >
            <PanelLeftClose size={16} />
            Collapse navigation
          </button>
        </div>
      </aside>
      <main
        className={`min-w-0 pb-16 pt-14 transition-all ${compact ? "" : "lg:pl-[224px]"}`}
      >
        {compact && (
          <button
            aria-label="Expand navigation"
            onClick={() => setCompact(false)}
            className="fixed left-3 top-16 z-20 rounded bg-white p-2 shadow"
          >
            <Menu size={18} />
          </button>
        )}
        <div className="border-b border-slate-100 bg-[#fbfcfe] px-4 py-2 text-[11px] text-slate-400 sm:px-7">
          Fictional demo data <span className="mx-2 text-slate-200">|</span>{" "}
          Changes stay in this browser. ERP records are not connected yet.
        </div>
        <Outlet />
      </main>
      <footer className="fixed inset-x-0 bottom-0 z-20 flex h-8 items-center justify-between border-t border-slate-200 bg-white px-4 text-[10px] text-slate-400">
        <span>
          Procurement workspace{" "}
          <span className="ml-3 hidden sm:inline">
            React · TypeScript · Tailwind
          </span>
        </span>
        <button
          onClick={() => setHelp(true)}
          className="flex items-center gap-1.5 text-blue-500"
        >
          <CircleHelp size={13} />
          Help & workflow guide
        </button>
      </footer>
      {notifications && (
        <Modal title="Notifications" onClose={() => setNotifications(false)}>
          <div className="space-y-4">
            <div className="rounded-md border border-amber-100 bg-amber-50 p-4">
              <p className="font-medium">Purchase request awaiting review</p>
              <p className="mt-1 text-sm text-slate-500">
                The Operations team requested new office equipment.
              </p>
              <Link
                to="/approvals"
                onClick={() => setNotifications(false)}
                className="mt-3 block text-sm text-blue-500"
              >
                Review in Approvals →
              </Link>
            </div>
            <p className="text-xs text-slate-400">
              Notifications are fictional. No email is sent.
            </p>
          </div>
        </Modal>
      )}
      {help && (
        <Modal
          title="One screen. Many workflows."
          onClose={() => setHelp(false)}
        >
          <p className="text-sm leading-6 text-slate-500">
            This prototype follows the documented Procurement workflow. Shared
            lists, transaction fields, catalogs, and settings are reused across
            workflows—not rebuilt for each screenshot.
          </p>
          <div className="my-5 space-y-3">
            {[
              ["Request", "/requests"],
              ["Source", "/rfqs"],
              ["Order", "/purchase-orders"],
              ["Receive", "/purchase-receives"],
              ["Bill", "/bills"],
              ["Payment", "/payments"],
            ].map(([label, to], index) => (
              <Link
                key={to}
                to={to}
                onClick={() => setHelp(false)}
                className="flex items-center gap-3 rounded border border-slate-100 p-3 text-sm"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-xs text-blue-500">
                  {index + 1}
                </span>
                {label}
                <ChevronRight size={15} className="ml-auto text-slate-400" />
              </Link>
            ))}
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              setHelp(false);
              notify(
                "All changes are simulated locally; no real sourcing, billing, or payment occurs.",
              );
            }}
          >
            About demo actions
          </Button>
        </Modal>
      )}
    </div>
  );
}
