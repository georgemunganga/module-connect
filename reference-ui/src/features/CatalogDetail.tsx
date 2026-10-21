import { RecordTable } from "../components/data/RecordTable";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  FileText,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  Send,
  Store,
  Trash2,
  UserRound,
  WalletCards,
} from "lucide-react";
import {
  ActivityTimeline,
  DeleteConfirm,
  DetailSection,
  DetailTabs,
  DetailValue,
} from "../components/data/DetailPrimitives";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from "../components/ui";
import { billBalance } from "../lib/payables";
import { belongsToVendor } from "../lib/vendor-links";
import { money, today, useApp, type AppRecord } from "../lib/store";

type Address = {
  id: string;
  attention: string;
  country: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  fax: string;
};
type ContactPerson = {
  id: string;
  salutation: string;
  firstName: string;
  lastName: string;
  email: string;
  workPhone: string;
  mobile: string;
  skype: string;
  designation: string;
  department: string;
};
type BankAccount = {
  id: string;
  holder: string;
  bank: string;
  masked: string;
  identifier: string;
};
type TextFormat = "normal" | "bold" | "italic" | "underline";
type LocalComment = {
  id: string;
  text: string;
  createdAt: string;
  format?: TextFormat;
};
type LocalMail = {
  id: string;
  subject: string;
  to: string;
  createdAt: string;
  body: string;
  format?: TextFormat;
};
type VendorTab =
  | "overview"
  | "comments"
  | "transactions"
  | "mails"
  | "statement";

function parseJson<T>(raw: string | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function metaArray<T>(record: AppRecord, key: string): T[] {
  const value = parseJson<T[]>(record.meta?.[key], []);
  return Array.isArray(value) ? value : [];
}
function saveMeta(
  record: AppRecord,
  updateRecord: (id: string, updates: Partial<AppRecord>) => void,
  patch: Record<string, string>,
) {
  updateRecord(record.id, { meta: { ...record.meta, ...patch } });
}
function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
}
function formatClass(format?: TextFormat) {
  if (format === "bold") return "font-semibold";
  if (format === "italic") return "italic";
  if (format === "underline") return "underline";
  return "";
}
function initials(value: string) {
  return (
    value
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? "")
      .join("")
      .toUpperCase() || "V"
  );
}
function transactionPath(kind: string) {
  const paths: Record<string, string> = {
    bills: "bills",
    "purchase-orders": "purchase-orders",
    "purchase-receives": "purchase-receives",
    "recurring-bills": "recurring-bills",
    payments: "payments",
    "vendor-credits": "vendor-credits",
  };
  return paths[kind] ?? kind;
}
export function CatalogDetail({ kind }: { kind: "items" | "vendors" }) {
  const { id, tab } = useParams();
  const { records } = useApp();
  const record = records.find((item) => item.id === id && item.kind === kind);
  if (!record)
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8">
        <h1 className="text-xl font-semibold">
          {kind === "vendors" ? "Vendor" : "Item"} not found
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          This record does not exist in the local demo catalog.
        </p>
        <Link
          to={`/${kind}`}
          className="mt-5 inline-flex text-sm text-blue-600"
        >
          Return to {kind} →
        </Link>
      </div>
    );
  return kind === "vendors" ? (
    <VendorDetail
      key={record.id}
      record={record}
      tab={tab as VendorTab | undefined}
    />
  ) : (
    <ItemDetail key={record.id} record={record} />
  );
}

