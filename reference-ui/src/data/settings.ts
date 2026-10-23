export type SettingsRoute = { path: string; title: string };

export type ModuleSettingsConfig = {
  slug: string;
  title: string;
  group: "General" | "Purchases";
  tabs: { slug: string; title: string }[];
  description: string;
};

const tab = (slug: string, title: string) => ({ slug, title });

export const moduleSettings: ModuleSettingsConfig[] = [
  {
    slug: "vendors",
    title: "Vendors",
    group: "General",
    description: "Control vendor intake, approvals, fields and actions.",
    tabs: [
      tab("preferences", "Preferences"),
      tab("approvals", "Approvals"),
      tab("fields", "Fields"),
      tab("buttons", "Buttons"),
    ],
  },
  {
    slug: "projects",
    title: "Projects",
    group: "General",
    description: "Shape the project context available to procurement teams.",
    tabs: [tab("preferences", "Preferences")],
  },
  {
    slug: "items",
    title: "Items",
    group: "General",
    description:
      "Configure the shared item catalog used in purchasing workflows.",
    tabs: [tab("preferences", "Preferences")],
  },
  {
    slug: "accounts",
    title: "Chart of Accounts",
    group: "General",
    description: "Set the account fields available on purchasing documents.",
    tabs: [tab("preferences", "Preferences")],
  },
  {
    slug: "customers",
    title: "Customers",
    group: "General",
    description: "Manage customer references for projects and chargebacks.",
    tabs: [tab("preferences", "Preferences")],
  },
  {
    slug: "purchase-requests",
    title: "Purchase Requests",
    group: "Purchases",
    description: "Configure intake, approvals, layouts, rules and actions.",
    tabs: [
      tab("preferences", "Preferences"),
      tab("fields", "Fields"),
      tab("approvals", "Approvals"),
      tab("buttons", "Buttons"),
      tab("page-layout", "Page Layout"),
      tab("validation-rules", "Validation Rules"),
    ],
  },
  {
    slug: "purchase-orders",
    title: "Purchase Orders",
    group: "Purchases",
    description: "Control order lifecycle, approvals, fields and related data.",
    tabs: [
      tab("preferences", "Preferences"),
      tab("approvals", "Approvals"),
      tab("fields", "Fields"),
      tab("validation-rules", "Validation Rules"),
      tab("buttons", "Buttons"),
      tab("related-lists", "Related Lists"),
    ],
  },
  {
    slug: "purchase-receives",
    title: "Purchase Receives",
    group: "Purchases",
    description: "Set receiving behavior and match rules for deliveries.",
    tabs: [tab("preferences", "Preferences")],
  },
  {
    slug: "bills",
    title: "Invoice Checks",
    group: "Purchases",
    description: "Configure procurement-side invoice matching before Finance receives the bill.",
    tabs: [tab("preferences", "Preferences")],
  },
  {
    slug: "request-for-quotes",
    title: "Requests for Quotes",
    group: "Purchases",
    description: "Set supplier invitation, response, closing and evaluation preferences.",
    tabs: [tab("preferences", "Preferences"), tab("approvals", "Approvals")],
  },
  {
    slug: "contracts",
    title: "Supplier Contracts",
    group: "Purchases",
    description: "Set contract review, renewal and utilization preferences.",
    tabs: [tab("preferences", "Preferences"), tab("approvals", "Approvals")],
  },
  {
    slug: "inspections",
    title: "Inspections",
    group: "Purchases",
    description: "Set evidence and acceptance rules for received goods.",
    tabs: [tab("preferences", "Preferences")],
  },
  {
    slug: "returns",
    title: "Returns",
    group: "Purchases",
    description: "Set approval and evidence rules for supplier returns.",
    tabs: [tab("preferences", "Preferences")],
  },
  {
    slug: "recurring-bills",
    title: "Recurring Bills",
    group: "Purchases",
    description: "Manage recurring bill defaults and available actions.",
    tabs: [tab("buttons", "Buttons")],
  },
  {
    slug: "payments-made",
    title: "Payments Made",
    group: "Purchases",
    description: "Set independent review rules for externally reported manual payments. Finance owns execution.",
    tabs: [tab("approvals", "Approvals")],
  },
];

