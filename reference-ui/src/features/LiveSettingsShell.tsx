import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, ChevronDown, LayoutGrid, Menu, Search, X } from "lucide-react";
import { Input, PageHeader } from "../components/ui";
import { BrandMark, useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { findModule, procurementModuleGroups, procurementModuleSlugs, settingsRoutes } from "../data/settings";
import { LiveConfiguration } from "./LiveConfiguration";
import { LivePolicies } from "./LivePolicies";

const coreGroups = [
  { title: "Organization", links: [
    { label: "Company profile", href: "/core/workspace/settings/organization" },
    { label: "Branding", href: "/core/workspace/settings/branding" },
    { label: "Locations", href: "/core/workspace/settings/organization#locations" },
    { label: "Departments", href: "/core/workspace/settings/organization#departments" },
  ] },
  { title: "Users & access", links: [
    { label: "Users", href: "/core/workspace/settings/users" },
    { label: "Roles", href: "/core/workspace/settings/roles" },
    { label: "Branch access", href: "/core/workspace/settings/branch-access" },
  ] },
] as const;
const buyingLinks = [
  { label: "Buying categories & methods", href: "/settings/reference-data" },
  { label: "Buying rules", href: "/settings/buying-rules" },
] as const;

function Notice({ title, detail }: { title: string; detail: string }) {
  return <div className="mx-auto max-w-2xl rounded-xl border border-border bg-surface p-7">
    <h1 className="text-xl font-semibold">{title}</h1>
    <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
    <Link to="/settings" className="mt-5 inline-block text-sm font-semibold text-primary">Back to settings</Link>
  </div>;
}

/** Live Settings uses the imported settings shell, without browser-local preview editors. */
export function LiveSettingsShell() {
  const readiness = useLiveReadiness();
  const { branding, assignedRoles, selection } = useErpShell();
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [modulesOpen, setModulesOpen] = useState(false);
  const path = location.pathname.replace(/\/$/, "") || "/settings";
  if (!readiness) return <Notice title="Settings unavailable" detail="Choose an ERP company to open Procurement settings." />;
  if (selection.entityId && selection.entityId !== readiness.legalEntityId)
    return <p role="status">Checking the selected company…</p>;
  const roles = new Set(assignedRoles.map(role => role.toLowerCase()));
  const canOpenCore = roles.has("erp_admin") || roles.has("hr_admin");
  const canOpenHrm = ["employee", "manager", "hr_ops", "payroll", "finance_approver", "hr_admin", "investigator", "timesheet_operator"].some(role => roles.has(role));
  const canReadConfiguration = readiness.permissions.includes("procurement-configuration-read")
    && readiness.capabilities.configurationDraft === true;
  const term = search.trim().toLowerCase();
  const cards = [
    ...coreGroups.filter(() => canOpenCore).map(group => ({ title: group.title, links: group.links.map(link => ({ ...link, external: true })) })),
    { title: "Buying", links: buyingLinks.map(link => ({ ...link, external: false })) },
    ...procurementModuleGroups.map(group => ({ title: group.title, links: group.slugs.map(slug => {
      const module = findModule(slug)!;
      return { label: module.title, href: `/settings/modules/${slug}/${module.tabs[0].slug}`, external: false };
    }) })),
  ];
  const visible = cards.map(card => ({ ...card, links: card.links.filter(link => !term || `${card.title} ${link.label}`.toLowerCase().includes(term)) }))
    .filter(card => card.links.length);
  let content: ReactNode;
  if (path === "/settings") content = <div className="mx-auto max-w-[1240px]">
    <PageHeader title="Procurement settings" subtitle="Manage buying rules here. Company and user settings open in ERP Core." />
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map(card => <section key={card.title}
      className="rounded-xl border border-border bg-surface p-5 shadow-[0_4px_16px_rgba(30,45,70,.04)]">
      <div className="mb-4 rounded-lg bg-primary-soft px-3 py-2 text-sm font-semibold text-primary">{card.title}</div>
      <div className="space-y-0.5">{card.links.map(link => link.external
        ? <a key={link.href} href={link.href} className="flex items-center justify-between rounded-md px-1 py-2 text-[13px] text-muted-foreground hover:bg-surface-muted hover:text-primary">{link.label}<ArrowRight size={14} /></a>
        : <Link key={link.href} to={link.href} className="flex items-center justify-between rounded-md px-1 py-2 text-[13px] text-muted-foreground hover:bg-surface-muted hover:text-primary">{link.label}<ArrowRight size={14} /></Link>)}</div>
    </section>)}</div>
    {!visible.length && <p className="mt-5 text-sm text-muted-foreground">No settings match “{search}”.</p>}
    <p className="mt-6 text-xs text-muted-foreground">Finance manages tax, accounting and payments. Additional Procurement preferences are listed for visibility and cannot be changed until their live controls are connected.</p>
  </div>;
  else if (path === "/settings/reference-data" || path === "/settings/buying-rules")
    content = !canReadConfiguration ? <Notice title="Buying settings unavailable" detail="Your account cannot open these company buying settings, or their live configuration is not ready." />
      : path === "/settings/reference-data"
        ? <LiveConfiguration key={`${readiness.tenantId}:${readiness.legalEntityId}:${selection.branch ?? ""}:${readiness.workerId ?? "admin"}`} />
        : <LivePolicies key={`${readiness.tenantId}:${readiness.legalEntityId}:${selection.branch ?? ""}:${readiness.workerId ?? "admin"}`} />;
  else if (path.startsWith("/settings/modules/")) {
    const [, , , slug, tab = "preferences"] = path.split("/");
    const module = procurementModuleSlugs.has(slug) ? findModule(slug) : undefined;
    content = module && module.tabs.some(item => item.slug === tab) ? <div className="mx-auto max-w-[1240px]">
      <PageHeader title={`${module.title} settings`} subtitle={module.description} />
      <nav aria-label={`${module.title} setting tabs`} className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {module.tabs.map(item => <Link key={item.slug} to={`/settings/modules/${slug}/${item.slug}`}
          aria-current={item.slug === tab ? "page" : undefined}
          className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm ${item.slug === tab ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{item.title}</Link>)}
      </nav>
      <Notice title={`${module.title}: ${module.tabs.find(item => item.slug === tab)?.title}`}
        detail="This setting does not have a live editor yet. No changes can be saved here. Use Buying categories & methods or Buying rules for the controls already connected to ERP." />
    </div> : <Notice title="Setting not found" detail="Choose a Procurement setting from the directory." />;
  } else if (settingsRoutes.some(route => route.path === path))
    content = <Notice title="Setting unavailable" detail="This control is not connected to the live ERP. Company identity and user access are managed in ERP Core; Finance manages tax and payment settings." />;
  else content = <Notice title="Setting not found" detail="Choose a setting from the directory." />;

  return <div className="min-h-screen bg-background text-foreground">
    <header className="sticky top-0 z-30 flex min-h-[74px] items-center gap-4 border-b border-border bg-surface px-4 sm:px-7">
      <button type="button" className="rounded-md border border-border p-2 text-muted-foreground lg:hidden" aria-label="Open settings navigation" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button>
      <Link to="/" className="flex items-center gap-3 border-r border-border pr-5" aria-label="Close Settings and return home">
        <BrandMark showName={false} /><span className="hidden sm:block"><span className="block text-[15px] font-semibold text-foreground">Procurement Settings</span><span className="block text-xs text-muted-foreground">{branding?.displayName || "ERP workspace"}</span></span>
      </Link>
      <div className="relative mx-auto w-full max-w-[420px]"><Search size={16} className="absolute left-3 top-3 text-muted-foreground" /><Input aria-label="Search settings" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search settings ( / )" className="pl-9" /></div>
      <div className="relative"><button type="button" aria-label="Switch ERP module" aria-expanded={modulesOpen} onClick={() => setModulesOpen(!modulesOpen)} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-semibold hover:bg-secondary"><LayoutGrid size={15} /><span className="hidden sm:inline">Procurement</span><ChevronDown size={13} /></button>
        {modulesOpen && <div className="absolute right-0 top-11 z-50 w-56 rounded-lg border border-border bg-surface p-2 text-foreground shadow-xl"><p className="px-2 py-1 text-[11px] font-semibold uppercase text-muted-foreground">My modules</p>{canOpenHrm && <a href="/hrm" className="block rounded px-2 py-2 text-sm hover:bg-secondary">Human resources</a>}<a href="/procurement/workspace/" className="block rounded bg-primary-soft px-2 py-2 text-sm font-semibold text-primary">Procurement</a>{canOpenCore && <a href="/core" className="block rounded px-2 py-2 text-sm hover:bg-secondary">ERP Core</a>}</div>}</div>
      <Link to="/" className="hidden shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-foreground hover:bg-secondary sm:flex">Close Settings <X size={14} className="text-muted-foreground" /></Link>
    </header>
    <div className="flex min-h-[calc(100vh-74px)]">
      {mobileNavOpen && <button type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden" />}
      <aside className={`fixed bottom-0 left-0 top-[74px] z-40 w-64 overflow-y-auto border-r border-rail-active bg-rail text-rail-foreground lg:sticky lg:top-[74px] lg:block lg:h-[calc(100vh-74px)] lg:translate-x-0 ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <nav aria-label="Procurement settings" className="px-3 py-5">
          <Link to="/settings" onClick={() => setMobileNavOpen(false)} className="mb-2 block rounded-md px-3 py-2 text-sm font-semibold text-rail-foreground hover:bg-rail-active">All settings</Link>
          {canOpenCore && coreGroups.map(group => <div key={group.title} className="mb-4"><p className="px-3 py-2 text-xs font-semibold text-rail-muted">{group.title}</p>{group.links.map(link => <a key={link.href} href={link.href} className="block rounded-md px-3 py-2 text-xs text-rail-muted hover:bg-rail-active hover:text-rail-foreground">{link.label}</a>)}</div>)}
          <div className="mb-4"><p className="px-3 py-2 text-xs font-semibold text-rail-muted">Buying</p>{buyingLinks.map(link => <Link key={link.href} to={link.href} onClick={() => setMobileNavOpen(false)} aria-current={path === link.href ? "page" : undefined} className="block rounded-md px-3 py-2 text-xs text-rail-muted hover:bg-rail-active hover:text-rail-foreground">{link.label}</Link>)}</div>
          {procurementModuleGroups.map(group => <div key={group.title} className="mb-4"><p className="px-3 py-2 text-xs font-semibold text-rail-muted">{group.title}</p>{group.slugs.map(slug => { const module = findModule(slug)!; const href = `/settings/modules/${slug}/${module.tabs[0].slug}`; return <Link key={slug} to={href} onClick={() => setMobileNavOpen(false)} className="block rounded-md px-3 py-2 text-xs text-rail-muted hover:bg-rail-active hover:text-rail-foreground">{module.title}</Link>; })}</div>)}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 pb-10 sm:px-7 lg:px-10">{content}</main>
    </div>
  </div>;
}
