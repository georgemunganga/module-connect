import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Plus,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Panel,
  Select,
  Textarea,
} from "../components/ui";
import {
  items,
  money,
  today,
  type AppRecord,
  type Line,
  useApp,
  useStoredState,
} from "../lib/store";

type Stage = 0 | 1 | 2 | 3 | 4 | 5;
type BiddingType = "Open bidding" | "Invited vendors" | "Sealed bid" | "";
type WizardUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  designation: string;
  role: string;
  pointOfContact: boolean;
};

type RfqDraft = {
  id: string;
  title: string;
  description: string;
  requestNumber: string;
  reference: string;
  currency: string;
  lines: Line[];
  terms: string;
  documents: string[];
  biddingType: BiddingType;
  bidStartDate: string;
  bidEndDate: string;
  awardingDate: string;
  organizer: string;
  users: WizardUser[];
  stage: Stage;
};

type FieldErrors = Record<string, string>;

const steps = [
  { title: "Basic Details", description: "Name and describe the request" },
  { title: "Items", description: "What vendors should quote" },
  { title: "Terms", description: "Conditions and requirements" },
  { title: "Documents", description: "Reference files for vendors" },
  { title: "Bidding Preferences", description: "Dates and bid format" },
  { title: "Team", description: "Organizers and collaborators" },
] as const;

// These are intentionally fictional in-product choices. No directory or personal-data lookup is used.
const fictionalUsers: WizardUser[] = [
  {
    id: "user-jordan-lee",
    name: "Jordan Lee",
    email: "jordan.lee@example.test",
    phone: "+260 000 000 101",
    designation: "Procurement Lead",
    role: "Request for Quote Organizer",
    pointOfContact: true,
  },
  {
    id: "user-avery-chen",
    name: "Avery Chen",
    email: "avery.chen@example.test",
    phone: "+260 000 000 102",
    designation: "Buyer",
    role: "Request for Quote Member",
    pointOfContact: false,
  },
  {
    id: "user-morgan-patel",
    name: "Morgan Patel",
    email: "morgan.patel@example.test",
    phone: "+260 000 000 103",
    designation: "Finance Partner",
    role: "Request for Quote Reviewer",
    pointOfContact: false,
  },
  {
    id: "user-riley-kim",
    name: "Riley Kim",
    email: "riley.kim@example.test",
    phone: "+260 000 000 104",
    designation: "Operations Buyer",
    role: "Request for Quote Member",
    pointOfContact: false,
  },
];

function newDraft(id: string): RfqDraft {
  return {
    id,
    title: "",
    description: "",
    requestNumber: "",
    reference: "",
    currency: "ZMW",
    lines: [],
    terms: "",
    documents: [],
    biddingType: "",
    bidStartDate: "",
    bidEndDate: "",
    awardingDate: "",
    organizer: "",
    users: [],
    stage: 0,
  };
}

function parseJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function draftFromRecord(record: AppRecord): RfqDraft {
  const meta = record.meta ?? {};
  return {
    ...newDraft(record.id),
    title: record.title === "Draft RFQ" ? "" : record.title,
    description: meta.description ?? "",
    requestNumber: meta.requestNumber ?? "",
    reference: meta.reference ?? "",
    currency: meta.currency ?? "ZMW",
    lines: record.lines ?? [],
    terms: meta.terms ?? "",
    documents: parseJson<string[]>(meta.documents, []),
    biddingType: (meta.biddingType as BiddingType) ?? "",
    bidStartDate: meta.bidStartDate ?? "",
    bidEndDate: meta.bidEndDate ?? "",
    awardingDate: meta.awardingDate ?? "",
    organizer: meta.organizer ?? "",
    users: parseJson<WizardUser[]>(meta.users, []),
    stage: Math.max(0, Math.min(5, Number(meta.stage ?? 0))) as Stage,
  };
}