function VendorDetail({
  record,
  tab: routeTab,
}: {
  record: AppRecord;
  tab?: VendorTab;
}) {
  const { records, updateRecord, saveRecord, deleteRecord, notify } = useApp();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const [newTransactionOpen, setNewTransactionOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addressEditor, setAddressEditor] = useState<{
    type: "billing" | "shipping";
    address: Address;
  } | null>(null);
  const [addressDelete, setAddressDelete] = useState<
    "billing" | "shipping" | null
  >(null);
  const [contactEditor, setContactEditor] = useState<ContactPerson | null>(
    null,
  );
  const [contactDelete, setContactDelete] = useState<ContactPerson | null>(
    null,
  );
  const [bankEditor, setBankEditor] = useState<BankAccount | null>(null);
  const [bankDelete, setBankDelete] = useState<BankAccount | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState({ subject: "", body: "" });
  const [emailFormat, setEmailFormat] = useState<TextFormat>("normal");
  const [range, setRange] = useState("This Month");
  const [transactionFilter, setTransactionFilter] = useState("All");
  const profile = {
    billing: parseJson<Address | null>(record.meta?.billingAddress, null),
    shipping: parseJson<Address | null>(record.meta?.shippingAddress, null),
    contacts: metaArray<ContactPerson>(record, "contactPersons"),
    banks: metaArray<BankAccount>(record, "bankAccounts"),
    comments: metaArray<LocalComment>(record, "comments"),
    mails: metaArray<LocalMail>(record, "localMails"),
    tags: metaArray<string>(record, "reportingTags"),
  };
  const company = record.meta?.company ?? record.title;
  const outstanding = records
    .filter((item) => item.kind === "bills" && belongsToVendor(item, record))
    .reduce((sum, bill) => sum + billBalance(records, bill), 0);
  const unusedCredits = records
    .filter(
      (item) =>
        item.kind === "vendor-credits" &&
        belongsToVendor(item, record) &&
        !item.meta?.appliedBillId &&
        item.status !== "Draft",
    )
    .reduce((sum, credit) => sum + credit.amount, 0);
  const txTypes = [
    {
      key: "bills",
      label: "Bills",
      path: "bills",
      columns: [
        "Date",
        "Bill #",
        "Order number",
        "Vendor name",
        "Amount",
        "Balance due",
        "Status",
      ],
    },
    {
      key: "payments",
      label: "Bill Payments",
      path: "payments",
      columns: [
        "Date",
        "Payment number",
        "Reference number",
        "Payment mode",
        "Amount paid",
        "Unused amount",
        "Status",
      ],
    },
    {
      key: "recurring-bills",
      label: "Recurring Bills",
      path: "recurring-bills",
      columns: [
        "Date",
        "Recurring bill #",
        "Vendor name",
        "Amount",
        "Frequency",
        "Status",
      ],
    },
    {
      key: "purchase-orders",
      label: "Purchase Orders",
      path: "purchase-orders",
      columns: ["Date", "Order #", "Vendor name", "Amount", "Status"],
    },
    {
      key: "purchase-receives",
      label: "Purchase Receives",
      path: "purchase-receives",
      columns: ["Date", "Receive #", "Purchase order", "Vendor name", "Status"],
    },
    {
      key: "vendor-credits",
      label: "Vendor Credits",
      path: "vendor-credits",
      columns: [
        "Date",
        "Credit #",
        "Vendor name",
        "Amount",
        "Applied to",
        "Status",
      ],
    },
  ];
  const relatedTransactions = records.filter(
    (item) =>
      txTypes.some((type) => type.key === item.kind) &&
      belongsToVendor(item, record),
  );
  const filteredTransactions =
    transactionFilter === "All"
      ? relatedTransactions
      : relatedTransactions.filter((item) => item.kind === transactionFilter);
  const actualTab: VendorTab = [
    "overview",
    "comments",
    "transactions",
    "mails",
    "statement",
  ].includes(routeTab ?? "")
    ? routeTab!
    : "overview";
  const setTab = (value: string) =>
    navigate(
      value === "overview"
        ? `/vendors/${record.id}`
        : `/vendors/${record.id}/${value}`,
    );
  const persist = (key: string, value: unknown) =>
    saveMeta(record, updateRecord, { [key]: JSON.stringify(value) });
  const patchAddress = (
    type: "billing" | "shipping",
    address: Address | null,
  ) => persist(`${type}Address`, address);
  const mailHistory = [...profile.mails].reverse();

  const removeVendor = () => {
    deleteRecord(record.id);
    setDeleteOpen(false);
    notify(
      `${record.title} removed from the local demo catalog. Related demo records were left unchanged.`,
    );
    navigate("/vendors");
  };
  const cloneVendor = () => {
    const safeMeta = { ...record.meta };
    delete safeMeta.accountNumber;
    delete safeMeta.accountName;
    delete safeMeta.bankName;
    if (safeMeta.bankAccounts) {
      safeMeta.bankAccounts = JSON.stringify(
        metaArray<BankAccount>(record, "bankAccounts").map(
          ({ id, holder, bank, masked, identifier }) => ({
            id,
            holder,
            bank,
            masked,
            identifier,
          }),
        ),
      );
    }
    const clone: AppRecord = {
      ...record,
      id: `VEND-${String(Date.now()).slice(-6)}`,
      title: `${record.title} (copy)`,
      party: company,
      date: today(),
      status: "Active",
      meta: {
        ...safeMeta,
        displayName: `${record.title} (copy)`,
        comments: "[]",
        localMails: "[]",
      },
    };
    saveRecord(clone);
    setMoreOpen(false);
    notify("Vendor copied in this browser only.");
    navigate(`/vendors/${clone.id}`);
  };
  const addAddress = (type: "billing" | "shipping", address: Address) => {
    patchAddress(type, address);
    setAddressEditor(null);
    notify(
      `${type === "billing" ? "Billing" : "Shipping"} address saved locally.`,
    );
  };
  const addContact = (person: ContactPerson) => {
    if (!person.firstName.trim() && !person.lastName.trim()) return;
    const contacts = person.id
      ? profile.contacts.map((item) => (item.id === person.id ? person : item))
      : [...profile.contacts, { ...person, id: crypto.randomUUID() }];
    persist("contactPersons", contacts);
    setContactEditor(null);
    notify("Contact person saved in the local demo profile.");
  };
  const addComment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = String(form.get("comment") ?? "").trim();
    if (!text) return;
    persist("comments", [
      ...profile.comments,
      {
        id: crypto.randomUUID(),
        text,
        createdAt: today(),
        format: emailFormat,
      },
    ]);
    event.currentTarget.reset();
    notify("Comment saved locally; nothing was sent to ERP.");
  };
  const composeLocalMail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!emailDraft.subject.trim()) return;
    persist("localMails", [
      ...profile.mails,
      {
        id: crypto.randomUUID(),
        subject: emailDraft.subject,
        to: record.meta?.email ?? "vendor@example.test",
        createdAt: today(),
        body: emailDraft.body,
        format: emailFormat,
      },
    ]);
    setEmailOpen(false);
    setEmailDraft({ subject: "", body: "" });
    notify(
      "Message saved in this local preview; it was not emailed to the vendor.",
    );
    setTab("mails");
  };
  const saveBank = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = String(form.get("id") ?? "");
    const existing = profile.banks.find((item) => item.id === id);
    const account = String(form.get("account") ?? "");
    const repeated = String(form.get("repeat") ?? "");
    const bank = String(form.get("bank") ?? "").trim();
    const invalidAccount = account
      ? account.length < 4 || account !== repeated
      : !existing;
    if (!bank || invalidAccount) {
      notify(
        account !== repeated && account
          ? "Account numbers do not match."
          : "Enter a fictional bank name and matching demo account number.",
      );
      return;
    }
    const masked = account
      ? `•••• ${account.slice(-4)}`
      : (existing?.masked ?? "");
    const next: BankAccount = {
      id: existing?.id ?? crypto.randomUUID(),
      holder: String(form.get("holder") ?? "").trim() || "Demo account holder",
      bank,
      masked,
      identifier: String(form.get("identifier") ?? "").trim(),
    };
    persist(
      "bankAccounts",
      existing
        ? profile.banks.map((item) => (item.id === existing.id ? next : item))
        : [...profile.banks, next],
    );
    event.currentTarget.reset();
    setBankEditor(null);
    notify(
      existing
        ? "Masked bank label updated locally. Raw account numbers were not stored."
        : "Masked bank label saved locally. Raw account numbers are not stored and no payments are enabled.",
    );
  };
  const tabs = [
    { key: "overview", label: "Overview" },
    {
      key: "comments",
      label: `Comments${profile.comments.length ? ` (${profile.comments.length})` : ""}`,
    },
    { key: "transactions", label: "Transactions" },
    { key: "mails", label: "Mails" },
    { key: "statement", label: "Statement" },
  ];
  return (
    <div className="-mx-5 -mt-5 min-h-[calc(100dvh-5rem)] bg-[#f7f8fb] sm:-mx-8 sm:-mt-8">
      <div className="flex min-h-[calc(100dvh-5rem)] flex-col xl:flex-row">
        <aside className="w-full shrink-0 border-b border-slate-200 bg-white xl:w-64 xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
            <div>
              <p className="text-xs text-slate-400">Directory</p>
              <Link
                to="/vendors"
                className="font-semibold text-slate-800 hover:text-blue-600"
              >
                Active Vendors
              </Link>
            </div>
            <Link
              to="/vendors/new"
              aria-label="Add vendor"
              className="rounded-md bg-blue-50 p-2 text-blue-600"
            >
              <Plus size={16} />
            </Link>
          </div>
          <div className="max-h-52 overflow-y-auto xl:max-h-[calc(100dvh-12rem)]">
            {records
              .filter(
                (item) => item.kind === "vendors" && item.status !== "Inactive",
              )
              .map((item) => (
                <Link
                  key={item.id}
                  to={`/vendors/${item.id}`}
                  className={`block border-b border-slate-100 px-4 py-3 hover:bg-blue-50/50 ${item.id === record.id ? "bg-blue-50/70" : ""}`}
                >
                  <span className="block truncate text-sm font-medium text-slate-800">
                    {item.title}
                  </span>
                  <span className="mt-1 block text-[11px] text-slate-400">
                    {money(
                      item.kind === "vendors"
                        ? records
                            .filter(
                              (tx) =>
                                tx.kind === "bills" &&
                                belongsToVendor(tx, item),
                            )
                            .reduce(
                              (sum, bill) => sum + billBalance(records, bill),
                              0,
                            )
                        : 0,
                    )}{" "}
                    outstanding
                  </span>
                </Link>
              ))}
          </div>
        </aside>
        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
            <div className="min-w-0">
              <Link
                to="/vendors"
                className="mb-1 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600"
              >
                <ArrowLeft size={13} /> Active Vendors
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold text-slate-900">
                  {record.title}
                </h1>
                <Badge>{record.status}</Badge>
              </div>
              <p className="text-xs text-slate-400">
                {money(outstanding)} outstanding payables
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link to={`/vendors/${record.id}/edit`}>
                <Button variant="secondary">
                  <Pencil size={14} /> Edit
                </Button>
              </Link>
              <div className="relative">
                <Button onClick={() => setNewTransactionOpen((v) => !v)}>
                  <Plus size={15} /> New Transaction <ChevronDown size={14} />
                </Button>
                {newTransactionOpen && (
                  <div className="absolute right-0 top-full z-30 mt-1 w-52 rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                    {txTypes.map((type) => (
                      <Link
                        key={type.key}
                        to={`/${type.path}/new?vendor=${encodeURIComponent(record.id)}`}
                        onClick={() => setNewTransactionOpen(false)}
                        className="block rounded px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        New {type.label.replace(/s$/, "")}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <Button
                  variant="secondary"
                  onClick={() => setMoreOpen((v) => !v)}
                  aria-expanded={moreOpen}
                >
                  <MoreHorizontal size={16} /> More
                </Button>
                {moreOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-30 mt-1 w-56 rounded-md border border-slate-200 bg-white p-1 shadow-lg"
                  >
                    <button
                      role="menuitem"
                      onClick={() => {
                        setEmailOpen(true);
                        setMoreOpen(false);
                      }}
                      className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      Email Vendor (preview)
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setBankEditor({
                          id: "",
                          holder: "",
                          bank: "",
                          masked: "",
                          identifier: "",
                        });
                        setMoreOpen(false);
                      }}
                      className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      Add Bank Account
                    </button>
                    <button
                      role="menuitem"
                      onClick={cloneVendor}
                      className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      Clone Vendor
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        updateRecord(record.id, {
                          status:
                            record.status === "Inactive"
                              ? "Active"
                              : "Inactive",
                        });
                        setMoreOpen(false);
                        notify(
                          `Vendor marked ${record.status === "Inactive" ? "active" : "inactive"} in the local demo.`,
                        );
                      }}
                      className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      {record.status === "Inactive"
                        ? "Mark as Active"
                        : "Mark as Inactive"}
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMoreOpen(false);
                        setDeleteOpen(true);
                      }}
                      className="block w-full rounded px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                    >
                      Delete Vendor
                    </button>
                    <div className="my-1 border-t border-slate-100" />
                    <button
                      role="menuitem"
                      disabled
                      title="No live ERP service is connected"
                      className="block w-full rounded px-3 py-2 text-left text-xs text-slate-400"
                    >
                      Configure Vendor Portal · unavailable
                    </button>
                    <button
                      role="menuitem"
                      disabled
                      title="Template association is not connected in this frontend-only preview."
                      className="block w-full rounded px-3 py-2 text-left text-xs text-slate-400"
                    >
                      Associate Templates · unavailable
                    </button>
                    <button
                      role="menuitem"
                      disabled
                      title="No live ERP service is connected"
                      className="block w-full rounded px-3 py-2 text-left text-xs text-slate-400"
                    >
                      Merge Vendors · unavailable
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>
          <DetailTabs tabs={tabs} active={actualTab} onChange={setTab} />
          <div className="space-y-4 p-4 sm:p-6">
            {actualTab === "overview" && (
              <VendorOverview
                record={record}
                profile={profile}
                outstanding={outstanding}
                unusedCredits={unusedCredits}
                relatedTransactions={relatedTransactions}
                openAddress={setAddressEditor}
                openContact={setContactEditor}
                openBank={() =>
                  setBankEditor({
                    id: "",
                    holder: "",
                    bank: "",
                    masked: "",
                    identifier: "",
                  })
                }
                onEditBank={setBankEditor}
                openEmail={() => setEmailOpen(true)}
                onDeleteAddress={setAddressDelete}
                onDeleteContact={setContactDelete}
                onDeleteBank={setBankDelete}
              />
            )}
            {actualTab === "comments" && (
              <VendorComments
                comments={profile.comments}
                onAdd={addComment}
                format={emailFormat}
                setFormat={setEmailFormat}
              />
            )}
            {actualTab === "transactions" && (
              <VendorTransactions
                types={txTypes}
                records={filteredTransactions}
                allRecords={relatedTransactions}
                filter={transactionFilter}
                setFilter={setTransactionFilter}
                vendor={record}
              />
            )}
            {actualTab === "mails" && (
              <VendorMails
                mails={mailHistory}
                openComposer={() => setEmailOpen(true)}
              />
            )}
            {actualTab === "statement" && (
              <VendorStatement
                record={record}
                transactions={relatedTransactions}
                outstanding={outstanding}
                range={range}
                setRange={setRange}
              />
            )}
          </div>
        </main>
      </div>
      <DeleteConfirm
        open={deleteOpen}
        title="Delete vendor?"
        description={`Delete ${record.title} from the local catalog? Related demo bills and orders will remain and will not be changed.`}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={removeVendor}
      />
      <DeleteConfirm
        open={Boolean(addressDelete)}
        title="Remove address?"
        description="This address will be removed from this browser's local demo profile only."
        onCancel={() => setAddressDelete(null)}
        onConfirm={() => {
          if (addressDelete) patchAddress(addressDelete, null);
          setAddressDelete(null);
          notify("Address removed from the local demo profile.");
        }}
      />
      <DeleteConfirm
        open={Boolean(contactDelete)}
        title="Remove contact person?"
        description={`Remove ${contactDelete?.firstName ?? ""} ${contactDelete?.lastName ?? ""} from this local demo vendor?`}
        onCancel={() => setContactDelete(null)}
        onConfirm={() => {
          if (contactDelete)
            persist(
              "contactPersons",
              profile.contacts.filter((item) => item.id !== contactDelete.id),
            );
          setContactDelete(null);
          notify("Contact person removed locally.");
        }}
      />
      <DeleteConfirm
        open={Boolean(bankDelete)}
        title="Remove bank account?"
        description="Remove this masked bank-account label from the local demo profile? No real account data or payment instruction will be affected."
        onCancel={() => setBankDelete(null)}
        onConfirm={() => {
          if (bankDelete)
            persist(
              "bankAccounts",
              profile.banks.filter((item) => item.id !== bankDelete.id),
            );
          setBankDelete(null);
          notify("Masked bank label removed locally.");
        }}
      />
      {addressEditor && (
        <AddressModal
          type={addressEditor.type}
          address={addressEditor.address}
          onClose={() => setAddressEditor(null)}
          onSave={addAddress}
        />
      )}
      {contactEditor && (
        <ContactModal
          contact={contactEditor}
          onClose={() => setContactEditor(null)}
          onSave={addContact}
        />
      )}
      {bankEditor && (
        <BankModal
          bank={bankEditor}
          onClose={() => setBankEditor(null)}
          onSave={saveBank}
        />
      )}
      {emailOpen && (
        <Modal
          title="Compose vendor email · preview"
          onClose={() => setEmailOpen(false)}
        >
          <form onSubmit={composeLocalMail} className="space-y-4">
            <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Local preview only. This message will not be sent to the vendor.
            </p>
            <Field label="To">
              <Input
                readOnly
                value={record.meta?.email ?? "vendor@example.test"}
              />
            </Field>
            <Field label="Subject">
              <Input
                required
                value={emailDraft.subject}
                onChange={(event) =>
                  setEmailDraft((v) => ({ ...v, subject: event.target.value }))
                }
              />
            </Field>
            <Field label="Message">
              <Textarea
                className={formatClass(emailFormat)}
                value={emailDraft.body}
                onChange={(event) =>
                  setEmailDraft((v) => ({ ...v, body: event.target.value }))
                }
              />
            </Field>
            <div className="flex justify-between gap-2">
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  className="!px-2"
                  onClick={() =>
                    setEmailFormat((v) => (v === "bold" ? "normal" : "bold"))
                  }
                >
                  <strong>B</strong>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="!px-2"
                  onClick={() =>
                    setEmailFormat((v) =>
                      v === "italic" ? "normal" : "italic",
                    )
                  }
                >
                  <em>I</em>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="!px-2"
                  aria-label="Underline"
                  onClick={() =>
                    setEmailFormat((v) =>
                      v === "underline" ? "normal" : "underline",
                    )
                  }
                >
                  <u>U</u>
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEmailOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  <Send size={14} />
                  Save to local mail history
                </Button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function VendorOverview({
  record,
  profile,
  outstanding,
  unusedCredits,
  relatedTransactions,
  openAddress,
  openContact,
  openBank,
  onEditBank,
  openEmail,
  onDeleteAddress,
  onDeleteContact,
  onDeleteBank,
}: {
  record: AppRecord;
  profile: {
    billing: Address | null;
    shipping: Address | null;
    contacts: ContactPerson[];
    banks: BankAccount[];
    tags: string[];
    comments: LocalComment[];
    mails: LocalMail[];
  };
  outstanding: number;
  unusedCredits: number;
  relatedTransactions: AppRecord[];
  openAddress: (value: {
    type: "billing" | "shipping";
    address: Address;
  }) => void;
  openContact: (person: ContactPerson) => void;
  openBank: () => void;
  onEditBank: (bank: BankAccount) => void;
  openEmail: () => void;
  onDeleteAddress: (type: "billing" | "shipping") => void;
  onDeleteContact: (person: ContactPerson) => void;
  onDeleteBank: (bank: BankAccount) => void;
}) {
  const navigate = useNavigate();
  const addr = (type: "billing" | "shipping", value: Address | null) =>
    value ? (
      <div className="text-sm text-slate-600">
        <p>{value.attention}</p>
        <p>
          {[value.street, value.city, value.state, value.zip, value.country]
            .filter(Boolean)
            .join(", ")}
        </p>
        {value.phone && <p>{value.phone}</p>}
      </div>
    ) : (
      <p className="text-sm text-slate-400">No {type} address added</p>
    );
  const activities = [
    {
      id: "created",
      title: "Vendor created in this local demo",
      date: formatDate(record.date),
      detail: "Fictional record · no ERP profile is connected.",
    },
  ];
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.6fr)]">
        <DetailSection title="Vendor contact">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 font-semibold text-blue-600">
              {initials(record.title)}
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-slate-800">
                {record.meta?.displayName ?? record.title}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {record.meta?.company ?? record.title}
              </p>
              <a
                href={`mailto:${record.meta?.email ?? ""}`}
                onClick={(event) => event.preventDefault()}
                className="mt-2 block truncate text-sm text-blue-600"
              >
                {record.meta?.email ?? "No email address"}
              </a>
              <p className="mt-1 text-sm text-slate-500">
                {record.meta?.phone ?? "No work phone"}
              </p>
              {record.meta?.mobile && (
                <p className="mt-1 text-sm text-slate-500">
                  {record.meta.mobile}
                </p>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => navigate(`/vendors/${record.id}/mails`)}
            >
              <Mail size={14} /> Mails
            </Button>
            <Button variant="secondary" onClick={openEmail}>
              <Send size={14} /> Send Email · preview
            </Button>
            <Button
              variant="secondary"
              disabled
              title="Portal invitations are not connected in this frontend-only preview."
            >
              Invite to Portal
            </Button>
          </div>
        </DetailSection>
        <DetailSection
          title="Payables"
          action={
            <span className="text-xs text-slate-400">Local demo records</span>
          }
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <DetailValue
              label="Currency"
              value={record.meta?.currency ?? "ZMW - Zambian Kwacha"}
            />
            <DetailValue
              label="Outstanding payables"
              value={money(outstanding)}
            />
            <DetailValue label="Unused credits" value={money(unusedCredits)} />
          </div>
          <div className="mt-4 overflow-x-auto">
            <RecordTable variant="compact" className="w-full min-w-[490px] text-left text-sm">
              <thead className="table-head">
                <tr>
                  {["Currency", "Outstanding payables", "Unused credits"].map(
                    (value) => (
                      <th key={value} className="table-cell">
                        {value}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="table-cell">
                    {record.meta?.currency ?? "ZMW - Zambian Kwacha"}
                  </td>
                  <td className="table-cell">{money(outstanding)}</td>
                  <td className="table-cell">{money(unusedCredits)}</td>
                </tr>
              </tbody>
            </RecordTable>
          </div>
        </DetailSection>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <DetailSection
          title="Address"
          action={
            <Button
              variant="ghost"
              onClick={() =>
                openAddress({
                  type: "billing",
                  address: {
                    id: crypto.randomUUID(),
                    attention: "",
                    country: "Zambia",
                    street: "",
                    city: "",
                    state: "",
                    zip: "",
                    phone: "",
                    fax: "",
                  },
                })
              }
            >
              <Plus size={14} /> New Address
            </Button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-md bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-600">
                  Billing Address
                </h3>
                {profile.billing && (
                  <div className="flex gap-1">
                    <button
                      aria-label="Edit billing address"
                      onClick={() =>
                        openAddress({
                          type: "billing",
                          address: profile.billing!,
                        })
                      }
                      className="rounded p-1 text-slate-400 hover:bg-white hover:text-blue-600"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      aria-label="Delete billing address"
                      onClick={() => onDeleteAddress("billing")}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
              {addr("billing", profile.billing)}
              {!profile.billing && (
                <button
                  className="mt-2 text-xs text-blue-600"
                  onClick={() =>
                    openAddress({
                      type: "billing",
                      address: {
                        id: crypto.randomUUID(),
                        attention: "",
                        country: "Zambia",
                        street: "",
                        city: "",
                        state: "",
                        zip: "",
                        phone: "",
                        fax: "",
                      },
                    })
                  }
                >
                  + Add billing address
                </button>
              )}
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-600">
                  Shipping Address
                </h3>
                {profile.shipping && (
                  <div className="flex gap-1">
                    <button
                      aria-label="Edit shipping address"
                      onClick={() =>
                        openAddress({
                          type: "shipping",
                          address: profile.shipping!,
                        })
                      }
                      className="rounded p-1 text-slate-400 hover:bg-white hover:text-blue-600"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      aria-label="Delete shipping address"
                      onClick={() => onDeleteAddress("shipping")}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
              {addr("shipping", profile.shipping)}
              {!profile.shipping && (
                <button
                  className="mt-2 text-xs text-blue-600"
                  onClick={() =>
                    openAddress({
                      type: "shipping",
                      address: {
                        id: crypto.randomUUID(),
                        attention: "",
                        country: "Zambia",
                        street: "",
                        city: "",
                        state: "",
                        zip: "",
                        phone: "",
                        fax: "",
                      },
                    })
                  }
                >
                  + Add shipping address
                </button>
              )}
            </div>
          </div>
          {profile.billing && !profile.shipping && (
            <button
              className="mt-3 text-xs text-blue-600"
              onClick={() =>
                openAddress({
                  type: "shipping",
                  address: { ...profile.billing!, id: crypto.randomUUID() },
                })
              }
            >
              Copy billing address to shipping
            </button>
          )}
        </DetailSection>
        <DetailSection title="Other Details">
          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailValue
              label="Default Currency"
              value={record.meta?.currency ?? "ZMW - Zambian Kwacha"}
            />
            <DetailValue
              label="Portal Status"
              value={record.meta?.portalStatus ?? "Not invited"}
            />
            <DetailValue
              label="Vendor Language"
              value={record.meta?.language ?? "English"}
            />
            <DetailValue
              label="Payment Due Period"
              value={record.meta?.paymentTerms ?? "Due on Receipt"}
            />
            <DetailValue
              label="Tax Rate"
              value={record.meta?.taxRate || "Not set"}
            />
            <DetailValue label="Company ID" value={record.meta?.companyId} />
          </dl>
        </DetailSection>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <DetailSection
          title="Contact Persons"
          action={
            <Button
              variant="ghost"
              onClick={() =>
                openContact({
                  id: "",
                  salutation: "",
                  firstName: "",
                  lastName: "",
                  email: "",
                  workPhone: "",
                  mobile: "",
                  skype: "",
                  designation: "",
                  department: "",
                })
              }
            >
              <Plus size={14} /> Add Contact Person
            </Button>
          }
        >
          {profile.contacts.length ? (
            <div className="overflow-x-auto">
              <RecordTable variant="compact" className="w-full min-w-[780px] text-left text-xs">
                <thead className="table-head">
                  <tr>
                    {[
                      "Name",
                      "Email Address",
                      "Work Phone",
                      "Mobile",
                      "Skype",
                      "Designation",
                      "Department",
                      "",
                    ].map((value) => (
                      <th key={value} className="table-cell">
                        {value}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {profile.contacts.map((person) => (
                    <tr key={person.id} className="border-b border-slate-100">
                      <td className="table-cell font-medium">
                        {[person.salutation, person.firstName, person.lastName]
                          .filter(Boolean)
                          .join(" ") || "Unnamed contact"}
                      </td>
                      <td className="table-cell">{person.email || "—"}</td>
                      <td className="table-cell">{person.workPhone || "—"}</td>
                      <td className="table-cell">{person.mobile || "—"}</td>
                      <td className="table-cell">{person.skype || "—"}</td>
                      <td className="table-cell">
                        {person.designation || "—"}
                      </td>
                      <td className="table-cell">{person.department || "—"}</td>
                      <td className="table-cell">
                        <button
                          onClick={() => openContact(person)}
                          aria-label={`Edit ${person.firstName} ${person.lastName}`}
                          className="rounded p-1 text-slate-400 hover:text-blue-600"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => onDeleteContact(person)}
                          aria-label={`Delete ${person.firstName} ${person.lastName}`}
                          className="rounded p-1 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </RecordTable>
            </div>
          ) : (
            <EmptyState
              title="No contact persons"
              description="Add local contact rows to the fictional vendor profile."
              action={
                <Button
                  variant="secondary"
                  onClick={() =>
                    openContact({
                      id: "",
                      salutation: "",
                      firstName: "",
                      lastName: "",
                      email: "",
                      workPhone: "",
                      mobile: "",
                      skype: "",
                      designation: "",
                      department: "",
                    })
                  }
                >
                  <Plus size={14} /> Add Contact Person
                </Button>
              }
            />
          )}
        </DetailSection>
        <DetailSection
          title="Bank Account Details"
          action={
            <Button variant="ghost" onClick={openBank}>
              <Plus size={14} /> Add Bank Account
            </Button>
          }
        >
          {profile.banks.length ? (
            <div className="space-y-2">
              {profile.banks.map((bank) => (
                <div
                  key={bank.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      {bank.bank}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {bank.holder} · {bank.masked}
                    </p>
                    {bank.identifier && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        Bank Identifier Code · {bank.identifier}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      aria-label={`Edit bank ${bank.bank}`}
                      onClick={() => onEditBank(bank)}
                      className="rounded p-2 text-slate-400 hover:text-blue-600"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      aria-label={`Remove bank ${bank.bank}`}
                      onClick={() => onDeleteBank(bank)}
                      className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              No bank account added. The demo form stores only a masked label,
              never the entered account number.
            </p>
          )}
          <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Fictional values only. No account number is stored; no payment
            authority is granted.
          </p>
        </DetailSection>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <DetailSection title="Record Info">
          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailValue label="Record ID" value={record.id} />
            <DetailValue label="Created" value={formatDate(record.date)} />
            <DetailValue label="Status" value={record.status} />
            <DetailValue label="Source" value="Fictional local catalog" />
            <DetailValue
              label="Internal remarks"
              value={record.meta?.remarks || "—"}
            />
            <DetailValue
              label="Reporting tags"
              value={
                profile.tags.length
                  ? profile.tags.join(", ")
                  : "No reporting tags"
              }
            />
          </dl>
        </DetailSection>
        <DetailSection title="Recent Activity">
          <ActivityTimeline
            items={[
              ...profile.comments.slice(-2).map((comment) => ({
                id: comment.id,
                title: "Local comment added",
                detail: comment.text,
                date: formatDate(comment.createdAt),
              })),
              ...profile.mails.slice(-1).map((mail) => ({
                id: mail.id,
                title: "Message added to local mail history",
                detail: mail.subject,
                date: formatDate(mail.createdAt),
              })),
              ...activities,
            ]}
          />
        </DetailSection>
      </div>
    </>
  );
}

function VendorComments({
  comments,
  onAdd,
  format,
  setFormat,
}: {
  comments: LocalComment[];
  onAdd: (event: FormEvent<HTMLFormElement>) => void;
  format: TextFormat;
  setFormat: (
    value: TextFormat | ((current: TextFormat) => TextFormat),
  ) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
      <DetailSection title="Add Comment">
        <form onSubmit={onAdd} className="space-y-3">
          <div className="flex gap-1 border-b border-slate-100 pb-2">
            <Button
              type="button"
              variant="ghost"
              className="!px-2"
              aria-label="Bold"
              onClick={() =>
                setFormat((v) => (v === "bold" ? "normal" : "bold"))
              }
            >
              <strong>B</strong>
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="!px-2"
              aria-label="Italic"
              onClick={() =>
                setFormat((v) => (v === "italic" ? "normal" : "italic"))
              }
            >
              <em>I</em>
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="!px-2"
              aria-label="Underline"
              onClick={() =>
                setFormat((value) =>
                  value === "underline" ? "normal" : "underline",
                )
              }
            >
              <u>U</u>
            </Button>
          </div>
          <Textarea
            name="comment"
            required
            className={formatClass(format)}
            placeholder="Write a comment for this local demo vendor…"
          />
          <div className="flex justify-end">
            <Button type="submit">
              <Plus size={14} /> Add Comment
            </Button>
          </div>
          <p className="text-xs text-slate-400">
            Comments are saved in this browser's demo data only.
          </p>
        </form>
      </DetailSection>
      <DetailSection title="All Comments">
        {comments.length ? (
          <div className="space-y-3">
            {[...comments].reverse().map((comment) => (
              <article
                key={comment.id}
                className="rounded-md border border-slate-100 p-3"
              >
                <p
                  className={`whitespace-pre-wrap text-sm text-slate-700 ${formatClass(comment.format)}`}
                >
                  {comment.text}
                </p>
                <p className="mt-2 text-[11px] text-slate-400">
                  Local demo user · {formatDate(comment.createdAt)}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No comments yet"
            description="Comments added in this preview appear here."
          />
        )}
      </DetailSection>
    </div>
  );
}

function vendorTransactionCell(
  item: AppRecord,
  kind: string,
  label: string,
  allRecords: AppRecord[],
) {
  if (label === "Status") return <Badge>{item.status}</Badge>;
  if (kind === "bills") {
    if (label === "Order number") return item.meta?.source || "—";
    if (label === "Vendor name") return item.party;
    if (label === "Amount") return money(item.amount);
    if (label === "Balance due") return money(billBalance(allRecords, item));
  }
  if (kind === "payments") {
    if (label === "Reference number") return item.meta?.reference || "—";
    if (label === "Payment mode") return item.meta?.paymentMode || "—";
    if (label === "Amount paid") return money(item.amount);
    if (label === "Unused amount") {
      const unused = item.meta?.unusedAmount;
      return unused !== undefined && Number.isFinite(Number(unused))
        ? money(Number(unused))
        : "—";
    }
  }
  if (kind === "recurring-bills") {
    if (label === "Vendor name") return item.party;
    if (label === "Amount") return money(item.amount);
    if (label === "Frequency") return item.meta?.frequency || "—";
  }
  if (kind === "purchase-orders") {
    if (label === "Vendor name") return item.party;
    if (label === "Amount") return money(item.amount);
  }
  if (kind === "purchase-receives") {
    if (label === "Purchase order") return item.meta?.source || "—";
    if (label === "Vendor name") return item.party;
  }
  if (kind === "vendor-credits") {
    if (label === "Vendor name") return item.party;
    if (label === "Amount") return money(item.amount);
    if (label === "Applied to") return item.meta?.appliedBillId || "—";
  }
  return "—";
}

function VendorTransactions({
  types,
  records,
  allRecords,
  filter,
  setFilter,
  vendor,
}: {
  types: { key: string; label: string; path: string; columns: string[] }[];
  records: AppRecord[];
  allRecords: AppRecord[];
  filter: string;
  setFilter: (value: string) => void;
  vendor: AppRecord;
}) {
  const chosen = types.find((type) => type.key === filter);
  const shownTypes = chosen ? [chosen] : types;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <h2 className="font-semibold text-slate-800">Transactions</h2>
          <p className="mt-1 text-xs text-slate-500">
            Purchase-to-pay records linked to this local vendor.
          </p>
        </div>
        <Field label="Go to transactions" className="w-full sm:w-64">
          <Select
            aria-label="Go to transactions"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="All">All transaction types</option>
            {types.map((type) => (
              <option key={type.key} value={type.key}>
                {type.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {shownTypes.map((type) => {
        const data = records.filter((item) => item.kind === type.key);
        return (
          <DetailSection
            key={type.key}
            title={type.label}
            action={
              <Link
                to={`/${type.path}/new?vendor=${encodeURIComponent(vendor.id)}&fromVendor=${encodeURIComponent(vendor.id)}&vendorTab=transactions`}
                className="text-xs font-medium text-blue-600"
              >
                New
              </Link>
            }
          >
            {data.length ? (
              <div className="overflow-x-auto">
                <RecordTable variant="compact" className="w-full min-w-[720px] text-left text-xs">
                  <thead className="table-head">
                    <tr>
                      {type.columns.map((label) => (
                        <th key={label} className="table-cell">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-slate-100 hover:bg-slate-50"
                      >
                        <td className="table-cell">{formatDate(item.date)}</td>
                        <td className="table-cell">
                          <Link
                            to={`/${transactionPath(item.kind)}/${item.id}?fromVendor=${encodeURIComponent(vendor.id)}&vendorTab=transactions`}
                            className="font-medium text-blue-600"
                          >
                            {item.id}
                          </Link>
                        </td>
                        {type.columns.slice(2).map((label) => (
                          <td key={label} className="table-cell">
                            {vendorTransactionCell(
                              item,
                              type.key,
                              label,
                              allRecords,
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </RecordTable>
              </div>
            ) : (
              <EmptyState
                title={`No ${type.label.toLowerCase()} recorded yet`}
                description="This empty state is separate from the vendor directory and can be filled with fictional local demo records."
              />
            )}
          </DetailSection>
        );
      })}
    </div>
  );
}

function VendorMails({
  mails,
  openComposer,
}: {
  mails: LocalMail[];
  openComposer: () => void;
}) {
  return (
    <DetailSection
      title="System Mails"
      action={
        <Button onClick={openComposer}>
          <Mail size={14} /> Compose email · preview
        </Button>
      }
    >
      {mails.length ? (
        <div className="divide-y divide-slate-100">
          {[...mails].reverse().map((mail) => (
            <article key={mail.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium text-slate-800">{mail.subject}</h3>
                <span className="text-xs text-slate-400">
                  {formatDate(mail.createdAt)}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                To: {mail.to} · local draft/history
              </p>
              <p
                className={`mt-3 whitespace-pre-wrap text-sm text-slate-600 ${formatClass(mail.format)}`}
              >
                {mail.body}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No emails sent"
          description="Messages saved from this local preview will appear here. Nothing is sent to the vendor."
          action={
            <Button variant="secondary" onClick={openComposer}>
              <Mail size={14} /> Compose local preview
            </Button>
          }
        />
      )}
    </DetailSection>
  );
}

function VendorStatement({
  record,
  transactions,
  outstanding,
  range,
  setRange,
}: {
  record: AppRecord;
  transactions: AppRecord[];
  outstanding: number;
  range: string;
  setRange: (value: string) => void;
}) {
  const [transactionKind, setTransactionKind] = useState("All");
  const filtered = useMemo(() => {
    const now = new Date();
    if (range === "Last Month") now.setMonth(now.getMonth() - 1);
    return transactions.filter((item) => {
      if (transactionKind !== "All" && item.kind !== transactionKind)
        return false;
      if (range === "All Time") return true;
      const date = new Date(`${item.date.slice(0, 10)}T00:00:00`);
      return (
        !Number.isNaN(date.getTime()) &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear()
      );
    });
  }, [transactions, range, transactionKind]);
  const totalBills = filtered
    .filter((item) => item.kind === "bills")
    .reduce((sum, item) => sum + item.amount, 0);
  const totalPayments = filtered
    .filter((item) => item.kind === "payments")
    .reduce((sum, item) => sum + item.amount, 0);
  const totalCredits = filtered
    .filter((item) => item.kind === "vendor-credits")
    .reduce((sum, item) => sum + item.amount, 0);
  const exportStatement = () => {
    const rows = [
      ["Date", "Type", "Number", "Description", "Amount", "Status"],
      ...filtered.map((item) => [
        item.date,
        item.kind,
        item.id,
        item.title,
        String(item.amount),
        item.status,
      ]),
    ];
    const text = rows
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendor-statement-${record.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Statement</h2>
          <p className="mt-1 text-sm text-slate-500">
            Statement of account · local demo data only
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Field label="Filter By">
            <Select
              aria-label="Statement filter by"
              value={transactionKind}
              onChange={(event) => setTransactionKind(event.target.value)}
            >
              <option value="All">All Transactions</option>
              <option value="bills">Bills</option>
              <option value="payments">Bill Payments</option>
              <option value="recurring-bills">Recurring Bills</option>
              <option value="purchase-orders">Purchase Orders</option>
              <option value="purchase-receives">Purchase Receives</option>
              <option value="vendor-credits">Vendor Credits</option>
            </Select>
          </Field>
          <Field label="Date range">
            <Select
              aria-label="Statement date range"
              value={range}
              onChange={(event) => setRange(event.target.value)}
            >
              <option>This Month</option>
              <option>Last Month</option>
              <option>All Time</option>
            </Select>
          </Field>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer size={14} /> Print / Save PDF
          </Button>
          <Button variant="secondary" onClick={exportStatement}>
            <FileText size={14} /> Export CSV
          </Button>
        </div>
      </div>
      <div className="mx-auto max-w-4xl border border-slate-200 bg-white p-5 shadow-sm sm:p-10 print:shadow-none">
        <div className="flex flex-wrap justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400">
              Procurement demo
            </p>
            <h3 className="mt-2 text-xl font-semibold">Statement of Account</h3>
            <p className="mt-1 text-sm text-slate-500">To: {record.title}</p>
          </div>
          <div className="text-sm text-slate-500">
            <p>Period</p>
            <p className="mt-1 font-medium text-slate-700">{range}</p>
            <p className="mt-1">Currency · {record.meta?.currency ?? "ZMW"}</p>
          </div>
        </div>
        <div className="my-5 grid gap-3 sm:grid-cols-4">
          {[
            ["Bills", money(totalBills)],
            ["Payments", money(totalPayments)],
            ["Credits", money(totalCredits)],
            ["Balance due", money(outstanding)],
          ].map(([label, value]) => (
            <div key={label} className="rounded bg-slate-50 p-3">
              <p className="text-xs text-slate-400">{label}</p>
              <p className="mt-1 font-semibold">{value}</p>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <RecordTable variant="compact" className="w-full min-w-[620px] text-left text-sm">
            <thead className="table-head">
              <tr>
                {[
                  "Date",
                  "Transaction",
                  "Number",
                  "Description",
                  "Amount",
                  "Status",
                ].map((label) => (
                  <th key={label} className="table-cell">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="table-cell">{formatDate(item.date)}</td>
                  <td className="table-cell capitalize">
                    {item.kind.replaceAll("-", " ")}
                  </td>
                  <td className="table-cell">{item.id}</td>
                  <td className="table-cell">{item.title}</td>
                  <td className="table-cell">{money(item.amount)}</td>
                  <td className="table-cell">{item.status}</td>
                </tr>
              ))}
            </tbody>
          </RecordTable>
        </div>
        {!filtered.length && (
          <p className="py-10 text-center text-sm text-slate-400">
            No transactions in this statement period.
          </p>
        )}
        <p className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-400">
          Generated for the local frontend preview. This is not an official
          statement and was not emailed.
        </p>
      </div>
    </div>
  );
}

function ItemDetail({ record }: { record: AppRecord }) {
  const { records, updateRecord, deleteRecord, saveRecord, notify } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const [menu, setMenu] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [filter, setFilter] = useState("Purchase Orders");
  const [statusFilter, setStatusFilter] = useState("All");
  const related = records.filter(
    (item) =>
      item.kind !== "items" &&
      item.lines?.some(
        (line) => line.itemId === record.id || line.name === record.title,
      ),
  );
  const byType =
    filter === "All"
      ? related
      : related.filter(
          (item) =>
            item.kind ===
            (filter === "Purchase Orders"
              ? "purchase-orders"
              : filter === "Purchase Receives"
                ? "purchase-receives"
                : "bills"),
        );
  const statuses = [...new Set(related.map((item) => item.status))];
  const rows = byType.filter(
    (item) => statusFilter === "All" || item.status === statusFilter,
  );
  const reportingTags = metaArray<string>(record, "reportingTags");
  const clone = () => {
    const duplicate = {
      ...record,
      id: `ITEM-${String(Date.now()).slice(-6)}`,
      title: `${record.title} (copy)`,
      date: today(),
      meta: { ...record.meta },
    };
    saveRecord(duplicate);
    notify("Item cloned locally.");
    navigate(`/items/${duplicate.id}`);
  };
  const remove = () => {
    deleteRecord(record.id);
    notify(
      "Item removed from the local catalog. Related demo records were left unchanged.",
    );
    navigate("/items");
  };
  const toggleActive = () => {
    updateRecord(record.id, {
      status: record.status === "Inactive" ? "Active" : "Inactive",
    });
    notify(
      `Item marked ${record.status === "Inactive" ? "active" : "inactive"} in the local demo.`,
    );
  };
  const activities = [
    {
      id: "created",
      title: "Item created in local demo",
      date: formatDate(record.date),
    },
  ];
  return (
    <div className="-mx-5 -mt-5 min-h-[calc(100dvh-5rem)] bg-[#f7f8fb] sm:-mx-8 sm:-mt-8">
      <div className="flex min-h-[calc(100dvh-5rem)] flex-col xl:flex-row">
        <aside className="w-full shrink-0 border-b border-slate-200 bg-white xl:w-64 xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
            <div>
              <p className="text-xs text-slate-400">Directory</p>
              <Link to="/items" className="font-semibold text-slate-800">
                Active Items
              </Link>
            </div>
            <Link
              to="/items/new"
              aria-label="Add item"
              className="rounded-md bg-blue-50 p-2 text-blue-600"
            >
              <Plus size={16} />
            </Link>
          </div>
          <div className="max-h-48 overflow-y-auto xl:max-h-[calc(100dvh-12rem)]">
            {records
              .filter(
                (item) => item.kind === "items" && item.status !== "Inactive",
              )
              .map((item) => (
                <Link
                  key={item.id}
                  to={`/items/${item.id}`}
                  className={`block border-b border-slate-100 px-4 py-3 hover:bg-blue-50/50 ${item.id === record.id ? "bg-blue-50/70" : ""}`}
                >
                  <span className="block truncate text-sm font-medium">
                    {item.title}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {money(item.amount)} · {item.meta?.unit ?? "pcs"}
                  </span>
                </Link>
              ))}
          </div>
        </aside>
        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
            <div>
              <Link
                to="/items"
                className="mb-1 inline-flex items-center gap-1 text-xs text-slate-400"
              >
                <ArrowLeft size={13} /> Items
              </Link>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold">{record.title}</h1>
                <Badge>{record.status}</Badge>
              </div>
              <p className="text-xs text-slate-400">
                {money(record.amount)} · {record.meta?.unit ?? "pcs"}
              </p>
            </div>
            <div className="flex gap-2">
              <Link to={`/items/${record.id}/edit`}>
                <Button variant="secondary">
                  <Pencil size={14} /> Edit
                </Button>
              </Link>
              <div className="relative">
                <Button variant="secondary" onClick={() => setMenu((v) => !v)}>
                  <MoreHorizontal size={16} /> More
                </Button>
                {menu && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-30 mt-1 w-48 rounded-md border border-slate-200 bg-white p-1 shadow-lg"
                  >
                    <button
                      role="menuitem"
                      onClick={clone}
                      className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      Clone Item
                    </button>
                    <button
                      role="menuitem"
                      onClick={toggleActive}
                      className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      Mark as{" "}
                      {record.status === "Inactive" ? "Active" : "Inactive"}
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => setDeleteOpen(true)}
                      className="block w-full rounded px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>
          <DetailTabs
            tabs={[
              { key: "overview", label: "Overview" },
              { key: "transactions", label: "Transactions" },
              { key: "history", label: "History" },
            ]}
            active={tab}
            onChange={setTab}
          />
          <div className="space-y-4 p-4 sm:p-6">
            {tab === "overview" && (
              <div className="grid gap-4 xl:grid-cols-2">
                <DetailSection title="Item Details">
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <DetailValue
                      label="Item Type"
                      value={record.meta?.type ?? "Goods"}
                    />
                    <DetailValue
                      label="Usage Unit"
                      value={record.meta?.unit ?? "pcs"}
                    />
                    <DetailValue
                      label="Created Source"
                      value="User · local demo"
                    />
                    <DetailValue label="SKU" value={record.meta?.sku} />
                  </dl>
                </DetailSection>
                <DetailSection title="Purchase Information">
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <DetailValue
                      label="Cost Price"
                      value={money(record.amount)}
                    />
                    <DetailValue
                      label="Purchase Account"
                      value={record.meta?.account ?? "Office Supplies"}
                    />
                    <DetailValue
                      label="Description"
                      value={record.meta?.description}
                    />
                    <DetailValue
                      label="Preferred Vendor"
                      value={record.meta?.preferredVendor}
                    />
                    <DetailValue
                      label="Sales Rate"
                      value={
                        record.meta?.salesRate
                          ? money(Number(record.meta.salesRate))
                          : "—"
                      }
                    />
                    <DetailValue
                      label="Reporting Tags"
                      value={
                        reportingTags.length
                          ? reportingTags.join(", ")
                          : "No reporting tag has been associated with this item."
                      }
                    />
                  </dl>
                </DetailSection>
              </div>
            )}
            {tab === "transactions" && (
              <DetailSection title="Transactions">
                <div className="mb-4 flex flex-wrap gap-3">
                  <Field label="Filter By">
                    <Select
                      aria-label="Item transaction type"
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                    >
                      <option>Purchase Orders</option>
                      <option>Purchase Receives</option>
                      <option>Bills</option>
                      <option>All</option>
                    </Select>
                  </Field>
                  <Field label="Status">
                    <Select
                      aria-label="Item transaction status"
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value)}
                    >
                      <option value="All">All</option>
                      {statuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                {rows.length ? (
                  <div className="overflow-x-auto">
                    <RecordTable variant="compact" className="w-full min-w-[620px] text-left text-sm">
                      <thead className="table-head">
                        <tr>
                          {["Date", "Number", "Vendor", "Amount", "Status"].map(
                            (label) => (
                              <th key={label} className="table-cell">
                                {label}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((item) => (
                          <tr
                            key={item.id}
                            className="border-b border-slate-100"
                          >
                            <td className="table-cell">
                              {formatDate(item.date)}
                            </td>
                            <td className="table-cell">
                              <Link
                                className="text-blue-600"
                                to={`/${transactionPath(item.kind)}/${item.id}`}
                              >
                                {item.id}
                              </Link>
                            </td>
                            <td className="table-cell">{item.party}</td>
                            <td className="table-cell">{money(item.amount)}</td>
                            <td className="table-cell">
                              <Badge>{item.status}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </RecordTable>
                  </div>
                ) : (
                  <EmptyState
                    title={`No ${filter.toLowerCase()} recorded yet`}
                    description="Related local purchase records appear here when their item lines include this catalog item."
                  />
                )}
              </DetailSection>
            )}
            {tab === "history" && (
              <DetailSection title="History">
                <ActivityTimeline items={activities} />
              </DetailSection>
            )}
          </div>
        </main>
      </div>
      <DeleteConfirm
        open={deleteOpen}
        title="Delete item?"
        description={`Delete ${record.title} from the local catalog? Existing demo transactions will remain unchanged.`}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={remove}
      />
    </div>
  );
}

function AddressModal({
  type,
  address,
  onClose,
  onSave,
}: {
  type: "billing" | "shipping";
  address: Address;
  onClose: () => void;
  onSave: (type: "billing" | "shipping", address: Address) => void;
}) {
  const [draft, setDraft] = useState(address);
  const patch = (key: keyof Address, value: string) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  return (
    <Modal
      title={`${type === "billing" ? "Billing" : "Shipping"} Address`}
      onClose={onClose}
      wide
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(type, draft);
        }}
      >
        <p className="rounded bg-blue-50 px-3 py-2 text-xs text-blue-700">
          Address changes are stored in this browser's local demo profile only.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Attention">
            <Input
              value={draft.attention}
              onChange={(event) => patch("attention", event.target.value)}
            />
          </Field>
          <Field label="Country/Region">
            <Input
              value={draft.country}
              onChange={(event) => patch("country", event.target.value)}
            />
          </Field>
          <Field label="Address">
            <Textarea
              value={draft.street}
              onChange={(event) => patch("street", event.target.value)}
              placeholder="Street 1"
            />
          </Field>
          <Field label="City">
            <Input
              value={draft.city}
              onChange={(event) => patch("city", event.target.value)}
            />
          </Field>
          <Field label="State">
            <Input
              value={draft.state}
              onChange={(event) => patch("state", event.target.value)}
            />
          </Field>
          <Field label="ZIP Code">
            <Input
              value={draft.zip}
              onChange={(event) => patch("zip", event.target.value)}
            />
          </Field>
          <Field label="Phone">
            <Input
              value={draft.phone}
              onChange={(event) => patch("phone", event.target.value)}
            />
          </Field>
          <Field label="Fax Number">
            <Input
              value={draft.fax}
              onChange={(event) => patch("fax", event.target.value)}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save address locally</Button>
        </div>
      </form>
    </Modal>
  );
}

function ContactModal({
  contact,
  onClose,
  onSave,
}: {
  contact: ContactPerson;
  onClose: () => void;
  onSave: (contact: ContactPerson) => void;
}) {
  const [draft, setDraft] = useState(contact);
  const fields: [keyof ContactPerson, string][] = [
    ["salutation", "Salutation"],
    ["firstName", "First Name"],
    ["lastName", "Last Name"],
    ["email", "Email Address"],
    ["workPhone", "Work Phone"],
    ["mobile", "Mobile"],
    ["skype", "Skype Name/Number"],
    ["designation", "Designation"],
    ["department", "Department"],
  ];
  return (
    <Modal
      title={contact.id ? "Edit Contact Person" : "Add Contact Person"}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(draft);
        }}
        className="space-y-4"
      >
        <p className="rounded bg-blue-50 px-3 py-2 text-xs text-blue-700">
          Fictional local contact details only. No vendor contact will be
          messaged.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map(([key, label]) => (
            <Field key={key} label={label}>
              <Input
                type={key === "email" ? "email" : "text"}
                value={draft[key]}
                onChange={(event) =>
                  setDraft((value) => ({ ...value, [key]: event.target.value }))
                }
              />
            </Field>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save contact locally</Button>
        </div>
      </form>
    </Modal>
  );
}

function BankModal({
  bank,
  onClose,
  onSave,
}: {
  bank: BankAccount | null;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [show, setShow] = useState(false);
  const editing = Boolean(bank?.id);
  return (
    <Modal
      title={`${editing ? "Edit" : "Add"} Bank Account Details · preview`}
      onClose={onClose}
      wide
    >
      <form onSubmit={onSave} className="space-y-4">
        <input type="hidden" name="id" value={bank?.id ?? ""} readOnly />
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Use fictional values only. Account numbers are used only to make a
          masked preview label and are discarded immediately; they are never
          stored. No payment authority is granted.
        </p>
        {editing && (
          <p className="text-xs text-slate-500">
            Current saved account label: {bank?.masked}. Leave the account
            fields blank to keep this masked label.
          </p>
        )}
        <Field label="Account Holder Name">
          <Input
            name="holder"
            autoComplete="off"
            defaultValue={bank?.holder ?? ""}
            placeholder="Demo account holder"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bank Name">
            <Input
              name="bank"
              required
              autoComplete="off"
              defaultValue={bank?.bank ?? ""}
            />
          </Field>
          <Field label="Bank Identifier Code">
            <Input
              name="identifier"
              autoComplete="off"
              defaultValue={bank?.identifier ?? ""}
            />
          </Field>
          <Field label="Account Number">
            <div className="flex gap-2">
              <Input
                name="account"
                aria-label="Account Number"
                type={show ? "text" : "password"}
                required={!editing}
                minLength={editing ? undefined : 4}
                autoComplete="off"
                placeholder={
                  editing
                    ? "Leave blank to retain masked value"
                    : "Fictional account number"
                }
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShow((v) => !v)}
              >
                {show ? "Hide" : "Show"}
              </Button>
            </div>
          </Field>
          <Field label="Re-enter Account Number">
            <Input
              name="repeat"
              aria-label="Re-enter Account Number"
              type="password"
              required={!editing}
              minLength={editing ? undefined : 4}
              autoComplete="off"
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">
            {editing ? "Update" : "Save"} masked label only
          </Button>
        </div>
      </form>
    </Modal>
  );
}
