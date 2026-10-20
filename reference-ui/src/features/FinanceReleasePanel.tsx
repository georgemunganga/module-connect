import { useEffect, useState, type FormEvent } from "react";
import { Badge, Button, Field, Input, Modal, Panel, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { ApprovalApiError, confirmFinanceRelease, listFinanceReleases,
  type FinanceReleaseCommand, type FinanceReleaseQueue, type FinanceReleaseRow } from "../../../src/platform/procurement-approvals-api";
const message = (cause: unknown) => cause instanceof Error ? cause.message : "Finance release evidence could not be confirmed.";
const localNow = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 23);
export function FinanceReleasePanel() {
  const readiness = useLiveReadiness();
  if (!readiness) throw new Error("Finance releases require ERP company context.");
  const company = readiness.legalEntityId;
  const enabled = readiness.capabilities.approvals && readiness.permissions.includes("procurement-budget-check");
  const [data, setData] = useState<FinanceReleaseQueue | null>(null), [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<FinanceReleaseRow | null>(null);
  const [reference, setReference] = useState(""), [reason, setReason] = useState(""), [confirmedAt, setConfirmedAt] = useState(localNow);
  const [pending, setPending] = useState<{ key: string; body: FinanceReleaseCommand } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController(); setData(null); setSelected(null); setPending(null); setLoading(true); setError("");
    listFinanceReleases(company, offset, abort.signal).then((result) => { if (!abort.signal.aborted) setData(result); })
      .catch((cause: unknown) => { if (!abort.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [company, offset, enabled]);
  if (!enabled) return null;
  async function save(event: FormEvent) {
    event.preventDefault(); if (!selected) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const intent = pending ?? { key: crypto.randomUUID(), body: {
        expectedRequestVersion: selected.requestVersion, reservationReference: selected.reservationReference,
        releasedAmount: selected.reservedAmount, currencyCode: selected.currencyCode,
        evidenceReference: reference.trim(), confirmedAt: new Date(confirmedAt).toISOString(), reason: reason.trim(),
      } };
      setPending(intent);
      const receipt = await confirmFinanceRelease(company, selected.requestId, intent.body, intent.key);
      setSelected(null); setPending(null);
      setNotice(receipt.requestState === "ReturnedForChanges" ? "Release evidence recorded. The requester can now make changes."
        : "Release evidence recorded. The rejected request remains closed.");
      setData(await listFinanceReleases(company, offset));
    } catch (cause) {
      setError(message(cause));
      if (cause instanceof ApprovalApiError && cause.status >= 400 && cause.status < 500) {
        setPending(null);
        if (cause.status === 409) { setSelected(null); try { setData(await listFinanceReleases(company, offset)); } catch { setData(null); } }
      }
    } finally { setBusy(false); }
  }
  return <Panel title="Funds waiting for release"><div className="space-y-4 p-5">
    <p className="text-sm text-muted-foreground">Verify the release in Finance first, then record the evidence here under your approved manual process. This does not release funds or send a payment.</p>
    {error && !selected && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {loading ? <p role="status">Loading Finance release requests…</p> : data?.records.length ? <div className="overflow-x-auto"><RecordTable><thead><tr><th>Request</th><th>Reserved amount</th><th>Requested</th><th>Status</th><th>Action</th></tr></thead><tbody>{data.records.map((row) => <tr key={row.releaseRequestId}><td>{row.requestNumber}</td><td>{row.currencyCode} {row.reservedAmount.toLocaleString()}</td><td>{new Date(row.requestedAt).toLocaleString()}</td><td><Badge>Release pending</Badge></td><td><Button variant="secondary" onClick={() => { setSelected(row); setReference(""); setReason(""); setConfirmedAt(localNow()); setPending(null); setError(""); }}>Record release evidence</Button></td></tr>)}</tbody></RecordTable></div> : data && <p className="text-sm text-muted-foreground">No reservations are waiting for release confirmation.</p>}
    {data && data.count > data.limit && <div className="flex items-center gap-3 text-sm"><Button variant="secondary" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - data.limit))}>Previous releases</Button><span>{offset + 1}–{Math.min(offset + data.limit, data.count)} of {data.count}</span><Button variant="secondary" disabled={offset + data.limit >= data.count} onClick={() => setOffset(offset + data.limit)}>Next releases</Button></div>}
    {selected && <Modal title={`Finance release · ${selected.requestNumber}`} onClose={() => { if (!busy && !pending) setSelected(null); }}><form onSubmit={(event) => void save(event)} className="space-y-4">
      <p className="text-sm">Manual evidence for {selected.reservationReference} · {selected.currencyCode} {selected.reservedAmount.toLocaleString()}.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <Field label="Release evidence reference"><Input required maxLength={500} disabled={busy || !!pending} value={reference} onChange={(event) => setReference(event.target.value)} /></Field>
      <Field label="Finance confirmation date and time" hint="Shown in your local time zone."><Input type="datetime-local" step="0.001" required disabled={busy || !!pending} value={confirmedAt} onChange={(event) => setConfirmedAt(event.target.value)} /></Field>
      <Field label="Reason"><Textarea required maxLength={2000} disabled={busy || !!pending} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
      {pending && !busy && <p className="text-sm">The response was not confirmed. Retry this same evidence to recover its saved result.</p>}
      <div className="flex gap-3"><Button type="submit" disabled={busy || !reference.trim() || !reason.trim() || !confirmedAt}>{busy ? "Saving…" : pending ? "Retry same confirmation" : "Confirm release evidence"}</Button><Button variant="secondary" disabled={busy || !!pending} onClick={() => setSelected(null)}>Cancel</Button></div>
    </form></Modal>}
  </div></Panel>;
}
