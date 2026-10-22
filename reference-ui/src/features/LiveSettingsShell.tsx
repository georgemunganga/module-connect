import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Menu, Search, Settings2, X } from "lucide-react";
import { ErpSidebarHeader, ErpTopBar } from "@amizopower/erp-ui";
import { Input, PageHeader } from "../components/ui";
import { BrandMark, useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { findModule, procurementModuleGroups, procurementModuleSlugs, settingsRoutes } from "../data/settings";
import { LiveConfiguration } from "./LiveConfiguration";
import { LivePolicies } from "./LivePolicies";
import { LiveApprovalSettings } from "./LiveApprovalSettings";

const buyingLinks = [
  { label: "Buying categories & methods", href: "/settings/reference-data" },
  { label: "Buying rules", href: "/settings/buying-rules" },
] as const;

function Notice({ title, detail }: { title: string; detail: string }) {
  return <div className="mx-auto max-w-2xl">
    <PageHeader title={title} />
    <section className="rounded-xl border border-border bg-surface p-7">
      <p className="text-sm text-muted-foreground">{detail}</p>
      <Link to="/settings" className="mt-5 inline-block text-sm font-semibold text-primary">Back to settings</Link>
    </section>
  </div>;
}

/** Live Settings retains the imported directory and rail without mounting local preview editors. */
export function LiveSettingsShell() {
  const readiness = useLiveReadiness();
  const { branding, assignedRoles, selection } = useErpShell();
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem("erp.sidebar.collapsed.v1") === "true");
  useEffect(() => { window.localStorage.setItem("erp.sidebar.collapsed.v1", String(collapsed)); }, [collapsed]);
  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);
  const path = location.pathname.replace(/\/$/, "") || "/settings";
  if (!readiness) return <Notice title="Settings unavailable" detail="Choose an ERP company to open Procurement settings." />;
  if (selection.entityId && selection.entityId !== readiness.legalEntityId)
    return <p role="status">Checking the selected company…</p>;

  const roles = new Set(assignedRoles.map(role => role.toLowerCase()));
  const canOpenCore = roles.has("erp_admin") || roles.has("hr_admin");
  const canReadConfiguration = readiness.permissions.includes("procurement-configuration-read")
    && readiness.capabilities.configurationDraft === true;
  const term = search.trim().toLowerCase();
  const cards = [
    { title: "Buying", links: buyingLinks.map(link => ({ ...link })) },
    ...procurementModuleGroups.map(group => ({ title: group.title, links: group.slugs.map(slug => {
      const module = findModule(slug)!;
      return { label: module.title, href: `/settings/modules/${slug}/${module.tabs[0].slug}` };
    }) })),
  ];
  const visible = cards.map(card => ({ ...card, links: card.links.filter(link => !term || `${card.title} ${link.label}`.toLowerCase().includes(term)) }))
    .filter(card => card.links.length);
  let content: ReactNode;
  if (path === "/settings") content = <div className="mx-auto max-w-[1240px]">
    <PageHeader title="Procurement settings" subtitle="Choose the buying controls you need. Company and user settings are in ERP Core." />
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map(card => <section key={card.title}
      className="rounded-xl border border-border bg-surface p-5 shadow-[0_4px_16px_rgba(30,45,70,.04)]">
      <div className="mb-4 rounded-lg bg-primary-soft px-3 py-2 text-sm font-semibold text-primary">{card.title}</div>
      <div className="space-y-0.5">{card.links.map(link => <Link key={link.href} to={link.href}
        className="flex items-center justify-between rounded-md px-1 py-2 text-[13px] text-muted-foreground hover:bg-surface-muted hover:text-primary">{link.label}<ArrowRight size={14} /></Link>)}</div>
    </section>)}</div>
    {!visible.length && <p className="mt-5 text-sm text-muted-foreground">No Procurement settings match “{search}”.</p>}
    {canOpenCore && <a href="/core/workspace/settings" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary">Open ERP Core settings <ArrowRight size={14} /></a>}
    <p className="mt-4 text-xs text-muted-foreground">Finance manages tax, accounting and payments. Other Procurement controls stay visible here and cannot be changed until their live settings are connected.</p>
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
      {(slug === "purchase-requests" || slug === "purchase-orders") && tab === "approvals"
        ? <LiveApprovalSettings key={`${readiness.tenantId}:${readiness.legalEntityId}:${selection.branch ?? ""}:${readiness.workerId ?? "admin"}:${slug}`}
          initialAction={slug === "purchase-orders" ? "PurchaseOrder.Approve" : "PurchaseRequest.Approve"} />
        : <section className="rounded-xl border border-border bg-surface p-7">
        <h2 className="text-lg font-semibold">{module.tabs.find(item => item.slug === tab)?.title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">This setting does not have a live editor yet. No changes can be saved here. Buying categories and rules are available from the Settings directory.</p>
      </section>}
    </div> : <Notice title="Setting not found" detail="Choose a Procurement setting from the directory." />;
  } else if (settingsRoutes.some(route => route.path === path))
    content = <Notice title="Setting unavailable" detail="This control is not connected to the live ERP. Company identity and user access are managed in ERP Core; Finance manages tax and payment settings." />;
  else content = <Notice title="Setting not found" detail="Choose a setting from the directory." />;

  const navLink = (label: string, href: string) => <Link key={href} to={href} title={label} aria-current={path === href ? "page" : undefined}
    onClick={() => setMobileNavOpen(false)}
    className={`block rounded-md px-3 py-2 text-xs ${path === href ? "bg-rail-active font-semibold text-rail-foreground" : "text-rail-muted hover:bg-rail-active hover:text-rail-foreground"}`}>{label}</Link>;
  return <div className="min-h-screen bg-background text-foreground">
    <ErpTopBar position="fixed" className="flex h-14 min-w-0 items-center gap-3 px-3 sm:px-6">
      <button type="button" className="rounded-md p-1 lg:hidden" aria-label="Open settings navigation" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button>
      <Link to="/" className="flex shrink-0 items-center gap-3" aria-label="Close Settings and return home"><BrandMark onDark showName={false} /><span className="hidden text-sm font-semibold sm:block">Procurement Settings</span></Link>
      <span className="hidden truncate text-xs opacity-80 md:block">{branding?.displayName || "ERP workspace"}</span>
      <div className="relative mx-auto w-full max-w-[420px]"><Search size={16} className="absolute left-3 top-2.5 text-muted-foreground" /><Input aria-label="Search settings" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search settings" className="h-9 bg-surface pl-9 text-foreground" /></div>
      <Link to="/" className="hidden shrink-0 items-center gap-1 rounded-full border border-current px-3 py-2 text-xs sm:flex">Close Settings <X size={14} /></Link>
    </ErpTopBar>
    <div className="flex min-h-dvh pt-14">
      {mobileNavOpen && <button type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden" />}
      <aside className={`fixed bottom-0 left-0 top-14 z-40 overflow-y-auto border-r border-rail-active bg-rail text-rail-foreground transition-[width,transform] duration-200 lg:sticky lg:top-14 lg:block lg:h-[calc(100dvh-3.5rem)] lg:translate-x-0 ${collapsed ? "w-64 lg:w-16" : "w-64"} ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <ErpSidebarHeader moduleName="Procurement" collapsed={collapsed} onToggle={() => setCollapsed(value => !value)} className="hidden lg:flex" />
        <nav aria-label="Procurement settings" className="px-3 py-4">
          <Link to="/settings" title="All settings" aria-current={path === "/settings" ? "page" : undefined} onClick={() => setMobileNavOpen(false)}
            className={`mb-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-rail-foreground hover:bg-rail-active ${collapsed ? "lg:justify-center lg:px-1" : ""}`}><Settings2 size={16} /><span className={collapsed ? "lg:sr-only" : ""}>All settings</span></Link>
          <div className={collapsed ? "lg:hidden" : ""}>
            <div className="mb-4"><p className="px-3 py-2 text-xs font-semibold text-rail-muted">Buying</p>{buyingLinks.map(link => navLink(link.label, link.href))}</div>
            {procurementModuleGroups.map(group => <div key={group.title} className="mb-4"><p className="px-3 py-2 text-xs font-semibold text-rail-muted">{group.title}</p>{group.slugs.map(slug => { const module = findModule(slug)!; return navLink(module.title, `/settings/modules/${slug}/${module.tabs[0].slug}`); })}</div>)}
          </div>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 pb-10 sm:px-7 lg:px-10">{content}</main>
    </div>
  </div>;
}
