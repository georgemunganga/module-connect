import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge, Button, Field, Input, Panel, Select, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { useErpShell } from "../lib/erpShell";
import { readPendingInvoiceMatching, claimPendingInvoiceMatching, clearPendingInvoiceMatching } from "../lib/invoice-matching-command-memory";
import { invoiceMappingNewWorkAllowed, principalHistoryCorrection, principalNewWorkBlocked } from "../lib/invoice-principal-history-lock";
import { listInvoiceDocuments, type InvoiceDocument } from "../../../src/platform/procurement-invoices-api";
import type { InvoiceFinanceReadiness } from "../../../src/platform/procurement-invoice-review-api";
import { invoiceMappingCommand, principalInvoiceMappingCommand, invoiceCompareCommand, invoiceMatchingRecovery,
  listInvoiceSources, listInvoiceAcceptances, listPrincipalInvoiceSources, listPrincipalInvoiceAcceptances, sendInvoiceMatching, recoverInvoiceMatching,
  canReleaseInvoiceMatchingPending,
  type InvoiceSource, type InvoiceSourcePage, type InvoiceAcceptance, type InvoiceAcceptancePage, type InvoiceMatchingCommand,
  type InvoiceMatchingReply, type InvoiceMatchingRecovery } from "../../../src/platform/procurement-invoice-matching-api";

type LinkDraft = { source: InvoiceSource; policy: string; acceptance: InvoiceAcceptance | null; unit: string; document: string; reference: string };
const causeText = (cause: unknown) => cause instanceof Error ? cause.message : "The invoice action was not confirmed.";
const emptyId = "00000000-0000-0000-0000-000000000000";
const outcomeText = (result: InvoiceMatchingReply) => result.outcome === "MappingUnverified" ? "Line links saved. Original units and documents still need verified review."
  : result.outcome === "Blocked" ? "Comparison recorded. Review the saved issues before continuing." : "Comparison recorded. Invoice approval and Finance posting are separate.";
