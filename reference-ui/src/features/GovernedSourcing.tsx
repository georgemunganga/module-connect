import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Panel, Select, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { ListTools, type ListColumn } from "../components/data/ListTools";
import { StandardDataTable } from "../components/data/StandardDataTable";
import { DetailSection, DetailValue } from "../components/data/DetailPrimitives";
import { RfqDetailLayout, RfqWizardLayout } from "./RfqPresentation";
import { useErpShell } from "../lib/erpShell";
import { readRfqRecovery, writeRfqRecovery } from "../lib/rfq-command-journal";
import { pendingRfqCommands } from "../lib/rfq-command-memory";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { listPublications, type PublicationPage, type PublicationRow } from "../../../src/platform/procurement-sourcing-publication-api";
import { PrincipalPublicationDetail, PrincipalAssignedReviews } from "./PrincipalPublication";
import { cancelRfqCommand, createRfqCommand, getGovernedRfq, listGovernedRfq, listRfqSources, recoverRfqCommand, sendRfqCommand,
  rfqRecoveryReference, RfqExecutionError, type RfqRecoveryReference, type RfqCommand, type RfqDetail, type RfqOwnedPage, type RfqSelection, type RfqSource, type RfqSourcePage, type RfqOwned, type RfqSourceMode } from "../../../src/platform/procurement-sourcing-execution-api";
