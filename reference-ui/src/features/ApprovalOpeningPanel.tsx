import { useRequestApprovalOperation } from "../lib/RequestApprovalJournal";
import { approvalPayloadFingerprint, type ApprovalLocator } from "../lib/request-approval-journal";
import { readBoundApprovalResult } from "../../../src/platform/procurement-approval-acknowledgements-api";
import { requestApprovalsAvailable } from "../lib/request-approval-availability";
import { useEffect, useRef, useState } from "react";
import { Button, Panel } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { ApprovalApiError, listApprovalOpeningQueue, openApproval,
  type ApprovalOpeningQueue, type ApprovalOpeningRow } from "../../../src/platform/procurement-approvals-api";
const message = (cause: unknown) => cause instanceof Error ? cause.message : "Approvals could not be started. Try again.";
export function ApprovalOpeningPanel() {
  const readiness = useLiveReadiness();
  if (!readiness) throw new Error("Starting approvals needs ERP company context.");
  const journal = useRequestApprovalOperation("approval-opening-queue");
  const write = journal.state("Open");
  const priorRecoveryBlocked = useRef(write.blocked);
  const company = readiness.legalEntityId;
  const enabled = requestApprovalsAvailable(readiness.capabilities) && readiness.permissions.includes("procurement-approval-open");
  const [data, setData] = useState<ApprovalOpeningQueue | null>(null), [offset, setOffset] = useState(0), [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [intent, setIntent] = useState<{ row: ApprovalOpeningRow; key: string; locator: ApprovalLocator; scopeKey: string } | null>(null);
  useEffect(() => {
    setIntent(null); setNotice("");
  }, [company]);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController(); setData(null); setLoading(true); setError("");
    listApprovalOpeningQueue(company, offset, abort.signal).then((result) => { if (!abort.signal.aborted) setData(result); })
      .catch((cause: unknown) => { if (!abort.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [company, offset, refreshKey, enabled]);
  async function start(row: ApprovalOpeningRow) {
    if (busy || !enabled || !journal.scope || !journal.current() || write.blocked && !intent) return;
    const captured = journal;
    setBusy(true); setError(""); setNotice("");
    let command = intent;
    try {
      if (!command) {
        const locator: ApprovalLocator = { locatorSchemaVersion: 1, operation: "Open", key: crypto.randomUUID(),
          requestId: row.requestId, caseId: null, assignmentId: null, expectedRequestVersion: row.requestVersion,
          expectedCaseVersion: null, expectedAssignmentVersion: null,
          fingerprint: await approvalPayloadFingerprint({ expectedRequestVersion: row.requestVersion }) };
        if (!captured.current() || !captured.claim(locator)) throw new Error("An earlier approval action must be checked before starting another.");
        command = { row, key: locator.key, locator, scopeKey: captured.scopeKey }; setIntent(command);
      }
      if (!captured.current() || command.scopeKey !== captured.scopeKey
        || captured.state("Open").pending?.key !== command.key || !captured.reserve(command.locator)) return;
      const result = await openApproval(company, command.row.requestId, command.row.requestVersion, command.key, captured.scope!.branchId);
      readBoundApprovalResult(result, command.locator);
      if (!captured.current()) return;
      if (!captured.confirm(command.locator)) throw new Error("The result was returned but its recovery reference remains blocked. Check the saved result.");
      setIntent(null); setNotice(`Approvals started for ${command.row.requestNumber}. The assigned people can now review it.`);
      setData(await listApprovalOpeningQueue(company, offset));
    } catch (cause) { if (captured.current()) setError(message(cause)); }
    finally { if (command) captured.settled(command.locator); if (captured.current()) setBusy(false); }
  }
  useEffect(() => {
    const blocked = journal.state("Open").blocked;
    if (priorRecoveryBlocked.current && !blocked) { setIntent(null); setRefreshKey(value => value + 1); }
    priorRecoveryBlocked.current = blocked;
  }, [journal.revision]);
  if (!enabled) return null;
  return <Panel title="Requests waiting to start approvals" className="mt-5"><div className="space-y-4 p-5">
    <p className="text-sm text-muted-foreground">Buying rules and funding evidence have been recorded. Starting approvals assigns the configured reviewers; it does not approve the purchase.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{notice && <p role="status" className="text-sm">{notice}</p>}
    {intent && !busy && <div className="space-y-2"><p className="text-sm">The result for {intent.row.requestNumber} was not confirmed. Retry the same request to check its saved result.</p><Button variant="secondary" onClick={() => void start(intent.row)}>Retry starting {intent.row.requestNumber}</Button></div>}
    {loading ? <p role="status">Loading requests awaiting approvals…</p> : data?.records.length ? <div className="overflow-x-auto"><RecordTable><thead><tr><th>Request</th><th>Purpose</th><th>Amount before adjustments</th><th>Submitted</th><th>Action</th></tr></thead><tbody>{data.records.map((row) => <tr key={row.requestId}><td>{row.requestNumber}</td><td>{row.purpose}</td><td>{row.currencyCode} {row.amount.toLocaleString()}</td><td>{new Date(row.submittedAt).toLocaleString()}</td><td><Button variant="secondary" disabled={busy || write.blocked || !journal.scope} onClick={() => void start(row)}>Start approvals for {row.requestNumber}</Button></td></tr>)}</tbody></RecordTable></div> : data && <p className="text-sm text-muted-foreground">No requests are waiting to start approvals.</p>}
    {data && data.count > data.limit && <div className="flex items-center gap-3 text-sm"><Button variant="secondary" disabled={busy || !offset} onClick={() => setOffset(Math.max(0, offset - data.limit))}>Previous requests</Button><span>{offset + 1}–{Math.min(offset + data.limit, data.count)} of {data.count}</span><Button variant="secondary" disabled={busy || offset + data.limit >= data.count} onClick={() => setOffset(offset + data.limit)}>Next requests</Button></div>}
    <Button variant="ghost" disabled={busy} onClick={() => setRefreshKey((key) => key + 1)}>Refresh waiting requests</Button>
  </div></Panel>;
}