/** Only Procurement-owned settings appear in the Procurement directory. */
export const procurementModuleGroups = [
  { title: "Suppliers & catalog", slugs: ["vendors", "items"] },
  { title: "Buying", slugs: ["purchase-requests", "purchase-orders"] },
  { title: "Sourcing & contracts", slugs: ["request-for-quotes", "contracts"] },
  { title: "Receiving & invoice checks", slugs: ["purchase-receives", "inspections", "returns", "bills"] },
  { title: "Payment review", slugs: ["payments-made"] },
] as const;

export const procurementModuleSlugs: ReadonlySet<string> = new Set(procurementModuleGroups.flatMap((group) => group.slugs));
export const moduleOwner: Record<string, string> = {
  projects: "Projects",
  accounts: "Finance",
  customers: "Customer Management",
  "recurring-bills": "Finance / Accounts Payable",
};

const organizationRoutes: SettingsRoute[] = [
  { path: "/settings/general", title: "General" },
  { path: "/settings/profile", title: "Organization Profile" },
  { path: "/settings/branding", title: "Organization Branding" },
  { path: "/settings/locations", title: "Locations" },
  { path: "/settings/currencies", title: "Currencies" },
  { path: "/settings/payment-terms", title: "Payment Terms" },
  { path: "/settings/vendor-portal", title: "Vendor Portal" },
  { path: "/settings/punchout-catalogs", title: "Punchout Catalogs" },
  {
    path: "/settings/transaction-number-series",
    title: "Transaction Number Series",
  },
  { path: "/settings/users", title: "Users" },
  { path: "/settings/roles", title: "Roles" },
  { path: "/settings/departments", title: "Departments" },
  { path: "/settings/taxes", title: "Taxes" },
  { path: "/settings/tds", title: "TDS" },
  { path: "/settings/reporting-tags", title: "Reporting Tags" },
  { path: "/settings/web-tabs", title: "Web Tabs" },
];

const moduleRoutes = moduleSettings.flatMap((module) =>
  module.tabs.map((item) => ({
    path: `/settings/modules/${module.slug}/${item.slug}`,
    title: `${module.title} — ${item.title}`,
  })),
);

export const settingsRoutes: SettingsRoute[] = [
  { path: "/settings", title: "All Settings" },
  { path: "/settings/reference-data", title: "Buying categories & methods" },
  { path: "/settings/buying-rules", title: "Buying rules" },
  ...organizationRoutes,
  { path: "/settings/customization/pdf-templates", title: "PDF Templates" },
  {
    path: "/settings/customization/email-notifications",
    title: "Email Notifications",
  },
  { path: "/settings/automation/workflow-rules", title: "Workflow Rules" },
  { path: "/settings/automation/workflow-actions", title: "Workflow Actions" },
  { path: "/settings/automation/workflow-logs", title: "Workflow Logs" },
  { path: "/settings/automation/schedules", title: "Schedules" },
  ...moduleRoutes,
  { path: "/settings/builders/custom-field", title: "New Custom Field" },
  { path: "/settings/builders/validation-rule", title: "New Validation Rule" },
  { path: "/settings/builders/custom-button", title: "New Custom Button" },
  { path: "/settings/builders/related-list", title: "New Related List" },
  { path: "/settings/builders/workflow-rule", title: "New Workflow Rule" },
  { path: "/settings/builders/email-alert", title: "New Email Alert" },
  { path: "/settings/builders/schedule", title: "New Schedule" },
];

export const findModule = (slug: string | undefined) =>
  moduleSettings.find((item) => item.slug === slug);
export const findSettingRoute = (path: string) =>
  settingsRoutes.find((item) => item.path === path);
