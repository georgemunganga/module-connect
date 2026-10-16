import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { CheckCircle2, X } from "lucide-react";
import { inferVendorId } from "./vendor-links";
import { withDefaultRequestOwner } from "./request-views";

export type Line = {
  id: string;
  itemId?: string;
  name: string;
  quantity: number;
  rate: number;
  unit: string;
  account?: string;
};
export type AppRecord = {
  id: string;
  kind: string;
  title: string;
  party: string;
  date: string;
  amount: number;
  status: string;
  createdAt?: string;
  lastModifiedAt?: string;
  lines?: Line[];
  meta?: Record<string, string>;
};
export function useStoredState<T>(
  key: string,
  initial: T,
): [T, (value: T | ((previous: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`procureui.${key}`);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`procureui.${key}`, JSON.stringify(state));
    } catch {
      /* Browser storage may be unavailable. */
    }
  }, [key, state]);
  return [state, setState];
}
export const today = () => new Date().toISOString().slice(0, 10);
export const money = (value: number) =>
  new Intl.NumberFormat("en-ZM", {
    style: "currency",
    currency: "ZMW",
    maximumFractionDigits: 2,
  }).format(value);
export const vendors = [
  "Northstar Office Supply",
  "Copperline Technology",
  "Atlas Industrial Supplies",
];
export const items = [
  { name: "Office chair", rate: 1250, unit: "pcs" },
  { name: "Business laptop", rate: 8400, unit: "pcs" },
  { name: "Printer paper", rate: 85, unit: "box" },
];
export const fixtures: AppRecord[] = [
  ...items.map((item, index) => ({
    id: `ITEM-${String(index + 1).padStart(3, "0")}`,
    kind: "items",
    title: item.name,
    party: "Inventory",
    date: today(),
    amount: item.rate,
    status: "Active",
    meta: {
      unit: item.unit,
      sku: `SKU-${index + 1}`,
      account: "Office Supplies",
      type: "Goods",
      description: `${item.name} for day-to-day operations`,
      preferredVendor: vendors[index % vendors.length],
    },
  })),
  ...vendors.map((name, index) => ({
    id: `VEND-${String(index + 1).padStart(3, "0")}`,
    kind: "vendors",
    title: name,
    party: "Zambia",
    date: today(),
    amount: 0,
    status: "Active",
    meta: {
      email: [
        "orders@northstar.example",
        "billing@copperline.example",
        "accounts@atlas.example",
      ][index],
      currency: "ZMW - Zambian Kwacha",
      company: name,
      displayName: name,
      phone: ["+260 211 555 010", "+260 211 555 011", "+260 211 555 012"][
        index
      ],
      language: "English",
      paymentTerms: "Due on Receipt",
      portalStatus: "Not invited",
      reportingTags: "[]",
      contactPersons: "[]",
      bankAccounts: "[]",
    },
  })),
  {
    id: "PR-00001",
    kind: "requests",
    title: "Office equipment for new team",
    party: "Operations",
    date: today(),
    amount: 15900,
    status: "Pending Approval",
    meta: { requester: "You" },
    lines: [
      {
        id: "1",
        itemId: "ITEM-001",
        name: "Office chair",
        quantity: 6,
        rate: 1250,
        unit: "pcs",
      },
      {
        id: "2",
        itemId: "ITEM-002",
        name: "Business laptop",
        quantity: 1,
        rate: 8400,
        unit: "pcs",
      },
    ],
  },
  {
    id: "PR-00002",
    kind: "requests",
    title: "Quarterly stationery",
    party: "Finance",
    date: today(),
    amount: 1700,
    status: "Approved",
    meta: { requester: "You" },
  },
  {
    id: "PR-00003",
    kind: "requests",
    title: "Headsets for the support team",
    party: "Support",
    date: today(),
    amount: 960,
    status: "Pending Approval",
    meta: { requester: "Another employee" },
  },
  {
    id: "RFQ-00001",
    kind: "rfqs",
    title: "Office equipment sourcing",
    party: "Procurement team",
    date: today(),
    amount: 0,
    status: "Draft",
  },
  {
    id: "PO-00001",
    kind: "purchase-orders",
    title: "Office equipment",
    party: vendors[0],
    date: today(),
    amount: 7500,
    status: "Draft",
    lines: [
      {
        id: "po-line-1",
        itemId: "ITEM-001",
        name: "Office chair",
        quantity: 6,
        rate: 1250,
        unit: "pcs",
        account: "Equipment",
      },
    ],
    meta: { vendorId: "VEND-001", reference: "PO-00001" },
  },
  {
    id: "RCV-00001",
    kind: "purchase-receives",
    title: "Stationery delivery",
    party: vendors[0],
    date: today(),
    amount: 1700,
    status: "Received",
    lines: [
      {
        id: "receive-line-1",
        itemId: "ITEM-003",
        name: "Printer paper",
        quantity: 20,
        rate: 85,
        unit: "box",
        account: "Office Supplies",
      },
    ],
    meta: { vendorId: "VEND-001", source: "PO-00001", reference: "RCV-00001" },
  },
  {
    id: "BILL-00001",
    kind: "bills",
    title: "Office supplies",
    party: vendors[0],
    date: today(),
    amount: 1700,
    status: "Open",
    lines: [
      {
        id: "bill-line-1",
        itemId: "ITEM-003",
        name: "Printer paper",
        quantity: 20,
        rate: 85,
        unit: "box",
        account: "Office Supplies",
      },
    ],
    meta: {
      vendorId: "VEND-001",
      reference: "BILL-00001",
      paymentTerms: "Due on Receipt",
    },
  },
  {
    id: "RB-00001",
    kind: "recurring-bills",
    title: "Monthly equipment service",
    party: vendors[2],
    date: today(),
    amount: 2400,
    status: "Active",
    lines: [
      {
        id: "recurring-line-1",
        name: "Monthly equipment service",
        quantity: 1,
        rate: 2400,
        unit: "month",
        account: "Services",
      },
    ],
    meta: { vendorId: "VEND-003", frequency: "Monthly", reference: "RB-00001" },
  },
  {
    id: "PAY-00001",
    kind: "payments",
    title: "Stationery payment",
    party: vendors[0],
    date: today(),
    amount: 850,
    status: "Paid",
    meta: {
      vendorId: "VEND-001",
      paymentMode: "Bank Transfer",
      account: "Operating Account",
    },
  },
  {
    id: "VC-00001",
    kind: "vendor-credits",
    title: "Returned supplies",
    party: vendors[0],
    date: today(),
    amount: 170,
    status: "Open",
    meta: { vendorId: "VEND-001", creditReason: "Returned supplies" },
  },
];
export function saveToRecords(
  records: AppRecord[],
  record: AppRecord,
  now = new Date().toISOString(),
) {
  const existing = records.find((candidate) => candidate.id === record.id);
  return [
    {
      ...record,
      createdAt: record.createdAt ?? existing?.createdAt ?? now,
      lastModifiedAt: now,
    },
    ...records.filter((candidate) => candidate.id !== record.id),
  ];
}
export function updateInRecords(
  records: AppRecord[],
  id: string,
  updates: Partial<AppRecord>,
  now = new Date().toISOString(),
) {
  return records.map((record) =>
    record.id === id
      ? {
          ...record,
          ...updates,
          createdAt: record.createdAt ?? now,
          lastModifiedAt: now,
        }
      : record,
  );
}
export function removeFromRecords(records: AppRecord[], id: string) {
  return records.filter((record) => record.id !== id);
}
type Store = {
  records: AppRecord[];
  saveRecord: (record: AppRecord) => void;
  updateRecord: (id: string, updates: Partial<AppRecord>) => void;
  deleteRecord: (id: string) => void;
  notify: (message: string) => void;
};
const Context = createContext<Store | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useStoredState("records.v1", fixtures);
  const [toast, setToast] = useState("");
  useEffect(() => {
    const vendors = records.filter((record) => record.kind === "vendors");
    const items = records.filter((record) => record.kind === "items");
    let changed = false;
    const migrated = records.map((record, index) => {
      const dateValue = Date.parse(`${record.date}T00:00:00.000Z`);
      const createdAt =
        record.createdAt ??
        new Date(
          (Number.isFinite(dateValue) ? dateValue : Date.now()) + index * 1000,
        ).toISOString();
      const lastModifiedAt = record.lastModifiedAt ?? createdAt;
      const timestampChanged = !record.createdAt || !record.lastModifiedAt;
      if (timestampChanged) changed = true;
      let meta = record.meta;
      const vendorId = inferVendorId(record, vendors);
      if (vendorId && vendorId !== record.meta?.vendorId) {
        meta = { ...meta, vendorId };
        changed = true;
      }
      let lines = record.lines;
      if (lines?.some((line) => !line.itemId)) {
        lines = lines.map((line) => {
          if (line.itemId) return line;
          const item = items.find((candidate) => candidate.title === line.name);
          return item ? { ...line, itemId: item.id } : line;
        });
        if (lines.some((line, index) => line !== record.lines?.[index]))
          changed = true;
      }
      return timestampChanged || meta !== record.meta || lines !== record.lines
        ? { ...record, createdAt, lastModifiedAt, meta, lines }
        : record;
    });
    if (changed) setRecords(migrated);
  }, [records, setRecords]);
  useEffect(() => {
    if (toast) {
      const timeout = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(timeout);
    }
  }, [toast]);
  const saveRecord = (record: AppRecord) => {
    setRecords((previous) =>
      saveToRecords(previous, withDefaultRequestOwner(record)),
    );
  };
  const updateRecord = (id: string, updates: Partial<AppRecord>) =>
    setRecords((previous) => updateInRecords(previous, id, updates));
  const deleteRecord = (id: string) =>
    setRecords((previous) => removeFromRecords(previous, id));
  return (
    <Context.Provider
      value={{
        records,
        saveRecord,
        updateRecord,
        deleteRecord,
        notify: setToast,
      }}
    >
      {children}
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-4 right-4 z-[60] flex items-center gap-3 rounded-lg bg-slate-900 px-5 py-4 text-sm text-white shadow-xl sm:left-auto sm:max-w-lg"
        >
          <CheckCircle2 size={20} className="shrink-0 text-emerald-400" />
          {toast}
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
            className="ml-auto p-1"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export function useApp() {
  const store = useContext(Context);
  if (!store) throw new Error("AppProvider is required");
  return store;
}
