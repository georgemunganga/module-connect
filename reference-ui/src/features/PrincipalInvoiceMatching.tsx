import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Field, Input, Panel, Select, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useErpShell } from "../lib/erpShell";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { claimPrincipalInvoicePending, clearPrincipalInvoicePending, readPrincipalInvoicePending } from "../lib/principal-invoice-command-memory";
import { listInvoiceDocuments, type InvoiceDocument } from "../../../src/platform/procurement-invoices-api";
import { getPrincipalInvoiceState, listPrincipalAcceptances, listPrincipalInvoiceSources,
  recoverPrincipalInvoiceCommand, sendPrincipalInvoiceCommand, PrincipalInvoiceError,
  type PrincipalInvoiceLocator, type PrincipalInvoiceMappingLine, type PrincipalInvoiceSource,
  type PrincipalInvoiceSourcePage, type PrincipalAcceptance, type PrincipalInvoiceState,
} from "../../../src/platform/procurement-principal-invoice-api";

type Line = { id: string; lineNumber: number; description: string };
type LinkDraft = { source: PrincipalInvoiceSource; acceptance: PrincipalAcceptance | null;
  unit: string; document: string; reference: string };
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : "The invoice action could not be confirmed.";

/** Fits inside the imported Bill detail Overview; the legacy comparison remains separate. */
export function PrincipalInvoiceMatching({ invoiceId, invoiceVersion, lines, refresh }: {
  invoiceId: string; invoiceVersion: number; lines: Line[]; refresh: (message?: string) => void;
}) {
  const context = useLiveReadiness()!, { selection } = useErpShell(), company = context.legalEntityId;
  const canRead = context.capabilities.principalInvoiceMatching && context.permissions.includes("procurement-invoice-read")
    && context.permissions.includes("procurement-invoice-match");
  const canMap = canRead && context.permissions.includes("procurement-invoice-capture");
  const canOpen = canRead && context.permissions.includes("procurement-invoice-unit-review-request");
  const scope = JSON.stringify([context.tenantId, company, selection.entityId ?? "", selection.branch ?? "",
    context.principalId, invoiceId, "principal-matching"]);
  const [pending, setPending] = useState(() => readPrincipalInvoicePending(scope));
  const [state, setState] = useState<PrincipalInvoiceState | null>(null);
  const [sources, setSources] = useState<PrincipalInvoiceSourcePage | null>(null);
  const [documents, setDocuments] = useState<InvoiceDocument[]>([]);
  const [drafts, setDrafts] = useState<Record<string, LinkDraft>>({});
  const [activeLine, setActiveLine] = useState(lines[0]?.id ?? "");
  const [acceptances, setAcceptances] = useState<PrincipalAcceptance[] | null>(null);
  const [page, setPage] = useState(1), [search, setSearch] = useState(""), [query, setQuery] = useState("");
  const [reason, setReason] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [editing, setEditing] = useState(false);
  const inFlight = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!canRead) return;
    const abort = new AbortController(); setState(null); setLoading(true); setError("");
    getPrincipalInvoiceState(company, invoiceId, abort.signal)
      .then(value => { if (!abort.signal.aborted) setState(value); })
      .catch(cause => { if (!abort.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [canRead, company, invoiceId, invoiceVersion]);
  useEffect(() => {
    if (!editing || !canMap || pending.blocked) return;
    const abort = new AbortController(); setSources(null);
    listPrincipalInvoiceSources(company, invoiceId, page, query, abort.signal)
      .then(value => { if (!abort.signal.aborted) {
        if (value.invoiceVersion !== invoiceVersion) throw new Error("The original bill changed. Refresh before linking it.");
        setSources(value);
      } }).catch(cause => { if (!abort.signal.aborted) setError(errorText(cause)); });
    return () => abort.abort();
  }, [editing, canMap, pending.blocked, company, invoiceId, invoiceVersion, page, query]);
  useEffect(() => {
    if (!editing || !canMap || !context.capabilities.invoiceDocuments) return;
    const abort = new AbortController(); setDocuments([]);
    listInvoiceDocuments(company, invoiceId, abort.signal)
      .then(value => { if (!abort.signal.aborted) setDocuments(value.items); })
      .catch(cause => { if (!abort.signal.aborted) setError(errorText(cause)); });
    return () => abort.abort();
  }, [editing, canMap, company, invoiceId, context.capabilities.invoiceDocuments]);
  const selected = drafts[activeLine];
  useEffect(() => {
    if (!selected || !editing || pending.blocked) return;
    const abort = new AbortController(); setAcceptances(null);
    listPrincipalAcceptances(company, invoiceId, selected.source, abort.signal)
      .then(value => { if (!abort.signal.aborted) setAcceptances(value); })
      .catch(cause => { if (!abort.signal.aborted) setError(errorText(cause)); });
    return () => abort.abort();
  }, [company, invoiceId, editing, activeLine, selected?.source.purchaseOrderLineId, pending.blocked]);
  function choose(source: PrincipalInvoiceSource) {
    const first = Object.values(drafts)[0];
    if (first && (first.source.orderId !== source.orderId || first.source.issuedVersionId !== source.issuedVersionId)) {
      setError("All bill lines must link to the same issued order. Clear the draft links to choose another order."); return;
    }
    setDrafts(all => ({ ...all, [activeLine]: { source, acceptance: null, unit: "", document: "", reference: "" } }));
    setAcceptances(null); setError("");
  }
  function update(change: Partial<LinkDraft>) { setDrafts(all => all[activeLine]
    ? { ...all, [activeLine]: { ...all[activeLine], ...change } } : all); }
  async function refreshState() {
    const value = await getPrincipalInvoiceState(company, invoiceId);
    if (alive.current) setState(value);
    return value;
  }
  async function execute(locator: PrincipalInvoiceLocator, body: Record<string, unknown>) {
    if (inFlight.current || busy || pending.blocked) return;
    inFlight.current = true;
    if (!claimPrincipalInvoicePending(scope, locator)) {
      inFlight.current = false; setPending(readPrincipalInvoicePending(scope));
      setError("A previous invoice action needs checking before another change."); return;
    }
    setPending(readPrincipalInvoicePending(scope)); setBusy(true); setError("");
    try {
      const receipt = await sendPrincipalInvoiceCommand(company, locator, body);
      if (!clearPrincipalInvoicePending(scope, locator)) throw new Error("The saved result was confirmed, but its browser recovery marker could not be cleared.");
      if (alive.current) { setPending(readPrincipalInvoicePending(scope)); setEditing(false); setDrafts({});
        setNotice(`${String(receipt.state)} recorded. Invoice approval and Finance remain separate.`);
        await refreshState(); refresh("Invoice evidence recorded."); }
    } catch (cause) {
      // Only definite input rejection is correctable without checking the original key.
      if (cause instanceof PrincipalInvoiceError && [400, 422].includes(cause.status)) clearPrincipalInvoicePending(scope, locator);
      if (alive.current) { setPending(readPrincipalInvoicePending(scope)); setError(errorText(cause)); }
    } finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  async function recover() {
    let locator = pending.locator;
    if (!locator || inFlight.current || busy) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const current = await refreshState();
      // OpenReview's ID is assigned by the server. A current status supplies the
      // route only; the actor-owned original-key receipt proves this POST.
      if (locator.operation === "OpenReview") {
        if (!current.reviewId || current.mappingVersionId !== locator.mappingVersionId)
          throw new Error("The review reference is not available. Ask an administrator to inspect the saved action.");
        locator = { ...locator, reviewId: current.reviewId };
      }
      const result = await recoverPrincipalInvoiceCommand(company, locator);
      if (!clearPrincipalInvoicePending(scope, pending.locator!)) throw new Error("The original action was found, but browser recovery remains locked.");
      if (alive.current) { setPending(readPrincipalInvoicePending(scope)); setNotice(`Saved ${String(result.state)} action found.`); refresh(); }
    } catch (cause) { if (alive.current) setError(errorText(cause)); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (!state || !canMap || state.invoiceVersion !== invoiceVersion || !["Unmapped", "Mapped"].includes(state.state)) return;
    try {
      if (lines.length < 1 || lines.some(line => !drafts[line.id]) || Object.keys(drafts).length !== lines.length)
        throw new Error("Choose an issued order line for every original bill line.");
      const first = drafts[lines[0].id];
      const mapped: PrincipalInvoiceMappingLine[] = lines.map(line => {
        const draft = drafts[line.id], acceptance = draft.acceptance;
        if (draft.source.orderId !== first.source.orderId || draft.source.issuedVersionId !== first.source.issuedVersionId
          || !draft.unit.trim() || !draft.document || !draft.reference.trim()
          || !documents.some(doc => doc.versionId === draft.document && doc.canDownload))
          throw new Error("Check the issued order, original document and unit on every bill line.");
        return { invoiceLineId: line.id, purchaseOrderLineId: draft.source.purchaseOrderLineId,
          principalReceivingSourceStateId: acceptance?.principalReceivingSourceStateId ?? null,
          principalAcceptanceFactId: acceptance?.principalAcceptanceFactId ?? null,
          acceptanceSequence: acceptance?.sourceSequence ?? null, invoiceUnitCode: draft.unit.trim(),
          documentVersionId: draft.document, documentLineReference: draft.reference.trim() };
      });
      const locator: PrincipalInvoiceLocator = { operation: "Map", invoiceId, key: crypto.randomUUID(), invoiceVersion,
        mappingRevision: state.mappingRevision, mappingVersionId: null, reviewId: null, reviewOutcomeId: null,
        orderId: first.source.orderId, issuedVersionId: first.source.issuedVersionId };
      void execute(locator, { invoiceVersion, expectedMappingRevision: state.mappingRevision,
        expectedStateVersion: state.stateVersion, purchaseOrderId: first.source.orderId,
        principalIssuedVersionId: first.source.issuedVersionId, lines: mapped });
    } catch (cause) { setError(errorText(cause)); }
  }
  function openReview() {
    if (!state || !canOpen || state.state !== "Mapped" || !state.mappingVersionId) return;
    void execute({ operation: "OpenReview", invoiceId, key: crypto.randomUUID(), invoiceVersion,
      mappingRevision: state.mappingRevision, mappingVersionId: state.mappingVersionId,
      reviewId: null, reviewOutcomeId: null, orderId: null, issuedVersionId: null },
    { invoiceVersion, mappingRevision: state.mappingRevision, reason: reason.trim() || null });
  }
  function compare() {
    if (!state || state.state !== "Reviewed" || !state.mappingVersionId || !state.reviewOutcomeId
      || !state.exposureVersion || !canRead) return;
    void execute({ operation: "Compare", invoiceId, key: crypto.randomUUID(), invoiceVersion,
      mappingRevision: state.mappingRevision, mappingVersionId: state.mappingVersionId,
      reviewId: state.reviewId, reviewOutcomeId: state.reviewOutcomeId, orderId: null, issuedVersionId: null },
    { invoiceVersion, mappingVersionId: state.mappingVersionId, reviewOutcomeId: state.reviewOutcomeId,
      exposureVersion: state.exposureVersion, reason: reason.trim() || null });
  }
  if (!canRead) return null;
  return <Panel title="Issued order and original bill checks" className="mt-5"><div className="space-y-4 p-5 text-sm">
    <p>Link original bill lines to an issued order. An independent person checks the original document before comparison. This does not approve the bill or send it to Finance.</p>
    {loading && <p role="status">Loading saved bill checks…</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {state && <p>Current step: <Badge>{state.state === "Unmapped" ? "Not linked" : state.state === "LegacyWorkflow" ? "Existing bill workflow" : state.state === "Mapped" ? "Original review needed" : state.state === "Reviewed" ? "Ready to compare" : "Comparison recorded"}</Badge></p>}
    {state?.state === "LegacyWorkflow" && <p>This bill already uses the existing invoice comparison. Its saved history remains available above.</p>}
    {state && state.invoiceVersion !== invoiceVersion && <p role="alert">The bill changed. Refresh its details before continuing.</p>}
    {pending.blocked && <div className="space-y-2"><p role="alert">A prior change has an unconfirmed result. Another change is blocked.</p>
      {pending.locator ? <Button variant="secondary" disabled={busy} onClick={() => void recover()}>Check saved action</Button>
        : <p>The saved recovery information cannot be read in this tab. Ask an administrator to inspect the history.</p>}</div>}
    {!pending.blocked && state?.invoiceVersion === invoiceVersion && <>
      {canMap && ["Unmapped", "Mapped"].includes(state.state) && !editing && <Button variant="secondary" disabled={busy} onClick={() => setEditing(true)}>Link bill lines</Button>}
      {editing && canMap && ["Unmapped", "Mapped"].includes(state.state) && <form onSubmit={save} className="space-y-4">
        <div className="flex flex-wrap items-end gap-3"><Field label="Bill line"><Select value={activeLine} disabled={busy} onChange={event => setActiveLine(event.target.value)}>
          {lines.map(line => <option key={line.id} value={line.id}>Line {line.lineNumber} · {line.description}</option>)}</Select></Field>
          <Field label="Find order or item"><Input value={search} maxLength={120} disabled={busy} onChange={event => setSearch(event.target.value)} /></Field>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => { setQuery(search.trim()); setPage(1); }}>Search sources</Button></div>
        {sources?.items.length ? <div className="overflow-x-auto"><RecordTable><thead><tr><th>Order</th><th>Item or service</th><th>Quantity</th><th>Unit price</th><th>Action</th></tr></thead>
          <tbody>{sources.items.map(source => <tr key={`${source.issuedVersionId}:${source.purchaseOrderLineId}`}><td>{source.orderNumber}</td><td>{source.description}</td>
            <td>{source.quantity} {source.unitCode}</td><td>{source.unitPrice}</td><td><Button type="button" variant="secondary" disabled={busy}
              onClick={() => choose(source)}>Choose source</Button></td></tr>)}</tbody></RecordTable></div> : sources && <p>No compatible issued order lines found.</p>}
        {sources && <div className="flex gap-3"><Button type="button" variant="secondary" disabled={busy || page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span>Page {page}</span><Button type="button" variant="secondary" disabled={busy || page * sources.pageSize >= sources.total} onClick={() => setPage(page + 1)}>Next</Button></div>}
        {selected && <div className="space-y-4 rounded-lg border border-border p-4"><p>{selected.source.orderNumber} · {selected.source.description}</p>
          <p>Receipt entries are recorded history. They do not establish remaining invoice capacity.</p>
          <Field label="Goods or service acceptance, if required by the buying rules"><Select value={selected.acceptance?.principalAcceptanceFactId ?? ""} disabled={busy || acceptances === null}
            onChange={event => update({ acceptance: acceptances?.find(item => item.principalAcceptanceFactId === event.target.value) ?? null })}>
            <option value="">No acceptance selected</option>{acceptances?.map(item => <option key={item.principalAcceptanceFactId} value={item.principalAcceptanceFactId}>
              {item.acceptanceReference} · {item.acceptedQuantity} · {item.kind}</option>)}</Select></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Unit on original bill"><Input maxLength={20} value={selected.unit} disabled={busy} onChange={event => update({ unit: event.target.value })} /></Field>
            <Field label="Checked original document"><Select value={selected.document} disabled={busy} onChange={event => update({ document: event.target.value })}><option value="">Choose document</option>
              {documents.filter(item => item.canDownload).map(item => <option key={item.versionId} value={item.versionId}>{item.fileName} · Version {item.versionNumber}</option>)}</Select></Field>
            <Field label="Document page or line"><Input maxLength={200} value={selected.reference} disabled={busy} onChange={event => update({ reference: event.target.value })} /></Field></div>
          {!documents.some(item => item.canDownload) && <p>Add the original bill document and wait for its security check before saving links.</p>}
        </div>}
        <p>Linked lines: {Object.keys(drafts).length} of {lines.length}.</p>
        <div className="flex gap-3"><Button type="submit" disabled={busy || lines.some(line => !drafts[line.id])}>Save line links</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => { setDrafts({}); setAcceptances(null); }}>Clear draft links</Button></div>
      </form>}
      {state.state === "Mapped" && !editing && <div className="space-y-3"><p>Saved links are not verified original units.</p>
        {state.reviewId ? <Link className="text-primary underline" to={`/approvals/principal-unit-review/${state.reviewId}`}>Open original review</Link>
          : canOpen && <><Field label="Review note (optional)"><Textarea maxLength={2000} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></Field>
            <Button disabled={busy} onClick={openReview}>Request original unit review</Button></>}</div>}
      {state.state === "Reviewed" && <div className="space-y-3"><p>The independent original unit decision is recorded. Comparison will recheck the issued order and all claims.</p>
        <Field label="Comparison note (optional)"><Textarea maxLength={2000} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></Field>
        <Button disabled={busy || !state.exposureVersion} onClick={compare}>Compare original bill with order</Button></div>}
      {state.state === "Compared" && <p>A commercial quantity claim was recorded. Finance posting and payment are separate.</p>}
    </>}
  </div></Panel>;
}
