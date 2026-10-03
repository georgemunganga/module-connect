import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useApp } from "@/platform/app-context";
import { RestrictedState } from "@/platform/components/States";
import { settingsGroups, type SettingsItem } from "@/modules/procurement/settings-catalog";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";

export const Route = createFileRoute("/procurement/configuration")({
  head: () => ({ meta: [
    { title: "Configuration — Meridian ERP Procurement" },
    { name: "description", content: "Procurement settings directory with shared ERP ownership and transaction preferences." },
  ] }),
  component: ProcConfiguration,
});

function SettingCard({ item }: { item: SettingsItem }) {
  const content = <>
    <span className="min-w-0"><span className="block font-medium">{item.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{item.detail}</span></span>
    <span className="flex shrink-0 flex-col items-end gap-1 text-xs"><span className="rounded-full border px-2 py-0.5 text-muted-foreground">{item.owner}</span><span className={item.to ? "text-primary" : "text-muted-foreground"}>{item.to ? "Open" : "Reference"}</span></span>
  </>;
  return item.to ? <Link to={item.to} className="flex min-h-20 items-start justify-between gap-4 rounded-lg border bg-surface p-3 text-sm hover:border-primary focus-visible:outline-2 focus-visible:outline-primary">{content}</Link>
    : <div className="flex min-h-20 items-start justify-between gap-4 rounded-lg border bg-surface p-3 text-sm">{content}</div>;
}

function ProcConfiguration() {
  const { role } = useApp();
  const [active, setActive] = useState("Module Settings");
  const [query, setQuery] = useState("");
  if (role !== "proc_admin") return <AppShell><RestrictedState /></AppShell>;
  const normalized = query.trim().toLowerCase();
  const groups = settingsGroups.filter((group) => normalized || group.name === active).map((group) => ({ ...group,
    sections: group.sections.map((section) => ({ ...section, items: section.items.filter((item) => !normalized || `${group.name} ${section.name} ${item.name} ${item.owner} ${item.detail}`.toLowerCase().includes(normalized)) })).filter((section) => section.items.length),
  })).filter((group) => group.sections.length);
  const count = groups.reduce((sum, group) => sum + group.sections.reduce((sectionSum, section) => sectionSum + section.items.length, 0), 0);

  return <AppShell>
    <PageHeader eyebrow="Procurement" title="Configuration" description="Find settings by business area. Procurement owns buying rules; ERP Core, Finance and shared services own their own records." />
    <div className="mt-5"><label htmlFor="setting-search" className="text-sm font-medium">Find a setting</label><Input id="setting-search" className="mt-1 max-w-xl" type="search" placeholder="Search Bills, roles, taxes, workflow…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="Configuration groups" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {settingsGroups.map((group) => <button key={group.name} type="button" onClick={() => { setActive(group.name); setQuery(""); }} aria-current={!normalized && active === group.name ? "page" : undefined} className={`shrink-0 rounded-md px-3 py-2 text-left text-sm lg:w-full ${!normalized && active === group.name ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{group.name}</button>)}
      </nav>
      <div className="space-y-7">
        {normalized ? <p role="status" className="text-sm text-muted-foreground">{count} setting{count === 1 ? "" : "s"} matching “{query.trim()}”</p> : null}
        {groups.map((group) => <section key={group.name} aria-labelledby={`settings-${group.name.replaceAll(" ", "-")}`}>
          <h2 id={`settings-${group.name.replaceAll(" ", "-")}`} className="text-lg font-semibold">{group.name}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{group.description}</p>
          <div className="mt-4 space-y-5">{group.sections.map((section) => <div key={section.name}><h3 className="mb-2 text-sm font-semibold">{section.name}</h3><div className="grid gap-2 sm:grid-cols-2">{section.items.map((item) => <SettingCard key={item.name} item={item} />)}</div></div>)}</div>
        </section>)}
        {!groups.length ? <p className="rounded-lg border bg-surface p-5 text-sm text-muted-foreground">No setting matches this search.</p> : null}
        <p className="rounded-lg border bg-surface p-3 text-xs text-muted-foreground">“Reference” means the setting is owned elsewhere or still needs its ERP integration. Only “Open” destinations have a Procurement screen in this demo. Saving a preview does not activate an approval or payment workflow.</p>
      </div>
    </div>
  </AppShell>;
}
