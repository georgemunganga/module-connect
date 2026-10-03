import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/platform/app-context";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import {
  addComment,
  addInvoice,
  invoiceTotal,
  updatePayables,
  updateSupplierItem,
  usePayables,
  type PolicyDraft,
} from "./store";

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-surface p-5">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}
function Block({ text }: { text: string }) {
  return (
    <div role="status" className="rounded-lg border bg-surface p-4 text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function SupplierInvoiceSubmission() {
  const [number, setNumber] = useState("");
  const [po, setPo] = useState("PO-2026-1042");
  const [amount, setAmount] = useState("");
  const [attachment, setAttachment] = useState("");
  const [result, setResult] = useState("");
  return (
    <Box title="Submit an invoice reference">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!number.trim() || !po.trim() || Number(amount) <= 0 || !attachment.trim()) {
            setResult("All fields are required; amount must be positive.");
            return;
          }
          const response = addInvoice({
            number: number.trim(),
            supplierId: "sup-001",
            supplier: "Northwind Devices B.V.",
            entityId: "ent-nl",
            po: po.trim(),
            source: "Supplier portal",
            currency: "EUR",
            date: new Date().toISOString().slice(0, 10),
            due: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
            tax: 0,
            matchType: "3-way",
            lines: [
              {
                description: "Supplier line",
                quantity: 1,
                unitPrice: Number(amount),
                acceptedQuantity: 0,
                poUnitPrice: Number(amount),
              },
            ],
            owner: "AP processor",
            attachment,
            exception: undefined,
            apKey: undefined,
            financeAt: undefined,
            correctionOf: undefined,
          });
          setResult(
            response.ok
              ? `${response.id} saved locally. AP validation and matching are pending; no invoice was sent externally.`
              : response.message,
          );
          if (response.ok) {
            setNumber("");
            setAmount("");
            setAttachment("");
          }
        }}
      >
        <div>
          <Label htmlFor="portal-invoice">Invoice number</Label>
          <Input id="portal-invoice" value={number} onChange={(e) => setNumber(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="portal-po">PO reference</Label>
          <Input id="portal-po" value={po} onChange={(e) => setPo(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="portal-amount">Amount, EUR (illustrative)</Label>
          <Input
            id="portal-amount"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="portal-attachment">Document filename/reference</Label>
          <Input
            id="portal-attachment"
            value={attachment}
            onChange={(e) => setAttachment(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit">Save demo invoice</Button>
        </div>
      </form>
      {result && (
        <p role="status" className="mt-3 text-sm">
          {result}
        </p>
      )}
    </Box>
  );
}

export function SupplierPortal() {
  const { role, setRole } = useApp();
  const state = usePayables();
  const [tab, setTab] = useState("Home");
  const [message, setMessage] = useState("");
  const [comment, setComment] = useState("");
  // The demo identity is pinned to sup-001. Switching ERP entity or URL cannot change supplier scope.
  const supplierId = "sup-001";
  if (role !== "supplier_user")
    return (
      <main className="min-h-screen bg-background p-6">
        <div className="mx-auto max-w-xl">
          <h1 className="text-2xl font-semibold">Supplier portal</h1>
          <Block text="Supplier identity is required. The internal ERP role cannot open supplier records." />
          <Button className="mt-4" onClick={() => setRole("supplier_user")}>
            Switch to supplier demo role
          </Button>
        </div>
      </main>
    );
  const items = state.supplierItems.filter((i) => i.supplierId === supplierId);
  const invoices = state.invoices.filter((i) => i.supplierId === supplierId);
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Meridian supplier portal · Demo data
            </p>
            <h1 className="text-xl font-semibold">Northwind Devices B.V.</h1>
          </div>
          <Button variant="outline" asChild>
            <Link to="/procurement">ERP home</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-7">
        <nav aria-label="Supplier portal" className="mb-6 flex flex-wrap gap-2">
          {[
            "Home",
            "Opportunities",
            "Orders",
            "Invoices & credits",
            "Documents",
            "Messages",
            "Company profile",
          ].map((name) => (
            <Button
              key={name}
              type="button"
              variant={tab === name ? "default" : "outline"}
              onClick={() => setTab(name)}
            >
              {name}
            </Button>
          ))}
        </nav>
        {tab === "Home" && (
          <div className="grid gap-4 md:grid-cols-3">
            <Box title="Your next actions">
              <ul className="space-y-2 text-sm">
                {items
                  .filter(
                    (i) =>
                      i.status === "Open" ||
                      i.status === "Awaiting acknowledgment" ||
                      i.status === "Expiring",
                  )
                  .map((i) => (
                    <li key={i.id}>
                      {i.title} · {i.status} · due {i.due}
                    </li>
                  ))}
              </ul>
            </Box>
            <Box title="Orders">
              {items.filter((i) => i.kind === "Order").length} orders shared with your company
            </Box>
            <Box title="Invoice visibility">
              {invoices.length} invoices · payment shown only after Finance confirmation
            </Box>
          </div>
        )}
        {tab === "Opportunities" && (
          <div className="space-y-3">
            {items
              .filter((i) => i.kind === "Opportunity")
              .map((i) => (
                <Box key={i.id} title={`${i.reference} · ${i.title}`}>
                  <p className="text-sm">
                    {i.status} · due {i.due}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Quotation submission requires the sourcing backend; this demo records interest
                    only.
                  </p>
                  <Button
                    className="mt-3"
                    disabled={i.status !== "Open"}
                    onClick={() => {
                      updateSupplierItem(i.id, "Interested");
                      setMessage(`Interest in ${i.reference} saved locally; no bid was submitted.`);
                    }}
                  >
                    Record interest
                  </Button>
                </Box>
              ))}
          </div>
        )}
        {tab === "Orders" && (
          <div className="space-y-3">
            {items
              .filter((i) => i.kind === "Order")
              .map((i) => (
                <Box key={i.id} title={`${i.reference} · ${i.title}`}>
                  <p className="text-sm">
                    {i.status} · due {i.due}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      disabled={i.status !== "Awaiting acknowledgment"}
                      onClick={() => {
                        updateSupplierItem(i.id, "Acknowledged");
                        setMessage(`${i.reference} acknowledgment saved as demo state.`);
                      }}
                    >
                      Acknowledge
                    </Button>
                    <Button
                      variant="outline"
                      disabled={i.status !== "Awaiting acknowledgment"}
                      onClick={() => {
                        updateSupplierItem(i.id, "Change requested");
                        setMessage(
                          `Change request recorded for ${i.reference}; buyer review required.`,
                        );
                      }}
                    >
                      Request change
                    </Button>
                    <Button
                      variant="outline"
                      disabled={i.status !== "Acknowledged"}
                      onClick={() => {
                        updateSupplierItem(i.id, "Delivery notice sent");
                        setMessage(`Delivery notice for ${i.reference} saved locally.`);
                      }}
                    >
                      Send delivery notice
                    </Button>
                  </div>
                </Box>
              ))}
          </div>
        )}
        {tab === "Invoices & credits" && (
          <div className="space-y-3">
            <SupplierInvoiceSubmission />
            {invoices.map((i) => (
              <Box key={i.id} title={`${i.number} · ${i.po}`}>
                <p className="text-sm">
                  {i.status} ·{" "}
                  {new Intl.NumberFormat("en", { style: "currency", currency: i.currency }).format(
                    invoiceTotal(i),
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {i.financeAt
                    ? `Finance demo last confirmed ${new Date(i.financeAt).toLocaleString()}`
                    : "No Finance payment confirmation yet."}
                </p>
                {i.status === "Exception" && (
                  <p className="mt-2 text-sm">Correction requested: {i.exception?.reason}</p>
                )}
              </Box>
            ))}
            {(state.credits ?? [])
              .filter((credit) => credit.supplierId === supplierId)
              .map((credit) => (
                <Box key={credit.id} title={`Credit ${credit.id}`}>
                  <p className="text-sm">
                    Original invoice {credit.invoiceId} · {credit.status} ·{" "}
                    {new Intl.NumberFormat("en", {
                      style: "currency",
                      currency: credit.currency,
                    }).format(credit.amount)}
                  </p>
                </Box>
              ))}
          </div>
        )}
        {tab === "Documents" && (
          <div className="space-y-3">
            {items
              .filter((i) => i.kind === "Document")
              .map((i) => (
                <Box key={i.id} title={i.title}>
                  <p className="text-sm">
                    {i.status} · due {i.due}
                  </p>
                  <Button
                    className="mt-3"
                    onClick={() => {
                      updateSupplierItem(i.id, "Replacement under review");
                      setMessage(
                        "Replacement reference saved. Verification is pending; no actual file was uploaded.",
                      );
                    }}
                  >
                    Submit replacement reference
                  </Button>
                </Box>
              ))}
          </div>
        )}
        {tab === "Messages" && (
          <Box title="Messages shared with your company">
            <div className="space-y-2">
              {Object.entries(state.comments).flatMap(([record, entries]) =>
                entries
                  .filter(
                    (entry) =>
                      entry.audience === "Supplier" &&
                      (invoices.some((i) => i.id === record) ||
                        items.some((i) => i.reference === record)),
                  )
                  .map((entry, idx) => (
                    <p key={`${record}-${idx}`} className="rounded border p-2 text-sm">
                      {record}: {entry.reason}
                    </p>
                  )),
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!comment.trim()) return;
                addComment("PO-2026-1042", "Northwind Devices B.V.", comment.trim(), "Supplier");
                setComment("");
                setMessage("Message saved locally.");
              }}
              className="mt-4 space-y-2"
            >
              <Label htmlFor="supplier-message">Send message on PO-2026-1042</Label>
              <Textarea
                id="supplier-message"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <Button type="submit">Send demo message</Button>
            </form>
          </Box>
        )}
        {tab === "Company profile" && (
          <Box title="Company profile">
            <p className="text-sm">Northwind Devices B.V. · Supplier ID sup-001 · Active</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Payment instructions and internal risk notes are intentionally absent. Profile changes
              require a verified onboarding workflow.
            </p>
          </Box>
        )}
        {message && (
          <p role="status" className="mt-4 rounded-lg border bg-surface p-3 text-sm">
            {message}
          </p>
        )}
      </main>
    </div>
  );
}

export function ProcurementReports() {
  const { role, entityId } = useApp();
  const state = usePayables();
  const [metric, setMetric] = useState("Invoice first-pass match");
  const [period, setPeriod] = useState("2026-10");
  const [notice, setNotice] = useState("");
  if (
    !["buyer", "supplier_steward", "receiver", "ap_processor", "proc_admin", "auditor"].includes(
      role,
    )
  )
    return (
      <AppShell>
        <PageHeader eyebrow="Procurement" title="Reports restricted" />
        <Block text="Your demo role cannot read this report." />
      </AppShell>
    );
  const rows = state.invoices.filter((i) => i.entityId === entityId && i.date.startsWith(period));
  const matched = rows.filter(
    (i) =>
      ["Validated", "Handoff pending", "Handed to AP", "Posted", "Partially paid", "Paid"].includes(
        i.status,
      ) && !i.timeline.some((event) => event.action.toLowerCase().includes("exception")),
  ).length;
  const value =
    metric === "Invoice first-pass match"
      ? `${matched} / ${rows.length}`
      : metric === "Exception aging"
        ? `${rows.filter((i) => i.status === "Exception").length} open`
        : metric === "AP handoff"
          ? `${rows.filter((i) => ["Handoff pending", "Handed to AP", "AP rejected", "Posted", "Paid"].includes(i.status)).length} records`
          : "No connected data";
  const definitions: Record<string, string> = {
    "Invoice first-pass match":
      "Invoices without a recorded match exception divided by invoices received in the selected period. Demo approximation; later corrections do not rewrite original first-pass evidence.",
    "Exception aging":
      "Open invoice exceptions created in the selected period; aging begins at first mismatch timestamp.",
    "AP handoff":
      "Invoices queued, accepted, rejected or posted by AP in the selected period. Local demo events only.",
    "Supplier delivery": "Accepted versus due deliveries. Requires Receiving data connection.",
    "Budget vs actual":
      "Finance commitments and actuals are required. This view intentionally does not invent balances.",
  };
  return (
    <AppShell>
      <PageHeader
        eyebrow="Procurement"
        title="Reports & controls"
        description="Each measure shows its scope, definition and source. Demo data only."
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <select
          aria-label="Metric"
          className="rounded-md border bg-surface p-2"
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
        >
          {Object.keys(definitions).map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <select
          aria-label="Reporting period"
          className="rounded-md border bg-surface p-2"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="2026-10">October 2026</option>
          <option value="2026-09">September 2026</option>
        </select>
        <Button
          variant="outline"
          onClick={() =>
            setNotice(
              role === "auditor" || role === "proc_admin"
                ? "Export request logged in demo. No file or sensitive data was sent."
                : "Export permission denied for this role.",
            )
          }
        >
          Request export
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Box title={metric}>
          <p className="text-3xl font-semibold">{value}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Entity {entityId} · {period} · Source: invoice demo records · refreshed in this browser
          </p>
        </Box>
        <Box title="Definition">
          <p className="text-sm">{definitions[metric]}</p>
        </Box>
        <Box title="Control notes">
          <p className="text-sm">
            Currency totals are omitted because mixed currencies cannot be added without a defined
            FX basis. Finance status may be stale until confirmation arrives.
          </p>
        </Box>
      </div>
      {!rows.length && (
        <div className="mt-4">
          <Block text="No records in the selected period and entity. This is an empty result, not a zero performance score." />
        </div>
      )}
      {notice && (
        <p role="status" className="mt-4 text-sm">
          {notice}
        </p>
      )}
      <Box title="Audit trail and exceptions">
        <div className="space-y-2">
          {rows.map((i) => (
            <Link
              to="/procurement/invoices/$id"
              params={{ id: i.id }}
              key={i.id}
              className="block rounded-lg border p-3 text-sm hover:border-primary"
            >
              {i.id} · {i.supplier} · {i.status} · {i.timeline.length} recorded events
            </Link>
          ))}
        </div>
      </Box>
    </AppShell>
  );
}

const groups = [
  "Purchasing preferences",
  "Methods & categories",
  "Thresholds & approvals",
  "Budget & tolerances",
  "Numbering",
  "Calendars & SLAs",
  "Supplier rules",
  "Document templates",
  "Portal preferences",
  "Validation",
  "Notifications",
  "Integrations & status",
];
export function ProcurementPolicy() {
  const { role, entityId } = useApp();
  const state = usePayables();
  const [section, setSection] = useState(groups[2]);
  const [amount, setAmount] = useState("12000");
  const [category, setCategory] = useState("IT equipment");
  const [supplierRisk, setSupplierRisk] = useState("Standard");
  const [route, setRoute] = useState("Direct");
  const [draft, setDraft] = useState<PolicyDraft>(state.policy);
  const [notice, setNotice] = useState("");
  const canEdit = role === "proc_admin";
  if (!["proc_admin", "auditor", "buyer"].includes(role))
    return (
      <AppShell>
        <PageHeader eyebrow="Procurement" title="Configuration restricted" />
        <Block text="Only Procurement administrators and authorised readers can access configuration." />
      </AppShell>
    );
  const invalid =
    draft.threshold <= 0 ||
    draft.tolerance < 0 ||
    draft.tolerance > 100 ||
    !draft.reason.trim() ||
    !draft.effective;
  const threshold = state.policy.threshold;
  const over = Number(amount) >= threshold;
  return (
    <AppShell>
      <PageHeader
        eyebrow="Procurement / Configuration"
        title="Policies & setup"
        description="Versioned procurement rules with illustrative values. Shared currency, tax, identity and workflow settings remain in ERP Core."
      />
      <div className="grid gap-5 lg:grid-cols-[250px_1fr]">
        <nav aria-label="Configuration sections" className="flex flex-col gap-1">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              className={`rounded-md px-3 py-2 text-left text-sm ${section === g ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => setSection(g)}
            >
              {g}
            </button>
          ))}
        </nav>
        <div className="space-y-4">
          <Box title={section}>
            <p className="text-sm">
              Published policy v{state.policy.version} · effective {state.policy.effective} ·{" "}
              {state.policy.status}.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              This demo only edits the illustrative threshold/tolerance package. Other settings
              require approved backend contracts.
            </p>
            {section === "Thresholds & approvals" || section === "Budget & tolerances" ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="threshold">
                    Competitive sourcing threshold (EUR, illustrative)
                  </Label>
                  <Input
                    id="threshold"
                    type="number"
                    value={draft.threshold}
                    onChange={(e) =>
                      setDraft({ ...draft, threshold: Number(e.target.value), status: "Draft" })
                    }
                    readOnly={!canEdit}
                  />
                </div>
                <div>
                  <Label htmlFor="tolerance">Price tolerance % (illustrative)</Label>
                  <Input
                    id="tolerance"
                    type="number"
                    value={draft.tolerance}
                    onChange={(e) =>
                      setDraft({ ...draft, tolerance: Number(e.target.value), status: "Draft" })
                    }
                    readOnly={!canEdit}
                  />
                </div>
                <div>
                  <Label htmlFor="effective">Effective from</Label>
                  <Input
                    id="effective"
                    type="date"
                    value={draft.effective}
                    onChange={(e) =>
                      setDraft({ ...draft, effective: e.target.value, status: "Draft" })
                    }
                    readOnly={!canEdit}
                  />
                </div>
                <div>
                  <Label htmlFor="reason">Change reason</Label>
                  <Input
                    id="reason"
                    value={draft.reason}
                    onChange={(e) =>
                      setDraft({ ...draft, reason: e.target.value, status: "Draft" })
                    }
                    readOnly={!canEdit}
                  />
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Linked to shared ERP configuration or pending a dedicated policy contract.
              </p>
            )}
            {canEdit && (
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    setNotice(
                      invalid
                        ? "Validation failed: positive threshold, 0–100% tolerance, date and reason required."
                        : "Draft validation passed. Check scope and independent sign-off before publication.",
                    )
                  }
                >
                  Validate draft
                </Button>
                <Button
                  onClick={() => {
                    if (invalid) {
                      setNotice("Draft has invalid fields and cannot enter review.");
                      return;
                    }
                    updatePayables((s) => ({
                      ...s,
                      candidate: {
                        ...draft,
                        version: s.policy.version + 1,
                        status: "Pending review",
                      },
                    }));
                    setNotice(
                      "Candidate submitted for independent review. Publication is blocked in this demo until governance approvals exist.",
                    );
                  }}
                >
                  Submit for review
                </Button>
              </div>
            )}
          </Box>
          <Box title="Policy simulator">
            <p className="mb-3 text-sm text-muted-foreground">
              Synthetic inputs only. Simulation does not update any transaction.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="sim-amount">Amount (EUR)</Label>
                <Input
                  id="sim-amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="sim-category">Category</Label>
                <Input
                  id="sim-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="sim-risk">Supplier risk</Label>
                <select
                  id="sim-risk"
                  className="block w-full rounded-md border bg-surface p-2"
                  value={supplierRisk}
                  onChange={(e) => setSupplierRisk(e.target.value)}
                >
                  <option>Standard</option>
                  <option>High</option>
                  <option>Suspended</option>
                </select>
              </div>
              <div>
                <Label htmlFor="sim-route">Requested route</Label>
                <select
                  id="sim-route"
                  className="block w-full rounded-md border bg-surface p-2"
                  value={route}
                  onChange={(e) => setRoute(e.target.value)}
                >
                  <option>Direct</option>
                  <option>RFQ</option>
                  <option>Contract</option>
                  <option>Emergency</option>
                </select>
              </div>
            </div>
            <div role="status" className="mt-4 rounded-lg border bg-muted p-3 text-sm">
              <strong>
                Result for {entityId} · policy v{state.policy.version}:
              </strong>{" "}
              {supplierRisk === "Suspended"
                ? "Blocked: supplier suspension requires review."
                : !Number.isFinite(Number(amount)) || Number(amount) <= 0
                  ? "Enter a positive amount."
                  : over && route === "Direct"
                    ? "Direct purchase blocked: competitive sourcing and manager + Procurement approval expected."
                    : supplierRisk === "High"
                      ? "Enhanced supplier review and Procurement approval expected."
                      : "Manager approval expected; budget decision remains Finance-owned."}
            </div>
          </Box>
          <Box title="Version history & publication controls">
            <p className="text-sm">
              Version {state.policy.version}: {state.policy.status}, {state.policy.reason}.
              Effective {state.policy.effective}.
            </p>
            {state.candidate && (
              <p className="mt-2 text-sm">
                Candidate v{state.candidate.version}: {state.candidate.status}; effective{" "}
                {state.candidate.effective}. It does not affect transaction decisions.
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Conflicting rules, missing authority, effective-date collisions and Finance sign-off
              must be checked by a backend resolver before publication. Historical decisions retain
              their original policy version.
            </p>
          </Box>
          {notice && (
            <p role="status" className="rounded border p-3 text-sm">
              {notice}
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
