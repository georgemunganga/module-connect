import {
  BadgeDollarSign,
  CalendarDays,
  ClipboardList,
  Clock4,
  Home,
  LifeBuoy,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { ModuleDefinition } from "@/platform/nav";

/**
 * HRM module navigation. Grouped, role-aware, and with exactly ONE
 * Configuration entry point — admin/setup never leaks into operational areas.
 */
export const hrmModule: ModuleDefinition = {
  id: "hrm",
  name: "Human resources",
  shortName: "HRM",
  sections: [
    { id: "home", label: "Home", icon: Home, to: "/" },
    {
      id: "people",
      label: "People",
      icon: Users,
      items: [
        { label: "Workers", to: "/workers" },
        { label: "My profile", to: "/workers/$id", params: { id: "w-1001" } },
      ],
    },
    {
      id: "leave",
      label: "Leave",
      icon: CalendarDays,
      items: [
        { label: "Leave requests", to: "/leave" },
        { label: "Request leave", to: "/leave/new" },
      ],
    },
    {
      id: "attendance",
      label: "Attendance",
      icon: Clock4,
      items: [
        { label: "Corrections", to: "/attendance" },
        { label: "Raise a correction", to: "/attendance/new" },
      ],
    },
    {
      id: "requests",
      label: "HR requests",
      icon: ClipboardList,
      items: [
        { label: "All requests", to: "/requests" },
        { label: "Raise a request", to: "/requests/new" },
      ],
    },
    {
      id: "approvals",
      label: "Approvals",
      icon: ShieldCheck,
      to: "/approvals",
      roles: ["manager", "hr_ops", "hr_admin", "payroll"],
    },
    {
      id: "pay",
      label: "Pay",
      icon: BadgeDollarSign,
      items: [{ label: "Payslips", to: "/payslips" }],
    },
    { id: "speakup", label: "Speak up", icon: LifeBuoy, to: "/speak-up" },
    {
      id: "configuration",
      label: "Configuration",
      icon: Settings,
      to: "/configuration",
      roles: ["hr_admin"],
    },
  ],
};

/** The single Configuration entry point, internally grouped. */
export const configurationGroups = [
  {
    label: "Business setup",
    description: "Who you are as an employer and how the organisation is shaped.",
    items: [
      { label: "Legal entities and branches", detail: "3 entities · 6 branches" },
      { label: "Departments and cost centres", detail: "12 departments" },
      { label: "Jobs, grades and pay ranges", detail: "9 grades" },
      { label: "Calendars and public holidays", detail: "3 calendars" },
    ],
  },
  {
    label: "Process design",
    description: "How work moves: policies, approval routes and forms.",
    items: [
      { label: "Leave policies and accruals", detail: "5 policies · 1 draft" },
      { label: "Attendance and shift rules", detail: "4 rule sets" },
      { label: "Approval routing", detail: "7 routes" },
      { label: "Request categories and SLAs", detail: "11 categories" },
    ],
  },
  {
    label: "Security and compliance",
    description: "Access, sensitive data handling and audit obligations.",
    items: [
      { label: "Roles and permissions", detail: "5 roles" },
      { label: "Sensitive field masking", detail: "6 masked fields" },
      { label: "Protected disclosure handling", detail: "Restricted to 2 handlers" },
      { label: "Retention and audit", detail: "Audit log enabled" },
    ],
  },
  {
    label: "Technical",
    description: "Integrations and data movement. Rarely changed after go-live.",
    items: [
      { label: "Import and export", detail: "CSV templates" },
      { label: "Payroll interface", detail: "Mock connector" },
      { label: "Identity provider", detail: "Not configured" },
      { label: "Numbering and references", detail: "Prefix: HR-" },
    ],
  },
];