const message = (error: unknown) => error instanceof Error ? error.message : "The quote action could not be confirmed.";
function useCompany() { const value = useLiveReadiness(); if (!value) throw new Error("Choose an ERP company first."); return value; }
function useCommandSlot(operation: string, mode: RfqSourceMode) {
  const company = useCompany(); const { selection } = useErpShell();
  return JSON.stringify([company.tenantId, company.legalEntityId, company.principalId, selection.branch ?? "", operation,
    ...(mode === "principal" ? ["principal"] : [])]);
}
const listLink = (mode: RfqSourceMode) => `/rfqs?source=${mode === "principal" ? "principal-approved" : "approved"}`;
const createLink = (mode: RfqSourceMode) => `/rfqs/new?source=${mode === "principal" ? "principal-approved" : "approved"}`;
const detailLink = (id: string, mode: RfqSourceMode) => `/rfqs/${id}?source=${mode === "principal" ? "principal-approved" : "approved"}`;
function Pager({ page, total, size, change }: { page: number; total: number; size: number; change: (value: number) => void }) {
  return <div className="mt-4 flex items-center gap-3 text-sm"><Button type="button" variant="secondary" disabled={page === 1} onClick={() => change(page - 1)}>Previous</Button>
    <span>Page {page}</span><Button type="button" variant="secondary" disabled={page * size >= total} onClick={() => change(page + 1)}>Next</Button></div>;
}
export function GovernedSourcingList({ mode = "worker" }: { mode?: RfqSourceMode }) {
  const { legalEntityId, permissions, capabilities } = useCompany();
  const publication = mode === "principal" && capabilities.principalSourcingPublication === true;
  const ownerCanRead = !publication || permissions.includes("procurement-sourcing-submit");
  const [data, setData] = useState<RfqOwnedPage | PublicationPage | null>(null);
  const [page, setPage] = useState(1), [search, setSearch] = useState(""), [state, setState] = useState(""), [error, setError] = useState("");
  const [revision, setRevision] = useState(0), [notice, setNotice] = useState("");
  const [visible, setVisible] = useState(["number", "currency", "status"]), [widths, setWidths] = useState<Record<string, number>>({});
  const [clip, setClip] = useState(false), [sort, setSort] = useState("number"), [selected, setSelected] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const columns: ListColumn[] = [{ key: "number", label: "Reference / Description", width: 360 }, { key: "currency", label: "Currency", width: 160 }, { key: "status", label: "Status", width: 160 }];
  useEffect(() => { const controller = new AbortController(); setData(null); setError(""); setSelected([]); setPreviewId(null);
    (publication ? ownerCanRead ? listPublications(legalEntityId, page, search, state, controller.signal)
      : Promise.resolve({ items: [], total: 0, page, pageSize: 25 } satisfies PublicationPage)
      : listGovernedRfq(legalEntityId, page, search, state, controller.signal, mode)).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(error => { if (!controller.signal.aborted) setError(message(error)); }); return () => controller.abort();
  }, [legalEntityId, page, search, state, revision, mode, publication, ownerCanRead]);
  const rows = useMemo<(RfqOwned | PublicationRow)[]>(() => [...(data?.items ?? [])].sort((left, right) => {
    const field = (row: RfqOwned | PublicationRow) => sort === "currency" ? row.currencyCode || "" : sort === "status" ? row.status || row.state : row.number;
    return field(left).localeCompare(field(right)) || left.id.localeCompare(right.id);
  }), [data, sort]);
  const currentIds = new Set(rows.map(row => row.id));
  const currentSelection = selected.filter(id => currentIds.has(id));
  const verified = (row: RfqOwned | PublicationRow) => row.state === "VerifiedRetainedDraft" || row.state === "VerifiedRetainedSourcing";
  const preview = rows.find(row => row.id === previewId && verified(row));
  return <div className="p-5 sm:p-8"><PageHeader title="Request for Quotes" subtitle={publication
    ? "Approved request sources, internal publication review, and manually contacted suppliers."
    : "Internal drafts from approved purchase requests. Vendors have not received these drafts."}
    actions={<><ListTools entity="Quote Requests" columns={columns} visibleColumns={visible} onVisibleColumnsChange={setVisible}
      columnWidths={widths} onColumnWidthsChange={setWidths} clipText={clip} onClipTextChange={setClip}
      sortOptions={columns.map(column => ({ key: column.key, label: `${column.label} on this page` }))} onSort={setSort}
      filterFields={[{ key: "status", label: "Status", type: "select", options: publication
        ? ["Draft", "PublicationReview", "Published", "Cancelled"] : ["Draft", "Cancelled"] }]} activeFilters={{ status: state }}
      onApplyFilters={filters => { setSelected([]); setPreviewId(null); setPage(1); setState(filters.status || ""); }} showSavedView={false}
      onExport={() => setNotice("Export is not available yet.")} onRefresh={() => { setSelected([]); setPreviewId(null); setRevision(value => value + 1); }}
      onResetWidths={() => setWidths({})} notify={setNotice} unavailableImportReason="Import is not available yet."
      unavailableExportReason="Export is not available yet." unavailableAllExportReason="Only the current page is loaded."
      viewExportLabel="Export Current Page View" selectedCount={currentSelection.length} />
      {permissions.includes("procurement-sourcing-convert") && <Link to={createLink(mode)}><Button>Use approved requests</Button></Link>}</>} />
    <Panel><div className="flex flex-wrap items-end gap-3 border-b border-border p-5"><Field label="Find quote request" className="min-w-56 flex-1"><Input maxLength={100} value={search} onChange={e => { setSelected([]); setPreviewId(null); setPage(1); setSearch(e.target.value); }} /></Field>
      <Field label="Status" className="min-w-40"><Select value={state} onChange={e => { setSelected([]); setPreviewId(null); setPage(1); setState(e.target.value); }}><option value="">All statuses</option><option value="Draft">Draft</option>{publication && <><option value="PublicationReview">Publication review</option><option value="Published">Published internally</option></>}<option value="Cancelled">Cancelled</option></Select></Field></div>
      <p className="px-5 pt-3 text-xs text-muted-foreground">Search and status work across pages you can access. Sorting and selection apply to this page only.</p>
      {notice && <p role="status" className="px-5 pt-3 text-sm">{notice}</p>}
      {error ? <p role="alert" className="p-5">{error}</p> : !data ? <p role="status" className="p-5">Loading your quote requests…</p> : !rows.length ? <div className="p-5"><EmptyState title={publication ? "No quote requests here" : "No drafts from approved requests"} description="Use approved purchase requests to prepare a quote request." /></div>
        : <><StandardDataTable rows={rows} columns={columns} visibleColumns={visible} columnWidths={widths} clipText={clip}
          selected={currentSelection} onSelectedChange={ids => setSelected(ids.filter(id => currentIds.has(id)))} onSort={setSort} rowLabel={row => `Open ${row.number}`}
          renderCell={(row, column) => column.key === "number" ? verified(row) ? <Link to={detailLink(row.id, mode)} className="block text-primary"><span className="font-semibold">{row.number}</span><span className="mt-1 block text-sm">{row.title || "Needs review"}</span></Link>
            : <><span className="font-semibold">{row.number}</span><span className="mt-1 block text-sm text-muted-foreground">Needs review</span></>
            : column.key === "currency" ? row.currencyCode || "—" : <Badge>{row.status || "Needs review"}</Badge>}
          renderActions={row => verified(row) ? <span className="flex items-center gap-2"><Link to={detailLink(row.id, mode)} className="text-primary">Open</Link><Button variant="ghost" onClick={() => setPreviewId(row.id)}>Preview</Button></span> : <span className="text-xs text-muted-foreground">Needs review</span>} />
          {currentSelection.length > 0 && <div className="border-t border-border bg-primary/5 px-5 py-3 text-sm">{currentSelection.length} selected on this page · Bulk changes are not available yet. <Button variant="ghost" onClick={() => setSelected([])}>Clear selection</Button></div>}</>}
      {data && <div className="border-t border-border px-5 py-3"><Pager page={page} total={data.total} size={data.pageSize} change={next => { setSelected([]); setPreviewId(null); setPage(next); }} /></div>}
    </Panel>
    {preview && <Modal title={`${preview.number} · Preview`} onClose={() => setPreviewId(null)}><div className="space-y-3 text-sm"><p className="font-medium">{preview.title}</p><Badge>{preview.status}</Badge><p>Currency: {preview.currencyCode}</p><Link to={detailLink(preview.id, mode)}><Button variant="secondary">View full details</Button></Link></div></Modal>}
    {publication && permissions.includes("procurement-sourcing-publish") && <PrincipalAssignedReviews company={legalEntityId} />}
  </div>;
}