function stepErrors(step: Stage, draft: RfqDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (step === 0) {
    if (!draft.title.trim())
      errors.title = "Enter a title for this request for quote.";
    if (!draft.description.trim())
      errors.description =
        "Add a short description so vendors understand the request.";
  }
  if (step === 1 && draft.lines.length < 1)
    errors.lines = "Add at least one item before continuing.";
  if (step === 2 && !draft.terms.trim())
    errors.terms = "Terms and conditions are required.";
  if (step === 4) {
    if (!draft.biddingType)
      errors.biddingType = "Choose how vendors will submit bids.";
    if (!draft.bidStartDate) errors.bidStartDate = "Choose a bid start date.";
    if (!draft.bidEndDate) errors.bidEndDate = "Choose a bid end date.";
    if (
      draft.bidStartDate &&
      draft.bidEndDate &&
      draft.bidEndDate < draft.bidStartDate
    )
      errors.bidEndDate = "The end date must be on or after the start date.";
  }
  if (step === 5 && !draft.organizer)
    errors.organizer = "Select an organizer for this RFQ.";
  return errors;
}

function allErrors(
  draft: RfqDraft,
): { step: Stage; errors: FieldErrors } | null {
  for (let step = 0 as Stage; step <= 5; step = (step + 1) as Stage) {
    const errors = stepErrors(step, draft);
    if (Object.keys(errors).length) return { step, errors };
  }
  return null;
}

function totalFor(lines: Line[]) {
  return lines.reduce((total, line) => total + line.quantity * line.rate, 0);
}

