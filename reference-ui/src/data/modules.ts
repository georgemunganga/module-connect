export type ModuleKey =
  | "requests"
  | "purchase-orders"
  | "purchase-receives"
  | "bills"
  | "recurring-bills"
  | "payments"
  | "vendor-credits"
  | "rfqs";
export type ModuleConfig = {
  key: ModuleKey;
  title: string;
  singular: string;
  prefix: string;
  reference: string;
  editorReference: string;
  description: string;
};
export const modules: Record<ModuleKey, ModuleConfig> = {
  requests: {
    key: "requests",
    title: "My Requests",
    singular: "Purchase Request",
    prefix: "PR",
    reference: "01_my_requests.png",
    editorReference: "02_new_purchase_request.png",
    description: "Track your requests from submission to approval.",
  },
  "purchase-orders": {
    key: "purchase-orders",
    title: "Purchase Orders",
    singular: "Purchase Order",
    prefix: "PO",
    reference: "11_purchase_orders.png",
    editorReference: "12_new_purchase_order.png",
    description: "Manage commitments to your vendors.",
  },
  "purchase-receives": {
    key: "purchase-receives",
    title: "Purchase Receives",
    singular: "Purchase Receive",
    prefix: "RCV",
    reference: "13_purchase_receives.png",
    editorReference: "14_new_purchase_receive.png",
    description: "Record and track goods received against orders.",
  },
  bills: {
    key: "bills",
    title: "Bills",
    singular: "Bill",
    prefix: "BILL",
    reference: "16_bills.png",
    editorReference: "17_new_bill.png",
    description: "A clear view of what you owe and when it is due.",
  },
  "recurring-bills": {
    key: "recurring-bills",
    title: "Recurring Purchases",
    singular: "Recurring Purchase",
    prefix: "RPC",
    reference: "18_recurring_bills.png",
    editorReference: "19_new_recurring_bill.png",
    description: "Plan purchases that repeat. Finance owns bills and payments.",
  },
  payments: {
    key: "payments",
    title: "Payments Made",
    singular: "Payment",
    prefix: "PAY",
    reference: "21_payments_made.png",
    editorReference: "22_new_payment.png",
    description: "View payments recorded against your bills.",
  },
  "vendor-credits": {
    key: "vendor-credits",
    title: "Vendor Credits",
    singular: "Vendor Credit",
    prefix: "VC",
    reference: "23_vendor_credits.png",
    editorReference: "24_new_vendor_credit.png",
    description: "Track vendor credits and adjustments.",
  },
  rfqs: {
    key: "rfqs",
    title: "Request for Quotes",
    singular: "Request for Quote",
    prefix: "RFQ",
    reference: "09_rfqs.png",
    editorReference: "10_new_rfq.png",
    description: "Bring your sourcing process into one place.",
  },
};
export const canonicalRoutes = [
  { path: "/", title: "Procurement dashboard" },
  { path: "/approvals", title: "Approvals" },
  { path: "/procurement-requests", title: "Procurement Purchase Requests" },
  { path: "/items", title: "Items" },
  { path: "/items/new", title: "New Item" },
  { path: "/items/:id", title: "Item detail" },
  { path: "/items/:id/edit", title: "Edit Item" },
  { path: "/vendors", title: "Vendors" },
  { path: "/vendors/new", title: "New Vendor" },
  { path: "/vendors/:id", title: "Vendor detail" },
  { path: "/vendors/:id/:tab", title: "Vendor detail section" },
  { path: "/vendors/:id/edit", title: "Edit Vendor" },
  { path: "/inbox", title: "Payables Inbox" },
  { path: "/batch-payments", title: "Batch Payments" },
  { path: "/batch-payments/:id", title: "Batch payment detail" },
  { path: "/batch-payments/:id/edit", title: "Edit prepared batch" },
  { path: "/budgets", title: "Budgets" },
  { path: "/analytics", title: "Analytics" },
  ...Object.values(modules).flatMap((module) => [
    { path: `/${module.key}`, title: module.title },
    { path: `/${module.key}/new`, title: `New ${module.singular}` },
    { path: `/${module.key}/:id`, title: `${module.singular} detail` },
    { path: `/${module.key}/:id/edit`, title: `Edit ${module.singular}` },
  ]),
];