function Pending({ command, busy, error, check }: { command: RfqRecoveryReference; busy: boolean; error: string; check: () => void }) {
  return <Panel title="Check the saved result"><div className="space-y-3 p-5"><p role="alert">{error || "This save has not been confirmed. Check its original reference before another change."}</p>
    <p className="break-all text-sm text-muted-foreground">Save reference: {command.key}</p>
    <Button type="button" variant="secondary" disabled={busy} onClick={check}>{busy ? "Checking…" : "Check saved result"}</Button>
    <p className="text-sm text-muted-foreground">Checking only reads the recorded result. It does not repeat the save or send anything to vendors.</p></div></Panel>;
}
export function GovernedSourcingCreate({ mode = "worker" }: { mode?: RfqSourceMode }) {
  const { legalEntityId } = useCompany(); const navigate = useNavigate(); const live = useRef(true);
  const slot = useCommandSlot("Create", mode); const working = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const [page, setPage] = useState(1), [search, setSearch] = useState(""), [title, setTitle] = useState(""), [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<RfqSourcePage | null>(null), [selected, setSelected] = useState<RfqSelection[]>([]);
  const [error, setError] = useState(""), [loadError, setLoadError] = useState(""), [busy, setBusy] = useState(false);
  const [journal] = useState(() => {
    try {
      const reference = readRfqRecovery(slot);
      if (!reference && pendingRfqCommands.has(slot)) throw new Error("The original save reference is missing from recovery storage. No new save will be sent. Ask Procurement to reconcile the saved result.");
      return { reference, error: "" };
    }
    catch (error) { return { reference: null, error: message(error) }; }
  });
  const [pending, setPendingState] = useState<RfqRecoveryReference | null>(journal.reference);
  function setPending(value: RfqCommand | null) {
    const reference = value ? rfqRecoveryReference(value) : null;
    // Complete and verify the durable write before any POST. Restored locators
    // cannot be passed to sendRfqCommand: only the original in-memory body can.
    writeRfqRecovery(slot, reference);
    if (value) pendingRfqCommands.set(slot, value); else pendingRfqCommands.delete(slot);
    if (live.current) setPendingState(reference);
  }
  useEffect(() => { const controller = new AbortController(); setData(null); setLoadError("");
    listRfqSources(legalEntityId, page, search, controller.signal, mode).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(error => { if (!controller.signal.aborted) setLoadError(message(error)); }); return () => controller.abort();
  }, [legalEntityId, page, search, refresh, mode]);
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
    event.preventDefault(); if (journal.error || pending || working.current) return; setError("");
    let command: RfqCommand;
    try { command = createRfqCommand(title, selected, crypto.randomUUID(), mode); } catch (error) { setError(message(error)); return; }
    try { setPending(command); } catch (error) { setError(message(error)); return; }
    working.current = true; setBusy(true);
    try { const saved = await sendRfqCommand(legalEntityId, command); setPending(null); if (live.current) navigate(detailLink(saved.eventId, mode)); }
    catch (error) {
      if (error instanceof RfqExecutionError && (error.status === 400 || error.status === 422)) {
        try { setPending(null); } catch (journalError) { setError(message(journalError)); return; }
      }
      if (error instanceof RfqExecutionError && (error.status === 401 || error.status === 403 || error.status === 404)) { setSelected([]); setData(null); }
      setError(message(error));
    }
    finally { working.current = false; if (live.current) setBusy(false); }
  }
  async function recover() {
    if (!pending || working.current) return; working.current = true; setBusy(true); setError("");
    try { const saved = await recoverRfqCommand(legalEntityId, pending); setPending(null); if (live.current) navigate(detailLink(saved.eventId, mode)); }
    catch (error) { setError(message(error)); } finally { working.current = false; if (live.current) setBusy(false); }
  }
  return <RfqWizardLayout title="Use approved purchase requests" back={listLink(mode)} approved busy={busy}>
    <p className="text-sm text-muted-foreground">Choose full or partial quantities. A draft holds quantities only after you explicitly create it.</p>
    {journal.error ? <p role="alert">{journal.error}</p> : pending ? <Pending command={pending} busy={busy} error={error} check={() => void recover()} /> : <form className="space-y-5" onSubmit={create}>
      {error && <p role="alert" className="text-red-600">{error}</p>}
      <div id="rfq-stage-0" className="scroll-mt-28"><Panel title="Quote request"><div className="p-5"><Field label="What are you buying?"><Input required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></Field></div></Panel></div>
      <div id="rfq-stage-1" className="scroll-mt-28"><Panel title="Approved requests"><div className="space-y-4 p-5"><div className="flex items-end gap-3"><Field label="Find request or item" className="flex-1"><Input maxLength={100} value={search} onChange={e => { setPage(1); setSearch(e.target.value); }} /></Field>
        <Button variant="secondary" type="button" onClick={() => { setSelected([]); setRefresh(value => value + 1); }}>Refresh sources</Button></div>
        {loadError ? <p role="alert">{loadError}</p> : !data ? <p role="status">Loading approved requests…</p> : !data.items.length ? <EmptyState title="No approved requests found" description="Approved competitive purchases appear here after their funding and source checks pass." />
          : <div className="overflow-x-auto"><RecordTable><thead><tr><th>Request</th><th>Item or service</th><th>Available</th><th>Approved estimate</th><th>Action</th></tr></thead><tbody>{data.items.map(row => <tr key={row.purchaseRequestLineId}>
            <td>{row.requestNumber}</td><td>{row.description ?? "Needs review"}</td><td>{row.availableQuantity ?? "—"} {row.unitCode}</td>
            <td>{row.approvedUnitEstimate ? `${row.currencyCode} ${row.approvedUnitEstimate}` : "—"}</td>
            <td><Button type="button" variant="secondary" disabled={!row.canSelect || selected.some(x => x.source.purchaseRequestLineId === row.purchaseRequestLineId)} onClick={() => choose(row)}>
              {row.state === "Unavailable" ? "Needs review" : row.state === "FullyAllocated" ? "Already assigned" : "Add line"}</Button></td></tr>)}</tbody></RecordTable></div>}
        {data && <><p className="text-sm text-muted-foreground">{data.candidateTotal} request lines to check. This includes lines needing review or already assigned.</p><Pager page={page} total={data.candidateTotal} size={data.pageSize} change={setPage} /></>}
      </div></Panel></div>
      <Panel title="Selected quantities"><div className="space-y-4 p-5">{!selected.length ? <p className="text-sm text-muted-foreground">Add lines from approved requests above.</p> : selected.map((row, index) => <div className="grid gap-3 sm:grid-cols-4" key={row.source.purchaseRequestLineId}>
        <div className="sm:col-span-2"><p>{row.source.description}</p><p className="text-sm text-muted-foreground">{row.source.requestNumber} · Available {row.source.availableQuantity} {row.source.unitCode}</p></div>
        <Field label={`Quantity for ${row.source.requestNumber}`}><Input required inputMode="decimal" value={row.quantity} onChange={e => setSelected(selected.map((item, at) => at === index ? { ...item, quantity: e.target.value } : item))} /></Field>
        <Button type="button" variant="ghost" onClick={() => setSelected(selected.filter((_, at) => at !== index))}>Remove line</Button></div>)}</div></Panel>
      <div className="sticky bottom-8 flex flex-wrap gap-3 border-t border-border bg-surface/95 py-4"><Button type="submit" disabled={busy || !selected.length}>Create internal draft</Button><Link to={listLink(mode)} onClick={event => { if (busy) event.preventDefault(); }} aria-disabled={busy}><Button variant="secondary" type="button" disabled={busy}>Back</Button></Link></div>
    </form>}
  </RfqWizardLayout>;
}
export function GovernedSourcingDetail({ id, mode = "worker" }: { id: string; mode?: RfqSourceMode }) {
  const { capabilities } = useCompany();
  if (mode === "principal" && capabilities.principalSourcingPublication)
    return <PrincipalPublicationDetail id={id} />;
  return <GovernedSourcingDraftDetail id={id} mode={mode} />;
}
function GovernedSourcingDraftDetail({ id, mode }: { id: string; mode: RfqSourceMode }) {
  const slot = useCommandSlot(`Cancel:${id}`, mode); const working = useRef(false); const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const { legalEntityId, permissions } = useCompany(); const [record, setRecord] = useState<RfqDetail | null>(null), [error, setError] = useState("");
  const [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  const [journal] = useState(() => {
    try {
      const reference = readRfqRecovery(slot);
      if (!reference && pendingRfqCommands.has(slot)) throw new Error("The original save reference is missing from recovery storage. No new save will be sent. Ask Procurement to reconcile the saved result.");
      return { reference, error: "" };
    }
    catch (error) { return { reference: null, error: message(error) }; }
  });
  const [pending, setPendingState] = useState<RfqRecoveryReference | null>(journal.reference);
  function setPending(value: RfqCommand | null) {
    const reference = value ? rfqRecoveryReference(value) : null;
    // Complete and verify the durable write before any POST. Restored locators
    // cannot be passed to sendRfqCommand: only the original in-memory body can.
    writeRfqRecovery(slot, reference);
    if (value) pendingRfqCommands.set(slot, value); else pendingRfqCommands.delete(slot);
    if (live.current) setPendingState(reference);
  }
  useEffect(() => { const controller = new AbortController(); setRecord(null); setError("");
    getGovernedRfq(legalEntityId, id, controller.signal, mode).then(value => { if (!controller.signal.aborted) setRecord(value); })
      .catch(error => { if (!controller.signal.aborted) setError(message(error)); }); return () => controller.abort();
  }, [legalEntityId, id, refresh, mode]);
  async function cancel() {
    if (journal.error || !record || pending || working.current || !permissions.includes("procurement-sourcing-cancel")) return; setError(""); let command: RfqCommand;
    try { command = cancelRfqCommand(record, reason, crypto.randomUUID(), mode); } catch (error) { setError(message(error)); return; }
    try { setPending(command); } catch (error) { setError(message(error)); return; }
    working.current = true; setBusy(true);
    try { await sendRfqCommand(legalEntityId, command); setPending(null); setReason(""); setRefresh(value => value + 1); }
    catch (error) {
      // A validated 400/422 rejection did not apply this command: retain the reason
      // for correction and require a fresh explicit submission. Unknown outcomes
      // keep their original UUID and expose GET-only recovery instead.
      if (error instanceof RfqExecutionError && (error.status === 400 || error.status === 422)) {
        try { setPending(null); } catch (journalError) { setError(message(journalError)); return; }
      }
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
  if (journal.error) return <div className="p-5 sm:p-8"><p role="alert">{journal.error}</p></div>;
  if (!record) return <div className="p-5 sm:p-8">{error ? <p role="alert">{error}</p> : <p role="status">Loading quote request…</p>}{pending && <Pending command={pending} busy={busy} error={error} check={() => void recover()} />}</div>;
  return <RfqDetailLayout title={record.title} number={record.number} method={record.method} currency={record.currencyCode} status={record.status} back={listLink(mode)}
    actions={<Button variant="secondary" disabled title="Publishing and invitations are not available yet">Publish</Button>}
    related={<div className="mb-4"><p className="mb-2 text-sm font-medium">Approved purchase requests</p><ul className="space-y-1 text-sm">{[...new Set(record.lines.map(line => line.purchaseRequestId))].map(sourceId =>
      <li key={sourceId}>{permissions.includes("procurement-request-read") ? <Link className="text-primary underline" to={`/requests/${sourceId}`}>{sourceId}</Link> : sourceId}</li>)}</ul></div>}
    itemCount={record.lines.length}
    items={<div className="overflow-x-auto"><RecordTable><thead><tr><th>Item or service</th><th>Quantity</th><th>Unit</th><th>Approved estimate</th><th>Draft balance</th></tr></thead><tbody>{record.lines.map(row => <tr key={row.id}>
      <td>{row.description}</td><td>{row.quantity}</td><td>{row.unitCode}</td><td>{record.currencyCode} {row.approvedUnitEstimate}</td><td>{row.allocationState === "Reserved" ? "Held for this draft" : "Released"}</td></tr>)}</tbody></RecordTable></div>}
    overview={<>
    <div className="grid gap-5 lg:grid-cols-3"><DetailSection title="Quote details" className="lg:col-span-2"><dl className="grid gap-4 sm:grid-cols-2"><DetailValue label="Reference" value={record.number} /><DetailValue label="Method" value={record.method} /><DetailValue label="Currency" value={record.currencyCode} /></dl></DetailSection>
      <DetailSection title="Source"><p className="text-sm text-muted-foreground">This draft uses approved purchase request quantities. Cancelling releases its held quantities.</p></DetailSection></div>
    <DetailSection title="Next step" className="mt-5"><p className="text-sm text-muted-foreground">Sending to vendors, invitations, bids, evaluation and award are not available yet. No Finance reservation was changed.</p></DetailSection>
    {record.cancellationReason && <Panel title="Cancellation reason" className="mt-5"><p className="p-5">{record.cancellationReason}</p></Panel>}
    {pending ? <div className="mt-5"><Pending command={pending} busy={busy} error={error} check={() => void recover()} /></div> : record.status === "Draft" && permissions.includes("procurement-sourcing-cancel") && <Panel title="Cancel this internal draft" className="mt-5"><div className="space-y-3 p-5">
      {error && <p role="alert">{error}</p>}<Field label="Reason"><Textarea maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></Field>
      <Button variant="danger" disabled={busy || !reason.trim()} onClick={() => void cancel()}>Cancel draft and release its quantities</Button></div></Panel>}
    </>} />;
}
