export type Role = "employee" | "manager" | "hr_ops" | "payroll" | "hr_admin";

export interface Workspace {
  id: Role;
  label: string;
  description: string;
}

export interface Entity {
  id: string;
  name: string;
  country: string;
  legalId: string;
  branches: string[];
}

export type WorkerType = "Permanent" | "Fixed term" | "Contractor" | "Intern" | "Part time";

export interface Worker {
  id: string;
  employeeNo: string;
  fullName: string;
  preferredName?: string;
  jobTitle: string;
  department: string;
  entityId: string;
  branch: string;
  managerId?: string;
  workerType: WorkerType;
  status: "Active" | "On leave" | "Notice period" | "Pre-hire" | "Terminated";
  startDate: string;
  endDate?: string;
  email?: string;
  phone?: string;
  location: string;
  grade: string;
  nationalId: string;
  bankAccount: string;
  leaveBalance: number;
  futureEffective?: { effectiveFrom: string; change: string };
}

export type RequestStatus =
  | "Draft"
  | "Submitted"
  | "In review"
  | "Approved"
  | "Returned"
  | "Rejected"
  | "Cancelled";

export interface TimelineEvent {
  id: string;
  at: string;
  actor: string;
  event: string;
  reason?: string;
  before?: string;
  after?: string;
  evidence?: { label: string; href: string };
}

export interface PolicyResult {
  id: string;
  label: string;
  outcome: "pass" | "warn" | "fail";
  detail: string;
}

export interface LeaveRequest {
  id: string;
  workerId: string;
  type: "Annual" | "Sick" | "Parental" | "Unpaid" | "Study";
  from: string;
  to: string;
  days: number;
  reason?: string;
  status: RequestStatus;
  owner: string;
  nextAction: string;
  dueDate: string;
  submittedAt: string;
  policy: PolicyResult[];
  timeline: TimelineEvent[];
  conflicts: string[];
}

export interface AttendanceCorrection {
  id: string;
  workerId: string;
  date: string;
  recordedIn?: string;
  recordedOut?: string;
  claimedIn: string;
  claimedOut: string;
  reason: string;
  status: RequestStatus;
  owner: string;
  nextAction: string;
  dueDate: string;
  timeline: TimelineEvent[];
}

export interface HrCase {
  id: string;
  workerId: string;
  category: string;
  subject: string;
  detail: string;
  priority: "Low" | "Normal" | "High";
  status: RequestStatus;
  owner: string;
  nextAction: string;
  dueDate: string;
  timeline: TimelineEvent[];
}

export interface PayslipLine {
  code: string;
  label: string;
  kind: "earning" | "deduction" | "employer";
  amount: number;
  inputs: { label: string; value: string }[];
  ruleVersion: string;
  effectiveFrom: string;
  explanation: string;
  priorAmount?: number;
}

export interface Payslip {
  id: string;
  workerId: string;
  period: string;
  currency: string;
  payDate: string;
  gross: number;
  net: number;
  lines: PayslipLine[];
}

export interface WorkItem {
  id: string;
  band: "exception" | "approval" | "task" | "deadline";
  title: string;
  context: string;
  due: string;
  overdue?: boolean;
  to: string;
  params?: Record<string, string>;
  roles: Role[];
}