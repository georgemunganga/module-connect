import { useEffect, useState, type FormEvent } from "react";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Panel, Select, Switch } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import {
  createPolicy, getPolicy, listPolicies, updatePolicy, validatePolicy,
  type PolicyPage, type PolicyRecord, type PolicyIssue,
} from "../../../src/platform/procurement-policy-api";

type RuleRow = {
  code: string; priority: number; minimum: string; maximum: string;
  categoryCodes: string; purchaseType: string; budget: "Required" | "ExceptionReview";
  method: string; quotes: string; lineManager: boolean; budgetOwner: boolean;
  procurementManager: boolean;
};
const emptyRule = (): RuleRow => ({ code: "DEFAULT", priority: 0, minimum: "", maximum: "",
  categoryCodes: "", purchaseType: "", budget: "Required", method: "", quotes: "",
  lineManager: true, budgetOwner: false, procurementManager: false });
const codes = (value: string) => value.split(",").map((part) => part.trim().toUpperCase()).filter(Boolean);
const day = (value: string | null) => value?.slice(0, 10) ?? "";
const utc = (value: string) => `${value}T00:00:00.000Z`;
const errorText = (error: unknown) => error instanceof Error ? error.message : "Buying rules are unavailable.";
const onlyKeys = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).every((name) => allowed.includes(name));

function toRuleJson(key: string, currency: string, rows: RuleRow[]): string {
  return JSON.stringify({ schemaVersion: 1,
    transactionType: key === "PURCHASE_ORDER" ? "PurchaseOrder" : "PurchaseRequest",
    currencyCode: currency, amountBasis: key === "PURCHASE_ORDER" ? "ApprovedGross" : "EstimatedGross",
    rules: rows.map((row) => ({ code: row.code.trim().toUpperCase(), priority: Number(row.priority),
      when: { minimumAmountInclusive: row.minimum ? Number(row.minimum) : null,
        maximumAmountExclusive: row.maximum ? Number(row.maximum) : null,
        categoryCodes: codes(row.categoryCodes), purchaseTypes: row.purchaseType ? [row.purchaseType] : [],
        branchIds: [] },
      result: { budgetReservation: row.budget,
        sourcingMethodCode: row.method.trim().toUpperCase() || null,
        minimumQuoteCount: row.quotes === "" ? null : Number(row.quotes),
        approvalStages: [
          ...(row.lineManager ? [{ code: "NEED", assignee: "LineManager", mode: "One" }] : []),
          ...(row.budgetOwner ? [{ code: "FUNDING", assignee: "BudgetOwner", mode: "One" }] : []),
          ...(row.procurementManager ? [{ code: "BUYING", assignee: "ProcurementManager", mode: "One" }] : []),
        ] },
    })) }, null, 2);
}

function fromRuleJson(json: string, key: string, currency: string): RuleRow[] | null {
  try {
    const document = JSON.parse(json) as Record<string, unknown>;
    if (document.schemaVersion !== 1 || !Array.isArray(document.rules)
      || !onlyKeys(document, ["schemaVersion", "transactionType", "currencyCode", "amountBasis", "rules"])
      || document.currencyCode !== currency
      || document.transactionType !== (key === "PURCHASE_ORDER" ? "PurchaseOrder" : "PurchaseRequest")
      || document.amountBasis !== (key === "PURCHASE_ORDER" ? "ApprovedGross" : "EstimatedGross")) return null;
    return document.rules.map((value: unknown) => {
      if (!value || typeof value !== "object") throw new Error("Unknown rule");
      const rule = value as Record<string, unknown>;
      const when = rule.when as Record<string, unknown>;
      const result = rule.result as Record<string, unknown>;
      if (!when || !result || !Array.isArray(result.approvalStages)
        || !onlyKeys(rule, ["code", "priority", "when", "result"])
        || !onlyKeys(when, ["minimumAmountInclusive", "maximumAmountExclusive", "categoryCodes", "purchaseTypes", "branchIds"])
        || !onlyKeys(result, ["budgetReservation", "sourcingMethodCode", "minimumQuoteCount", "approvalStages"])
        || !Array.isArray(when.categoryCodes) || !Array.isArray(when.purchaseTypes)
        || !Array.isArray(when.branchIds) || when.branchIds.length
        || when.purchaseTypes.length > 1
        || (when.purchaseTypes.length === 1 && !["GOODS", "SERVICES", "ASSETS", "SUBSCRIPTIONS"].includes(String(when.purchaseTypes[0])))
        || !["Required", "ExceptionReview"].includes(String(result.budgetReservation)))
        throw new Error("This draft uses more detailed conditions.");
      const stages = result.approvalStages as Array<Record<string, unknown>>;
      if (stages.some((stage) => !onlyKeys(stage, ["code", "assignee", "mode"])
        || stage.mode !== "One" || ![
          ["NEED", "LineManager"], ["FUNDING", "BudgetOwner"], ["BUYING", "ProcurementManager"],
        ].some(([code, assignee]) => stage.code === code && stage.assignee === assignee)))
        throw new Error("This draft uses a different approval assignment.");
      return { code: String(rule.code ?? ""), priority: Number(rule.priority ?? 0),
        minimum: when.minimumAmountInclusive == null ? "" : String(when.minimumAmountInclusive),
        maximum: when.maximumAmountExclusive == null ? "" : String(when.maximumAmountExclusive),
        categoryCodes: when.categoryCodes.join(", "), purchaseType: String(when.purchaseTypes[0] ?? ""),
        budget: result.budgetReservation === "ExceptionReview" ? "ExceptionReview" : "Required",
        method: String(result.sourcingMethodCode ?? ""),
        quotes: result.minimumQuoteCount == null ? "" : String(result.minimumQuoteCount),
        lineManager: stages.some((stage) => stage.assignee === "LineManager"),
        budgetOwner: stages.some((stage) => stage.assignee === "BudgetOwner"),
        procurementManager: stages.some((stage) => stage.assignee === "ProcurementManager"),
      } satisfies RuleRow;
    });
  } catch { return null; }
}

