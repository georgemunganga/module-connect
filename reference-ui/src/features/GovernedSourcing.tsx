import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Panel, Select, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useErpShell } from "../lib/erpShell";
import { pendingRfqCommands } from "../lib/rfq-command-memory";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { cancelRfqCommand, createRfqCommand, getGovernedRfq, listGovernedRfq, listRfqSources, recoverRfqCommand, sendRfqCommand,
  RfqExecutionError, type RfqCommand, type RfqDetail, type RfqOwnedPage, type RfqSelection, type RfqSource, type RfqSourcePage } from "../../../src/platform/procurement-sourcing-execution-api";
const message = (error: unknown) => error instanceof Error ? error.message : "The quote action could not be confirmed.";
function useCompany() { const value = useLiveReadiness(); if (!value) throw new Error("Choose an ERP company first."); return value; }
function useCommandSlot(operation: string) {
  const company = useCompany(); const { selection } = useErpShell();
  return JSON.stringify([company.tenantId, company.legalEntityId, company.workerId, selection.branch ?? "", operation]);
}
const detailLink = (id: string) => `/rfqs/${id}?source=approved`;
function Pager({ page, total, size, change }: { page: number; total: number; size: number; change: (value: number) => void }) {
  return <div className="mt-4 flex items-center gap-3 text-sm"><Button type="button" variant="secondary" disabled={page === 1} onClick={() => change(page - 1)}>Previous</Button>
    <span>Page {page}</span><Button type="button" variant="secondary" disabled={page * size >= total} onClick={() => change(page + 1)}>Next</Button></div>;
}
export function GovernedSourcingList() {
  const { legalEntityId, permissions } = useCompany(); const [data, setData] = useState<RfqOwnedPage | null>(null);
  const [page, setPage] = useState(1), [search, setSearch] = useState(""), [state, setState] = useState(""), [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); setData(null); setError("");
    listGovernedRfq(legalEntityId, page, search, state, controller.signal).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(error => { if (!controller.signal.aborted) setError(message(error)); }); return () => controller.abort();
  }, [legalEntityId, page, search, state]);
  return <div className="p-5 sm:p-8"><PageHeader title="Request for Quotes" subtitle="Internal drafts from approved purchase requests. Vendors have not received these drafts."
    actions={permissions.includes("procurement-sourcing-convert") && <Link to="/rfqs/new?source=approved"><Button>Use approved requests</Button></Link>} />
    <Panel><div className="space-y-4 p-5"><div className="grid gap-3 sm:grid-cols-2"><Field label="Find quote request"><Input maxLength={100} value={search} onChange={e => { setPage(1); setSearch(e.target.value); }} /></Field>
      <Field label="Status"><Select value={state} onChange={e => { setPage(1); setState(e.target.value); }}><option value="">All</option><option value="Draft">Draft</option><option value="Cancelled">Cancelled</option></Select></Field></div>
      {error ? <p role="alert">{error}</p> : !data ? <p role="status">Loading your quote requests…</p> : !data.items.length ? <EmptyState title="No drafts from approved requests" description="Use approved purchase requests to prepare a quote request." />
        : <div className="overflow-x-auto"><RecordTable><thead><tr><th>Reference</th><th>Title</th><th>Currency</th><th>Status</th><th>Action</th></tr></thead><tbody>{data.items.map(row => <tr key={row.id}>
          <td>{row.number}</td><td>{row.title ?? "Needs review"}</td><td>{row.currencyCode ?? "—"}</td><td><Badge>{row.status ?? "Needs review"}</Badge></td>
          <td>{row.state === "VerifiedRetainedDraft" ? <Link to={detailLink(row.id)} className="text-primary hover:underline">Open</Link> : "Refresh or ask Procurement to review"}</td></tr>)}</tbody></RecordTable></div>}
      {data && <Pager page={page} total={data.total} size={data.pageSize} change={setPage} />}</div></Panel></div>;
}

