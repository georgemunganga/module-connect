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
  Search,
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
import { entities, notifications, workspaces } from "@/mock/data";
import type { Role } from "@/mock/types";
import { hrmModule } from "@/modules/hrm/nav";
import type { ModuleDefinition, NavItem, NavSection } from "@/platform/nav";
import { useApp } from "@/platform/app-context";
import { cn } from "@/lib/utils";

const modules = [
  { id: "hrm", label: "Human resources", available: true },
  { id: "finance", label: "Finance", available: false },
  { id: "procurement", label: "Procurement", available: false },
  { id: "inventory", label: "Inventory", available: false },
  { id: "accounting", label: "Accounting", available: false },
];

function useVisibleSections(mod: ModuleDefinition, role: Role) {
  return mod.sections.filter((s) => !s.roles || s.roles.includes(role));
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
    >
      {item.label}
    </Link>
  );
}

function Section({ section, onNavigate }: { section: NavSection; onNavigate?: () => void }) {
  const Icon = section.icon;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const childActive =
    section.items?.some((i) => pathname.startsWith(i.to.split("/$")[0])) ?? false;
  const [open, setOpen] = useState(childActive);
  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  if (section.to) {
    return (
      <Link
        to={section.to}
        onClick={onNavigate}
        activeProps={{ className: "bg-rail-active text-rail-foreground" }}
        activeOptions={{ exact: section.to === "/" }}
        className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-rail-muted transition-colors hover:bg-rail-active hover:text-rail-foreground"
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        {section.label}
      </Link>
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

function RailContent({ onNavigate }: { onNavigate?: () => void }) {
  const { role } = useApp();
  const sections = useVisibleSections(hrmModule, role);
  const main = sections.filter((s) => s.id !== "configuration");
  const config = sections.find((s) => s.id === "configuration");

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 py-4">
        <p className="px-2 text-xs font-semibold uppercase tracking-wide text-rail-muted">Module</p>
        <p className="px-2 text-sm font-semibold text-rail-foreground">{hrmModule.name}</p>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {main.map((s) => <Section key={s.id} section={s} onNavigate={onNavigate} />)}
      </nav>
      {config ? (
        <div className="border-t border-rail-active px-3 py-3">
          <Section section={config} onNavigate={onNavigate} />
          <p className="px-2.5 pt-1 text-[11px] text-rail-muted">
            All setup and admin lives here.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { role } = useApp();
  const sections = useVisibleSections(hrmModule, role);
  const links = sections.flatMap((s) =>
    s.to ? [{ label: s.label, to: s.to, params: undefined }] : (s.items ?? []).map((i) => ({ label: `${s.label}: ${i.label}`, to: i.to, params: i.params })),
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search screens, records and actions…" />
      <CommandList>
        <CommandEmpty>Nothing matched. Try a reference like LV-2026-0412.</CommandEmpty>
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
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { role, setRole, entityId, setEntityId, branch, setBranch, theme, toggleTheme } = useApp();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const entity = entities.find((e) => e.id === entityId)!;
  const unread = notifications.filter((n) => n.unread).length;

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
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                <Menu className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-rail p-0 text-rail-foreground">
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <RailContent />
            </SheetContent>
          </Sheet>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2">
                <Grid2x2 className="size-4" aria-hidden />
                <span className="hidden font-semibold sm:inline">Meridian ERP</span>
                <ChevronDown className="size-3.5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Modules</DropdownMenuLabel>
              {modules.map((m) => (
                <DropdownMenuItem key={m.id} disabled={!m.available}>
                  {m.label}
                  {!m.available ? <span className="ml-auto text-xs text-muted-foreground">Not enabled</span> : null}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Workspace</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={role} onValueChange={(v) => setRole(v as Role)}>
                {workspaces.map((w) => (
                  <DropdownMenuRadioItem key={w.id} value={w.id}>
                    {w.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
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
          </DropdownMenu>

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-muted-foreground"
              onClick={() => setPaletteOpen(true)}
            >
              <Search className="size-4" aria-hidden />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden rounded border px-1 text-[10px] sm:inline">⌘K</kbd>
            </Button>

            <Button asChild variant="ghost" size="icon" className="relative" aria-label="Tasks and approvals">
              <Link to="/approvals">
                <CheckSquare className="size-5" aria-hidden />
                <span className="absolute right-1 top-1 rounded-full bg-warning px-1 text-[10px] font-semibold text-warning-foreground">3</span>
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
                {notifications.map((n) => (
                  <DropdownMenuItem key={n.id} className="flex-col items-start gap-0.5">
                    <span className="text-sm font-medium">{n.title}</span>
                    <span className="text-xs text-muted-foreground">{n.body}</span>
                    <span className="text-[11px] text-muted-foreground">{n.at}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="icon" aria-label="Help" asChild>
              <Link to="/help">
                <CircleHelp className="size-5" aria-hidden />
              </Link>
            </Button>

            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
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
                  <span>Amara Chukwuemeka-Van der Berghe</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Acting as {workspaces.find((w) => w.id === role)?.label}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/workers/$id" params={{ id: "w-1001" }}>My profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/setup">Setup guide</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <LogOut className="size-4" aria-hidden /> Sign out (mock)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <Separator />
      </header>

      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 bg-rail text-rail-foreground lg:block">
          <RailContent />
        </aside>
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl space-y-6">{children}</div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
