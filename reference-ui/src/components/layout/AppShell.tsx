import { RequestApprovalRecoverySlot } from "../../lib/RequestApprovalJournal";
import { useState, useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Building2,
  Home,
  ShoppingBag,
  LayoutGrid,
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
  Sparkles,
  UserRound,
} from "lucide-react";
import { useApp, money } from "../../lib/store";
import { modules } from "../../data/modules";
import { Modal, Button } from "../ui";
import { BrandMark, useErpShell } from "../../lib/erpShell";
import { ErpSidebarHeader, ErpTopBar } from "@amizopower/erp-ui";
import { isProcurementLiveMode, useLiveReadiness } from "../../lib/ProcurementLiveGate";

const procurement = [
  ["/procurement-requests", "Purchase Requests"],
  ["/rfqs", "Request for Quotes"],
  ["/purchase-orders", "Purchase Orders"],
  ["/purchase-receives", "Purchase Receives"],
  ["/recurring-bills", "Recurring Purchases"],
];
const payables = [
  ["/inbox", "Inbox"],
  ["/bills", "Bills"],
  ["/batch-payments", "Batch Payments"],
  ["/payments", "Payments Made"],
  ["/vendor-credits", "Vendor Credits"],
];
export function AppShell() {
  const procurementReadiness = useLiveReadiness();
  const location = useLocation();
  const { records, notify } = useApp();
  const { branding, entities, branches, selection, contextAvailable, verifiedContext, procurementScopeStatus, assignedRoles, selectEntity, selectBranch, selectAllBranches } = useErpShell();
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
    [compact, setCompact] = useState(() => window.localStorage.getItem("erp.sidebar.collapsed.v1") === "true");
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
  useEffect(() => {
    window.localStorage.setItem("erp.sidebar.collapsed.v1", String(compact));
  }, [compact]);
  const activeEntity = entities.find((item) => item.id === selection.entityId) ?? entities[0] ?? verifiedContext?.company;
  const activeBranch = selection.branchScope === "all" ? null
    : branches.find((item) => item.id === selection.branch) ?? verifiedContext?.branch;
  const results = (isProcurementLiveMode ? [] : records)
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
        `group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${child ? `pl-10 ${compact ? "lg:hidden" : ""}` : compact ? "lg:justify-center lg:px-2" : ""} ${isActive ? "bg-rail-active font-medium text-rail-foreground" : "text-rail-muted hover:bg-rail-active hover:text-rail-foreground"}`
      }
      title={label}
    >
      {icon}
      <span className={compact && !child ? "lg:sr-only" : ""}>{label}</span>
    </NavLink>
  );
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <ErpTopBar position="fixed" className="flex h-14 min-w-0 items-center gap-1 px-2 sm:gap-2 sm:px-3">
        <button
          className="mr-3 p-1 lg:hidden"
          aria-label="Open navigation"
          onClick={() => setMobile(true)}
        >
          <Menu size={22} />
        </button>
        <a href="/" aria-label="ERP home" className="flex shrink-0 items-center rounded-md px-1.5 py-1 hover:bg-primary-foreground/10 sm:px-2"><BrandMark onDark showName={false} /></a>
        <div className="relative shrink-0">
          <button type="button" aria-label="Switch ERP module" aria-expanded={modulesOpen} onClick={() => { setModulesOpen(!modulesOpen); setContextOpen(false); }} className="flex h-9 items-center gap-1 rounded-md px-2 text-sm font-semibold hover:bg-primary-foreground/10 sm:gap-1.5 sm:px-3"><LayoutGrid size={16} /><span className="hidden sm:inline">Procurement</span><ChevronDown size={14} /></button>
          {modulesOpen && <div className="absolute left-0 top-11 z-50 w-56 rounded-lg border border-border bg-surface p-2 text-foreground shadow-xl">
            <p className="px-2 py-1 text-[11px] font-semibold uppercase text-muted-foreground">My modules</p>
            {canOpenHrm && <a href="/hrm" className="block rounded px-2 py-2 text-sm hover:bg-secondary">Human resources</a>}
            <Link to="/" onClick={() => setModulesOpen(false)} aria-current="page" className="block rounded bg-primary-soft px-2 py-2 text-sm font-medium text-primary">Procurement</Link>
            {canOpenCore && <a href="/core" className="block rounded px-2 py-2 text-sm hover:bg-secondary">ERP Core</a>}
          </div>}
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="Organisation context"
            aria-expanded={contextOpen}
            onClick={() => { setContextOpen(!contextOpen); setModulesOpen(false); }}
            className="flex max-w-64 items-center gap-2 rounded-full border border-primary-foreground/40 bg-surface px-2 py-1.5 text-sm text-foreground md:px-3"
          >
            <Building2 size={15} className="shrink-0" />
            <span className="hidden truncate md:inline">{activeEntity?.name || branding?.displayName || "Organisation"}{selection.branchScope === "all" ? " · All permitted branches" : activeBranch ? ` · ${activeBranch.name}` : ""}</span>
            <ChevronDown size={14} className="hidden shrink-0 md:block" />
          </button>
          {contextOpen && <div className="fixed inset-x-3 top-14 z-50 max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-surface p-2 text-foreground shadow-xl md:absolute md:inset-x-auto md:left-0 md:top-11 md:w-80">
            <p className="px-2 py-1 text-[11px] font-semibold uppercase text-muted-foreground">Organisation context</p>
            {contextAvailable ? entities.map((entity) => <div key={entity.id}>
              <button type="button" onClick={() => selectEntity(entity.id)} className="w-full rounded px-2 py-2 text-left text-sm hover:bg-secondary">{entity.name}</button>
              <button type="button" onClick={() => selectAllBranches(entity.id)} className={`block w-full rounded px-6 py-1.5 text-left text-xs hover:bg-secondary ${selection.entityId === entity.id && selection.branchScope === "all" ? "bg-primary-soft font-semibold text-primary" : "text-muted-foreground"}`}>All permitted branches</button>
              {branches.filter((branch) => branch.legalEntityId === entity.id).map((branch) => <button key={branch.id} type="button" onClick={() => selectBranch(branch.id, entity.id)} className={`block w-full rounded px-6 py-1.5 text-left text-xs hover:bg-secondary ${selection.branch === branch.id ? "bg-primary-soft font-semibold text-primary" : "text-muted-foreground"}`}>{branch.name}</button>)}
            </div>) : verifiedContext ? <div className="space-y-1 px-2 py-2" aria-label="Verified current organisation">
              <p className="text-sm font-medium">{verifiedContext.company.name}</p>
              {verifiedContext.branch && selection.entityId === verifiedContext.company.id && selection.branchScope === "all"
                ? <p className="text-sm text-muted-foreground">This view shows only branches your account can access.</p>
                : verifiedContext.branch && (procurementScopeStatus === "selection-required"
                ? <button type="button" className="rounded px-2 py-2 text-left text-sm hover:bg-secondary" onClick={() => selectBranch(verifiedContext.branch!.id, verifiedContext.company.id)}>Use {verifiedContext.branch.name}</button>
                : <p className="text-sm text-muted-foreground">{verifiedContext.branch.name}</p>)}
              <button type="button" className={`rounded px-2 py-2 text-left text-sm hover:bg-secondary ${selection.entityId === verifiedContext.company.id && selection.branchScope === "all" ? "bg-primary-soft font-semibold text-primary" : ""}`} onClick={() => selectAllBranches(verifiedContext.company.id)}>All permitted branches</button>
              <p className="pt-2 text-xs text-muted-foreground">Current workspace. Organisation switching is not available for this account.</p>
            </div> : <p className="px-2 py-2 text-xs text-muted-foreground">Organisation choices are not available for this account.</p>}
          </div>}
        </div>
        <div className={`${searchOpen ? "fixed inset-x-3 top-16 z-50 block" : "hidden"} lg:relative lg:inset-auto lg:top-auto lg:z-auto lg:ml-auto lg:block lg:w-[min(25vw,320px)]`}>
          <Search
            className="absolute left-3 top-2.5 text-muted-foreground"
            size={17}
          />
          <input
            aria-label="Search procurement"
            autoFocus={searchOpen}
            value={query}
            onFocus={() => setSearchOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setSearchOpen(true);
            }}
            className="w-full rounded-full border border-primary-foreground/40 bg-surface py-2 pl-10 pr-3 text-sm text-foreground outline-none focus:border-ring"
            placeholder="Search procurement"
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
        <div className="ml-auto flex items-center gap-2 sm:gap-3 md:ml-2">
          <button type="button" aria-label="Search procurement" className="rounded-md p-1 lg:hidden" onClick={() => setSearchOpen(true)}><Search size={19} /></button>
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
          <div className="relative">
            <button
              aria-label="User menu"
              onClick={() => setAccount(!account)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/15 text-primary-foreground"
            >
              <UserRound size={17} aria-hidden />
            </button>
            {account && (
              <div className="absolute right-0 top-11 w-60 rounded-lg bg-white p-4 text-slate-700 shadow-xl">
                <p className="font-semibold">ERP account</p>
                <a href="/core/workspace/settings/organization" className="mt-3 block text-sm text-blue-500">
                  Organization profile
                </a>
                <Link to="/settings" className="mt-3 block text-sm text-blue-500">Procurement settings</Link>
              </div>
            )}
          </div>
        </div>
      </ErpTopBar>
      {mobile && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        aria-label="Main navigation"
        className={`fixed bottom-0 top-0 z-40 flex w-64 flex-col border-r border-rail-active bg-rail pt-4 text-rail-foreground transition-[width,transform] duration-200 lg:top-14 lg:z-20 lg:pt-0 ${mobile ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} ${compact ? "lg:w-16" : "lg:w-64"}`}
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
        <ErpSidebarHeader moduleName="Procurement" collapsed={compact} onToggle={() => setCompact((value) => !value)} className="hidden lg:flex" />
        <div className={`px-3 pb-3 ${compact ? "lg:px-2" : ""}`}>
          <button
            onClick={() => setHelp(true)}
          title="Workflow guide"
          className={`flex w-full items-center gap-2 rounded-lg border border-rail-active bg-rail-active/40 px-3 py-3 text-sm text-rail-foreground ${compact ? "lg:justify-center lg:px-2" : ""}`}
          >
            <Sparkles size={16} className="text-primary" />
            <span className={compact ? "lg:sr-only" : ""}>Workflow guide</span>
            <ChevronRight size={14} className={`ml-auto ${compact ? "lg:hidden" : ""}`} />
          </button>
        </div>
        <nav aria-label="Main" className={`flex-1 space-y-1 overflow-y-auto px-3 pb-5 ${compact ? "lg:px-2" : ""}`}>
          {nav("/", "Home", <Home size={17} />)}
          {nav("/requests", "My Requests", <ShoppingBag size={17} />)}
          {nav("/approvals", "Approvals", <CheckCircle2 size={17} />)}
          <div className="h-3" />
          {nav("/items", "Items", <Package size={17} />)}
          {nav("/vendors", "Vendors", <Store size={17} />)}
          <button
            onClick={() => { if (compact && window.innerWidth >= 1024) { setCompact(false); setProcOpen(true); } else setProcOpen(!procOpen); }}
            aria-label="Procurement"
            title="Procurement"
            className={`mt-3 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-rail-muted hover:bg-rail-active hover:text-rail-foreground ${compact ? "lg:justify-center lg:px-2" : ""}`}
          >
            <ShoppingBag size={17} />
            <span className={compact ? "lg:sr-only" : ""}>Procurement</span>
            {procOpen ? (
              <ChevronDown size={13} className={`ml-auto ${compact ? "lg:hidden" : ""}`} />
            ) : (
              <ChevronRight size={13} className={`ml-auto ${compact ? "lg:hidden" : ""}`} />
            )}
          </button>
          {procOpen && <>
            {procurement.map(([to, label]) => nav(to, label, null, true))}
            {isProcurementLiveMode && nav("/contracts", "Contracts", null, true)}
            {isProcurementLiveMode && procurementReadiness?.capabilities.contractInternalReview === true
              && procurementReadiness.permissions.includes("procurement-contract-review-read")
              && nav("/contracts/internal-review", "Contract Reviews", null, true)}
            {isProcurementLiveMode && nav("/plans", "Purchase Plans", null, true)}
          </>}
          <button
            onClick={() => { if (compact && window.innerWidth >= 1024) { setCompact(false); setPayOpen(true); } else setPayOpen(!payOpen); }}
            aria-label="Payables"
            title="Payables"
            className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-rail-muted hover:bg-rail-active hover:text-rail-foreground ${compact ? "lg:justify-center lg:px-2" : ""}`}
          >
            <Wallet size={17} />
            <span className={compact ? "lg:sr-only" : ""}>Payables</span>
            {payOpen ? (
              <ChevronDown size={13} className={`ml-auto ${compact ? "lg:hidden" : ""}`} />
            ) : (
              <ChevronRight size={13} className={`ml-auto ${compact ? "lg:hidden" : ""}`} />
            )}
          </button>
          {payOpen && payables.map(([to, label]) => nav(to, label, null, true))}
          <div className="h-2" />
          {nav("/budgets", "Budgets", <PieChart size={17} />)}
          {nav("/analytics", "Analytics", <BarChart3 size={17} />)}
        </nav>
        <div className={`border-t border-rail-active p-3 ${compact ? "lg:px-2" : ""}`}>
          <Link
            to="/settings"
            title="Settings"
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm text-rail-muted hover:bg-rail-active hover:text-rail-foreground ${compact ? "lg:justify-center lg:px-2" : ""}`}
          >
            <Settings size={16} />
            <span className={compact ? "lg:sr-only" : ""}>Settings</span>
          </Link>
        </div>
      </aside>
      <main
        className={`min-w-0 pb-16 pt-14 transition-all ${compact ? "lg:pl-16" : "lg:pl-64"}`}
      >
        <div className="mx-auto w-full max-w-6xl">
          <RequestApprovalRecoverySlot />
          <Outlet />
        </div>
      </main>
      <footer className="fixed inset-x-0 bottom-0 z-20 flex h-8 items-center justify-between border-t border-border bg-surface px-4 text-[10px] text-muted-foreground">
        <span>Procurement workspace</span>
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
          {isProcurementLiveMode ? <p className="text-sm text-muted-foreground">Notifications are not available here yet. Check your requests and approvals from the menu.</p> : <div className="space-y-4">
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
          </div>}
        </Modal>
      )}
      {help && (
        <Modal
          title="One screen. Many workflows."
          onClose={() => setHelp(false)}
        >
          <p className="text-sm leading-6 text-slate-500">
            {isProcurementLiveMode
              ? "Follow requests, quotations, orders, deliveries and bills from one workspace. Available actions depend on your account."
              : "This preview follows the documented Procurement workflow using shared lists, forms, catalogs and settings."}
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
          {!isProcurementLiveMode && <Button
            variant="secondary"
            onClick={() => {
              setHelp(false);
              notify(
                "All changes are simulated locally; no real sourcing, billing, or payment occurs.",
              );
            }}
          >
            About demo actions
          </Button>}
        </Modal>
      )}
    </div>
  );
}
