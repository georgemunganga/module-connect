import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Building2,
  CheckSquare,
  ChevronDown,
  CircleHelp,
  Grid2x2,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Sparkles,
  Sun,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { entities, notifications, workspaces } from "@/mock/data";
import type { Role } from "@/mock/types";
import { hrmModule } from "@/modules/hrm/nav";
import { procurementModule } from "@/modules/procurement/nav";
import { useProcurement } from "@/modules/procurement/store";
import { useCommercial } from "@/modules/procurement/commercial/store";
import { usePayables } from "@/modules/procurement/payables/store";
import { requestVisible, sameEntity } from "@/modules/procurement/access";
import type { ModuleDefinition, NavItem, NavSection } from "@/platform/nav";
import { useApp } from "@/platform/app-context";
import { useProcurementSession } from "@/platform/procurement-session";
import type { ModuleId } from "@/platform/app-context";
import { cn } from "@/lib/utils";

/** Module registry: adding a future module means registering it here — never copying shell code. */
const moduleRegistry: Record<ModuleId, { def: ModuleDefinition; home: string; available: boolean }> = {
  hrm: { def: hrmModule, home: "/", available: true },
  procurement: { def: procurementModule, home: "/procurement", available: true },
};

function useVisibleSections(mod: ModuleDefinition, role: Role) {
  return mod.sections
    .filter((s) => !s.roles || s.roles.includes(role))
    .map((s) => ({
      ...s,
      items: s.items?.filter((item) => !item.roles || item.roles.includes(role)),
      groups: s.groups?.map((group) => ({ ...group, items: group.items.filter((item) => !item.roles || item.roles.includes(role)) })).filter((group) => group.items.length),
    }))
    .filter((s) => Boolean(s.to || s.items?.length || s.groups?.length));
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <Link
      to={item.to}
      params={item.params as never}
      onClick={onNavigate}
      activeProps={{ className: "bg-rail-active text-rail-foreground font-medium" }}
      activeOptions={{ exact: true }}
      className="block rounded-md px-3 py-1.5 text-sm text-rail-muted transition-colors hover:bg-rail-active hover:text-rail-foreground"
      title={item.label}
    >
      {item.label}
    </Link>
  );
}