export function InvoiceMatchingPanel({ invoiceId, invoiceVersion, lines, readiness, currentMappingId, currentMappingOriginalCurrent, currentMappingSchema, principalNewWorkLocked, refresh }: {
  invoiceId: string; invoiceVersion: number; lines: { id: string; lineNumber: number; description: string }[];
  readiness: InvoiceFinanceReadiness | null; currentMappingId: string | null; currentMappingOriginalCurrent: boolean;
  currentMappingSchema: 3 | null | undefined; principalNewWorkLocked: boolean; refresh: (message?: string) => void;
}) {
  const context = useLiveReadiness()!, { selection } = useErpShell(), company = context.legalEntityId;
  const principalWrite = context.capabilities.principalInvoiceComparison === true;
  const legacyWrite = context.capabilities.invoiceComparison === true;
  const canSelect = context.permissions.includes("procurement-invoice-read") && context.permissions.includes("procurement-invoice-match")
    && (principalWrite || legacyWrite);
  const canMap = canSelect && context.permissions.includes("procurement-invoice-capture")
    && invoiceMappingNewWorkAllowed(currentMappingSchema, principalWrite, legacyWrite, principalNewWorkLocked);
  const canCompare = canSelect && (currentMappingSchema === 3
    ? principalWrite && !principalNewWorkBlocked(true, principalNewWorkLocked)
    : currentMappingSchema === null && legacyWrite);
  const scopeKey = JSON.stringify([context.tenantId, company, selection.entityId, selection.branch, context.principalId, invoiceId]);
  const [pendingState, setPendingState] = useState(() => readPendingInvoiceMatching(scopeKey));
  const uncertain = pendingState.command;
  const commandBlocked = pendingState.blocked;
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, LinkDraft>>({}), [activeLine, setActiveLine] = useState(lines[0]?.id ?? "");
  const [sources, setSources] = useState<InvoiceSourcePage | null>(null), [sourceLoading, setSourceLoading] = useState(false);
  const [sourcePage, setSourcePage] = useState(1), [search, setSearch] = useState(""), [query, setQuery] = useState("");
  const [acceptances, setAcceptances] = useState<InvoiceAcceptancePage | null>(null), [acceptancePage, setAcceptancePage] = useState(1), [acceptanceLoading, setAcceptanceLoading] = useState(false);
  const [documents, setDocuments] = useState<InvoiceDocument[]>([]), [reason, setReason] = useState("");
  const alive = useRef(true), operationInFlight = useRef(false); useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const selected = drafts[activeLine];
  useEffect(() => {
    const abort = new AbortController(); setSources(null); setSourceLoading(false);
    if (!editing || !canMap || commandBlocked) return () => abort.abort();
    setSourceLoading(true);
    (principalWrite
      ? listPrincipalInvoiceSources(context.tenantId, company, selection.branch ?? "", invoiceId,
        invoiceVersion, sourcePage, query, abort.signal)
      : listInvoiceSources(company, invoiceId, invoiceVersion, sourcePage, query, abort.signal))
      .then((result) => { if (!abort.signal.aborted) {
        setSources(result);
        // A changed policy invalidates dependent hints, never silently migrates saved choices.
        if (Object.values(drafts).some((draft) => draft.policy !== result.policyVersionId)) {
          setDrafts({}); setAcceptances(null); setError("The comparison rules changed. Choose the invoice links again.");
        }
      } })
      .catch((cause) => { if (!abort.signal.aborted) setError(causeText(cause)); })
      .finally(() => { if (!abort.signal.aborted) setSourceLoading(false); });
    return () => abort.abort();
  }, [company, invoiceId, invoiceVersion, editing, canMap, principalWrite, context.tenantId, selection.branch, sourcePage, query, commandBlocked]);
  useEffect(() => {
    const abort = new AbortController(); setDocuments([]);
    if (!editing || !canMap || !context.capabilities.invoiceDocuments) return () => abort.abort();
    listInvoiceDocuments(company, invoiceId, abort.signal).then((result) => { if (!abort.signal.aborted) setDocuments(result.items); })
      .catch((cause) => { if (!abort.signal.aborted) setError(causeText(cause)); });
    return () => abort.abort();
  }, [company, invoiceId, editing, canMap, context.capabilities.invoiceDocuments]);
  useEffect(() => {
    const abort = new AbortController(); setAcceptances(null); setAcceptanceLoading(false);
    if (!editing || !selected || selected.source.method !== "ThreeWay" || commandBlocked) return () => abort.abort();
    setAcceptanceLoading(true);
    (principalWrite
      ? listPrincipalInvoiceAcceptances(company, invoiceId, invoiceVersion, selected.policy, selected.source, acceptancePage, "", abort.signal)
      : listInvoiceAcceptances(company, invoiceId, invoiceVersion, selected.policy, selected.source, acceptancePage, "", abort.signal))
      .then((result) => { if (!abort.signal.aborted) setAcceptances(result); })
      .catch((cause) => { if (!abort.signal.aborted) setError(causeText(cause)); })
      .finally(() => { if (!abort.signal.aborted) setAcceptanceLoading(false); });
    return () => abort.abort();
  }, [company, invoiceId, invoiceVersion, editing, principalWrite, activeLine, selected?.policy, selected?.source.orderId, selected?.source.issuedVersionId, selected?.source.purchaseOrderLineId, acceptancePage, commandBlocked]);
  const update = (change: Partial<LinkDraft>) => setDrafts((all) => all[activeLine] ? { ...all, [activeLine]: { ...all[activeLine], ...change } } : all);
  function choose(source: InvoiceSource) {
    if (!sources || source.sourceState !== "VerifiedIssued" || source.blocker || !source.method
      || principalWrite && source.sourceSchemaVersion !== 3 || !principalWrite && source.sourceSchemaVersion === 3) return;
    const another = Object.entries(drafts).find(([line]) => line !== activeLine)?.[1];
    if (another && (another.source.orderId !== source.orderId || another.source.issuedVersionId !== source.issuedVersionId || another.policy !== sources.policyVersionId)) {
      setError("All invoice lines must link to the same issued order. Clear the draft links before choosing another order."); return;
    }
    setError(""); setAcceptancePage(1); setAcceptances(null);
    setDrafts((all) => ({ ...all, [activeLine]: { source, policy: sources.policyVersionId, acceptance: null, unit: "", document: "", reference: "" } }));
  }
  async function execute(command: InvoiceMatchingCommand) {
    if (operationInFlight.current || busy || commandBlocked
      || principalNewWorkBlocked(command.sourceSchemaVersion === 3, principalNewWorkLocked)) return;
    operationInFlight.current = true;
    let locator: InvoiceMatchingRecovery;
    try { locator = invoiceMatchingRecovery(command); }
    catch (cause) { operationInFlight.current = false; setError(causeText(cause)); return; }
    if (!claimPendingInvoiceMatching(scopeKey, locator)) {
      operationInFlight.current = false;
      setPendingState(readPendingInvoiceMatching(scopeKey));
      setError("The saved action cannot be checked in this browser tab. Open the invoice again before making another change.");
      return;
    }
    setPendingState(readPendingInvoiceMatching(scopeKey)); setBusy(true); setError("");
    try {
      const result = await sendInvoiceMatching(company, command);
      clearPendingInvoiceMatching(scopeKey, locator);
      if (alive.current) { setPendingState(readPendingInvoiceMatching(scopeKey)); refresh(outcomeText(result)); }
    } catch (cause) {
      // Only a definite validation rejection can release a command marker.
      // Scope, conflict and transport failures may leave a server receipt.
      if (canReleaseInvoiceMatchingPending(command, cause)) clearPendingInvoiceMatching(scopeKey, locator);
      if (alive.current) {
        setPendingState(readPendingInvoiceMatching(scopeKey)); setError(causeText(cause));
        setDrafts({}); setSources(null); setAcceptances(null); setEditing(false);
      }
    } finally { operationInFlight.current = false; if (alive.current) setBusy(false); }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    try {
      const links = lines.map((line) => {
        const draft = drafts[line.id];
        if (!draft || principalWrite && draft.source.sourceSchemaVersion !== 3 || !principalWrite && draft.source.sourceSchemaVersion === 3
          || !draft.unit.trim() || (!principalWrite && (!draft.reference.trim()
          || !documents.some((document) => document.versionId === draft.document && document.scanState === "Available")))
          || principalWrite && Boolean(draft.reference.trim()) !== Boolean(draft.document)
          || principalWrite && Boolean(draft.document) && !documents.some((document) => document.versionId === draft.document && document.scanState === "Available")
          || !principalWrite && draft.source.method === "ThreeWay" && !draft.acceptance) throw new Error(principalWrite
            ? "Choose an issued source, original unit and any required accepted fact for every invoice line. If you choose a checked document, enter its line reference."
            : "Choose a source, checked document, original unit and document line for every invoice line.");
        return { invoiceLineId: line.id, purchaseOrderLineId: draft.source.purchaseOrderLineId,
          goodsReceiptLineId: draft.acceptance?.goodsReceiptLineId ?? null, serviceAcceptanceId: draft.acceptance?.serviceAcceptanceId ?? null,
          principalReceivingSourceStateId: draft.acceptance?.principalReceivingSourceStateId ?? null,
          principalReceivingFactId: draft.acceptance?.principalReceivingFactId ?? null,
          invoiceUnitCode: draft.unit, documentVersionId: principalWrite && !draft.document ? emptyId : draft.document,
          documentLineReference: principalWrite && !draft.reference.trim() ? "" : draft.reference };
      });
      const first = drafts[lines[0]?.id];
      if (!first || Object.values(drafts).some((d) => d.source.orderId !== first.source.orderId || d.source.issuedVersionId !== first.source.issuedVersionId || d.policy !== first.policy)) throw new Error("Choose one issued order for this invoice.");
      if (principalWrite) void execute(principalInvoiceMappingCommand(invoiceId, lines.map((l) => l.id), {
        version: invoiceVersion, purchaseOrderId: first.source.orderId, issuedVersionId: first.source.issuedVersionId,
        lines: links.map((link) => ({ invoiceLineId: link.invoiceLineId, purchaseOrderLineId: link.purchaseOrderLineId,
          principalReceivingSourceStateId: link.principalReceivingSourceStateId, principalReceivingFactId: link.principalReceivingFactId,
          invoiceUnitCode: link.invoiceUnitCode, documentVersionId: link.documentVersionId,
          documentLineReference: link.documentLineReference })) }, crypto.randomUUID()));
      else void execute(invoiceMappingCommand(invoiceId, lines.map((l) => l.id), { version: invoiceVersion,
        purchaseOrderId: first.source.orderId, issuedVersionId: first.source.issuedVersionId,
        lines: links.map((link) => ({ invoiceLineId: link.invoiceLineId, purchaseOrderLineId: link.purchaseOrderLineId,
          goodsReceiptLineId: link.goodsReceiptLineId, serviceAcceptanceId: link.serviceAcceptanceId,
          invoiceUnitCode: link.invoiceUnitCode, documentVersionId: link.documentVersionId,
          documentLineReference: link.documentLineReference })) }, crypto.randomUUID()));
    } catch (cause) { setError(causeText(cause)); }
  }
  function compare() {
    try {
      if (!canCompare) throw new Error("This invoice mapping is available to read, but comparison changes are not enabled for it.");
      const mappingId = currentMappingSchema === 3 ? currentMappingId : readiness?.evidence.mappingVersionId;
      if (!mappingId) throw new Error("Save and refresh the invoice line links first.");
      void execute(invoiceCompareCommand(invoiceId, lines.map((l) => l.id), { version: invoiceVersion, mappingVersionId: mappingId, reason: reason.trim() || null }, crypto.randomUUID(),
        currentMappingSchema === 3 ? 3 : undefined));
    } catch (cause) { setError(causeText(cause)); }
  }
  async function recover() {
    if (!uncertain || busy || operationInFlight.current) return;
    operationInFlight.current = true; setBusy(true); setError("");
    try { const result = await recoverInvoiceMatching(company, uncertain); clearPendingInvoiceMatching(scopeKey, uncertain); if (alive.current) { setPendingState(readPendingInvoiceMatching(scopeKey)); refresh(`Saved result found. ${outcomeText(result)}`); } }
    catch (cause) { if (alive.current) setError(causeText(cause)); }
    finally { operationInFlight.current = false; if (alive.current) setBusy(false); }
  }
  if (!canSelect && !context.permissions.includes("procurement-invoice-capture") && !commandBlocked) return null;
  return <Panel title="Invoice line links and checks"><div className="space-y-4 p-5">
    <p className="text-sm text-muted-foreground">Link the original lines to their order and receipt evidence. Saving links does not verify units, approve the invoice or send it to Finance.</p>
    {principalWrite && principalNewWorkLocked && <p role="status" className="text-sm">{principalHistoryCorrection}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {commandBlocked ? <div className="space-y-3"><p>The previous response was interrupted. Check its saved result before another change.</p>
      {uncertain ? <Button variant="secondary" disabled={busy} onClick={recover}>Check saved invoice action</Button>
        : <p role="alert">This browser cannot safely recover the previous action. Ask an administrator to review the invoice history.</p>}</div> : <>
      {!canSelect && <p className="text-sm">Invoice comparison access is needed to select order and receipt evidence. You can still capture invoices and manage permitted documents.</p>}
      {canMap && !editing && <Button variant="secondary" disabled={busy} onClick={() => { setEditing(true); setError(""); }}>Link invoice lines</Button>}
      {editing && canMap && <form onSubmit={save} className="space-y-4">
        <div className="flex flex-wrap items-end gap-3"><Field label="Invoice line"><Select value={activeLine} disabled={busy} onChange={(e) => { setActiveLine(e.target.value); setAcceptancePage(1); setAcceptances(null); }}>
          {lines.map((line) => <option key={line.id} value={line.id}>Line {line.lineNumber} · {line.description}</option>)}</Select></Field>
          <Field label="Find order or item"><Input value={search} maxLength={120} disabled={busy} onChange={(e) => setSearch(e.target.value)} /></Field>
          <Button type="button" variant="secondary" disabled={busy || sourceLoading} onClick={() => { setQuery(search.trim()); setSourcePage(1); }}>Search sources</Button></div>
        {sourceLoading ? <p role="status">Loading matching sources…</p> : sources && <>
          {sources.items.length ? <div className="overflow-x-auto"><RecordTable><thead><tr><th>Order</th><th>Item or service</th><th>Ordered quantity</th><th>Unit price</th><th>Action</th></tr></thead><tbody>{sources.items.map((source) =>
            <tr key={`${source.issuedVersionId}:${source.purchaseOrderLineId}`}><td>{source.orderNumber}</td><td>{source.description}</td><td>{source.quantity ?? "Unavailable"} {source.unitCode}</td><td>{source.unitPrice ?? "Unavailable"}</td><td>
              {source.sourceState === "VerifiedIssued" && !source.blocker && source.method ? <Button type="button" variant="secondary" disabled={busy} onClick={() => choose(source)}>Choose source</Button> : <span>{source.blocker === "InvoiceMatchingAcceptanceKindChanged" ? "Receipt type does not match" : "Source needs review"}</span>}</td></tr>)}</tbody></RecordTable></div> : <p>No compatible issued order lines found.</p>}
          <div className="flex items-center gap-3"><Button type="button" variant="secondary" disabled={busy || sources.page <= 1} onClick={() => setSourcePage((p) => p - 1)}>Previous sources</Button><span>Page {sources.page}</span>
            <Button type="button" variant="secondary" disabled={busy || sources.page * sources.pageSize >= sources.total} onClick={() => setSourcePage((p) => p + 1)}>Next sources</Button></div>
        </>}
        {selected && <div className="space-y-4 rounded-lg border border-border p-4">
          <p>Linked source: {selected.source.orderNumber} · {selected.source.description}</p>
          {selected.source.method === "ThreeWay" && <><p className="text-sm">Receipt quantities below are recorded physical history, not available invoice capacity.{principalWrite && " A source link can be proposed while accepted evidence is still missing; comparison will remain blocked."}</p>
            {acceptanceLoading ? <p role="status">Loading receipt evidence…</p> : acceptances?.state === "Unavailable" ? <p role="alert">Receipt history needs review. It cannot be treated as zero.</p> : acceptances && <>
              <Field label="Receipt or service confirmation"><Select value={selected.acceptance?.id ?? ""} disabled={busy} onChange={(e) => update({ acceptance: acceptances.items.find((a) => a.id === e.target.value) ?? null })}>
                <option value="">Choose recorded evidence</option>{acceptances.items.map((a) => <option key={a.id} value={a.id}>{a.reference} · {a.sourceSchemaVersion === 3 ? a.acceptedQuantity : a.historicalNetQuantity} · {a.kind === "Goods" ? "Goods receipt" : "Service confirmation"}</option>)}</Select></Field>
              {acceptances.total === 0 && <p>No accepted receipt evidence is recorded for this line.</p>}
              <div className="flex gap-3"><Button type="button" variant="secondary" disabled={busy || acceptances.page <= 1} onClick={() => setAcceptancePage((p) => p - 1)}>Previous receipts</Button>
                <Button type="button" variant="secondary" disabled={busy || acceptances.total === null || acceptances.page * acceptances.pageSize >= acceptances.total} onClick={() => setAcceptancePage((p) => p + 1)}>Next receipts</Button></div>
            </>}
          </>}
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Unit on original invoice"><Input value={selected.unit} maxLength={20} disabled={busy} onChange={(e) => update({ unit: e.target.value })} /></Field>
            <Field label="Original invoice document"><Select value={selected.document} disabled={busy} onChange={(e) => update({ document: e.target.value })}><option value="">Choose a checked document</option>
              {documents.filter((d) => d.scanState === "Available").map((d) => <option key={d.versionId} value={d.versionId}>{d.fileName} · Version {d.versionNumber}</option>)}</Select></Field>
            <Field label="Line or page reference in document"><Input value={selected.reference} maxLength={200} disabled={busy} onChange={(e) => update({ reference: e.target.value })} /></Field></div>
          {!documents.some((d) => d.scanState === "Available") && <p className="text-sm">{principalWrite
            ? "You may save a source link now. Original document and unit review remain required before a verified comparison."
            : "Add the original invoice document and wait for its security check before saving links."}</p>}
        </div>}
        <p className="text-sm">Linked lines: {Object.keys(drafts).length} of {lines.length}. Original document review remains separate.</p>
        <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy || sourceLoading || acceptanceLoading || lines.some((line) => !drafts[line.id])}>Save line links</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => { setDrafts({}); setAcceptances(null); }}>Clear draft links</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => { setEditing(false); setDrafts({}); setError(""); }}>Cancel linking</Button></div>
      </form>}
      {canCompare && (currentMappingSchema === 3 ? currentMappingId && currentMappingOriginalCurrent
        : readiness?.evidence.mappingVersionId && readiness.evidence.mappingOriginalCurrent === true) && <div className="space-y-3 border-t border-border pt-4">
        <Field label="Comparison note (optional)"><Textarea value={reason} maxLength={2000} disabled={busy} onChange={(e) => setReason(e.target.value)} /></Field>
        <Button disabled={busy || editing} onClick={compare}>Run invoice comparison</Button>
        <p className="text-sm text-muted-foreground">A saved comparison may still need verified document review and Finance history. It never approves or posts this invoice.</p>
      </div>}
    </>}
    {busy && <Badge>Checking the saved result…</Badge>}
  </div></Panel>;
}
