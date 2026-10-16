import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Code2,
  CreditCard,
  FileText,
  Globe2,
  LayoutGrid,
  Mail,
  Menu,
  Plus,
  Receipt,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Panel,
  Select,
  Textarea,
} from "../components/ui";
import { useApp, useStoredState } from "../lib/store";
import {
  findModule,
  moduleSettings,
  settingsRoutes,
  type ModuleSettingsConfig,
} from "../data/settings";

import { SetupConfig } from "./SetupConfig";
import { CurrencySettings, TaxSettings } from "./SettingsLists";

const NAV_BLUE = "text-[#2879dc]";

type SavePreview = (label: string) => void;

const organizationLinks = [
  ["Organization", "/settings/profile"],
  ["Profile", "/settings/profile"],
  ["Branding", "/settings/branding"],
  ["Locations", "/settings/locations"],
];
const setupLinks = [
  ["General", "/settings/general"],
  ["Currencies", "/settings/currencies"],
  ["Payment Terms", "/settings/payment-terms"],
  ["Vendor Portal", "/settings/vendor-portal"],
  ["Punchout Catalogs", "/settings/punchout-catalogs"],
];
const userLinks = [
  ["Users", "/settings/users"],
  ["Roles", "/settings/roles"],
  ["Departments", "/settings/departments"],
];
const taxLinks = [
  ["Taxes", "/settings/taxes"],
  ["TDS", "/settings/tds"],
  ["Reporting Tags", "/settings/reporting-tags"],
];
const customizationLinks = [
  ["Transaction Number Series", "/settings/transaction-number-series"],
  ["PDF Templates", "/settings/customization/pdf-templates"],
  ["Email Notifications", "/settings/customization/email-notifications"],
  ["Web Tabs", "/settings/web-tabs"],
];
const automationLinks = [
  ["Workflow Rules", "/settings/automation/workflow-rules"],
  ["Workflow Actions", "/settings/automation/workflow-actions"],
  ["Workflow Logs", "/settings/automation/workflow-logs"],
  ["Schedules", "/settings/automation/schedules"],
];

const groupIcons: Record<string, ReactNode> = {
  Organization: <Building2 size={16} />,
  "Users & Roles": <Users size={16} />,
  "Taxes & Compliance": <ShieldCheck size={16} />,
  "Setup & Configurations": <Settings2 size={16} />,
  Customization: <Sparkles size={16} />,
  Automation: <Zap size={16} />,
  General: <LayoutGrid size={16} />,
  Purchases: <Receipt size={16} />,
};

const moduleLabel = (slug: string) =>
  findModule(slug)?.title ?? slug.replaceAll("-", " ");
const titleCase = (value: string) =>
  value
    .split(/[-_]/)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");

export function Settings() {
  const location = useLocation();
  const { notify } = useApp();
  const [preview, setPreview] = useStoredState<Record<string, string>>(
    "settings.preview.v1",
    {},
  );
  const [search, setSearch] = useState("");
  const [resetVersion, setResetVersion] = useState(0);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  useEffect(() => {
    const reset = () => setResetVersion((previous) => previous + 1);
    window.addEventListener("procureui.reset-settings", reset);
    return () => window.removeEventListener("procureui.reset-settings", reset);
  }, []);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const savePreview = (label: string) => {
    const fields = Array.from(
      document.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("main input, main select, main textarea"),
    ).map((element, index) => ({
      label:
        element.getAttribute("aria-label") ||
        element.closest("label")?.querySelector("span")?.textContent ||
        element.name ||
        `Field ${index + 1}`,
      value:
        element instanceof HTMLInputElement &&
        ["checkbox", "radio"].includes(element.type)
          ? element.checked
            ? "Yes"
            : "No"
          : element.value,
    }));
    setPreview((previous) => ({
      ...previous,
      lastSaved: `${label} · ${new Date().toLocaleTimeString()}`,
      snapshot: JSON.stringify(fields),
      snapshotTitle: label,
    }));
    setSnapshotOpen(true);
    notify(
      `${label} snapshot stored locally. No live configuration is applied.`,
    );
  };
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);
  const currentPath = location.pathname.replace(/\/$/, "") || "/settings";
  const isIndex = currentPath === "/settings";
  const content = isIndex ? (
    <SettingsIndex search={search} />
  ) : (
    <SettingsRouteContent
      key={`${currentPath}${location.search}-${resetVersion}`}
      path={currentPath}
      onSavePreview={savePreview}
    />
  );
  const snapshotFields = useMemo(() => {
    try {
      return JSON.parse(preview.snapshot || "[]");
    } catch {
      return [];
    }
  }, [preview.snapshot]);

  return (
    <div className="min-h-screen bg-[#f8f9fc] text-slate-800">
      <header className="sticky top-0 z-30 flex min-h-[74px] items-center gap-4 border-b border-slate-200 bg-white px-4 shadow-sm sm:px-7">
        <button
          className="rounded-md border border-slate-200 p-2 text-slate-500 lg:hidden"
          aria-label="Open settings navigation"
          onClick={() => setMobileNavOpen(true)}
        >
          <Menu size={20} />
        </button>
        <Link
          to="/"
          className="flex items-center gap-3 border-r border-slate-200 pr-5"
          aria-label="Close Settings and return home"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eaf3ff] text-[#2879dc]">
            <Settings2 size={19} />
          </span>
          <span className="hidden sm:block">
            <span className="block text-[15px] font-semibold text-slate-900">
              All Settings
            </span>
            <span className="block text-xs text-slate-400">
              Meridian · frontend demo
            </span>
          </span>
        </Link>
        <div className="relative mx-auto w-full max-w-[420px]">
          <Search size={16} className="absolute left-3 top-3 text-slate-400" />
          <Input
            aria-label="Search settings"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search settings ( / )"
            className="pl-9"
          />
        </div>
        <Link
          to="/"
          className="hidden shrink-0 items-center gap-1 rounded-md bg-slate-50 px-3.5 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-100 sm:flex"
        >
          Close Settings <X size={14} className="text-rose-500" />
        </Link>
      </header>
      <div className="flex min-h-[calc(100vh-74px)]">
        <SettingsSidebar
          open={mobileNavOpen}
          path={currentPath}
          onClose={() => setMobileNavOpen(false)}
        />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-7 lg:px-10">
          {content}
        </main>
      </div>
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-2.5 text-center text-[11px] text-slate-500 backdrop-blur sm:text-left sm:px-7">
        <span className="font-semibold text-slate-700">Frontend demo</span> ·
        only saved preview snapshots stay in this browser. No live
        configuration, automation, or emails are applied.
        {preview.lastSaved && (
          <span className="ml-2 hidden text-slate-400 sm:inline">
            Last preview: {preview.lastSaved}
            <button
              onClick={() => setSnapshotOpen(true)}
              className="ml-3 text-blue-500"
            >
              View snapshot
            </button>
          </span>
        )}
      </div>
      {snapshotOpen && (
        <Modal
          title={`${preview.snapshotTitle || "Settings"} · Local preview snapshot`}
          onClose={() => setSnapshotOpen(false)}
        >
          <p className="mb-4 text-sm text-slate-500">
            The field snapshot below is stored in this browser only. It does not
            change permissions, run scripts, send mail, or apply settings.
          </p>
          <pre className="max-h-96 overflow-auto rounded bg-slate-50 p-4 text-xs whitespace-pre-wrap">
            {JSON.stringify(snapshotFields, null, 2)}
          </pre>
          <Button className="mt-4" onClick={() => setSnapshotOpen(false)}>
            Continue editing
          </Button>
        </Modal>
      )}
    </div>
  );
}

