import { useState, useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Building2,
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
  UserRound,
} from "lucide-react";
import { useApp, money } from "../../lib/store";
import { modules } from "../../data/modules";
import { Modal, Button, Badge } from "../ui";
import { BrandMark, useErpShell } from "../../lib/erpShell";

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
  const { branding, entities, branches, selection, contextAvailable, assignedRoles, selectEntity, selectBranch } = useErpShell();
  const roleSet = new Set(assignedRoles.map((role) => role.toLowerCase()));
  const canOpenHrm = ["employee", "manager", "hr_ops", "payroll", "finance_approver", "hr_admin", "investigator", "timesheet_operator"].some((role) => roleSet.has(role));
  const canOpenCore = roleSet.has("erp_admin") || roleSet.has("hr_admin");
  const [mobile, setMobile] = useState(false),
    [query, setQuery] = useState(""),
    [searchOpen, setSearchOpen] = useState(false),
    [quick, setQuick] = useState(false),
    [notifications, setNotifications] = useState(false),
    [account, setAccount] = useState(false),
    [help, setHelp] = useState(false),
    [modulesOpen, setModulesOpen] = useState(false),
    [contextOpen, setContextOpen] = useState(false),
    [compact, setCompact] = useState(false);
  const [procOpen, setProcOpen] = useState(true),
    [payOpen, setPayOpen] = useState(true);
  useEffect(() => {
    setMobile(false);
    setSearchOpen(false);
    setQuick(false);
    setAccount(false);
    setModulesOpen(false);
    setContextOpen(false);
  }, [location.pathname]);
  const activeEntity = entities.find((item) => item.id === selection.entityId) ?? entities[0];
  const activeBranch = branches.find((item) => item.id === selection.branch);
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
        `group flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] transition-colors ${child ? "pl-10" : ""} ${isActive ? "bg-rail-active font-medium text-rail-foreground" : "text-rail-muted hover:bg-rail-active hover:text-rail-foreground"}`
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center border-b border-primary/40 bg-primary px-3 text-primary-foreground shadow-sm sm:px-5">
        <button
          className="mr-3 p-1 lg:hidden"
          aria-label="Open navigation"
          onClick={() => setMobile(true)}
        >
          <Menu size={22} />
        </button>
        <a href="/" className="flex shrink-0 items-center rounded-md px-2 py-1 hover:bg-primary-foreground/10 lg:w-[260px]"><BrandMark onDark /></a>
        <div className="relative hidden md:block">
          <button
            type="button"
            aria-label="Organisation context"
            aria-expanded={contextOpen}
            onClick={() => { setContextOpen(!contextOpen); setModulesOpen(false); }}
            className="flex max-w-64 items-center gap-2 rounded-full border border-primary-foreground/40 bg-surface px-3 py-1.5 text-xs text-foreground"
          >
            <Building2 size={15} className="shrink-0" />
            <span className="truncate">{activeEntity?.name || branding?.displayName || "Organisation"}{activeBranch ? ` · ${activeBranch.name}` : ""}</span>
            <ChevronDown size={14} className="shrink-0" />
          </button>
          {contextOpen && <div className="absolute left-0 top-11 max-h-[60vh] w-80 overflow-y-auto rounded-lg border border-border bg-surface p-2 text-foreground shadow-xl">
            <p className="px-2 py-1 text-[11px] font-semibold uppercase text-muted-foreground">Organisation context</p>
            {contextAvailable ? entities.map((entity) => <div key={entity.id}>
              <button type="button" onClick={() => selectEntity(entity.id)} className={`w-full rounded px-2 py-2 text-left text-sm hover:bg-secondary ${selection.entityId === entity.id && !selection.branch ? "bg-primary-soft font-semibold text-primary" : ""}`}>{entity.name}</button>
              {branches.filter((branch) => branch.legalEntityId === entity.id).map((branch) => <button key={branch.id} type="button" onClick={() => selectBranch(branch.id, entity.id)} className={`block w-full rounded px-6 py-1.5 text-left text-xs hover:bg-secondary ${selection.branch === branch.id ? "bg-primary-soft font-semibold text-primary" : "text-muted-foreground"}`}>{branch.name}</button>)}
            </div>) : <p className="px-2 py-2 text-xs text-muted-foreground">Sign in to the ERP to see your permitted entities and branches.</p>}
            <p className="mt-2 border-t border-border px-2 pt-2 text-[11px] text-muted-foreground">Procurement demo records are not filtered by this selection.</p>
          </div>}
        </div>
        <div className="relative ml-auto hidden w-[min(25vw,320px)] md:block lg:ml-5">
          <Search
            className="absolute left-3 top-2.5 text-muted-foreground"
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
            className="w-full rounded-full border border-primary-foreground/40 bg-surface py-2 pl-10 pr-3 text-xs text-foreground outline-none focus:border-ring"
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
          <div className="relative">
            <button type="button" aria-label="Switch ERP module" aria-expanded={modulesOpen} onClick={() => { setModulesOpen(!modulesOpen); setContextOpen(false); }} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold hover:bg-primary-foreground/10"><ShoppingBag size={16} /><span className="hidden sm:inline">Procurement</span><ChevronDown size={14} /></button>
            {modulesOpen && <div className="absolute right-0 top-11 z-50 w-56 rounded-lg border border-border bg-surface p-2 text-foreground shadow-xl">
              <p className="px-2 py-1 text-[11px] font-semibold uppercase text-muted-foreground">My modules</p>
              {canOpenHrm && <a href="/hrm" className="block rounded px-2 py-2 text-sm hover:bg-secondary">Human resources</a>}
              <Link to="/" onClick={() => setModulesOpen(false)} className="block rounded bg-primary-soft px-2 py-2 text-sm font-medium text-primary">Procurement</Link>
              {canOpenCore && <a href="/core" className="block rounded px-2 py-2 text-sm hover:bg-secondary">ERP Core</a>}
            </div>}
          </div>
          <span className="hidden rounded-full border border-warning/40 bg-warning-soft px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-foreground xl:block">
            Demo data
          </span>
          <div className="relative">
            <button
              onClick={() => setQuick(!quick)}
              aria-label="Quick create"
              className="rounded-full border border-primary-foreground/40 bg-primary-foreground/10 p-1.5 text-primary-foreground"
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
            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-primary bg-danger" />
          </button>
          <Link to="/settings" aria-label="Open settings" className="p-1">
            <Settings size={19} />
          </Link>
          <div className="relative">
            <button
              aria-label="Open demo account"
              onClick={() => setAccount(!account)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/15 text-primary-foreground"
            >
              <UserRound size={17} aria-hidden />
            </button>
            {account && (
              <div className="absolute right-0 top-11 w-60 rounded-lg bg-white p-4 text-slate-700 shadow-xl">
                <p className="font-semibold">{branding?.displayName || "ERP workspace"}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Fictional demo organization
                </p>
                <Badge>Procurement admin</Badge>
                <a href="/core/organization" className="mt-3 block text-sm text-blue-500">
                  Organization profile
                </a>
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
        className={`fixed bottom-0 top-0 z-40 flex w-64 flex-col border-r border-rail-active bg-rail pt-4 text-rail-foreground transition-transform lg:top-14 lg:z-20 lg:pt-0 ${mobile ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} ${compact ? "lg:hidden" : ""}`}
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
        <div className="px-4 pb-2 text-xs text-rail-muted md:hidden">
          <span className="block truncate">{activeEntity?.name || branding?.displayName || "Organisation"}{activeBranch ? ` · ${activeBranch.name}` : ""}</span>
          <a href="/hrm" className="mt-1 inline-block text-rail-foreground underline underline-offset-2">Change branch in ERP</a>
        </div>
        <div className="px-3 py-4">
          <button
            onClick={() => setHelp(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-rail-active bg-rail-active/40 px-3 py-3 text-xs text-rail-foreground"
          >
            <Sparkles size={16} className="text-primary" />
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
            className="mt-3 flex w-full items-center gap-3 px-3 py-2.5 text-[13px] text-rail-muted hover:text-rail-foreground"
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
            className="flex w-full items-center gap-3 px-3 py-2.5 text-[13px] text-rail-muted hover:text-rail-foreground"
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
        <div className="border-t border-rail-active p-3">
          <Link
            to="/settings"
            className="flex items-center gap-3 px-3 py-2 text-xs text-rail-muted hover:text-rail-foreground"
          >
            <Settings size={16} />
            Settings
          </Link>
          <button
            onClick={() => setCompact(true)}
            className="hidden items-center gap-3 px-3 py-2 text-xs text-rail-muted hover:text-rail-foreground lg:flex"
          >
            <PanelLeftClose size={16} />
            Collapse navigation
          </button>
        </div>
      </aside>
      <main
        className={`min-w-0 pb-16 pt-14 transition-all ${compact ? "" : "lg:pl-64"}`}
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
        <div className="border-b border-border bg-surface-muted px-4 py-2 text-[11px] text-muted-foreground sm:px-7">
          Fictional demo data <span className="mx-2 text-slate-200">|</span>{" "}
          Changes stay in this browser. ERP records are not connected yet.
        </div>
        <Outlet />
      </main>
      <footer className="fixed inset-x-0 bottom-0 z-20 flex h-8 items-center justify-between border-t border-border bg-surface px-4 text-[10px] text-muted-foreground">
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