export function RfqWizard() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { records, saveRecord, updateRecord, notify } = useApp();
  const record = id
    ? records.find((item) => item.id === id && item.kind === "rfqs")
    : undefined;
  const [newId] = useStoredState(
    "rfq.new-id",
    `RFQ-${String(Date.now()).slice(-8)}`,
  );
  const generatedId = useRef(newId);
  const source = records.find(
    (item) =>
      item.id === searchParams.get("source") && item.kind === "requests",
  );
  const catalog = records
    .filter((item) => item.kind === "items")
    .map((item) => ({
      name: item.title,
      rate: item.amount,
      unit: item.meta?.unit || "pcs",
    }));
  const draftId = record?.id ?? id ?? generatedId.current;
  const storageKey = `rfq.wizard.${draftId}`;
  const initialDraft = useMemo(
    () =>
      record
        ? draftFromRecord(record)
        : {
            ...newDraft(draftId),
            ...(source
              ? {
                  title: source.title,
                  description: `Sourcing for approved request ${source.id}: ${source.title}`,
                  reference: source.id,
                  requestNumber: source.id,
                  lines: source.lines || [],
                }
              : {}),
          },
    [record, draftId, source],
  );
  const [draft, setDraft] = useStoredState<RfqDraft>(storageKey, initialDraft);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [dirty, setDirty] = useState(false);
  const [modal, setModal] = useState<"item" | "user" | "cancel" | null>(null);
  const [itemName, setItemName] = useState(catalog[0]?.name ?? "");
  const [itemQuantity, setItemQuantity] = useState("1");
  const [userId, setUserId] = useState(fictionalUsers[1]?.id ?? "");
  const [userRole, setUserRole] = useState("Request for Quote Member");
  const [pointOfContact, setPointOfContact] = useState(false);

  const updateDraft = (updates: Partial<RfqDraft>) => {
    setDraft((previous) => ({ ...previous, ...updates }));
    setDirty(true);
  };

  const updateField = <K extends keyof RfqDraft>(
    key: K,
    value: RfqDraft[K],
  ) => {
    updateDraft({ [key]: value } as Partial<RfqDraft>);
    setErrors((previous) => {
      const next = { ...previous };
      delete next[String(key)];
      return next;
    });
  };

  const closeWizard = () => {
    const hasDraftContent = Boolean(
      draft.title ||
        draft.description ||
        draft.lines.length ||
        draft.terms ||
        draft.documents.length,
    );
    if (dirty || hasDraftContent) setModal("cancel");
    else navigate(returnTo);
  };

  const persistDraft = (navigateAway: boolean) => {
    const metadata: Record<string, string> = {
      wizard: "rfq",
      description: draft.description,
      requestNumber: draft.requestNumber,
      reference: draft.reference,
      currency: draft.currency,
      terms: draft.terms,
      documents: JSON.stringify(draft.documents),
      biddingType: draft.biddingType,
      bidStartDate: draft.bidStartDate,
      bidEndDate: draft.bidEndDate,
      awardingDate: draft.awardingDate,
      organizer: draft.organizer,
      users: JSON.stringify(draft.users),
      stage: String(draft.stage),
    };
    const recordToSave: AppRecord = {
      id: draft.id,
      kind: "rfqs",
      title: draft.title.trim() || "Draft RFQ",
      party: draft.organizer || "Procurement team",
      date: today(),
      amount: totalFor(draft.lines),
      status: "Draft",
      lines: draft.lines,
      meta: metadata,
    };
    if (records.some((item) => item.id === draft.id && item.kind === "rfqs"))
      updateRecord(draft.id, recordToSave);
    else saveRecord(recordToSave);
    setDirty(false);
    try {
      localStorage.removeItem(`procureui.${storageKey}`);
      if (!id) localStorage.removeItem("procureui.rfq.new-id");
    } catch {
      /* local storage can be unavailable */
    }
    notify("RFQ draft saved locally. No vendors were contacted.");
    if (navigateAway) navigate(returnTo);
  };

  const saveDraftAndExit = () => persistDraft(true);

  const next = () => {
    const nextErrors = stepErrors(draft.stage, draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      notify("Complete the highlighted fields before continuing.");
      return;
    }
    if (draft.stage === 5) {
      const firstError = allErrors(draft);
      if (firstError) {
        updateDraft({ stage: firstError.step });
        setErrors(firstError.errors);
        notify("Complete the required RFQ details before saving.");
        return;
      }
      persistDraft(true);
      return;
    }
    updateDraft({ stage: (draft.stage + 1) as Stage });
    setErrors({});
  };

  const back = () => {
    if (draft.stage === 0) return;
    updateDraft({ stage: (draft.stage - 1) as Stage });
    setErrors({});
  };

  const addItem = () => {
    const catalogItem = catalog.find((item) => item.name === itemName);
    const quantity = Number(itemQuantity);
    if (!catalogItem || !Number.isFinite(quantity) || quantity <= 0) {
      notify("Choose an item and enter a quantity greater than zero.");
      return;
    }
    const line: Line = {
      id: `line-${Date.now()}`,
      name: catalogItem.name,
      quantity,
      rate: catalogItem.rate,
      unit: catalogItem.unit,
    };
    updateDraft({ lines: [...draft.lines, line] });
    setModal(null);
    notify(`${catalogItem.name} added to this RFQ.`);
  };

  const addUser = () => {
    const chosen = fictionalUsers.find((user) => user.id === userId);
    if (!chosen) {
      notify("Choose a fictional user from the list.");
      return;
    }
    const user: WizardUser = { ...chosen, role: userRole, pointOfContact };
    updateDraft({
      users: [
        ...draft.users.filter((existing) => existing.id !== user.id),
        user,
      ],
    });
    setModal(null);
    notify(`${chosen.name} added to the RFQ team.`);
  };

  const removeLine = (lineId: string) =>
    updateDraft({ lines: draft.lines.filter((line) => line.id !== lineId) });
  const removeUser = (userIdToRemove: string) =>
    updateDraft({
      users: draft.users.filter((user) => user.id !== userIdToRemove),
    });

  const returnTo =
    searchParams.get("entry") === "procurement"
      ? "/procurement-requests"
      : searchParams.get("entry") === "approvals"
        ? "/approvals"
        : "/rfqs";
  const pageTitle = id ? "Edit Request for Quote" : "New Request for Quote";
  const stage = draft.stage;

  if (id && !record)
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-xl font-semibold">Request for Quote not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          That RFQ ID is not available in the local demo workspace.
        </p>
        <button
          onClick={() => navigate("/rfqs")}
          className="mt-5 text-sm text-blue-600"
        >
          Return to Request for Quotes →
        </button>
      </div>
    );
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="flex min-h-16 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-7">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">
            Procurement / RFQs
          </p>
          <h1 className="mt-1 text-lg font-semibold text-slate-900 sm:text-xl">
            {pageTitle}
          </h1>
        </div>
        <Button variant="ghost" onClick={closeWizard} aria-label="Cancel RFQ">
          <X size={17} /> <span className="hidden sm:inline">Cancel</span>
        </Button>
      </header>

      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-[1480px] flex-col lg:flex-row">
        <aside className="border-b border-slate-200 bg-white lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
          <div className="flex gap-1 overflow-x-auto px-4 py-3 lg:block lg:space-y-1 lg:px-0 lg:py-7">
            {steps.map((item, index) => {
              const active = stage === index;
              const complete = stage > index;
              return (
                <button
                  type="button"
                  key={item.title}
                  onClick={() =>
                    index <= stage && updateDraft({ stage: index as Stage })
                  }
                  className={`group flex min-w-[148px] items-center gap-3 rounded-md px-3 py-2 text-left transition-colors lg:min-w-0 lg:w-full lg:px-7 lg:py-3 ${active ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"} ${index > stage ? "cursor-default opacity-60" : ""}`}
                  disabled={index > stage}
                  aria-current={active ? "step" : undefined}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${active ? "border-blue-500 bg-blue-500 text-white" : complete ? "border-emerald-400 bg-emerald-500 text-white" : "border-slate-200 bg-white text-slate-500"}`}
                  >
                    {complete ? <Check size={14} /> : index + 1}
                  </span>
                  <span className="whitespace-nowrap text-[13px] font-medium lg:whitespace-normal">
                    {item.title}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 p-4 pb-28 sm:p-7 lg:p-10">
            {stage === 0 && (
              <div className="max-w-3xl">
                <StageIntro
                  title="Basic Details"
                  description="Enter the basic details of the request for quote. Required fields are saved locally as you work."
                />
                <Panel className="mt-6">
                  <div className="space-y-5 p-5 sm:p-7">
                    <Field label="Title *" error={errors.title}>
                      <Input
                        autoFocus
                        value={draft.title}
                        onChange={(event) =>
                          updateField("title", event.target.value)
                        }
                        placeholder="e.g. Office equipment sourcing"
                      />
                    </Field>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field
                        label="Request for Quote #"
                        hint="Optional internal identifier."
                      >
                        <Input
                          value={draft.requestNumber}
                          onChange={(event) =>
                            updateField("requestNumber", event.target.value)
                          }
                          placeholder="RFQ-2025-001"
                        />
                      </Field>
                      <Field
                        label="Reference #"
                        hint="Optional reference for your team."
                      >
                        <Input
                          value={draft.reference}
                          onChange={(event) =>
                            updateField("reference", event.target.value)
                          }
                          placeholder="Project or request reference"
                        />
                      </Field>
                    </div>
                    <Field label="Description *" error={errors.description}>
                      <Textarea
                        value={draft.description}
                        onChange={(event) =>
                          updateField("description", event.target.value)
                        }
                        placeholder="Describe what vendors should quote and any useful context."
                        rows={5}
                      />
                    </Field>
                    <Field
                      label="Currency *"
                      hint="This prototype uses the organization currency for local draft calculations."
                    >
                      <Select
                        value={draft.currency}
                        onChange={(event) =>
                          updateField("currency", event.target.value)
                        }
                      >
                        <option value="ZMW">ZMW — Zambian Kwacha</option>
                        <option value="USD" disabled>
                          USD — conversion not connected
                        </option>
                        <option value="EUR" disabled>
                          EUR — conversion not connected
                        </option>
                      </Select>
                    </Field>
                  </div>
                </Panel>
              </div>
            )}

            {stage === 1 && (
              <div className="max-w-5xl">
                <StageIntro
                  title="Items"
                  description="Add the items vendors should include in their quote. Choose an existing catalog item and set its expected quantity."
                />
                <Panel
                  className="mt-6"
                  title="RFQ line items"
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setItemName(catalog[0]?.name ?? "");
                        setItemQuantity("1");
                        setModal("item");
                      }}
                    >
                      <Plus size={15} /> Add item
                    </Button>
                  }
                >
                  {draft.lines.length === 0 ? (
                    <div className="m-5 rounded-md border border-dashed border-slate-300 px-5 py-14 text-center sm:m-7">
                      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                        <Plus size={18} />
                      </div>
                      <h3 className="font-medium text-slate-700">
                        No items added yet
                      </h3>
                      <p className="mt-1 text-sm text-slate-400">
                        At least one catalog item is required to continue.
                      </p>
                      <Button
                        className="mt-5"
                        onClick={() => {
                          setItemName(catalog[0]?.name ?? "");
                          setItemQuantity("1");
                          setModal("item");
                        }}
                      >
                        <Plus size={15} /> Add existing item
                      </Button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[650px] border-collapse text-left text-sm">
                        <thead>
                          <tr className="table-head">
                            <th className="px-5 py-3">Item</th>
                            <th className="px-5 py-3">Expected quantity</th>
                            <th className="px-5 py-3">Unit rate</th>
                            <th className="px-5 py-3">Estimated amount</th>
                            <th className="px-5 py-3">
                              <span className="sr-only">Actions</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {draft.lines.map((line) => (
                            <tr
                              key={line.id}
                              className="border-t border-slate-100"
                            >
                              <td className="px-5 py-4">
                                <p className="font-medium text-slate-800">
                                  {line.name}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-400">
                                  Catalog item · {line.unit}
                                </p>
                              </td>
                              <td className="px-5 py-4">
                                {line.quantity} {line.unit}
                              </td>
                              <td className="px-5 py-4">{money(line.rate)}</td>
                              <td className="px-5 py-4 font-medium">
                                {money(line.quantity * line.rate)}
                              </td>
                              <td className="px-5 py-4 text-right">
                                <Button
                                  variant="ghost"
                                  onClick={() => removeLine(line.id)}
                                  aria-label={`Remove ${line.name}`}
                                >
                                  <Trash2 size={15} />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {errors.lines && (
                    <p className="px-5 pb-5 text-sm text-red-600" role="alert">
                      {errors.lines}
                    </p>
                  )}
                </Panel>
                {draft.lines.length > 0 && (
                  <div className="mt-4 flex justify-end text-sm text-slate-500">
                    Estimated total{" "}
                    <strong className="ml-2 text-slate-900">
                      {money(totalFor(draft.lines))}
                    </strong>
                  </div>
                )}
              </div>
            )}

            {stage === 2 && (
              <div className="max-w-4xl">
                <StageIntro
                  title="Terms and Conditions"
                  description="Include the terms and conditions for the request for quote, covering obligations, payment terms, delivery details, legal provisions, and other relevant details."
                />
                <Panel className="mt-6">
                  <div className="p-5 sm:p-7">
                    <Field label="Terms and conditions *" error={errors.terms}>
                      <Textarea
                        autoFocus
                        className="min-h-[280px]"
                        value={draft.terms}
                        onChange={(event) =>
                          updateField("terms", event.target.value)
                        }
                        placeholder="Add delivery expectations, payment terms, warranty requirements, validity period, and other conditions."
                        rows={12}
                      />
                    </Field>
                  </div>
                </Panel>
              </div>
            )}

            {stage === 3 && (
              <div className="max-w-5xl">
                <StageIntro
                  title="Documents"
                  description="Add documents related to the request for quote. Selected filenames remain local to this browser prototype and are not uploaded."
                  action={
                    <label
                      htmlFor="rfq-document-input"
                      className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Plus size={15} /> Add document
                    </label>
                  }
                />
                <input
                  id="rfq-document-input"
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    const names = Array.from(event.target.files ?? []).map(
                      (file) => file.name,
                    );
                    if (names.length) {
                      updateDraft({
                        documents: [
                          ...draft.documents,
                          ...names.filter(
                            (name) => !draft.documents.includes(name),
                          ),
                        ],
                      });
                      notify(
                        `${names.length} document${names.length === 1 ? "" : "s"} selected locally.`,
                      );
                    }
                    event.currentTarget.value = "";
                  }}
                />
                <Panel className="mt-6">
                  {draft.documents.length === 0 ? (
                    <div className="m-5 flex min-h-64 flex-col items-center justify-center rounded-md border border-dashed border-slate-300 text-center sm:m-7">
                      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        <FileText size={19} />
                      </div>
                      <p className="font-medium text-slate-700">
                        No documents selected
                      </p>
                      <p className="mt-1 max-w-sm text-sm text-slate-400">
                        Choose local files to retain their filenames in the
                        draft. No file data leaves this browser.
                      </p>
                      <label
                        htmlFor="rfq-document-input"
                        className="mt-5 cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700"
                      >
                        + Add document
                      </label>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {draft.documents.map((name) => (
                        <div
                          key={name}
                          className="flex items-center justify-between gap-4 px-5 py-4 sm:px-7"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                              <FileText size={16} />
                            </span>
                            <span className="truncate text-sm text-slate-700">
                              {name}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              updateDraft({
                                documents: draft.documents.filter(
                                  (document) => document !== name,
                                ),
                              })
                            }
                            aria-label={`Remove ${name}`}
                          >
                            <Trash2 size={15} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              </div>
            )}

            {stage === 4 && (
              <div className="max-w-4xl">
                <StageIntro
                  title="Bidding Preferences"
                  description="Set how vendors will bid and the dates when bids can be submitted and evaluated."
                />
                <Panel className="mt-6">
                  <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-7">
                    <Field
                      className="sm:col-span-2"
                      label="Bidding type *"
                      hint="This only describes the local RFQ draft; it does not publish or contact vendors."
                      error={errors.biddingType}
                    >
                      <Select
                        value={draft.biddingType}
                        onChange={(event) =>
                          updateField(
                            "biddingType",
                            event.target.value as BiddingType,
                          )
                        }
                      >
                        <option value="">Select a bidding type</option>
                        <option>Open bidding</option>
                        <option>Invited vendors</option>
                        <option>Sealed bid</option>
                      </Select>
                    </Field>
                    <Field label="Bid start date *" error={errors.bidStartDate}>
                      <Input
                        type="date"
                        value={draft.bidStartDate}
                        onChange={(event) =>
                          updateField("bidStartDate", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Bid end date *" error={errors.bidEndDate}>
                      <Input
                        type="date"
                        value={draft.bidEndDate}
                        min={draft.bidStartDate || undefined}
                        onChange={(event) =>
                          updateField("bidEndDate", event.target.value)
                        }
                      />
                    </Field>
                    <Field
                      className="sm:col-span-2"
                      label="Awarding date"
                      hint="Optional planning date; award actions are not simulated here."
                    >
                      <Input
                        type="date"
                        value={draft.awardingDate}
                        min={draft.bidEndDate || undefined}
                        onChange={(event) =>
                          updateField("awardingDate", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                </Panel>
              </div>
            )}

            {stage === 5 && (
              <div className="max-w-5xl">
                <StageIntro
                  title="Team"
                  description="Add the fictional users from this prototype who will be part of the request for quote, and select an organizer."
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setUserId(
                          fictionalUsers[1]?.id ?? fictionalUsers[0]?.id ?? "",
                        );
                        setUserRole("Request for Quote Member");
                        setPointOfContact(false);
                        setModal("user");
                      }}
                    >
                      <UserPlus size={15} /> Add user
                    </Button>
                  }
                />
                <Panel className="mt-6" title="RFQ organizer">
                  <div className="p-5 sm:p-7">
                    <Field
                      label="Organizer *"
                      hint="Choose a fictional in-product user. No personal directory is accessed."
                      error={errors.organizer}
                    >
                      <Select
                        value={draft.organizer}
                        onChange={(event) =>
                          updateField("organizer", event.target.value)
                        }
                      >
                        <option value="">Select an organizer</option>
                        {fictionalUsers.map((user) => (
                          <option key={user.id} value={user.name}>
                            {user.name} · {user.designation}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                </Panel>
                <Panel
                  className="mt-5"
                  title="Team members"
                  action={
                    <span className="text-xs text-slate-400">
                      {draft.users.length} selected
                    </span>
                  }
                >
                  {draft.users.length === 0 ? (
                    <div className="p-7 text-sm text-slate-500">
                      No additional team members selected. Use{" "}
                      <button
                        type="button"
                        className="font-medium text-blue-600"
                        onClick={() => setModal("user")}
                      >
                        Add user
                      </button>{" "}
                      to include one.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                        <thead>
                          <tr className="table-head">
                            <th className="px-5 py-3">Name</th>
                            <th className="px-5 py-3">Email</th>
                            <th className="px-5 py-3">Designation</th>
                            <th className="px-5 py-3">Role</th>
                            <th className="px-5 py-3">Point of contact</th>
                            <th className="px-5 py-3">
                              <span className="sr-only">Actions</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {draft.users.map((user) => (
                            <tr
                              key={user.id}
                              className="border-t border-slate-100"
                            >
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-2">
                                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                                    {user.name
                                      .split(" ")
                                      .map((part) => part[0])
                                      .join("")}
                                  </span>
                                  <span className="font-medium text-slate-800">
                                    {user.name}
                                  </span>
                                  {user.name === draft.organizer && (
                                    <Badge>Organizer</Badge>
                                  )}
                                </div>
                              </td>
                              <td className="px-5 py-4 text-slate-600">
                                {user.email}
                              </td>
                              <td className="px-5 py-4 text-slate-600">
                                {user.designation}
                              </td>
                              <td className="px-5 py-4 text-slate-600">
                                {user.role}
                              </td>
                              <td className="px-5 py-4">
                                {user.pointOfContact ? (
                                  <Badge>Yes</Badge>
                                ) : (
                                  <span className="text-slate-400">No</span>
                                )}
                              </td>
                              <td className="px-5 py-4 text-right">
                                <Button
                                  variant="ghost"
                                  onClick={() => removeUser(user.id)}
                                  aria-label={`Remove ${user.name}`}
                                >
                                  <Trash2 size={15} />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>
              </div>
            )}
          </div>

          <footer className="sticky bottom-10 z-10 flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-7 lg:px-10">
            <Button
              variant="secondary"
              onClick={back}
              disabled={stage === 0}
              aria-label="Previous stage"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Back</span>
            </Button>
            <Button variant="secondary" onClick={saveDraftAndExit}>
              Save as Draft
            </Button>
            <div className="ml-auto" />
            <Button onClick={next}>
              {stage === 5 ? "Save" : "Save and Next"}{" "}
              {stage === 5 ? <Check size={16} /> : <ArrowRight size={16} />}
            </Button>
          </footer>
        </main>
      </div>

      {modal === "item" && (
        <Modal title="Add item" onClose={() => setModal(null)}>
          <div className="space-y-5">
            <Field label="Item *" hint="Choose an existing catalog item.">
              <Select
                value={itemName}
                onChange={(event) => setItemName(event.target.value)}
              >
                {catalog.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name} · {money(item.rate)} / {item.unit}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Expected quantity *">
              <Input
                type="number"
                min="1"
                step="1"
                value={itemQuantity}
                onChange={(event) => setItemQuantity(event.target.value)}
              />
            </Field>
            <div className="rounded-md bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
              The estimated unit rate is shown for planning only. Vendor
              responses and pricing are not sent or stored externally.
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" onClick={() => setModal(null)}>
                Cancel
              </Button>
              <Button onClick={addItem}>
                <Plus size={15} /> Add item
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {modal === "user" && (
        <Modal title="Add user" onClose={() => setModal(null)}>
          <div className="space-y-5">
            <Field
              label="Name *"
              hint="Only fictional users provided by this prototype are available."
            >
              <Select
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
              >
                {fictionalUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} · {user.designation}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Role *">
              <Select
                value={userRole}
                onChange={(event) => setUserRole(event.target.value)}
              >
                <option>Request for Quote Member</option>
                <option>Request for Quote Reviewer</option>
                <option>Request for Quote Organizer</option>
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={pointOfContact}
                onChange={(event) => setPointOfContact(event.target.checked)}
              />{" "}
              Mark user as point of contact
            </label>
            <div className="rounded-md bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
              No invitation or email is sent. Adding a user only updates this
              local draft.
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" onClick={() => setModal(null)}>
                Cancel
              </Button>
              <Button onClick={addUser}>
                <UserPlus size={15} /> Add user
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {modal === "cancel" && (
        <Modal title="Discard unsaved changes?" onClose={() => setModal(null)}>
          <p className="text-sm leading-6 text-slate-600">
            Your local RFQ draft has changes that have not been saved to the RFQ
            list. Leave without saving?
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>
              Keep editing
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                try {
                  localStorage.removeItem(`procureui.${storageKey}`);
                  if (!id) localStorage.removeItem("procureui.rfq.new-id");
                } catch {
                  /* optional storage */
                }
                navigate(returnTo);
              }}
            >
              Discard and leave
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function StageIntro({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">
          {title}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          {description}
        </p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