function Pending({ command, busy, error, check }: { command: RfqCommand; busy: boolean; error: string; check: () => void }) {
  return <Panel title="Check the saved result"><div className="space-y-3 p-5"><p role="alert">{error || "This save has not been confirmed. Check its original reference before another change."}</p>
    <p className="break-all text-sm text-muted-foreground">Save reference: {command.key}</p>
    <Button type="button" variant="secondary" disabled={busy} onClick={check}>{busy ? "Checking…" : "Check saved result"}</Button>
    <p className="text-sm text-muted-foreground">Checking only reads the recorded result. It does not repeat the save or send anything to vendors.</p></div></Panel>;
}
export function GovernedSourcingCreate() {
  const { legalEntityId } = useCompany(); const navigate = useNavigate(); const live = useRef(true);
  const slot = useCommandSlot("Create"); const working = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const [page, setPage] = useState(1), [search, setSearch] = useState(""), [title, setTitle] = useState(""), [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<RfqSourcePage | null>(null), [selected, setSelected] = useState<RfqSelection[]>([]);
  const [error, setError] = useState(""), [loadError, setLoadError] = useState(""), [busy, setBusy] = useState(false);
  const [pending, setPendingState] = useState<RfqCommand | null>(() => pendingRfqCommands.get(slot) ?? null);
  function setPending(value: RfqCommand | null) {
    if (value) pendingRfqCommands.set(slot, value); else pendingRfqCommands.delete(slot);
    if (live.current) setPendingState(value);
  }
  useEffect(() => { const controller = new AbortController(); setData(null); setLoadError("");
    listRfqSources(legalEntityId, page, search, controller.signal).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(error => { if (!controller.signal.aborted) setLoadError(message(error)); }); return () => controller.abort();
  }, [legalEntityId, page, search, refresh]);
  function choose(source: RfqSource) {
    setError(""); if (!source.canSelect || !source.availableQuantity) return;
    if (selected.some(row => row.source.purchaseRequestLineId === source.purchaseRequestLineId)) return;
    if (selected.length >= 200) { setError("Choose no more than 200 lines."); return; }
    if (selected.some(row => row.source.branchRef !== source.branchRef || row.source.currencyCode !== source.currencyCode)) {
      setError("Choose lines from the same branch and currency. Use a separate draft for other purchases."); return;
    }
    setSelected([...selected, { source, quantity: source.availableQuantity }]);
  }
  async function create(event: FormEvent) {
    event.preventDefault(); if (pending || working.current) return; setError("");
    let command: RfqCommand;
    try { command = createRfqCommand(title, selected, crypto.randomUUID()); } catch (error) { setError(message(error)); return; }
    setPending(command); working.current = true; setBusy(true);
    try { const saved = await sendRfqCommand(legalEntityId, command); setPending(null); if (live.current) navigate(detailLink(saved.eventId)); }
    catch (error) {
      if (error instanceof RfqExecutionError && (error.status === 400 || error.status === 422)) setPending(null);
      if (error instanceof RfqExecutionError && (error.status === 401 || error.status === 403 || error.status === 404)) { setSelected([]); setData(null); }
      setError(message(error));
    }
    finally { working.current = false; if (live.current) setBusy(false); }
  }
  async function recover() {
    if (!pending || working.current) return; working.current = true; setBusy(true); setError("");
    try { const saved = await recoverRfqCommand(legalEntityId, pending); setPending(null); if (live.current) navigate(detailLink(saved.eventId)); }
    catch (error) { setError(message(error)); } finally { working.current = false; if (live.current) setBusy(false); }
  }
  return <div className="p-5 sm:p-8"><PageHeader title="Use approved purchase requests" subtitle="Choose full or partial quantities. A draft holds quantities only after you explicitly create it." />
    {pending ? <Pending command={pending} busy={busy} error={error} check={() => void recover()} /> : <form className="space-y-5" onSubmit={create}>
      {error && <p role="alert" className="text-red-600">{error}</p>}
      <Panel title="Quote request"><div className="p-5"><Field label="What are you buying?"><Input required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></Field></div></Panel>
      <Panel title="Approved requests"><div className="space-y-4 p-5"><div className="flex items-end gap-3"><Field label="Find request or item" className="flex-1"><Input maxLength={100} value={search} onChange={e => { setPage(1); setSearch(e.target.value); }} /></Field>
        <Button variant="secondary" type="button" onClick={() => { setSelected([]); setRefresh(value => value + 1); }}>Refresh sources</Button></div>
        {loadError ? <p role="alert">{loadError}</p> : !data ? <p role="status">Loading approved requests…</p> : !data.items.length ? <EmptyState title="No approved requests found" description="Approved competitive purchases appear here after their funding and source checks pass." />
          : <div className="overflow-x-auto"><RecordTable><thead><tr><th>Request</th><th>Item or service</th><th>Available</th><th>Approved estimate</th><th>Action</th></tr></thead><tbody>{data.items.map(row => <tr key={row.purchaseRequestLineId}>
            <td>{row.requestNumber}</td><td>{row.description ?? "Needs review"}</td><td>{row.availableQuantity ?? "—"} {row.unitCode}</td>
            <td>{row.approvedUnitEstimate ? `${row.currencyCode} ${row.approvedUnitEstimate}` : "—"}</td>
            <td><Button type="button" variant="secondary" disabled={!row.canSelect || selected.some(x => x.source.purchaseRequestLineId === row.purchaseRequestLineId)} onClick={() => choose(row)}>
              {row.state === "Unavailable" ? "Needs review" : row.state === "FullyAllocated" ? "Already assigned" : "Add line"}</Button></td></tr>)}</tbody></RecordTable></div>}
        {data && <><p className="text-sm text-muted-foreground">{data.candidateTotal} request lines to check. This includes lines needing review or already assigned.</p><Pager page={page} total={data.candidateTotal} size={data.pageSize} change={setPage} /></>}
      </div></Panel>
      <Panel title="Selected quantities"><div className="space-y-4 p-5">{!selected.length ? <p className="text-sm text-muted-foreground">Add lines from approved requests above.</p> : selected.map((row, index) => <div className="grid gap-3 sm:grid-cols-4" key={row.source.purchaseRequestLineId}>
        <div className="sm:col-span-2"><p>{row.source.description}</p><p className="text-sm text-muted-foreground">{row.source.requestNumber} · Available {row.source.availableQuantity} {row.source.unitCode}</p></div>
        <Field label={`Quantity for ${row.source.requestNumber}`}><Input required inputMode="decimal" value={row.quantity} onChange={e => setSelected(selected.map((item, at) => at === index ? { ...item, quantity: e.target.value } : item))} /></Field>
        <Button type="button" variant="ghost" onClick={() => setSelected(selected.filter((_, at) => at !== index))}>Remove line</Button></div>)}</div></Panel>
      <div className="flex gap-3"><Button type="submit" disabled={busy || !selected.length}>Create internal draft</Button><Link to="/rfqs?source=approved"><Button variant="secondary" type="button">Back</Button></Link></div>
    </form>}
  </div>;
}
export function GovernedSourcingDetail({ id }: { id: string }) {
  const slot = useCommandSlot(`Cancel:${id}`); const working = useRef(false); const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const { legalEntityId, permissions } = useCompany(); const [record, setRecord] = useState<RfqDetail | null>(null), [error, setError] = useState("");
  const [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  const [pending, setPendingState] = useState<RfqCommand | null>(() => pendingRfqCommands.get(slot) ?? null);
  function setPending(value: RfqCommand | null) {
    if (value) pendingRfqCommands.set(slot, value); else pendingRfqCommands.delete(slot);
    if (live.current) setPendingState(value);
  }
  useEffect(() => { const controller = new AbortController(); setRecord(null); setError("");
    getGovernedRfq(legalEntityId, id, controller.signal).then(value => { if (!controller.signal.aborted) setRecord(value); })
      .catch(error => { if (!controller.signal.aborted) setError(message(error)); }); return () => controller.abort();
  }, [legalEntityId, id, refresh]);
  async function cancel() {
    if (!record || pending || working.current || !permissions.includes("procurement-sourcing-cancel")) return; setError(""); let command: RfqCommand;
    try { command = cancelRfqCommand(record, reason, crypto.randomUUID()); } catch (error) { setError(message(error)); return; }
    setPending(command); working.current = true; setBusy(true);
    try { await sendRfqCommand(legalEntityId, command); setPending(null); setReason(""); setRefresh(value => value + 1); }
    catch (error) {
      // A validated 400/422 rejection did not apply this command: retain the reason
      // for correction and require a fresh explicit submission. Unknown outcomes
      // keep their original UUID and expose GET-only recovery instead.
      if (error instanceof RfqExecutionError && (error.status === 400 || error.status === 422)) setPending(null);
      if (error instanceof RfqExecutionError && (error.status === 401 || error.status === 403 || error.status === 404)) setRecord(null);
      setError(message(error));
    }
    finally { working.current = false; if (live.current) setBusy(false); }
  }
  async function recover() {
    if (!pending || working.current) return; working.current = true; setBusy(true); setError("");
    try { await recoverRfqCommand(legalEntityId, pending); setPending(null); setReason(""); setRefresh(value => value + 1); }
    catch (error) { if (error instanceof RfqExecutionError && (error.status === 401 || error.status === 403 || error.status === 404)) setRecord(null); setError(message(error)); }
    finally { working.current = false; if (live.current) setBusy(false); }
  }
  if (!record) return <div className="p-5 sm:p-8">{error ? <p role="alert">{error}</p> : <p role="status">Loading quote request…</p>}{pending && <Pending command={pending} busy={busy} error={error} check={() => void recover()} />}</div>;
  return <div className="p-5 sm:p-8"><PageHeader title={record.title} subtitle={`${record.number} · ${record.method} · ${record.currencyCode}`} actions={<Badge>{record.status}</Badge>} />
    <Panel title="Items and services"><div className="overflow-x-auto p-5"><RecordTable><thead><tr><th>Item or service</th><th>Quantity</th><th>Unit</th><th>Approved estimate</th><th>Draft balance</th></tr></thead><tbody>{record.lines.map(row => <tr key={row.id}>
      <td>{row.description}</td><td>{row.quantity}</td><td>{row.unitCode}</td><td>{record.currencyCode} {row.approvedUnitEstimate}</td><td>{row.allocationState === "Reserved" ? "Held for this draft" : "Released"}</td></tr>)}</tbody></RecordTable></div></Panel>
    <Panel title="Next step" className="mt-5"><p className="p-5 text-sm text-muted-foreground">This is an internal draft. Sending to vendors, invitations and award open only when their controlled workflows are ready. No Finance reservation was changed.</p></Panel>
    {record.cancellationReason && <Panel title="Cancellation reason" className="mt-5"><p className="p-5">{record.cancellationReason}</p></Panel>}
    {pending ? <div className="mt-5"><Pending command={pending} busy={busy} error={error} check={() => void recover()} /></div> : record.status === "Draft" && permissions.includes("procurement-sourcing-cancel") && <Panel title="Cancel this internal draft" className="mt-5"><div className="space-y-3 p-5">
      {error && <p role="alert">{error}</p>}<Field label="Reason"><Textarea maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></Field>
      <Button variant="danger" disabled={busy || !reason.trim()} onClick={() => void cancel()}>Cancel draft and release its quantities</Button></div></Panel>}
    <Link to="/rfqs?source=approved" className="mt-5 inline-block text-primary hover:underline">Back to quote requests</Link></div>;
}
