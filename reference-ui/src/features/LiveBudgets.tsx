import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Panel, Select, Textarea } from "../components/ui";
import { FinanceReleasePanel } from "./FinanceReleasePanel";
import { RecordTable } from "../components/data/RecordTable";
import { useErpShell } from "../lib/erpShell";
import { formatInvoiceDecimal } from "../../../src/platform/procurement-invoice-exact";
import { budgetAmountCoversSource, budgetCheckedAmount, defaultBudgetCheckedAmount } from "../../../src/platform/procurement-budget-exact";
import { RequestApiError } from "../../../src/platform/procurement-requests-api";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import {
  budgetCheckMatches, listBudgetChecks, listBudgetQueue, recordBudgetCheck,
  type BudgetCheck, type BudgetDecision, type BudgetQueuePage, type BudgetQueueRecord,
} from "../../../src/platform/procurement-budget-api";

const errorText = (error: unknown) => error instanceof Error ? error.message : "Finance review failed. Try again.";
const money = (amount: string, currency: string) => `${currency} ${formatInvoiceDecimal(amount)}`;

export function LiveBudgets() {
  const readiness = useLiveReadiness(); const { selection } = useErpShell();
  if (!readiness) throw new Error("Finance review requires an ERP company.");
  const key = JSON.stringify([readiness.tenantId, readiness.legalEntityId, selection.entityId ?? "", selection.branch ?? "",
    readiness.workerId, readiness.permissions, readiness.capabilities]);
  return <LiveBudgetsContent key={key} />;
}
function LiveBudgetsContent() {
  const readiness = useLiveReadiness();
  if (!readiness) throw new Error("Finance review requires an ERP company.");
  const companyId = readiness.legalEntityId;
  const canReview = readiness.permissions.includes("procurement-budget-check");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<BudgetQueuePage | null>(null);
  const [selected, setSelected] = useState<BudgetQueueRecord | null>(null);
  const [history, setHistory] = useState<BudgetCheck[]>([]);
  const [loading, setLoading] = useState(canReview);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [financeCheckRef, setFinanceCheckRef] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");
  const [reservationRef, setReservationRef] = useState("");
  const [reason, setReason] = useState("");
  const [outcome, setOutcome] = useState<BudgetDecision["status"] | "">("");
  const [checkedAmount, setCheckedAmount] = useState("");
  const [pending, setPending] = useState<{ request: BudgetQueueRecord; decision: BudgetDecision } | null>(null);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  useEffect(() => {
    if (!canReview) return;
    const controller = new AbortController();
    setLoading(true); setError(""); setPage(null);
    listBudgetQueue(companyId, offset, controller.signal).then(value => { if (!controller.signal.aborted) setPage(value); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [canReview, companyId, offset]);

  useEffect(() => {
    if (!selected || !canReview) return;
    const controller = new AbortController();
    setHistoryLoading(true); setError(""); setHistoryError(""); setHistory([]);
    listBudgetChecks(companyId, selected.id, controller.signal).then(value => { if (!controller.signal.aborted) setHistory(value); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) { setHistoryError(errorText(cause)); setError(errorText(cause)); } })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [canReview, companyId, selected]);

  async function confirmed(request: BudgetQueueRecord) {
    if (!live.current) return;
    setPending(null); setNotice(`Finance check saved for ${request.number}. This does not approve the purchase.`);
    setFinanceCheckRef(""); setEvidenceRef(""); setReservationRef(""); setReason(""); setOutcome("");
    try {
      const checks = await listBudgetChecks(companyId, request.id);
      const queue = await listBudgetQueue(companyId, offset);
      if (live.current) { setHistory(checks); setPage(queue); }
    } catch (cause) {
      if (live.current) {
        if (cause instanceof RequestApiError && (cause.status === 401 || cause.status === 403 || cause.status === 404)) {
          setSelected(null); setHistory([]); setPage(null); setNotice("");
        }
        setError(`The check was confirmed, but the latest view could not be loaded. ${errorText(cause)}`);
      }
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!selected || saving || pending) return;
    setError(""); setNotice("");
    if (!financeCheckRef.trim() || !evidenceRef.trim()) { setError("Add the Finance reference and evidence reference."); return; }
    if (!outcome) { setError("Choose the funding outcome checked by Finance."); return; }
    if (outcome === "Available" && !reservationRef.trim()) { setError("Add the confirmed Finance reservation reference."); return; }
    if (outcome !== "Available" && !reason.trim()) { setError("Explain why the full amount is not available."); return; }
    let amount: string;
    try { amount = budgetCheckedAmount(checkedAmount);
      if (!budgetAmountCoversSource(amount, selected.estimatedAmount)) { setError("The amount checked must cover the full exact request amount."); return; }
    } catch (cause) { setError(errorText(cause)); return; }
    const decision: BudgetDecision = { requestVersion: selected.version, financeCheckRef: financeCheckRef.trim(), status: outcome,
      checkedAmount: amount, currencyCode: selected.currencyCode, evidenceRef: evidenceRef.trim(), decisionReason: reason.trim() || null,
      reservationRef: outcome === "Available" ? reservationRef.trim() : null, reservationStatus: outcome === "Available" ? "Confirmed" : null };
    setPending({ request: selected, decision }); setSaving(true);
    try { await recordBudgetCheck(companyId, selected.id, decision, selected.estimatedAmount, selected.businessVersion); await confirmed(selected); }
    catch (cause) {
      if (!live.current) return;
      if (cause instanceof RequestApiError && (cause.status === 400 || cause.status === 422)) setPending(null);
      if (cause instanceof RequestApiError && (cause.status === 401 || cause.status === 403 || cause.status === 404)) { setSelected(null); setHistory([]); setPage(null); }
      setError(errorText(cause));
    } finally { if (live.current) setSaving(false); }
  }
  async function recover() {
    if (!pending || saving) return; setSaving(true); setError("");
    try {
      const checks = await listBudgetChecks(companyId, pending.request.id);
      if (!live.current) return;
      setHistory(checks);
      setError(checks.some(check => budgetCheckMatches(check, pending.decision, pending.request.businessVersion))
        ? "A matching funding check is recorded. This does not identify who recorded your interrupted save. Review it in Finance before another save."
        : "This save remains unconfirmed in history. Keep its original Finance reference and review it in Finance before another save.");
    } catch (cause) {
      if (live.current) {
        if (cause instanceof RequestApiError && (cause.status === 401 || cause.status === 403 || cause.status === 404)) { setSelected(null); setHistory([]); setPage(null); }
        setError(errorText(cause));
      }
    } finally { if (live.current) setSaving(false); }
  }

  return <div className="p-5 sm:p-8">
    <PageHeader title="Budget checks" subtitle="Finance records whether funding has been checked for a submitted purchase request." />
    {!canReview ? <Panel><div className="p-5" role="alert">Finance budget review access is needed to see these requests.</div></Panel> : <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Use the Finance system to verify funds first. A check here records its reference and evidence; it does not create a budget or approve a purchase.</p>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
      <Panel title="Requests waiting for Finance"><div className="p-5">
        {loading ? <p role="status">Loading requests…</p> : error && !page ? <p className="text-sm text-muted-foreground">The request list is unavailable. Resolve the message above before reviewing funding.</p> : page?.records.length ? <div className="overflow-x-auto"><RecordTable>
          <thead><tr><th>Request</th><th>Purpose</th><th>Amount</th><th>Sent</th><th>Action</th></tr></thead>
          <tbody>{page.records.map((record) => <tr key={record.id}><td>{record.number}</td><td>{record.purpose}</td><td>{money(record.estimatedAmount, record.currencyCode)}</td><td>{new Date(record.submittedAt).toLocaleDateString()}</td><td><Button variant="secondary" disabled={Boolean(pending) || saving} onClick={() => { setSelected(record); setCheckedAmount(defaultBudgetCheckedAmount(record.estimatedAmount)); setNotice(""); setFinanceCheckRef(""); setEvidenceRef(""); setReservationRef(""); setReason(""); setOutcome(""); }}>Review funding</Button></td></tr>)}</tbody>
        </RecordTable></div> : <EmptyState title="No requests waiting" description="Submitted purchase requests will appear here for Finance review." />}
        {page && page.count > page.limit && <div className="mt-4 flex items-center gap-3 text-sm"><Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - page.limit))}>Previous</Button><span>{offset + 1}–{Math.min(offset + page.limit, page.count)} of {page.count}</span><Button variant="secondary" disabled={offset + page.limit >= page.count} onClick={() => setOffset(offset + page.limit)}>Next</Button></div>}
      </div></Panel>
      {pending && <Panel title="Review recorded funding"><div className="space-y-3 p-5">
        <p className="text-sm">The save is not confirmed. Keep Finance reference {pending.decision.financeCheckRef} before another change.</p>
        <Button variant="secondary" disabled={saving} onClick={() => void recover()}>{saving ? "Checking…" : "Check recorded funding"}</Button>
        <p className="text-sm text-muted-foreground">This reads recorded funding only. It does not confirm the original recorder, repeat the save, or move funds.</p>
        {history.length > 0 && <div className="overflow-x-auto"><RecordTable><thead><tr><th>Finance reference</th><th>Amount checked</th><th>Outcome</th><th>Request business version</th></tr></thead>
          <tbody>{history.map(check => <tr key={check.id}><td>{check.financeCheckRef}</td><td>{money(check.checkedAmount, check.currencyCode)}</td><td>{check.status}</td><td>{check.requestVersion}</td></tr>)}</tbody></RecordTable></div>}
      </div></Panel>}
      {selected && !pending && <Panel title={`Finance review · ${selected.number}`}><div className="space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">{selected.purpose}</p><p className="text-sm text-muted-foreground">Request version {selected.version} · {money(selected.estimatedAmount, selected.currencyCode)}</p></div><Button variant="ghost" onClick={() => setSelected(null)}>Close</Button></div>
        <form onSubmit={(event) => void save(event)} className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <Field label="Finance check reference"><Input required maxLength={200} value={financeCheckRef} onChange={(event) => setFinanceCheckRef(event.target.value)} /></Field>
          <Field label="Evidence reference" hint="Use a reference to the check in Finance; do not enter bank details."><Input required maxLength={500} value={evidenceRef} onChange={(event) => setEvidenceRef(event.target.value)} /></Field>
          <Field label="Amount checked" hint={defaultBudgetCheckedAmount(selected.estimatedAmount) === ""
            ? "This request has more precision than a check can store. Enter the amount reviewed in Finance with up to four decimal places, covering the exact request total."
            : "Enter the full amount reviewed in Finance, not the available balance. Use up to four decimal places."}>
            <Input required inputMode="decimal" value={checkedAmount} onChange={event => setCheckedAmount(event.target.value)} /></Field>
          <Field label="Funding outcome"><Select required value={outcome} onChange={(event) => setOutcome(event.target.value as BudgetDecision["status"] | "")}><option value="">Choose funding outcome</option><option value="Available">Full amount available</option><option value="PartiallyAvailable">Part of the amount available</option><option value="Insufficient">Not enough funds</option><option value="NotConfigured">Budget is not set up</option></Select></Field>
          {outcome === "Available" && <Field label="Confirmed Finance reservation reference"><Input required maxLength={200} value={reservationRef} onChange={(event) => setReservationRef(event.target.value)} /></Field>}
          <Field label={outcome === "Available" ? "Note (optional)" : "Reason"} className="sm:col-span-2"><Textarea required={outcome !== "Available"} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
          <div className="sm:col-span-2"><Button type="submit" disabled={saving || historyLoading || Boolean(historyError)}>{saving ? "Saving…" : "Save Finance check"}</Button></div>
        </form>
        <div><h3 className="mb-3 font-semibold">Previous Finance checks</h3>{historyLoading ? <p role="status">Loading check history…</p> : historyError ? <p className="text-sm text-muted-foreground">Check history is unavailable. Close and reopen the review to refresh it.</p> : history.length ? <div className="overflow-x-auto"><RecordTable><thead><tr><th>Checked</th><th>Outcome</th><th>Amount checked</th><th>Finance reference</th><th>Evidence</th><th>Reservation</th><th>Request version</th></tr></thead><tbody>{history.map((check) => <tr key={check.id}><td>{new Date(check.checkedAt).toLocaleString()}</td><td><Badge>{check.status}</Badge></td><td>{money(check.checkedAmount, check.currencyCode)}</td><td>{check.financeCheckRef}</td><td>{check.evidenceRef}</td><td>{check.reservationRef || "—"}</td><td>{check.requestVersion}</td></tr>)}</tbody></RecordTable></div> : <p className="text-sm text-muted-foreground">No Finance checks recorded yet.</p>}</div>
      </div></Panel>}
      <FinanceReleasePanel />
    </div>}
  </div>;
}