function Section({ section, onNavigate, collapsed = false }: { section: NavSection; onNavigate?: () => void; collapsed?: boolean }) {
  const Icon = section.icon;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const childActive =
    section.items?.some((i) => pathname.startsWith(i.to.split("/$")[0])) || section.groups?.some((g) => g.items.some((i) => pathname.startsWith(i.to.split("/$")[0]))) || false;
  const [open, setOpen] = useState(childActive);
  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  if (section.to) {
    return (
      <Link
        to={section.to}
        params={section.params as never}
        onClick={onNavigate}
        activeProps={{ className: "bg-rail-active text-rail-foreground" }}
        activeOptions={{ exact: section.to === "/" || section.to === "/procurement", includeSearch: false }}
        className={cn(
          "flex items-center gap-2.5 rounded-md py-2 text-sm font-medium text-rail-muted transition-colors hover:bg-rail-active hover:text-rail-foreground",
          collapsed ? "justify-center px-2" : "px-2.5",
        )}
        title={section.label}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        {collapsed ? <span className="sr-only">{section.label}</span> : section.label}
      </Link>
    );
  }

  if (collapsed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={section.label}
            title={section.label}
            className={cn(
              "mx-auto flex size-10 items-center justify-center rounded-md text-rail-muted transition-colors hover:bg-rail-active hover:text-rail-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rail-active",
              childActive && "bg-rail-active text-rail-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" sideOffset={10} className="w-72 p-2">
          <DropdownMenuLabel>{section.label}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="max-h-[70vh] overflow-y-auto">
            {section.items?.map((item) => (
              <DropdownMenuItem key={item.to + item.label} asChild>
                <Link to={item.to} params={item.params as never} onClick={onNavigate}>{item.label}</Link>
              </DropdownMenuItem>
            ))}
            {section.groups?.map((group) => (
              <div key={group.label}>
                <DropdownMenuLabel className="text-xs text-muted-foreground">{group.label}</DropdownMenuLabel>
                {group.items.map((item) => (
                  <DropdownMenuItem key={item.to + item.label} asChild>
                    <Link to={item.to} params={item.params as never} onClick={onNavigate}>{item.label}</Link>
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-rail-muted transition-colors hover:bg-rail-active hover:text-rail-foreground"
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 text-left">{section.label}</span>
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className="mt-0.5 space-y-0.5 border-l border-rail-active pl-3 ml-4">
          {section.items?.map((i) => <NavLink key={i.to + i.label} item={i} onNavigate={onNavigate} />)}
          {section.groups?.map((g) => (
            <div key={g.label} className="pt-2">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-rail-muted/80">
                {g.label}
              </p>
              {g.items.map((i) => <NavLink key={i.to + i.label} item={i} onNavigate={onNavigate} />)}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RailContent({ onNavigate, onOpenGuide, collapsed = false, onToggleCollapsed }: { onNavigate?: () => void; onOpenGuide?: () => void; collapsed?: boolean; onToggleCollapsed?: () => void }) {
  const { role, moduleId } = useApp();
  const mod = moduleRegistry[moduleId].def;
  const sections = useVisibleSections(mod, role);
  const main = sections.filter((s) => s.id !== "configuration");
  const config = sections.find((s) => s.id === "configuration");

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex items-center gap-2 px-3 py-4", collapsed ? "flex-col px-2" : "justify-between")}>
        {collapsed ? (
          <span className="flex size-9 items-center justify-center rounded-md bg-rail-active text-sm font-semibold" title={mod.name}>{mod.shortName}</span>
        ) : (
          <div>
            <p className="px-2 text-xs font-semibold uppercase tracking-wide text-rail-muted">Module</p>
            <p className="px-2 text-sm font-semibold text-rail-foreground">{mod.name}</p>
          </div>
        )}
        {onToggleCollapsed ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden size-8 text-rail-muted hover:bg-rail-active hover:text-rail-foreground lg:inline-flex"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand side menu" : "Collapse side menu"}
            title={collapsed ? "Expand side menu" : "Collapse side menu"}
          >
            {collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
          </Button>
        ) : null}
      </div>
      {moduleId === "procurement" ? <div className={cn("pb-3", collapsed ? "px-2" : "px-3")}>
        <button type="button" onClick={() => { onNavigate?.(); onOpenGuide?.(); }} title="Workflow guide" className={cn("flex w-full items-center gap-2 rounded-lg border border-rail-active bg-rail-active/40 py-2 text-left text-sm font-medium text-rail-foreground hover:bg-rail-active", collapsed ? "justify-center px-2" : "px-3")}><Sparkles className="size-4 text-primary" aria-hidden />{collapsed ? <span className="sr-only">Workflow guide</span> : <span>Workflow guide</span>}</button>
      </div> : null}
      <nav aria-label="Main" className={cn("flex-1 space-y-1 overflow-y-auto pb-4", collapsed ? "px-2" : "px-3")}>
        {main.map((s) => <Section key={s.id} section={s} onNavigate={onNavigate} collapsed={collapsed} />)}
      </nav>
      {config ? (
        <div className={cn("border-t border-rail-active py-3", collapsed ? "px-2" : "px-3")}>
          <Section section={config} onNavigate={onNavigate} collapsed={collapsed} />
          <p className={cn("px-2.5 pt-1 text-[11px] text-rail-muted", collapsed && "sr-only")}>
            All setup and admin lives here.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { role, moduleId, entityId } = useApp();
  const procurement = useProcurement();
  const commercial = useCommercial();
  const payables = usePayables();
  const mod = moduleRegistry[moduleId].def;
  const sections = useVisibleSections(mod, role);
  const links = sections.flatMap((s) =>
    s.to ? [{ label: s.label, to: s.to, params: s.params }] : [...(s.items ?? []), ...(s.groups ?? []).flatMap((group) => group.items)].map((i) => ({ label: `${s.label}: ${i.label}`, to: i.to, params: i.params })),
  );
  const records = moduleId === "procurement" ? [
    ...procurement.requests.filter((request) => requestVisible(role, entityId, procurement.metadata[request.id]?.entity, request.requester, request.department)).map((request) => ({ id: request.id, title: request.title, to: "/procurement/requests/$id", label: "Request" })),
    ...(["buyer", "receiver", "proc_admin", "auditor"].includes(role) ? commercial.orders.filter((order) => sameEntity(order.entity, entityId)).map((order) => ({ id: order.id, title: order.supplier, to: "/procurement/orders/$id", label: "Order" })) : []),
    ...(["ap_processor", "buyer", "proc_admin", "auditor"].includes(role) ? payables.invoices.filter((invoice) => invoice.entityId === entityId).map((invoice) => ({ id: invoice.id, title: invoice.supplier, to: "/procurement/invoices/$id", label: "Bill" })) : []),
  ].slice(0, 30) : [];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search screens, records and actions…" />
      <CommandList>
        <CommandEmpty>Nothing matched. Try a record number or screen name.</CommandEmpty>
        <CommandGroup heading="Go to">
          {links.map((l) => (
            <CommandItem key={l.label} value={l.label} asChild>
              <Link to={l.to} params={l.params as never} onClick={() => onOpenChange(false)}>
                {l.label}
              </Link>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Records">
          {moduleId === "hrm" ? (
            <>
              <CommandItem value="LV-2026-0412" asChild>
                <Link to="/leave/$id" params={{ id: "LV-2026-0412" }} onClick={() => onOpenChange(false)}>
                  LV-2026-0412 — Annual leave, Amara
                </Link>
              </CommandItem>
              <CommandItem value="HR-2026-0912" asChild>
                <Link to="/requests/$id" params={{ id: "HR-2026-0912" }} onClick={() => onOpenChange(false)}>
                  HR-2026-0912 — Employment letter
                </Link>
              </CommandItem>
            </>
          ) : records.map((record) => <CommandItem key={record.id} value={`${record.label} ${record.id} ${record.title}`} asChild><Link to={record.to as never} params={{ id: record.id } as never} onClick={() => onOpenChange(false)}>{record.label} {record.id} — {record.title}</Link></CommandItem>)}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { role, setRole, entityId, setEntityId, approvalActor, branch, setBranch, theme, toggleTheme, moduleId } = useApp();
  const session = useProcurementSession();
  const procurement = useProcurement();
  const payables = usePayables();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const procurementScreen = pathname.startsWith("/procurement");
  const demoScreen = !procurementScreen || session.mode === "demo";
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const entity = entities.find((e) => e.id === entityId)!;
  const procAlerts = ["manager", "buyer", "proc_admin"].includes(role) ? procurement.approvals.filter((task) => sameEntity(task.recordEntity, entityId) && task.state !== "Completed" && (role !== "manager" || task.assignee === approvalActor)).slice(0, 4) : [];
  const billAlerts = ["ap_processor", "buyer", "proc_admin"].includes(role) ? payables.invoices.filter((invoice) => invoice.entityId === entityId && ["Exception", "AP rejected"].includes(invoice.status)).slice(0, 3) : [];
  const unread = moduleId === "procurement" ? procAlerts.length + billAlerts.length : notifications.filter((n) => n.unread).length;
  const quickActions = moduleId === "procurement" ? [
    ...(["employee", "manager", "hr_ops", "payroll", "hr_admin"].includes(role) ? [{ label: "Purchase request", to: "/procurement/requests/new", search: { item: undefined } }] : []),
    ...(["buyer", "proc_admin"].includes(role) ? [{ label: "Request for quotes", to: "/procurement/sourcing/new" }, { label: "Contract", to: "/procurement/contracts/new" }] : []),
    ...(["supplier_steward", "proc_admin"].includes(role) ? [{ label: "Vendor", to: "/procurement/suppliers/new", search: { edit: undefined } }] : []),
    ...(["ap_processor", "proc_admin"].includes(role) ? [{ label: "Bill", to: "/procurement/invoices/new" }] : []),
  ] : [];

  useEffect(() => {
    setRailCollapsed(window.localStorage.getItem("erp.procurement.rail.collapsed") === "true");
  }, []);

  const toggleRail = () => {
    setRailCollapsed((current) => {
      window.localStorage.setItem("erp.procurement.rail.collapsed", String(!current));
      return !current;
    });
  };

  const assignedRoles = session.mode === "live" ? new Set(session.user.roles.map((value) => value.toLowerCase())) : null;
  const canOpenHrm = !assignedRoles || ["employee", "manager", "hr_ops", "payroll", "finance_approver", "hr_admin", "investigator", "timesheet_operator"].some((value) => assignedRoles.has(value));
  const canOpenCore = !assignedRoles || assignedRoles.has("erp_admin") || assignedRoles.has("hr_admin");

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b bg-surface">
        <div className="flex h-14 items-center gap-2 px-3">
          {demoScreen ? <Sheet open={navigationOpen} onOpenChange={setNavigationOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                <Menu className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-rail p-0 text-rail-foreground">
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <RailContent onNavigate={() => setNavigationOpen(false)} onOpenGuide={() => setGuideOpen(true)} />
            </SheetContent>
          </Sheet> : null}

          <a href="/" className="rounded-md px-2 py-1 text-sm font-semibold hover:bg-secondary">Meridian ERP</a>

          <span role="status" className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning-soft px-2.5 py-1 text-xs font-medium text-foreground">
            <span className="size-1.5 rounded-full bg-warning" aria-hidden />
            {procurementScreen ? session.mode === "live" ? "Live account · screens pending" : session.mode === "unavailable" ? "Procurement unavailable" : session.mode === "loading" ? "Checking access" : "Demo data" : "Demo data"}
          </span>


          {demoScreen ? <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="hidden min-w-0 gap-2 md:flex">
                <Building2 className="size-4 shrink-0" aria-hidden />
                <span className="max-w-48 truncate">{entity.name}</span>
                <span className="text-muted-foreground">· {branch}</span>
                <ChevronDown className="size-3.5 shrink-0" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              <DropdownMenuLabel>Legal entity</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={entityId} onValueChange={setEntityId}>
                {entities.map((e) => (
                  <DropdownMenuRadioItem key={e.id} value={e.id}>
                    <span className="min-w-0">
                      <span className="block truncate">{e.name}</span>
                      <span className="block text-xs text-muted-foreground">{e.country} · {e.legalId}</span>
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Branch</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={branch} onValueChange={setBranch}>
                {entity.branches.map((b) => (
                  <DropdownMenuRadioItem key={b} value={b}>
                    {b}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu> : session.mode === "live" ? <div className="hidden items-center gap-2 rounded-md border px-3 py-1.5 text-sm md:flex"><Building2 className="size-4" aria-hidden /><span className="max-w-48 truncate">{session.context.company.name}</span></div> : null}

          <div className="ml-auto flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="gap-1.5" aria-label="Switch ERP module"><Grid2x2 className="size-4" /><span className="hidden sm:inline">Procurement</span><ChevronDown className="size-3.5" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My modules</DropdownMenuLabel>
                {canOpenHrm ? <DropdownMenuItem asChild><a href="/hrm">Human resources</a></DropdownMenuItem> : null}
                <DropdownMenuItem asChild><a href="/procurement" aria-current="page" className="font-semibold">Procurement</a></DropdownMenuItem>
                {canOpenCore ? <DropdownMenuItem asChild><a href="/core">ERP Core</a></DropdownMenuItem> : null}
                {demoScreen ? <><DropdownMenuSeparator /><DropdownMenuLabel>Demo workspace</DropdownMenuLabel><DropdownMenuRadioGroup value={role} onValueChange={(value) => setRole(value as Role)}>{workspaces.map((workspace) => <DropdownMenuRadioItem key={workspace.id} value={workspace.id}>{workspace.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></> : null}
              </DropdownMenuContent>
            </DropdownMenu>
            {demoScreen ? <>
            {quickActions.length ? <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="icon" aria-label="Quick create" title="Quick create"><Plus className="size-4" aria-hidden /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56"><DropdownMenuLabel>Quick create</DropdownMenuLabel>{quickActions.map((action) => <DropdownMenuItem key={action.to} asChild><Link to={action.to as never} search={("search" in action ? action.search : undefined) as never}>{action.label}</Link></DropdownMenuItem>)}</DropdownMenuContent>
            </DropdownMenu> : null}
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-muted-foreground max-sm:w-11 max-sm:px-0"
              onClick={() => setPaletteOpen(true)}
            >
              <Search className="size-4" aria-hidden />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden rounded border px-1 text-[10px] sm:inline">⌘K</kbd>
            </Button>

            <Button asChild variant="ghost" size="icon" className="relative" aria-label="Tasks and approvals">
              <Link to={moduleId === "procurement" ? "/procurement/approvals" : "/approvals"}>
                <CheckSquare className="size-5" aria-hidden />
              </Link>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications, ${unread} unread`}>
                  <Bell className="size-5" aria-hidden />
                  {unread ? (
                    <span className="absolute right-1 top-1 rounded-full bg-danger px-1 text-[10px] font-semibold text-danger-foreground">
                      {unread}
                    </span>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                {moduleId === "procurement" ? <>
                  {procAlerts.map((task) => <DropdownMenuItem key={task.id} asChild><Link to="/procurement/approvals/$id" params={{ id: task.id }} className="flex flex-col items-start"><span className="text-sm font-medium">Approval · {task.subject}</span><span className="text-xs text-muted-foreground">{task.id} · {task.state}</span></Link></DropdownMenuItem>)}
                  {billAlerts.map((invoice) => <DropdownMenuItem key={invoice.id} asChild><Link to="/procurement/invoices/$id" params={{ id: invoice.id }} className="flex flex-col items-start"><span className="text-sm font-medium">Bill needs review · {invoice.supplier}</span><span className="text-xs text-muted-foreground">{invoice.id} · {invoice.status}</span></Link></DropdownMenuItem>)}
                  {!unread ? <p className="px-2 py-3 text-sm text-muted-foreground">No procurement alerts for this company.</p> : null}
                </> : notifications.map((n) => (
                  <DropdownMenuItem key={n.id} className="flex-col items-start gap-0.5">
                    <span className="text-sm font-medium">{n.title}</span>
                    <span className="text-xs text-muted-foreground">{n.body}</span>
                    <span className="text-[11px] text-muted-foreground">{n.at}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label="Help" asChild>
              <Link to="/help">
                <CircleHelp className="size-5" aria-hidden />
              </Link>
            </Button>

            </> : null}
            <Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
              {theme === "light" ? <Moon className="size-5" aria-hidden /> : <Sun className="size-5" aria-hidden />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="User menu">
                  <UserRound className="size-5" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="flex flex-col">
                  <span>{procurementScreen && session.mode === "live" ? session.user.displayName : procurementScreen && session.mode !== "demo" ? "ERP account" : "Amara Chukwuemeka-Van der Berghe"}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {procurementScreen && session.mode === "live" ? session.user.email : procurementScreen && session.mode !== "demo" ? "Access is being checked" : `Acting as ${workspaces.find((w) => w.id === role)?.label}`}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {demoScreen ? <>
                <DropdownMenuItem asChild>
                  <Link to="/workers/$id" params={{ id: "w-1001" }}>My profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/setup">Setup guide</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/help">Help</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={toggleTheme}>
                  {theme === "light" ? <Moon className="size-4" aria-hidden /> : <Sun className="size-4" aria-hidden />}
                  Switch to {theme === "light" ? "dark" : "light"} mode
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <LogOut className="size-4" aria-hidden /> Sign out (mock)
                </DropdownMenuItem>
                </> : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <Separator />
      </header>

      <div className="flex">
        {demoScreen ? <aside className={cn("sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 bg-rail text-rail-foreground transition-[width] duration-200 lg:block", railCollapsed ? "w-16" : "w-64")}>
          <RailContent collapsed={railCollapsed} onToggleCollapsed={toggleRail} onOpenGuide={() => setGuideOpen(true)} />
        </aside> : null}
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl space-y-6">
            {!procurementScreen || session.mode === "demo" ? children : session.mode === "loading" ?
              <div role="status" className="rounded-lg border bg-surface p-8">Checking your ERP access…</div> : session.mode === "live" ?
              <div role="status" className="max-w-2xl rounded-lg border bg-surface p-8"><h1 className="text-xl font-semibold">Live Procurement account connected</h1><p className="mt-2 text-sm text-muted-foreground">Signed in as {session.user.displayName} for {session.context.company.name}. The purchasing screens are still demo workflows and are hidden until they use live records.</p></div> :
              <div role="alert" className="max-w-2xl rounded-lg border bg-surface p-8"><h1 className="text-xl font-semibold">Procurement is unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{session.reason} Your demo workspace has not been opened as a fallback.</p><div className="mt-4 flex gap-2"><Button variant="outline" onClick={() => window.location.reload()}>Try again</Button><Button variant="outline" asChild><a href="/sign-in">Sign in to ERP</a></Button></div></div>}
          </div>
        </main>
      </div>

      {demoScreen ? <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} /> : null}
      {demoScreen && moduleId === "procurement" ? <Dialog open={guideOpen} onOpenChange={setGuideOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>How a purchase moves</DialogTitle><DialogDescription>Follow the work from a request to the Finance payment update. Each step opens only when your role has access.</DialogDescription></DialogHeader><ol className="mt-2 space-y-2">{[
        { label: "Request", detail: "Describe the need and ask for approval.", to: "/procurement/requests", roles: ["employee", "manager", "buyer", "proc_admin"] },
        { label: "Get quotes", detail: "Invite vendors when the buying rule requires competition.", to: "/procurement/sourcing", roles: ["buyer", "proc_admin"] },
        { label: "Order", detail: "Issue the approved purchase order.", to: "/procurement/orders", roles: ["buyer", "receiver", "proc_admin"] },
        { label: "Receive", detail: "Confirm goods or completed services.", to: "/procurement/receiving", roles: ["receiver", "buyer", "proc_admin"] },
        { label: "Check bill", detail: "Compare the bill with the order and accepted delivery.", to: "/procurement/invoices", roles: ["ap_processor", "buyer", "proc_admin"] },
        { label: "Finance update", detail: "See AP and payment status returned by Finance.", to: "/procurement/payables/payment-status", roles: ["ap_processor", "buyer", "proc_admin"] },
      ].map((step, index) => <li key={step.label} className="flex items-start gap-3 rounded-lg border p-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">{index + 1}</span><div><strong className="text-sm">{step.label}</strong><p className="text-xs text-muted-foreground">{step.detail}</p>{step.roles.includes(role) ? <Link to={step.to as never} onClick={() => setGuideOpen(false)} className="mt-1 inline-block text-xs font-medium text-primary hover:underline">Open {step.label.toLowerCase()} →</Link> : null}</div></li>)}</ol>{role === "proc_admin" ? <Button variant="outline" asChild><Link to="/procurement/getting-started" onClick={() => setGuideOpen(false)}>Open setup guide</Link></Button> : null}<p className="text-xs text-muted-foreground">Demo records only. Finance owns accounting and payment execution.</p></DialogContent></Dialog> : null}
    </div>
  );
}