export function LivePolicies() {
  const readiness = useLiveReadiness();
  if (!readiness) throw new Error("Buying rules require an ERP company.");
  const companyId = readiness.legalEntityId;
  const currency = readiness.defaultCurrencyCode;
  const [page, setPage] = useState<PolicyPage | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PolicyRecord | "new" | null>(null);
  const [key, setKey] = useState("PURCHASE_REQUEST");
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState("");
  const [rows, setRows] = useState<RuleRow[]>([emptyRule()]);
  const [issues, setIssues] = useState<PolicyIssue[]>([]);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setListError("");
    listPolicies(companyId, controller.signal).then(setPage)
      .catch((cause: unknown) => { if (!controller.signal.aborted) setListError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [companyId, refresh]);

  const newDraft = () => { setEditing("new"); setKey("PURCHASE_REQUEST");
    setStart(new Date().toISOString().slice(0, 10)); setEnd(""); setRows([emptyRule()]);
    setIssues([]); setError(""); };
  async function edit(id: string) {
    setError(""); setIssues([]);
    try {
      const record = await getPolicy(companyId, id);
      const parsed = fromRuleJson(record.rulesJson, record.policyKey, currency);
      if (!parsed?.length) {
        setError("This draft uses settings that need a fuller editor. Ask Procurement to review the existing draft before changing it.");
        return;
      }
      setEditing(record); setKey(record.policyKey); setStart(day(record.effectiveFrom));
      setEnd(day(record.effectiveTo)); setRows(parsed);
    } catch (cause) { setError(errorText(cause)); }
  }
  const changeRow = (index: number, patch: Partial<RuleRow>) =>
    setRows((current) => current.map((row, i) => i === index ? { ...row, ...patch } : row));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true); setError(""); setIssues([]);
    try {
      const rulesJson = toRuleJson(key, currency, rows);
      const check = await validatePolicy(companyId, rulesJson);
      setIssues(check.issues);
      if (!check.isValid) return;
      const draft = { policyKey: key, effectiveFrom: utc(start),
        effectiveTo: end ? utc(end) : null, rulesJson };
      if (editing === "new") await createPolicy(companyId, draft);
      else await updatePolicy(companyId, editing.id, editing.version, draft);
      setEditing(null); setRefresh((value) => value + 1);
    } catch (cause) { setError(errorText(cause)); }
    finally { setSaving(false); }
  }

  return <div className="mx-auto max-w-5xl space-y-5">
    <PageHeader title="Buying rules" subtitle="Prepare company rules for budgets, quotes and approvals." />
    <Panel><div className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Rules for {currency}</h2>
          <p className="text-sm text-muted-foreground">Saved rules are drafts. A draft does not approve or release a purchase.</p></div>
        <Button onClick={newDraft}>Add buying rule draft</Button>
      </div>
      {listError && <p role="alert" className="mb-4 text-sm text-red-700">{listError}</p>}
      {loading ? <p role="status">Loading buying rules…</p> : page?.items.length
        ? <div className="overflow-x-auto"><RecordTable><thead><tr><th>Used for</th><th>Version</th><th>From</th><th>Until</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{page.items.map((record) => <tr key={record.id}><td>{record.policyKey === "PURCHASE_ORDER" ? "Purchase orders" : "Purchase requests"}</td><td>{record.policyVersionNumber}</td><td>{day(record.effectiveFrom)}</td><td>{day(record.effectiveTo) || "No end date"}</td><td><Badge>{record.state}</Badge></td><td>{record.state === "Draft" ? <Button variant="secondary" onClick={() => void edit(record.id)}>Edit draft</Button> : "—"}</td></tr>)}</tbody></RecordTable></div>
        : <EmptyState title="No buying rules yet" description="Add a draft for purchase requests or purchase orders." action={<Button onClick={newDraft}>Add buying rule draft</Button>} />}
      {page && page.total > page.items.length && <p className="mt-3 text-xs text-muted-foreground">Showing the first {page.items.length} of {page.total} versions.</p>}
    </div></Panel>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {editing && <form onSubmit={save}>
      <Panel title={editing === "new" ? "New buying rule draft" : `Edit ${key.replaceAll("_", " ").toLowerCase()} draft`}>
        <div className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Use these rules for"><Select value={key} disabled={editing !== "new"} onChange={(event) => setKey(event.target.value)}><option value="PURCHASE_REQUEST">Purchase requests</option><option value="PURCHASE_ORDER">Purchase orders</option></Select></Field>
            <Field label="Start date"><Input type="date" required value={start} onChange={(event) => setStart(event.target.value)} /></Field>
            <Field label="End date (optional)"><Input type="date" min={start} value={end} onChange={(event) => setEnd(event.target.value)} /></Field>
          </div>
          <p className="text-xs text-muted-foreground">Amounts use {currency}. An empty amount or category means there is no limit for that condition. Higher priority wins where rules overlap.</p>
          {rows.map((row, index) => <section key={index} className="space-y-4 rounded-xl border border-border bg-surface-muted p-4">
            <div className="flex items-center justify-between"><h3 className="font-semibold">Rule {index + 1}</h3>{rows.length > 1 && <Button variant="secondary" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}>Remove rule</Button>}</div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Rule code"><Input required maxLength={100} value={row.code} onChange={(event) => changeRow(index, { code: event.target.value.toUpperCase() })} /></Field>
              <Field label="Priority"><Input type="number" min={0} max={100000} required value={row.priority} onChange={(event) => changeRow(index, { priority: Number(event.target.value) })} /></Field>
              <Field label="Purchase type"><Select value={row.purchaseType} onChange={(event) => changeRow(index, { purchaseType: event.target.value })}><option value="">Any type</option><option value="GOODS">Goods</option><option value="SERVICES">Services</option><option value="ASSETS">Assets</option><option value="SUBSCRIPTIONS">Subscriptions</option></Select></Field>
              <Field label={`Amount from (${currency})`}><Input type="number" min={0} step="0.0001" value={row.minimum} onChange={(event) => changeRow(index, { minimum: event.target.value })} /></Field>
              <Field label={`Amount below (${currency})`}><Input type="number" min={0} step="0.0001" value={row.maximum} onChange={(event) => changeRow(index, { maximum: event.target.value })} /></Field>
              <Field label="Category codes (optional)"><Input value={row.categoryCodes} placeholder="IT, OFFICE" onChange={(event) => changeRow(index, { categoryCodes: event.target.value.toUpperCase() })} /></Field>
              <Field label="Budget handling"><Select value={row.budget} onChange={(event) => changeRow(index, { budget: event.target.value as RuleRow["budget"] })}><option value="Required">Require budget confirmation</option><option value="ExceptionReview">Send budget exception for review</option></Select></Field>
              <Field label="Buying method code (optional)"><Input value={row.method} onChange={(event) => changeRow(index, { method: event.target.value.toUpperCase() })} /></Field>
              <Field label="Quotes needed (optional)"><Input type="number" min={0} max={20} value={row.quotes} onChange={(event) => changeRow(index, { quotes: event.target.value })} /></Field>
            </div>
            <fieldset><legend className="mb-2 text-sm font-medium">Approvers needed</legend><div className="flex flex-wrap gap-4 text-sm">
              {([['lineManager', 'Line manager'], ['budgetOwner', 'Budget owner'], ['procurementManager', 'Procurement manager']] as const).map(([field, label]) => <label key={field} className="flex items-center gap-2"><Switch checked={row[field]} onChange={(event) => changeRow(index, { [field]: event.target.checked })} />{label}</label>)}
            </div></fieldset>
          </section>)}
          <Button variant="secondary" onClick={() => setRows((current) => [...current, { ...emptyRule(), code: `RULE_${current.length + 1}`, priority: current.length }])}>Add another rule</Button>
          {!!issues.length && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">Check these rule details:</p><ul className="mt-2 list-disc pl-5">{issues.map((issue, index) => <li key={index}>{issue.path}: {issue.message}</li>)}</ul></div>}
          <div className="flex gap-3"><Button type="submit" disabled={saving}>{saving ? "Checking…" : "Check and save draft"}</Button><Button variant="secondary" onClick={() => { setEditing(null); setIssues([]); }}>Cancel</Button></div>
        </div>
      </Panel>
    </form>}
  </div>;
}
