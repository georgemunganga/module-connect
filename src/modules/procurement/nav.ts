import { Home, Settings, ShieldCheck, ShoppingCart, Truck } from "lucide-react";
import type { ModuleDefinition } from "@/platform/nav";

/**
 * Procurement module navigation. Same shell conventions as HRM: grouped,
 * role-aware sections and exactly ONE Configuration entry point.
 */
export const procurementModule: ModuleDefinition = {
  id: "procurement",
  name: "Procurement",
  shortName: "PROC",
  sections: [
    { id: "home", label: "Home", icon: Home, to: "/procurement" },
    {
      id: "purchasing",
      label: "Purchasing",
      icon: ShoppingCart,
      items: [
        { label: "Purchase requests", to: "/procurement/requests" },
        { label: "Suppliers", to: "/procurement/suppliers" },
      ],
    },
    {
      id: "approvals",
      label: "Approvals",
      icon: ShieldCheck,
      to: "/procurement/requests",
      roles: ["manager", "buyer", "proc_admin"],
    },
    { id: "receiving", label: "Receiving", icon: Truck, to: "/procurement/requests" },
    {
      id: "configuration",
      label: "Configuration",
      icon: Settings,
      to: "/procurement/configuration",
      roles: ["proc_admin"],
    },
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
      { label: "Spend thresholds and quote rules", detail: "3-quote rule above €10,000" },
      { label: "Approval routing", detail: "4 routes" },
      { label: "Receiving and three-way match", detail: "Match tolerance 2%" },
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