function SettingsSidebar({
  open,
  path,
  onClose,
}: {
  open: boolean;
  path: string;
  onClose: () => void;
}) {
  const moduleGroups = [
    {
      title: "General",
      items: moduleSettings.filter((item) => item.group === "General"),
    },
    {
      title: "Purchases",
      items: moduleSettings.filter((item) => item.group === "Purchases"),
    },
  ];
  return (
    <>
      {open && (
        <button
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
        />
      )}
      <aside
        className={`fixed bottom-0 left-0 top-[74px] z-40 w-[284px] overflow-y-auto border-r border-slate-200 bg-white px-3 py-5 transition-transform lg:sticky lg:top-[74px] lg:block lg:h-[calc(100vh-74px)] lg:w-[250px] lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="mb-3 flex items-center justify-between px-2 lg:hidden">
          <span className="font-semibold">Settings navigation</span>
          <button onClick={onClose} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.12em] text-slate-400">
          Organization settings
        </p>
        <SidebarGroup
          title="Organization"
          path={path}
          links={organizationLinks.slice(1)}
          icon={groupIcons.Organization}
        />
        <SidebarGroup
          title="Users & Roles"
          path={path}
          links={userLinks}
          icon={groupIcons["Users & Roles"]}
        />
        <SidebarGroup
          title="Taxes & Compliance"
          path={path}
          links={taxLinks}
          icon={groupIcons["Taxes & Compliance"]}
        />
        <SidebarGroup
          title="Setup & Configurations"
          path={path}
          links={setupLinks}
          icon={groupIcons["Setup & Configurations"]}
        />
        <SidebarGroup
          title="Customization"
          path={path}
          links={customizationLinks}
          icon={groupIcons.Customization}
        />
        <SidebarGroup
          title="Automation"
          path={path}
          links={automationLinks}
          icon={groupIcons.Automation}
        />
        <p className="mb-2 mt-6 px-3 text-[10px] font-semibold uppercase tracking-[.12em] text-slate-400">
          Module settings
        </p>
        {moduleGroups.map((group) => (
          <ModuleSidebarGroup
            key={group.title}
            {...group}
            path={path}
            icon={groupIcons[group.title]}
          />
        ))}
      </aside>
    </>
  );
}

function SidebarGroup({
  title,
  links,
  path,
  icon,
}: {
  title: string;
  links: string[][];
  path: string;
  icon: ReactNode;
}) {
  const active = links.some(
    ([, href]) => path === href || path.startsWith(`${href}/`),
  );
  const [open, setOpen] = useState(active);
  const expanded = active || open;
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={expanded}
        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium ${expanded ? "text-slate-900" : "text-slate-600"}`}
      >
        {icon}
        <span>{title}</span>
        <ChevronRight
          size={14}
          className={`ml-auto text-slate-400 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>
      {expanded && (
        <div className="ml-3 border-l border-slate-200 pl-2">
          {links.map(([label, href]) => (
            <SidebarLink key={href} label={label} href={href} path={path} />
          ))}
        </div>
      )}
    </div>
  );
}

function ModuleSidebarGroup({
  title,
  items,
  path,
  icon,
}: {
  title: string;
  items: ModuleSettingsConfig[];
  path: string;
  icon: ReactNode;
}) {
  const active = items.some((item) =>
    path.startsWith(`/settings/modules/${item.slug}`),
  );
  const [open, setOpen] = useState(active);
  const expanded = active || open;
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={expanded}
        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium ${expanded ? "text-slate-900" : "text-slate-600"}`}
      >
        {icon}
        <span>{title}</span>
        <ChevronRight
          size={14}
          className={`ml-auto text-slate-400 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>
      {expanded && (
        <div className="ml-3 border-l border-slate-200 pl-2">
          {items.map((item) => (
            <SidebarLink
              key={item.slug}
              label={item.title}
              href={`/settings/modules/${item.slug}/${item.tabs[0].slug}`}
              path={path}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarLink({
  label,
  href,
  path,
}: {
  label: string;
  href: string;
  path: string;
}) {
  const active = path === href || path.startsWith(`${href}/`);
  return (
    <Link
      to={href}
      className={`mb-0.5 block rounded-md px-3 py-2 text-[12px] transition-colors ${active ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
    >
      {label}
    </Link>
  );
}

function SettingsIndex({ search }: { search: string }) {
  const cards = [
    {
      title: "Organization",
      tone: "mint",
      icon: <Building2 size={17} />,
      links: [
        ["Profile", "/settings/profile"],
        ["Branding", "/settings/branding"],
        ["Locations", "/settings/locations"],
        ["General", "/settings/general"],
      ],
    },
    {
      title: "Users & Roles",
      tone: "rose",
      icon: <Users size={17} />,
      links: [
        ["Users", "/settings/users"],
        ["Roles", "/settings/roles"],
        ["Departments", "/settings/departments"],
      ],
    },
    {
      title: "Taxes & Compliance",
      tone: "blue",
      icon: <ShieldCheck size={17} />,
      links: [
        ["Taxes", "/settings/taxes"],
        ["TDS", "/settings/tds"],
        ["Reporting Tags", "/settings/reporting-tags"],
      ],
    },
    {
      title: "Setup & Configurations",
      tone: "amber",
      icon: <Settings2 size={17} />,
      links: [
        ["Currencies", "/settings/currencies"],
        ["Payment Terms", "/settings/payment-terms"],
        ["Vendor Portal", "/settings/vendor-portal"],
        ["Punchout Catalogs", "/settings/punchout-catalogs"],
      ],
    },
    {
      title: "Customization",
      tone: "violet",
      icon: <Sparkles size={17} />,
      links: [
        ["Transaction Number Series", "/settings/transaction-number-series"],
        ["PDF Templates", "/settings/customization/pdf-templates"],
        ["Email Notifications", "/settings/customization/email-notifications"],
        ["Web Tabs", "/settings/web-tabs"],
      ],
    },
    {
      title: "Automation",
      tone: "rose",
      icon: <Zap size={17} />,
      links: [
        ["Workflow Rules", "/settings/automation/workflow-rules"],
        ["Workflow Actions", "/settings/automation/workflow-actions"],
        ["Workflow Logs", "/settings/automation/workflow-logs"],
        ["Schedules", "/settings/automation/schedules"],
      ],
    },
  ];
  const matches = (label: string) =>
    !search.trim() ||
    label.toLowerCase().includes(search.toLowerCase()) ||
    "settings".includes(search.toLowerCase());
  return (
    <div className="mx-auto max-w-[1240px]">
      <PageHeader
        title="Organization Settings"
        subtitle="Configure your procurement workspace without leaving this frontend demo."
        actions={<Badge>Demo workspace</Badge>}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <section
            key={card.title}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_4px_16px_rgba(30,45,70,.04)]"
          >
            <div
              className={`mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${card.tone === "mint" ? "bg-emerald-50 text-emerald-700" : card.tone === "rose" ? "bg-rose-50 text-rose-700" : card.tone === "amber" ? "bg-amber-50 text-amber-700" : card.tone === "violet" ? "bg-violet-50 text-violet-700" : "bg-blue-50 text-blue-700"}`}
            >
              {card.icon}
              {card.title}
            </div>
            <div className="space-y-0.5">
              {card.links
                .filter(([label]) => matches(label))
                .map(([label, href]) => (
                  <Link
                    key={href}
                    to={href}
                    className="flex items-center justify-between rounded-md px-1 py-2 text-[13px] text-slate-600 hover:bg-slate-50 hover:text-blue-700"
                  >
                    {label}
                    <ArrowRight size={14} className="text-slate-300" />
                  </Link>
                ))}
            </div>
          </section>
        ))}
      </div>
      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-[0_4px_16px_rgba(30,45,70,.04)]">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Module Settings
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {["General", "Purchases"].map((group) => (
            <div
              key={group}
              className="rounded-lg border border-slate-100 bg-slate-50/60 p-4"
            >
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                {group === "General" ? (
                  <LayoutGrid size={16} className={NAV_BLUE} />
                ) : (
                  <Receipt size={16} className="text-emerald-600" />
                )}
                {group}
              </div>
              <div className="space-y-0.5">
                {moduleSettings
                  .filter((module) => module.group === group)
                  .map((module) => (
                    <Link
                      key={module.slug}
                      to={`/settings/modules/${module.slug}/${module.tabs[0].slug}`}
                      className="flex items-center justify-between rounded px-1 py-2 text-[13px] text-slate-600 hover:bg-white hover:text-blue-700"
                    >
                      {module.title}
                      <ChevronRight size={14} className="text-slate-300" />
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SettingsRouteContent({
  path,
  onSavePreview,
}: {
  path: string;
  onSavePreview: SavePreview;
}) {
  if (!settingsRoutes.some((route) => route.path === path))
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-8">
        <h1 className="text-xl font-semibold">Settings page not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          That route is not part of the captured Procurement settings flow.
        </p>
        <Link
          to="/settings"
          className="mt-5 inline-block text-sm text-blue-600"
        >
          Return to All Settings →
        </Link>
      </div>
    );
  if (path.startsWith("/settings/modules/")) {
    const [, , , moduleSlug, tab = "preferences"] = path.split("/");
    return (
      <ModulePage
        moduleSlug={moduleSlug}
        activeTab={tab}
        onSavePreview={onSavePreview}
      />
    );
  }
  if (path.startsWith("/settings/builders/"))
    return (
      <BuilderPage
        type={path.split("/")[3] ?? "custom-field"}
        onSavePreview={onSavePreview}
      />
    );
  if (path === "/settings/customization/pdf-templates")
    return <TemplatePage type="pdf" onSavePreview={onSavePreview} />;
  if (path === "/settings/customization/email-notifications")
    return <TemplatePage type="email" onSavePreview={onSavePreview} />;
  if (path.startsWith("/settings/automation/"))
    return (
      <AutomationPage
        kind={path.split("/")[3] ?? "workflow-rules"}
        onSavePreview={onSavePreview}
      />
    );
  const slug = path.replace("/settings/", "") || "general";
  return <ConfigurationPage slug={slug} onSavePreview={onSavePreview} />;
}

function ConfigurationPage({
  slug,
  onSavePreview,
}: {
  slug: string;
  onSavePreview: SavePreview;
}) {
  const [values, setValues] = useState<Record<string, string>>({
    organization: "Meridian Procurement Demo",
    currency: "ZMW",
    timezone: "Africa/Lusaka",
    series: "PO-{YYYY}-{#####}",
  });
  const set = (key: string, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  if (
    [
      "profile",
      "general",
      "branding",
      "payment-terms",
      "vendor-portal",
      "punchout-catalogs",
      "transaction-number-series",
      "reporting-tags",
      "web-tabs",
    ].includes(slug)
  )
    return (
      <div className="mx-auto max-w-[1060px]">
        <PageHeader
          title={titleCase(slug)}
          subtitle="Organization configuration · local preview only"
        />
        <SetupConfig slug={slug} onSavePreview={onSavePreview} />
      </div>
    );
  const title =
    (
      {
        "payment-terms": "Payment Terms",
        "vendor-portal": "Vendor Portal",
        "punchout-catalogs": "Punchout Catalogs",
        "transaction-number-series": "Transaction Number Series",
        "reporting-tags": "Reporting Tags",
        "web-tabs": "Web Tabs",
      } as Record<string, string>
    )[slug] ?? titleCase(slug);
  const subtitle =
    (
      {
        general: "Workspace defaults used across purchasing and payables.",
        profile:
          "Keep organization identity and contact details ready for documents.",
        branding:
          "Preview the visual identity used in procurement communications.",
        locations:
          "Define delivery and billing destinations for the demo organization.",
        currencies: "Maintain currencies available on purchasing documents.",
        users: "Fictional workspace users and access assignments.",
        roles: "Permission groups used by this frontend demo.",
        departments: "Organize requesters and approvers by department.",
        taxes: "Tax rates and treatment available to document forms.",
        tds: "Withholding tax defaults for local compliance scenarios.",
      } as Record<string, string>
    )[slug] ?? `Configure ${title.toLowerCase()} for this fictional workspace.`;
  return (
    <div className="mx-auto max-w-[1060px]">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <Link
            to="/settings"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-blue-700"
          >
            <ArrowLeft size={15} /> All settings
          </Link>
        }
      />
      {slug === "users" || slug === "roles" || slug === "departments" ? (
        <DirectoryConfig slug={slug} onSavePreview={onSavePreview} />
      ) : slug === "locations" ? (
        <LocationsConfig onSavePreview={onSavePreview} />
      ) : slug === "currencies" ? (
        <CurrencySettings onSavePreview={onSavePreview} />
      ) : slug === "taxes" || slug === "tds" ? (
        <TaxSettings kind={slug} onSavePreview={onSavePreview} />
      ) : (
        <Panel
          title="Configuration preview"
          action={<Badge>Unsaved preview</Badge>}
        >
          <div className="grid gap-5 p-5 md:grid-cols-2">
            <Field
              label={slug === "profile" ? "Organization name" : "Display name"}
            >
              <Input
                value={values.organization}
                onChange={(event) => set("organization", event.target.value)}
              />
            </Field>
            <Field label="Default currency">
              <Select
                value={values.currency}
                onChange={(event) => set("currency", event.target.value)}
              >
                <option>ZMW — Zambian Kwacha</option>
                <option>USD — US Dollar</option>
                <option>EUR — Euro</option>
              </Select>
            </Field>
            <Field label="Timezone">
              <Select
                value={values.timezone}
                onChange={(event) => set("timezone", event.target.value)}
              >
                <option>Africa/Lusaka (UTC+02:00)</option>
                <option>UTC</option>
                <option>Europe/London</option>
              </Select>
            </Field>
            <Field label="Status">
              <Select defaultValue="active">
                <option>Active</option>
                <option>Review required</option>
              </Select>
            </Field>
            <Field label="Configuration notes" className="md:col-span-2">
              <Textarea
                defaultValue={`Frontend preview for ${title}. No live tenant configuration is changed.`}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-4">
            <Button onClick={() => onSavePreview(title)}>Save preview</Button>
            <Button
              variant="secondary"
              onClick={() =>
                setValues({
                  organization: "Meridian Procurement Demo",
                  currency: "ZMW — Zambian Kwacha",
                  timezone: "Africa/Lusaka (UTC+02:00)",
                  series: "PO-{YYYY}-{#####}",
                })
              }
            >
              Reset fields
            </Button>
            <span className="text-xs text-slate-400">
              Preview only · not connected to a backend
            </span>
          </div>
        </Panel>
      )}
      {slug === "general" && (
        <Panel title="Purchase workspace defaults" className="mt-5">
          <div className="grid gap-5 p-5 md:grid-cols-2">
            <Field label="Default payment terms">
              <Select defaultValue="net-30">
                <option>Net 30</option>
                <option>Net 15</option>
                <option>Due on receipt</option>
              </Select>
            </Field>
            <Field
              label="Document number format"
              hint="Use {YYYY} and # placeholders for a preview format."
            >
              <Input
                value={values.series}
                onChange={(event) => set("series", event.target.value)}
              />
            </Field>
          </div>
        </Panel>
      )}
    </div>
  );
}

function DirectoryConfig({
  slug,
  onSavePreview,
}: {
  slug: string;
  onSavePreview: SavePreview;
}) {
  const title = titleCase(slug);
  const rows =
    slug === "users"
      ? [
          ["Amara Phiri", "Procurement Lead", "Active"],
          ["Theo Banda", "Finance reviewer", "Active"],
          ["Maya Tembo", "Requester", "Invited"],
        ]
      : slug === "roles"
        ? [
            ["Procurement Lead", "Orders, vendors, approvals", "3 users"],
            ["Finance reviewer", "Bills, payments, reports", "2 users"],
            ["Requester", "Purchase requests", "8 users"],
          ]
        : [
            ["Procurement", "Amara Phiri", "12 requesters"],
            ["Finance", "Theo Banda", "4 requesters"],
            ["Operations", "Maya Tembo", "8 requesters"],
          ];
  return (
    <Panel
      title={`${title} directory`}
      action={
        <Button
          onClick={() =>
            onSavePreview("Directory creation preview — not connected")
          }
        >
          <Plus size={15} /> Add{" "}
          {slug === "users" ? "user" : slug === "roles" ? "role" : "department"}
        </Button>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-left">
          <thead className="table-head">
            <tr>
              <th className="table-cell">Name</th>
              <th className="table-cell">Details</th>
              <th className="table-cell">Status / Members</th>
              <th className="table-cell">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]}>
                <td className="table-cell font-medium text-slate-800">
                  {row[0]}
                </td>
                <td className="table-cell text-slate-500">{row[1]}</td>
                <td className="table-cell">
                  <Badge>{row[2]}</Badge>
                </td>
                <td className="table-cell">
                  <Button
                    variant="ghost"
                    onClick={() => onSavePreview(`${title} · ${row[0]}`)}
                  >
                    Preview edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-100 px-5 py-4 text-xs text-slate-400">
        Fictional users and roles only. Save actions are local previews.
      </div>
    </Panel>
  );
}

function LocationsConfig({ onSavePreview }: { onSavePreview: SavePreview }) {
  const [locations, setLocations] = useState([
    { name: "Lusaka HQ", address: "Plot 17, Cairo Road", type: "Office" },
    {
      name: "Copperbelt Depot",
      address: "Kitwe industrial area",
      type: "Warehouse",
    },
  ]);
  return (
    <Panel
      title="Organization locations"
      action={
        <Button
          onClick={() =>
            setLocations((rows) => [
              ...rows,
              {
                name: "New preview location",
                address: "Draft address",
                type: "Office",
              },
            ])
          }
        >
          <Plus size={15} /> Add location
        </Button>
      }
    >
      <div className="divide-y divide-slate-100">
        {locations.map((location, index) => (
          <div
            className="grid gap-3 p-5 sm:grid-cols-[1fr_1fr_160px_auto] sm:items-center"
            key={`${location.name}-${index}`}
          >
            <div>
              <p className="font-medium text-slate-800">{location.name}</p>
              <p className="mt-1 text-xs text-slate-400">{location.address}</p>
            </div>
            <Input
              defaultValue={location.address}
              aria-label={`${location.name} address`}
            />
            <Select defaultValue={location.type}>
              <option>Office</option>
              <option>Warehouse</option>
              <option>Delivery point</option>
            </Select>
            <Button
              variant="secondary"
              onClick={() => onSavePreview(`Location · ${location.name}`)}
            >
              Save preview
            </Button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ModulePage({
  moduleSlug,
  activeTab,
  onSavePreview,
}: {
  moduleSlug: string;
  activeTab: string;
  onSavePreview: SavePreview;
}) {
  const module = findModule(moduleSlug) ?? moduleSettings[0];
  const tab =
    module.tabs.find((item) => item.slug === activeTab) ?? module.tabs[0];
  return (
    <div className="mx-auto max-w-[1140px]">
      <PageHeader
        title={module.title}
        subtitle={module.description}
        actions={
          <Link
            to="/settings"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-blue-700"
          >
            <ArrowLeft size={15} /> All settings
          </Link>
        }
      />
      <nav
        className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2 pt-2"
        aria-label={`${module.title} setting tabs`}
      >
        {module.tabs.map((item) => (
          <Link
            key={item.slug}
            to={`/settings/modules/${module.slug}/${item.slug}`}
            className={`shrink-0 border-b-2 px-3 py-3 text-[13px] ${item.slug === tab.slug ? "border-blue-500 font-semibold text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {item.title}
          </Link>
        ))}
      </nav>
      {renderModuleTab(module, tab.slug, onSavePreview)}
    </div>
  );
}

function renderModuleTab(
  module: ModuleSettingsConfig,
  tab: string,
  onSavePreview: SavePreview,
) {
  if (tab === "preferences")
    return <PreferencesPanel module={module} onSavePreview={onSavePreview} />;
  if (tab === "approvals")
    return <ApprovalsPanel module={module} onSavePreview={onSavePreview} />;
  if (tab === "fields")
    return (
      <BuilderList
        module={module}
        kind="fields"
        action="custom-field"
        onSavePreview={onSavePreview}
      />
    );
  if (tab === "validation-rules")
    return (
      <BuilderList
        module={module}
        kind="validation rules"
        action="validation-rule"
        onSavePreview={onSavePreview}
      />
    );
  if (tab === "buttons")
    return (
      <BuilderList
        module={module}
        kind="buttons"
        action="custom-button"
        onSavePreview={onSavePreview}
      />
    );
  if (tab === "related-lists")
    return (
      <BuilderList
        module={module}
        kind="related lists"
        action="related-list"
        onSavePreview={onSavePreview}
      />
    );
  return <PageLayoutPanel module={module} onSavePreview={onSavePreview} />;
}

function PreferencesPanel({
  module,
  onSavePreview,
}: {
  module: ModuleSettingsConfig;
  onSavePreview: SavePreview;
}) {
  const [closeRule, setCloseRule] = useState(
    "When Receives and Bills are recorded",
  );
  const specific =
    module.slug === "bills" ? (
      <>
        <ToggleRow
          label="Match bills to purchase orders automatically"
          hint="Suggest matching lines when a bill is opened."
        />
        <ToggleRow
          label="Require a receive before bill approval"
          hint="Keep three-way reconciliation visible to reviewers."
        />
      </>
    ) : module.slug === "purchase-receives" ? (
      <>
        <ToggleRow
          label="Allow partial receipts"
          hint="Record deliveries across multiple receiving notes."
        />
        <ToggleRow label="Require a purchase order reference" />
      </>
    ) : module.slug === "vendors" ? (
      <>
        <ToggleRow label="Require vendor tax registration" />
        <ToggleRow label="Allow vendors to update their portal profile" />
      </>
    ) : module.slug === "purchase-requests" ? (
      <>
        <ToggleRow label="Allow requesters to suggest a vendor" />
        <ToggleRow label="Require budget owner review" />
      </>
    ) : module.slug === "items" ? (
      <>
        <ToggleRow label="Require an account for every item" />
        <ToggleRow label="Show inactive items in selectors" />
      </>
    ) : (
      <>
        <ToggleRow
          label={`Allow users to record advances for ${module.title}`}
        />
        <ToggleRow label="Allow vendors to accept or decline purchase orders via public links" />
      </>
    );
  return (
    <Panel
      title={`${module.title} preferences`}
      action={<Badge>Unsaved preview</Badge>}
    >
      <div className="space-y-1 p-5">
        {specific}
        <div className="mt-5 border-t border-slate-100 pt-5">
          <Field
            label={`When should ${module.title} be closed?`}
            hint="This selection is only reflected in this local demo preview."
          >
            <Select
              value={closeRule}
              onChange={(event) => setCloseRule(event.target.value)}
            >
              <option>When Receives and Bills are recorded</option>
              <option>When a Receive is recorded</option>
              <option>When a Bill is created</option>
              <option>Never automatically</option>
            </Select>
          </Field>
        </div>
        <Field label="Terms & conditions" className="mt-5">
          <Textarea
            defaultValue={`Standard ${module.title.toLowerCase()} terms for Meridian Procurement Demo.\nDelivery and approval requirements apply.`}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-4">
        <Button onClick={() => onSavePreview(`${module.title} preferences`)}>
          <Check size={15} /> Save preview
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("procureui.reset-settings"))
          }
        >
          Reset
        </Button>
      </div>
    </Panel>
  );
}

function ToggleRow({ label, hint }: { label: string; hint?: string }) {
  const [checked, setChecked] = useState(false);
  return (
    <label className="flex cursor-pointer items-start gap-3 border-b border-slate-100 py-4">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => setChecked(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
      />
      <span>
        <span className="block text-sm font-medium text-slate-700">
          {label}
        </span>
        {hint && (
          <span className="mt-1 block text-xs text-slate-400">{hint}</span>
        )}
      </span>
    </label>
  );
}

function ApprovalsPanel({
  module,
  onSavePreview,
}: {
  module: ModuleSettingsConfig;
  onSavePreview: SavePreview;
}) {
  return (
    <Panel
      title={`${module.title} approval options`}
      action={
        <Button
          onClick={() =>
            onSavePreview("Directory creation preview — not connected")
          }
        >
          <Plus size={15} /> Add approval level
        </Button>
      }
    >
      <div className="space-y-3 p-5">
        <div className="grid gap-4 rounded-lg border border-blue-100 bg-blue-50/50 p-4 md:grid-cols-[1fr_180px_160px_auto] md:items-end">
          <Field label="Approval condition">
            <Select defaultValue="amount">
              <option>Document total is greater than</option>
              <option>Department is</option>
              <option>Requester role is</option>
            </Select>
          </Field>
          <Field label="Threshold">
            <Input defaultValue="10,000" />
          </Field>
          <Field label="Approver">
            <Select defaultValue="finance">
              <option>Finance reviewer</option>
              <option>Procurement Lead</option>
              <option>Department head</option>
            </Select>
          </Field>
          <Button
            variant="secondary"
            onClick={() => onSavePreview(`${module.title} approval level`)}
          >
            Preview row
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left">
            <thead className="table-head">
              <tr>
                <th className="table-cell">Level</th>
                <th className="table-cell">Condition</th>
                <th className="table-cell">Approver</th>
                <th className="table-cell">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="table-cell font-medium">1 · Team review</td>
                <td className="table-cell">Always</td>
                <td className="table-cell">Procurement Lead</td>
                <td className="table-cell">
                  <Badge>Active preview</Badge>
                </td>
              </tr>
              <tr>
                <td className="table-cell font-medium">2 · Finance review</td>
                <td className="table-cell">Total &gt; ZMW 10,000</td>
                <td className="table-cell">Finance reviewer</td>
                <td className="table-cell">
                  <Badge>Active preview</Badge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}

function BuilderList({
  module,
  kind,
  action,
  onSavePreview,
}: {
  module: ModuleSettingsConfig;
  kind: string;
  action: string;
  onSavePreview: SavePreview;
}) {
  const entries =
    kind === "fields"
      ? [
          ["Project code", "Text", "Visible on forms"],
          ["Delivery window", "Date", "Optional"],
        ]
      : kind === "buttons"
        ? [["Request vendor quote", "Details page menu", "Enabled"]]
        : kind === "related lists"
          ? [["Supplier scorecard", "Related tab", "Preview only"]]
          : [];
  return (
    <Panel
      title={`${module.title} ${kind}`}
      action={
        <Link to={`/settings/builders/${action}?module=${module.slug}`}>
          <Button>
            <Plus size={15} /> New {kind.slice(0, -1)}
          </Button>
        </Link>
      }
    >
      <div className="overflow-x-auto">
        {entries.length ? (
          <table className="w-full min-w-[620px] text-left">
            <thead className="table-head">
              <tr>
                <th className="table-cell">Name</th>
                <th className="table-cell">Type / location</th>
                <th className="table-cell">State</th>
                <th className="table-cell" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry[0]}>
                  {entry.map((cell) => (
                    <td key={cell} className="table-cell">
                      {cell}
                    </td>
                  ))}
                  <td className="table-cell">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        onSavePreview(`${module.title} · ${entry[0]}`)
                      }
                    >
                      Preview edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState
            title={`No ${kind} configured`}
            description={`Start a reusable ${kind.slice(0, -1)} preview for ${module.title}.`}
            action={
              <Link to={`/settings/builders/${action}?module=${module.slug}`}>
                <Button>
                  <Plus size={15} /> Create preview
                </Button>
              </Link>
            }
          />
        )}
      </div>
      <div className="border-t border-slate-100 px-5 py-4 text-xs text-slate-400">
        Builder changes are not published or persisted as live configuration.
      </div>
    </Panel>
  );
}

function PageLayoutPanel({
  module,
  onSavePreview,
}: {
  module: ModuleSettingsConfig;
  onSavePreview: SavePreview;
}) {
  const [columns, setColumns] = useState([
    "Vendor",
    "Order number",
    "Status",
    "Total",
  ]);
  return (
    <Panel
      title={`${module.title} page layout`}
      action={
        <Button onClick={() => setColumns((items) => [...items, "Requester"])}>
          <Plus size={15} /> Add field
        </Button>
      }
    >
      <div className="p-5">
        <p className="mb-4 text-sm text-slate-500">
          Arrange the visible columns and form sections for this module.
        </p>
        <div className="space-y-2">
          {columns.map((column, index) => (
            <div
              key={column}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3"
            >
              <span className="text-sm font-medium">
                {index + 1}. {column}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  disabled={index === 0}
                  onClick={() =>
                    setColumns((items) => {
                      const next = [...items];
                      [next[index - 1], next[index]] = [
                        next[index],
                        next[index - 1],
                      ];
                      return next;
                    })
                  }
                >
                  Move up
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    setColumns((items) =>
                      items.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  Hide
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5">
          <Button onClick={() => onSavePreview(`${module.title} page layout`)}>
            Save layout preview
          </Button>
        </div>
      </div>
    </Panel>
  );
}

const pdfTemplates = [
  "Purchase Order",
  "Purchase Receive",
  "Bill",
  "Vendor Credit",
  "Vendor Payment",
  "Vendor Statement",
];
const emailTemplates = [
  "Item Notification",
  "RFQ Notification",
  "Vendor Invite Notification",
  "RFQ Canceled Notification",
  "Bid Submission Reminder",
  "Bidding Period Extended",
  "Bidding Period Closed",
  "RFQ Awarded",
  "RFQ Not Awarded",
  "Vendor Credit Notification",
  "Vendor Portal Invitation",
  "Purchase Request Notification",
  "Purchase Order Notification",
  "Bill Notification",
  "Recurring Bill Notification",
  "Projects Notification",
  "Payment Made Notification",
  "Vendor Statement",
];

function TemplatePage({
  type,
  onSavePreview,
}: {
  type: "pdf" | "email";
  onSavePreview: SavePreview;
}) {
  const options = type === "pdf" ? pdfTemplates : emailTemplates;
  const [selected, setSelected] = useState(options[0]);
  const [body, setBody] = useState(
    type === "pdf"
      ? `{{organization_name}}\n\n${selected}\n\nVendor: {{vendor_name}}\nReference: {{document_number}}\nTotal: {{total}}`
      : `Hello {{recipient_name}},\n\nThis is a preview of the ${selected} email.\n\n{{document_link}}\n\nMeridian Procurement Demo`,
  );
  const selectTemplate = (value: string) => {
    setSelected(value);
    setBody(
      type === "pdf"
        ? `{{organization_name}}\n\n${value}\n\nVendor: {{vendor_name}}\nReference: {{document_number}}\nTotal: {{total}}`
        : `Hello {{recipient_name}},\n\nThis is a preview of the ${value} email.\n\n{{document_link}}\n\nMeridian Procurement Demo`,
    );
  };
  return (
    <div className="mx-auto max-w-[1140px]">
      <PageHeader
        title={type === "pdf" ? "PDF Templates" : "Email Notifications"}
        subtitle={
          type === "pdf"
            ? "Choose a document template and edit a local preview."
            : "18 captured notification categories with local-only editor states."
        }
        actions={<Badge>Preview editor</Badge>}
      />
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <Panel
          title={
            type === "pdf" ? "Document templates" : "Notification categories"
          }
        >
          <div className="divide-y divide-slate-100">
            {options.map((option) => (
              <button
                key={option}
                onClick={() => selectTemplate(option)}
                className={`flex w-full items-center justify-between px-5 py-3 text-left text-[13px] ${selected === option ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {option}
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
        </Panel>
        <Panel
          title={`${selected} editor`}
          action={<Badge>Unsaved preview</Badge>}
        >
          <div className="grid gap-5 p-5 xl:grid-cols-2">
            <Field label={type === "pdf" ? "Template name" : "Subject line"}>
              <Input defaultValue={selected} />
            </Field>
            <Field label="Sender / layout">
              <Select
                defaultValue={
                  type === "pdf" ? "Standard Meridian" : "Procurement notifications"
                }
              >
                <option>Standard Meridian</option>
                <option>Finance team</option>
                <option>Procurement team</option>
              </Select>
            </Field>
            <Field
              label="Body / template tokens"
              hint="Editing is local to this browser. Sending and publishing are disabled."
              className="xl:col-span-2"
            >
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="min-h-64 font-mono text-xs"
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-4">
            <Button
              onClick={() =>
                onSavePreview(
                  `${type === "pdf" ? "PDF" : "Email"} · ${selected}`,
                )
              }
            >
              <Check size={15} /> Save preview
            </Button>
            <Button
              variant="secondary"
              onClick={() => selectTemplate(selected)}
            >
              Reset template
            </Button>
            {type === "email" && (
              <Button
                variant="ghost"
                disabled
                title="Sending email is not connected"
              >
                <Mail size={15} /> Test disabled
              </Button>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

const automationNames: Record<
  string,
  { title: string; description: string; rows: string[][]; action?: string }
> = {
  "workflow-rules": {
    title: "Workflow Rules",
    description: "Review automation definitions without executing them.",
    rows: [
      ["Order approval reminder", "Purchase Order", "Active"],
      ["Bill reconciliation check", "Bill", "Draft preview"],
    ],
    action: "workflow-rule",
  },
  "workflow-actions": {
    title: "Workflow Actions",
    description: "Reusable actions referenced by workflow rules.",
    rows: [
      ["Notify finance reviewer", "Email alert", "Available"],
      ["Set approval status", "Field update", "Available"],
    ],
    action: "email-alert",
  },
  "workflow-logs": {
    title: "Workflow Logs",
    description: "A safe, empty execution history for this frontend-only demo.",
    rows: [],
  },
  schedules: {
    title: "Schedules",
    description:
      "Plan recurring scripts as unsaved previews; nothing will run.",
    rows: [
      ["Refresh supplier scorecard", "Daily at 10:30", "Preview only"],
      ["Send monthly spend digest", "Monthly on day 1", "Disabled"],
    ],
    action: "schedule",
  },
};

function AutomationPage({
  kind,
  onSavePreview,
}: {
  kind: string;
  onSavePreview: SavePreview;
}) {
  const config = automationNames[kind] ?? automationNames["workflow-rules"];
  return (
    <div className="mx-auto max-w-[1140px]">
      <PageHeader
        title={config.title}
        subtitle={config.description}
        actions={
          config.action ? (
            <Link to={`/settings/builders/${config.action}`}>
              <Button>
                <Plus size={15} /> New{" "}
                {config.title === "Schedules"
                  ? "schedule"
                  : config.title === "Workflow Rules"
                    ? "workflow rule"
                    : "email alert"}
              </Button>
            </Link>
          ) : undefined
        }
      />
      {config.rows.length ? (
        <Panel title="Configured previews">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left">
              <thead className="table-head">
                <tr>
                  <th className="table-cell">Name</th>
                  <th className="table-cell">Trigger / type</th>
                  <th className="table-cell">Status</th>
                  <th className="table-cell" />
                </tr>
              </thead>
              <tbody>
                {config.rows.map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell) => (
                      <td key={cell} className="table-cell">
                        {cell === "Active" ||
                        cell === "Available" ||
                        cell === "Preview only" ? (
                          <Badge>{cell}</Badge>
                        ) : (
                          cell
                        )}
                      </td>
                    ))}
                    <td className="table-cell">
                      <Button
                        variant="ghost"
                        onClick={() =>
                          onSavePreview(`${config.title} · ${row[0]}`)
                        }
                      >
                        Preview details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : (
        <Panel>
          <EmptyState
            title="No workflow executions"
            description="No automation has run. This prototype deliberately does not execute rules or send messages."
          />
        </Panel>
      )}
      <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        <strong>Safe preview:</strong> builder forms below are local only; no
        automation, scripts or emails run.
      </div>
    </div>
  );
}

function BuilderPage({
  type,
  onSavePreview,
}: {
  type: string;
  onSavePreview: SavePreview;
}) {
  const location = useLocation();
  const moduleFromQuery =
    new URLSearchParams(location.search).get("module") ?? "purchase-orders";
  const [name, setName] = useState("");
  if (type === "custom-field")
    return (
      <BuilderFrame
        title={`New Field · ${moduleLabel(moduleFromQuery)}`}
        subtitle="Add a reusable field to the module layout."
        onSave={() => onSavePreview("Custom field")}
      >
        <Field label="Label name">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Delivery window"
          />
        </Field>
        <Field label="Data type" className="mt-5">
          <Select defaultValue="text">
            <option>Single line</option>
            <option>Number</option>
            <option>Date</option>
            <option>Dropdown</option>
            <option>Checkbox</option>
          </Select>
        </Field>
        <RadioRow label="Is mandatory" options={["Yes", "No"]} />
        <RadioRow label="Show in all PDFs" options={["Yes", "No"]} />
      </BuilderFrame>
    );
  if (type === "validation-rule")
    return (
      <ValidationBuilder
        module={moduleLabel(moduleFromQuery)}
        onSavePreview={onSavePreview}
      />
    );
  if (type === "custom-button")
    return (
      <BuilderFrame
        title={`New Button · ${moduleLabel(moduleFromQuery)}`}
        subtitle="Create a meaningful action preview for a module record."
        onSave={() => onSavePreview("Custom button")}
      >
        <Field label="Button name">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Request vendor quote"
          />
        </Field>
        <Field label="Action type" className="mt-5">
          <Select defaultValue="open-form">
            <option>Open a form</option>
            <option>Open a URL</option>
            <option>Run a function (disabled)</option>
          </Select>
        </Field>
        <Field label="Location" className="mt-5">
          <Select defaultValue="details">
            <option>Details page menu</option>
            <option>List view toolbar</option>
            <option>Related list</option>
          </Select>
        </Field>
        <div className="mt-5 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          Preview link:{" "}
          <span className="font-mono">
            /demo/{moduleFromQuery}/actions/request-quote
          </span>
        </div>
      </BuilderFrame>
    );
  if (type === "related-list")
    return (
      <BuilderFrame
        title={`New Related List · ${moduleLabel(moduleFromQuery)}`}
        subtitle="Describe a related data panel without executing a script."
        onSave={() => onSavePreview("Related list")}
        wide
      >
        <Field label="Related list name">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Supplier scorecard"
          />
        </Field>
        <Field label="Deluge / script preview" className="mt-5">
          <Textarea
            className="min-h-72 font-mono text-xs"
            defaultValue={
              '// Frontend preview only\nheaderData = List();\nheaderData.add({"key":"vendor_name", "value":"Vendor Name"});\nreturn headerData;'
            }
          />
        </Field>
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <Code2 size={15} /> Scripts are shown for editing only and never
          executed.
        </div>
      </BuilderFrame>
    );
  if (type === "workflow-rule")
    return <WorkflowBuilder onSavePreview={onSavePreview} />;
  if (type === "email-alert")
    return <EmailAlertBuilder onSavePreview={onSavePreview} />;
  return <ScheduleBuilder onSavePreview={onSavePreview} />;
}

function BuilderFrame({
  title,
  subtitle,
  children,
  onSave,
  wide = false,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  onSave: () => void;
  wide?: boolean;
}) {
  return (
    <div className="mx-auto max-w-[980px]">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <Link
            to="/settings"
            className="inline-flex items-center gap-1 text-sm text-slate-500"
          >
            <X size={15} /> Cancel
          </Link>
        }
      />
      <Panel title="Builder preview" action={<Badge>Unsaved</Badge>}>
        <div className={wide ? "p-5" : "max-w-2xl p-5"}>{children}</div>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-4">
          <Button onClick={onSave}>
            <Check size={15} /> Save preview
          </Button>
          <Link to="/settings">
            <Button variant="secondary">Cancel</Button>
          </Link>
          <span className="self-center text-xs text-slate-400">
            No live configuration is changed.
          </span>
        </div>
      </Panel>
    </div>
  );
}

function RadioRow({ label, options }: { label: string; options: string[] }) {
  const [value, setValue] = useState(options[1]);
  return (
    <fieldset className="mt-5">
      <legend className="mb-2 text-[13px] font-medium text-slate-700">
        {label}
      </legend>
      <div className="flex gap-5">
        {options.map((option) => (
          <label
            className="flex items-center gap-2 text-sm text-slate-600"
            key={option}
          >
            <input
              type="radio"
              name={label}
              checked={value === option}
              onChange={() => setValue(option)}
            />
            {option}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ValidationBuilder({
  module,
  onSavePreview,
}: {
  module: string;
  onSavePreview: SavePreview;
}) {
  const [rules, setRules] = useState([
    { field: "Total", operator: "greater than", value: "0" },
  ]);
  return (
    <div className="mx-auto max-w-[1140px]">
      <PageHeader
        title={`New Validation Rule · ${module}`}
        subtitle="Build a safe, local validation preview from meaningful selectors."
        actions={
          <Link to="/settings" className="text-sm text-slate-500">
            Cancel
          </Link>
        }
      />
      <Panel title="Validation rule" action={<Badge>Unsaved</Badge>}>
        <div className="p-5">
          <Field label="Validation rule name">
            <Input defaultValue="Require a positive order total" />
          </Field>
          <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-amber-400 text-sm font-semibold text-white">
                WHEN
              </span>
              <span className="text-sm font-semibold text-slate-700">
                All of these conditions are true
              </span>
            </div>
            {rules.map((rule, index) => (
              <div
                className="mb-3 grid gap-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[1fr_1fr_1fr_auto]"
                key={index}
              >
                <Select
                  value={rule.field}
                  onChange={(event) =>
                    setRules((current) =>
                      current.map((item, i) =>
                        i === index
                          ? { ...item, field: event.target.value }
                          : item,
                      ),
                    )
                  }
                >
                  <option>Total</option>
                  <option>Vendor</option>
                  <option>Delivery date</option>
                  <option>Department</option>
                </Select>
                <Select
                  value={rule.operator}
                  onChange={(event) =>
                    setRules((current) =>
                      current.map((item, i) =>
                        i === index
                          ? { ...item, operator: event.target.value }
                          : item,
                      ),
                    )
                  }
                >
                  <option>greater than</option>
                  <option>is</option>
                  <option>contains</option>
                  <option>is empty</option>
                </Select>
                <Input
                  value={rule.value}
                  onChange={(event) =>
                    setRules((current) =>
                      current.map((item, i) =>
                        i === index
                          ? { ...item, value: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  onClick={() =>
                    setRules((current) => current.filter((_, i) => i !== index))
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              variant="secondary"
              onClick={() =>
                setRules((current) => [
                  ...current,
                  { field: "Department", operator: "is", value: "Procurement" },
                ])
              }
            >
              <Plus size={15} /> Add rule
            </Button>
          </div>
          <div className="mt-5 flex gap-2">
            <Button onClick={() => onSavePreview("Validation rule")}>
              <Check size={15} /> Save preview
            </Button>
            <Link
              to={`/settings/modules/${module.toLowerCase().replaceAll(" ", "-")}/validation-rules`}
            >
              <Button variant="secondary">Cancel</Button>
            </Link>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function WorkflowBuilder({ onSavePreview }: { onSavePreview: SavePreview }) {
  const [step, setStep] = useState(1);
  const [module, setModule] = useState("Purchase Order");
  const [action, setAction] = useState("Created");
  return (
    <div className="mx-auto max-w-[1040px]">
      <PageHeader
        title={
          step === 1
            ? "New Workflow Rule"
            : "DEMO SCREENSHOT — UNSAVED WORKFLOW RULE"
        }
        subtitle="Wizard preview · no rules will be saved or run."
        actions={<Badge>Step {step} of 2</Badge>}
      />
      <Panel
        title={
          step === 1 ? "Workflow details" : "Workflow rule execution condition"
        }
      >
        <div className="max-w-2xl space-y-5 p-5">
          {step === 1 ? (
            <>
              <Field label="Workflow rule name">
                <Input defaultValue="Order review reminder (preview)" />
              </Field>
              <Field label="Description">
                <Textarea defaultValue="Remind the fictional finance reviewer when a purchase order needs attention." />
              </Field>
              <Field label="Module">
                <Select
                  value={module}
                  onChange={(event) => setModule(event.target.value)}
                >
                  <option>Bill</option>
                  <option>Recurring Bill</option>
                  <option>Purchase Order</option>
                  <option>Purchase Receive</option>
                  <option>Vendor Credit</option>
                  <option>Vendor Payment</option>
                </Select>
              </Field>
              <div className="flex gap-2">
                <Button onClick={() => setStep(2)}>
                  Next <ArrowRight size={15} />
                </Button>
                <Link to="/settings/automation/workflow-rules">
                  <Button variant="secondary">Cancel</Button>
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-4 text-sm">
                <strong>Module:</strong> {module}
                <span className="mx-2 text-slate-300">|</span>
                <strong>Condition:</strong> event based
              </div>
              <Field label="Workflow type">
                <Select defaultValue="Event Based">
                  <option>Event Based</option>
                  <option>Date Based</option>
                </Select>
              </Field>
              <Field label="Action type">
                <Select
                  value={action}
                  onChange={(event) => setAction(event.target.value)}
                >
                  <option>Created</option>
                  <option>Edited</option>
                  <option>Created or Edited</option>
                  <option>Submitted</option>
                  <option>Approved</option>
                  <option>Rejected</option>
                </Select>
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => onSavePreview(`Workflow rule · ${module}`)}
                >
                  <Check size={15} /> Save preview
                </Button>
                <Button variant="secondary" onClick={() => setStep(1)}>
                  <ArrowLeft size={15} /> Back
                </Button>
                <Link to="/settings/automation/workflow-rules">
                  <Button variant="ghost">Cancel</Button>
                </Link>
              </div>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}

function EmailAlertBuilder({ onSavePreview }: { onSavePreview: SavePreview }) {
  const [module, setModule] = useState("Purchase Order");
  const [name, setName] = useState("");
  return (
    <div className="mx-auto max-w-[980px]">
      <PageHeader
        title="New Email Alert"
        subtitle="Create a notification preview with module and recipient selectors."
        actions={<Badge>Unsaved</Badge>}
      />
      <Panel title="Email alert details">
        <div className="grid max-w-3xl gap-5 p-5 md:grid-cols-2">
          <Field label="Name">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Finance review requested"
            />
          </Field>
          <Field label="Module">
            <Select
              value={module}
              onChange={(event) => setModule(event.target.value)}
            >
              <option>Bill</option>
              <option>Purchase Order</option>
              <option>Purchase Request</option>
              <option>Purchase Receive</option>
              <option>Vendor</option>
              <option>Vendor Payment</option>
            </Select>
          </Field>
          <Field label="From">
            <Select defaultValue="Procurement team">
              <option>Procurement team</option>
              <option>Finance team</option>
              <option>Meridian notifications</option>
            </Select>
          </Field>
          <Field label="Email template">
            <Select defaultValue="Purchase Order Notification">
              <option>Purchase Order Notification</option>
              <option>Bill Notification</option>
              <option>Purchase Request Notification</option>
              <option>Vendor Statement</option>
            </Select>
          </Field>
          <Field label="Email recipients">
            <Select defaultValue="Approvers">
              <option>Approvers</option>
              <option>Requester</option>
              <option>Vendor contact</option>
              <option>Finance reviewer</option>
            </Select>
          </Field>
          <Field label="Cc / Bcc">
            <Input placeholder="Optional recipients (demo only)" />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-4">
          <Button
            onClick={() => onSavePreview(`Email alert · ${name || module}`)}
          >
            <Check size={15} /> Save preview
          </Button>
          <Link to="/settings/automation/workflow-actions">
            <Button variant="secondary">Cancel</Button>
          </Link>
          <span className="self-center text-xs text-slate-400">
            No message is sent.
          </span>
        </div>
      </Panel>
    </div>
  );
}

function ScheduleBuilder({ onSavePreview }: { onSavePreview: SavePreview }) {
  const [frequency, setFrequency] = useState("Daily");
  return (
    <div className="mx-auto max-w-[1140px]">
      <PageHeader
        title="New Schedule"
        subtitle="Draft a recurring task preview; scripts are never executed."
        actions={<Badge>Unsaved</Badge>}
      />
      <Panel title="Schedule details">
        <div className="grid gap-5 p-5 md:grid-cols-2">
          <Field label="Name">
            <Input defaultValue="Refresh supplier scorecard" />
          </Field>
          <Field label="Frequency">
            <Select
              value={frequency}
              onChange={(event) => setFrequency(event.target.value)}
            >
              <option>Hourly</option>
              <option>Daily</option>
              <option>Weekly</option>
              <option>Monthly</option>
              <option>Yearly</option>
            </Select>
          </Field>
          <Field label="Start date & time">
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" />
              <Select defaultValue="10:30">
                <option>10:30</option>
                <option>14:00</option>
                <option>17:30</option>
              </Select>
            </div>
          </Field>
          <Field label="Expires after">
            <Select defaultValue="Never expires">
              <option>Never expires</option>
              <option>After 10 runs</option>
              <option>On a selected date</option>
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-600 md:col-span-2">
            <input type="checkbox" className="h-4 w-4" /> Exclude weekends
          </label>
          <Field
            label="Script preview"
            hint={`Scheduled task would run ${frequency.toLowerCase()}; no task will run.`}
            className="md:col-span-2"
          >
            <Textarea
              className="min-h-64 font-mono text-xs"
              defaultValue={
                'void My_Custom_Scheduler(Map organization) {\n  // Sample only — no execution in this frontend demo.\n  info "Refresh supplier scorecard preview";\n}'
              }
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-4">
          <Button onClick={() => onSavePreview(`Schedule · ${frequency}`)}>
            <Check size={15} /> Save preview
          </Button>
          <Link to="/settings/automation/schedules">
            <Button variant="secondary">Cancel</Button>
          </Link>
          <span className="self-center text-xs text-slate-400">
            <Code2 size={13} className="mr-1 inline" />
            Code remains unsaved
          </span>
        </div>
      </Panel>
    </div>
  );
}
