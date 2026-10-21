export type SettingsOwner = "ERP Core" | "Procurement" | "Finance" | "Platform" | "Projects / Inventory";
export type SettingsRoute = "/procurement/configuration/policy" | "/procurement/configuration/bills" | "/procurement/configuration/orders" | "/procurement/configuration/$section";

export interface SettingsItem {
  name: string;
  owner: SettingsOwner;
  detail: string;
  to?: SettingsRoute;
  section?: "vendors" | "items" | "purchases" | "requests" | "quotes" | "receives" | "credits";
}

export interface SettingsGroup {
  name: string;
  description: string;
  sections: { name: string; items: SettingsItem[] }[];
}

/** Configuration directory, not a claim that every linked ERP service is implemented. */
export const settingsGroups: SettingsGroup[] = [
  {
    name: "Organization Settings", description: "Company identity and locations shared by every ERP module.",
    sections: [{ name: "Organization", items: [
      { name: "Profile", owner: "ERP Core", detail: "Legal entity and organization profile." },
      { name: "Branding", owner: "ERP Core", detail: "Shared logo, colours and document identity." },
      { name: "Locations", owner: "ERP Core", detail: "Branches, sites and delivery locations." },
      { name: "AI Integration", owner: "Platform", detail: "Optional platform integration; no procurement dependency." },
      { name: "Manage Subscription", owner: "Platform", detail: "ERP account and subscription administration." },
    ] }],
  },
  {
    name: "Users & Roles", description: "Identity, authority and organization references.",
    sections: [{ name: "Access and people", items: [
      { name: "Users", owner: "ERP Core", detail: "Identity and HRMS worker links." },
      { name: "Roles", owner: "ERP Core", detail: "Permissions, data scope and segregation of duties." },
      { name: "User Preferences", owner: "ERP Core", detail: "Language, locale and personal display choices." },
      { name: "Departments", owner: "ERP Core", detail: "Organization hierarchy supplied to Procurement." },
    ] }],
  },
  {
    name: "Taxes & Compliance", description: "Finance owns tax calculation and regulatory reference data.",
    sections: [{ name: "Tax references", items: [
      { name: "Taxes", owner: "Finance", detail: "Tax codes and calculation rules; Procurement stores references." },
    ] }],
  },
  {
    name: "Setup & Configurations", description: "Shared setup used across transactions.",
    sections: [{ name: "General", items: [
      { name: "General", owner: "ERP Core", detail: "Shared ERP defaults and organization context." },
      { name: "Currencies", owner: "Finance", detail: "Currency and exchange-rate references." },
      { name: "Payment Terms", owner: "Finance", detail: "Financial terms referenced by contracts and POs." },
      { name: "Vendor Portal", owner: "Procurement", detail: "Supplier access, invitation and visibility rules." },
      { name: "Punchout Catalogs", owner: "Procurement", detail: "External catalog integration and returned-cart controls." },
    ] }],
  },
  {
    name: "Customization", description: "Shared presentation and metadata services, scoped per transaction.",
    sections: [{ name: "Presentation and metadata", items: [
      { name: "Transaction Number Series", owner: "Platform", detail: "Atomic reference allocation by entity and transaction." },
      { name: "PDF Templates", owner: "Platform", detail: "Versioned document templates for issued records." },
      { name: "Email Notifications", owner: "Platform", detail: "Shared delivery templates and preferences." },
      { name: "Reporting Tags", owner: "Finance", detail: "Controlled dimensions used in financial and spend reports." },
      { name: "Web Tabs", owner: "Platform", detail: "Optional extension surface; governed before use." },
    ] }],
  },
  {
    name: "Automation", description: "Procurement defines business rules; the shared platform executes them.",
    sections: [{ name: "Workflow", items: [
      { name: "Workflow Rules", owner: "Platform", detail: "Versioned triggers and routing conditions." },
      { name: "Workflow Actions", owner: "Platform", detail: "Approved notifications, assignments and integrations." },
      { name: "Workflow Logs", owner: "Platform", detail: "Execution history and failed-action recovery." },
      { name: "Schedules", owner: "Platform", detail: "Reminder and periodic task execution." },
    ] }],
  },
  {
    name: "Module Settings", description: "Transaction preferences stay with the module that owns the record.",
    sections: [
      { name: "Procurement-owned records", items: [
        { name: "General", owner: "Procurement", detail: "Buying methods, thresholds and tolerances.", to: "/procurement/configuration/policy" },
        { name: "Vendors", owner: "Procurement", detail: "Supplier onboarding and orderability; Finance owns payable account.", to: "/procurement/configuration/$section", section: "vendors" },
        { name: "Items", owner: "Procurement", detail: "Buying catalog and preferred offers; Inventory owns stock.", to: "/procurement/configuration/$section", section: "items" },
        { name: "Purchases", owner: "Procurement", detail: "Commercial purchasing preferences and exceptions.", to: "/procurement/configuration/$section", section: "purchases" },
        { name: "Purchase Requests", owner: "Procurement", detail: "Required fields, budget gate and request approval route.", to: "/procurement/configuration/$section", section: "requests" },
        { name: "Request for Quotes", owner: "Procurement", detail: "Supplier invitation, deadline and evaluation rules.", to: "/procurement/configuration/$section", section: "quotes" },
        { name: "Purchase Orders", owner: "Procurement", detail: "Approval, issue, revision and supplier acknowledgment.", to: "/procurement/configuration/orders" },
        { name: "Purchase Receives", owner: "Procurement", detail: "Inspection, acceptance and receipt tolerances.", to: "/procurement/configuration/$section", section: "receives" },
        { name: "Bills", owner: "Procurement", detail: "Invoice validation settings and approval design; Finance owns AP posting.", to: "/procurement/configuration/bills" },
        { name: "Vendor Credits", owner: "Procurement", detail: "Commercial credit reason and source link; Finance owns ledger application.", to: "/procurement/configuration/$section", section: "credits" },
      ] },
      { name: "Other ERP owners", items: [
        { name: "Projects", owner: "Projects / Inventory", detail: "Project coding and budget source, consumed by Procurement." },
        { name: "Chart of Accounts", owner: "Finance", detail: "General ledger account master." },
        { name: "Customers", owner: "ERP Core", detail: "Customer master belongs outside Procurement." },
        { name: "Recurring Bills", owner: "Finance", detail: "Recurring payable schedule; Procurement tracks contract commitment." },
        { name: "Payments Made", owner: "Finance", detail: "Payment execution and status." },
        { name: "Batch Payments", owner: "Finance", detail: "Treasury payment batch controls." },
      ] },
    ],
  },
  {
    name: "Custom Modules", description: "Future platform extension governed outside the Procurement MVP.",
    sections: [{ name: "Extensibility", items: [
      { name: "Overview", owner: "Platform", detail: "Proposed custom business modules and approval flows." },
    ] }],
  },
];
