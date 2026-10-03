import type { PolicyResult, RequestStatus, Role, TimelineEvent } from "@/mock/types";

export interface Supplier {
  id: string;
  name: string;
  country: string;
  category: string;
  status: "Active" | "On hold" | "Pending onboarding";
  paymentTerms: string;
  currency: string;
  contact?: string;
  taxId?: string;
}

export interface PurchaseRequest {
  id: string;
  title: string;
  requester: string;
  department: string;
  supplierId?: string;
  currency: string;
  amount: number;
  neededBy: string;
  status: RequestStatus;
  owner: string;
  nextAction: string;
  dueDate: string;
  submittedAt: string;
  policy: PolicyResult[];
  timeline: TimelineEvent[];
  conflicts: string[];
  lines: { description: string; qty: number; unitPrice: number }[];
}

export interface ProcWorkItem {
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
