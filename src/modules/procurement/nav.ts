import { BarChart3, CalendarRange, BookOpen, Building2, FileText, Home, Package, Receipt, Settings, ShieldCheck, ShoppingCart, ListChecks, Wallet } from "lucide-react";
import type { ModuleDefinition } from "@/platform/nav";
import { PLANNING_ENABLED } from "./planning";

/**
 * Procurement module navigation. Same shell conventions as HRM: grouped,
 * role-aware sections and exactly ONE Configuration entry point.
 */
const OPS: ModuleDefinition["sections"][number]["roles"] = ["buyer", "supplier_steward", "receiver", "ap_processor", "proc_admin", "auditor"];
const REQUESTERS: ModuleDefinition["sections"][number]["roles"] = ["employee", "manager", "hr_ops", "payroll", "hr_admin"];
const PROCUREMENT: ModuleDefinition["sections"][number]["roles"] = ["manager", "buyer", "receiver", "proc_admin", "auditor"];
const PAYABLES: ModuleDefinition["sections"][number]["roles"] = ["ap_processor", "buyer", "proc_admin", "auditor"];

export const procurementModule: ModuleDefinition = {
  id: "procurement",
  name: "Procurement",
  shortName: "PROC",
  sections: [
    { id: "home", label: "Home", icon: Home, to: "/procurement" },
    { id: "getting-started", label: "Getting started", icon: ListChecks, to: "/procurement/getting-started", roles: ["proc_admin"] },
    { id: "my-requests", label: "My Requests", icon: FileText, to: "/procurement/requests", roles: REQUESTERS },
    { id: "approvals", label: "Approvals", icon: ShieldCheck, to: "/procurement/approvals", roles: ["manager", "buyer", "proc_admin"] },
    { id: "items", label: "Items", icon: BookOpen, to: "/procurement/catalog", roles: [...(REQUESTERS ?? []), "buyer", "proc_admin"] },
    { id: "vendors", label: "Vendors", icon: Building2, to: "/procurement/suppliers", roles: ["buyer", "supplier_steward", "proc_admin", "auditor"] },
    {
      id: "procurement", label: "Procurement", icon: ShoppingCart, roles: PROCUREMENT,
      items: [
        { label: "Purchase Requests", to: "/procurement/requests", roles: ["buyer", "proc_admin", "auditor"] },
        { label: "Requests for Quotes", to: "/procurement/sourcing", roles: ["buyer", "proc_admin", "auditor"] },
        { label: "Evaluations", to: "/procurement/evaluations", roles: ["buyer", "proc_admin", "auditor"] },
        { label: "Purchase Orders", to: "/procurement/orders", roles: ["buyer", "receiver", "proc_admin", "auditor"] },
        { label: "Purchase Receipts", to: "/procurement/receiving", roles: ["buyer", "receiver", "proc_admin", "auditor"] },
        { label: "Contracts", to: "/procurement/contracts", roles: ["buyer", "proc_admin", "auditor"] },
        ...(PLANNING_ENABLED ? [{ label: "Planning", to: "/procurement/planning", roles: ["manager", "buyer", "proc_admin", "auditor"] as NonNullable<ModuleDefinition["sections"][number]["roles"]> }] : []),
      ],
    },
    { id: "payables", label: "Payables", icon: Receipt, roles: PAYABLES, items: [
      { label: "Inbox", to: "/procurement/payables/inbox" },
      { label: "Bills", to: "/procurement/invoices" },
      { label: "Payment Status", to: "/procurement/payables/payment-status" },
    ] },
    { id: "budgets", label: "Budgets", icon: Wallet, to: "/procurement/budgets", roles: ["manager", "buyer", "proc_admin", "auditor"] },
    { id: "analytics", label: "Analytics", icon: BarChart3, to: "/procurement/reports", roles: OPS },
    { id: "configuration", label: "Configuration", icon: Settings, to: "/procurement/configuration", roles: ["proc_admin"] },
  ],
};

/** The single Configuration entry point, internally grouped. */
export const procConfigurationGroups = [
  {
    label: "Business setup",
    description: "Who buys, and from where.",
    items: [
      { label: "Buying entities and ship-to addresses", detail: "3 entities · 6 addresses" },
      { label: "Supplier onboarding and verification", detail: "4-step onboarding" },
      { label: "Catalogues and preferred suppliers", detail: "5 categories" },
    ],
  },
  {
    label: "Process design",
    description: "How spend moves: thresholds, quotes and approval routes.",
    items: [
      { label: "Spend thresholds and quote rules", detail: "Versioned demo policy", to: "/procurement/configuration/policy" },
      { label: "Approval routing", detail: "Review in policy studio", to: "/procurement/configuration/policy" },
      { label: "Receiving and three-way match", detail: "Review tolerances in policy studio", to: "/procurement/configuration/policy" },
    ],
  },
  {
    label: "Security and compliance",
    description: "Access, segregation of duties and audit obligations.",
    items: [
      { label: "Roles and permissions", detail: "5 roles" },
      { label: "Segregation of duties", detail: "Requester ≠ approver ≠ receiver" },
      { label: "Retention and audit", detail: "Audit log enabled" },
    ],
  },
  {
    label: "Technical",
    description: "Integrations and data movement. Rarely changed after go-live.",
    items: [
      { label: "Import and export", detail: "CSV templates" },
      { label: "Accounting interface", detail: "Mock connector" },
      { label: "Numbering and references", detail: "Prefix: PR-" },
    ],
  },
];
