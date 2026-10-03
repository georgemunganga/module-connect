import { BarChart3, CalendarRange, BookOpen, Building2, FileSignature, FileText, Gavel, Home, Package, Receipt, Settings, ShieldCheck, ShoppingCart, Truck, ClipboardCheck } from "lucide-react";
import type { ModuleDefinition } from "@/platform/nav";
import { PLANNING_ENABLED } from "./planning";

/**
 * Procurement module navigation. Same shell conventions as HRM: grouped,
 * role-aware sections and exactly ONE Configuration entry point.
 */
const OPS: ModuleDefinition["sections"][number]["roles"] = ["buyer", "supplier_steward", "receiver", "ap_processor", "proc_admin", "auditor"];
const REQUESTERS: ModuleDefinition["sections"][number]["roles"] = ["employee", "manager", "hr_ops", "payroll", "hr_admin"];

export const procurementModule: ModuleDefinition = {
  id: "procurement",
  name: "Procurement",
  shortName: "PROC",
  sections: [
    { id: "home", label: "Home", icon: Home, to: "/procurement" },
    // Requester (employee) navigation
    { id: "catalog", label: "Catalog", icon: BookOpen, to: "/procurement/catalog", roles: [...(REQUESTERS ?? []), "buyer", "proc_admin"] },
    { id: "my-requests", label: "My requests", icon: FileText, to: "/procurement/requests", roles: REQUESTERS },
    { id: "my-orders", label: "My purchases", icon: Package, to: "/procurement/requests", roles: REQUESTERS },
    { id: "approvals", label: "Approvals", icon: ShieldCheck, to: "/procurement/approvals", roles: ["manager", "buyer", "proc_admin"] },
    ...(PLANNING_ENABLED
      ? [{ id: "planning", label: "Planning", icon: CalendarRange, to: "/procurement/planning", roles: ["manager", "buyer", "proc_admin", "auditor"] as ModuleDefinition["sections"][number]["roles"] }]
      : []),
    // Procurement operations navigation (max one sublink level)
    { id: "buying", label: "Buying", icon: ShoppingCart, to: "/procurement/requests", roles: OPS },
    { id: "suppliers", label: "Suppliers", icon: Building2, to: "/procurement/suppliers", roles: OPS },
    { id: "sourcing", label: "Sourcing", icon: Gavel, to: "/procurement/sourcing", roles: ["buyer", "proc_admin", "auditor"] },
    { id: "evaluations", label: "Evaluations", icon: ClipboardCheck, to: "/procurement/evaluations", roles: ["buyer", "proc_admin", "auditor"] },
    { id: "contracts", label: "Contracts", icon: FileSignature, to: "/procurement/contracts", roles: ["buyer", "proc_admin", "auditor"] },
    { id: "purchasing", label: "Purchase orders", icon: Truck, to: "/procurement/orders", roles: ["buyer", "receiver", "proc_admin", "auditor"] },
    { id: "receiving", label: "Receiving", icon: Package, to: "/procurement/receiving", roles: ["receiver", "buyer", "proc_admin", "auditor"] },
    { id: "invoices", label: "Invoices", icon: Receipt, to: "/procurement/invoices", roles: ["ap_processor", "buyer", "proc_admin", "auditor"] },
    { id: "reports", label: "Reports", icon: BarChart3, to: "/procurement/reports", roles: OPS },
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
