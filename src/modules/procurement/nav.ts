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
        { label: "Get Quotes", to: "/procurement/sourcing", roles: ["buyer", "proc_admin", "auditor"] },
        { label: "Compare Quotes", to: "/procurement/evaluations", roles: ["buyer", "proc_admin", "auditor"] },
        { label: "Purchase Orders", to: "/procurement/orders", roles: ["buyer", "receiver", "proc_admin", "auditor"] },
        { label: "Deliveries & Services", to: "/procurement/receiving", roles: ["buyer", "receiver", "proc_admin", "auditor"] },
        { label: "Contracts", to: "/procurement/contracts", roles: ["buyer", "proc_admin", "auditor"] },
        ...(PLANNING_ENABLED ? [{ label: "Purchase Plans", to: "/procurement/planning", roles: ["manager", "buyer", "proc_admin", "auditor"] as NonNullable<ModuleDefinition["sections"][number]["roles"]> }] : []),
      ],
    },
    { id: "payables", label: "Payables", icon: Receipt, roles: PAYABLES, items: [
      { label: "Inbox", to: "/procurement/payables/inbox" },
      { label: "Bills", to: "/procurement/invoices" },
      { label: "Recurring purchases", to: "/procurement/payables/recurring" },
      { label: "Vendor credits", to: "/procurement/payables/credits" },
      { label: "Payment Status", to: "/procurement/payables/payment-status" },
    ] },
    { id: "budgets", label: "Budgets", icon: Wallet, to: "/procurement/budgets", roles: ["manager", "buyer", "proc_admin", "auditor"] },
    { id: "analytics", label: "Analytics", icon: BarChart3, to: "/procurement/reports", roles: OPS },
    { id: "configuration", label: "Settings", icon: Settings, to: "/procurement/configuration", roles: ["proc_admin"] },
  ],
};
