import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, Button, Field, Input, PageHeader, Panel, Select, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { RfqDetailLayout } from "./RfqPresentation";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { useErpShell } from "../lib/erpShell";
import { procurementScopeHeaders } from "../../../shared/shell-scope";
import {
  openedRecommendationRounds, recommendationSource, ownRecommendation, recommendationDetail,
  recommendationCommand, recommendationLines, saveRecommendation, recoverRecommendation,
  type OpenedRound, type RecommendationSource, type RecommendationDetail,
  type RecommendationLine, type RecommendationCommand,
} from "../lib/principal-rfq-recommendation-api";
import { recommendationJournal, type RecommendationJournalScope } from "../lib/principal-rfq-recommendation-journal";

const root = "/rfqs/recommendations";
const message = (error: unknown) => error instanceof Error ? error.message : "Recommendation drafts are unavailable. Refresh to check your access.";
const permission = (actions: string[]) => actions.includes("procurement-sourcing-recommend-draft")
  && actions.includes("procurement-sourcing-opened-offer-read");
function useRecommendationContext() {
  const context = useLiveReadiness(); const { selection } = useErpShell();
  const branch = context ? procurementScopeHeaders(context.legalEntityId)["X-Shell-Location"] ?? "" : "";
  return { context, branch, enabled: Boolean(context?.capabilities.principalRfqRecommendationDrafts === true
    && permission(context.permissions) && selection.branchScope !== "all" && branch) };
}

/** Opened-round discovery is metadata only. Titles arrive through each verified purpose read. */
export function LiveRfqRecommendationList() {
  const { context, enabled, branch } = useRecommendationContext();
  const [offset, setOffset] = useState(0), [version, setVersion] = useState(0);
  const [rows, setRows] = useState<{ round: OpenedRound; source: RecommendationSource | null }[]>([]);
  const [hasMore, setHasMore] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); setRows([]); setError(""); setLoading(true);
    if (!enabled || !context) { setLoading(false); return () => controller.abort(); }
    openedRecommendationRounds(context.legalEntityId, offset, controller.signal).then(async page => {
      const checked = await Promise.all(page.items.map(async round => {
        if (round.branchId !== branch) return { round, source: null };
        try { return { round, source: await recommendationSource(context.legalEntityId, round.roundId, controller.signal) }; }
        catch { return { round, source: null }; }
      }));
      if (!controller.signal.aborted) { setRows(checked); setHasMore(page.hasMore); }
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [context, enabled, branch, offset, version]);
  return <div className="p-5 sm:p-8"><PageHeader title="Request for Quotes" subtitle="Recommendation drafts for opened offers you may review. These are not awards or purchase orders." />
    <div className="mb-4"><Link className="text-sm text-primary hover:underline" to="/rfqs">Back to quote requests</Link></div>
    {!enabled ? <p role="alert">Choose a permitted branch and obtain current opened-offer and recommendation access.</p> : <>
      <div className="mb-4"><Button variant="secondary" onClick={() => setVersion(value => value + 1)}>Refresh opened rounds</Button></div>
      {error && <p role="alert">{error}</p>}{loading ? <p role="status">Checking opened rounds…</p> : <Panel><div className="overflow-x-auto"><RecordTable>
        <thead><tr><th>Quote request</th><th>Opened</th><th>Recommendation</th></tr></thead><tbody>
          {rows.map(({ round, source }) => <tr key={round.roundId}><td>{source?.rfqTitle ?? "Opened round unavailable"}</td>
            <td>{source ? new Date(round.openedAt).toLocaleDateString() : "—"}</td>
            <td>{source ? <Link className="text-primary hover:underline" to={`${root}/${round.roundId}`}>Open recommendation draft</Link> : "Check this round later"}</td></tr>)}
        </tbody></RecordTable></div>{!rows.length && !error && <p className="p-5 text-sm text-muted-foreground">No opened rounds are available in this branch.</p>}</Panel>}
      <div className="mt-4 flex gap-3"><Button variant="secondary" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - 3))}>Previous</Button>
        <Button variant="secondary" disabled={!hasMore || loading} onClick={() => setOffset(offset + 3)}>Next</Button></div>
    </>}
  </div>;
}

type Loaded = { source: RecommendationSource; detail: RecommendationDetail | null };
type Entry = RecommendationLine & { label: string };
const emptyEntry = (): Entry => ({ offerId: "", sourcingLineId: "", quantityExact: "", proposedValueExact: "", rationale: "", label: "" });
export function LiveRfqRecommendationDetail() {
  const { roundId = "" } = useParams(); const { context, branch, enabled } = useRecommendationContext();
  return <RecommendationPage key={`${context?.tenantId}:${context?.legalEntityId}:${context?.principalId}:${branch}:${roundId}`}
    roundId={roundId} context={context} branch={branch} enabled={enabled} />;
}
function RecommendationPage({ roundId, context, branch, enabled }: {
  roundId: string; context: ReturnType<typeof useRecommendationContext>["context"]; branch: string; enabled: boolean;
}) {
  const company = context?.legalEntityId ?? "";
  const [loaded, setLoaded] = useState<Loaded | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]), [activeTab, setActiveTab] = useState("related");
  const [refresh, setRefresh] = useState(0), [busy, setBusy] = useState(false);
  const alive = useRef(true), busyRef = useRef(false);
  const baseScope = { tenantId: context?.tenantId ?? "", companyId: company,
    principalId: context?.principalId ?? "", branchId: branch, roundId };
  const journalScope = (recordId: string): RecommendationJournalScope => ({ ...baseScope, recordId });
  const [pending, setPending] = useState<RecommendationCommand | null>(() => {
    try { return recommendationJournal.read(journalScope("new")); } catch { return null; }
  });
  const [journalError, setJournalError] = useState(() => {
    try { recommendationJournal.read(journalScope("new")); return ""; } catch { return "A saved draft needs review before another change."; }
  });
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoaded(null); setError(""); setLoading(true);
    if (!enabled) { setLoading(false); return () => controller.abort(); }
    Promise.all([recommendationSource(company, roundId, controller.signal), ownRecommendation(company, roundId, controller.signal)])
      .then(async ([source, own]) => {
        const detail = own ? await recommendationDetail(company, roundId, own.draftId, controller.signal) : null;
        if (controller.signal.aborted) return;
        setLoaded({ source, detail });
        if (detail) {
          setEntries(detail.lines.map(line => ({ ...line, label: source.offers.find(offer => offer.offerId === line.offerId)?.offerLabel ?? "Opened offer" })));
          try { const previous = recommendationJournal.read(journalScope(detail.draftId)); if (previous) setPending(previous); }
          catch { setJournalError("A saved draft needs review before another change."); }
        }
      }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [company, roundId, enabled, refresh]);
  const choices = loaded?.source.offers.flatMap(offer => offer.lines.map(line => ({ offerId: offer.offerId,
    sourceLineId: line.sourceLineId, label: `${offer.offerLabel} · ${line.lineLabel}${offer.supplierLabel ? ` · ${offer.supplierLabel}` : ""}`,
    offeredQuantityExact: line.offeredQuantityExact }))) ?? [];
  const knownPairs = new Set(choices.map(choice => `${choice.offerId}:${choice.sourceLineId}`));
  function update(index: number, patch: Partial<Entry>) { setEntries(value => value.map((line, position) => position === index ? { ...line, ...patch } : line)); }
  async function recover() {
    if (!pending || busyRef.current || !enabled || journalError) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      const ack = await recoverRecommendation(company, pending);
      const current = await recommendationDetail(company, roundId, ack.draftId);
      if (current.currentRevision !== ack.revision || current.currentSnapshotSha256 !== ack.snapshotSha256) throw new Error("The saved revision needs review before another change.");
      recommendationJournal.clear(journalScope(pending.draftId ?? "new"), pending);
      if (alive.current) { setPending(null); setRefresh(value => value + 1); }
    } catch (cause) { if (alive.current) setError(message(cause)); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!loaded || pending || journalError || busyRef.current || !enabled) return;
    const detail = loaded.detail;
    let command: RecommendationCommand;
    try {
      const lines = recommendationLines(entries.map(({ offerId, sourcingLineId, quantityExact, proposedValueExact, rationale }) =>
        ({ offerId, sourcingLineId, quantityExact, proposedValueExact, rationale: rationale.trim() })));
      if (lines.some(line => !knownPairs.has(`${line.offerId}:${line.sourcingLineId}`))) throw new Error("Choose a verified opened offer and line.");
      command = recommendationCommand(roundId, detail?.draftId ?? null, detail?.currentRevision ?? 0,
        detail?.currentSnapshotSha256 ?? null, lines, crypto.randomUUID());
      recommendationJournal.claim(journalScope(detail?.draftId ?? "new"), command);
      setPending(command);
    } catch (cause) { setError(message(cause)); return; }
    busyRef.current = true; setBusy(true); setError("");
    try {
      const ack = await saveRecommendation(company, command);
      const current = await recommendationDetail(company, roundId, ack.draftId);
      if (current.currentRevision !== ack.revision || current.currentSnapshotSha256 !== ack.snapshotSha256) throw new Error("The saved revision needs review before another change.");
      recommendationJournal.clear(journalScope(command.draftId ?? "new"), command);
      if (alive.current) { setPending(null); setRefresh(value => value + 1); }
    } catch (cause) { if (alive.current) setError(message(cause)); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  if (!enabled) return <div className="p-5 sm:p-8" role="alert">Recommendation drafts require current opened-offer access and a permitted branch.</div>;
  if (loading) return <div className="p-5 sm:p-8" role="status">Checking the opened offers and your draft…</div>;
  if (!loaded) return <div className="p-5 sm:p-8" role="alert">{error || "This recommendation is unavailable in your current access."}</div>;
  const { source, detail } = loaded;
  return <RfqDetailLayout title={source.rfqTitle} number="Opened offers" method="Recommendation draft" currency="" status="Draft"
    back={root} activeTab={activeTab} onTabChange={setActiveTab} itemCount={source.sourceLines.length}
    overview={<div className="space-y-3"><p>This is a draft recommendation for opened offers. It does not choose a winner, send a supplier notice or create a purchase order.</p>
      <p>{detail ? "Your recommendation draft has been saved." : "No recommendation draft has been saved yet."}</p></div>}
    items={<RecordTable><thead><tr><th>Quote request line</th></tr></thead><tbody>{source.sourceLines.map(line => <tr key={line.sourceLineId}><td>{line.lineLabel}</td></tr>)}</tbody></RecordTable>}
    related={<div className="space-y-5"><Panel title="Opened offers"><div className="overflow-x-auto"><RecordTable><thead><tr><th>Offer</th><th>Line</th><th>Offered quantity</th><th>Currency</th></tr></thead><tbody>
      {source.offers.flatMap(offer => offer.lines.map(line => <tr key={`${offer.offerId}:${line.sourceLineId}`}><td>{offer.offerLabel}{offer.supplierLabel ? ` · ${offer.supplierLabel}` : ""}</td>
        <td>{line.lineLabel}</td><td>{line.offeredQuantityExact}</td><td>{line.currencyCode}</td></tr>))}</tbody></RecordTable></div></Panel>
      <Panel title="Recommendation draft"><div className="space-y-4 p-5">
        <p>Current draft revision: {detail?.currentRevision ?? "Not saved"}</p>
        {journalError && <p role="alert">{journalError}</p>}
        {pending && <div role="alert" className="space-y-2"><p>Check whether this recommendation draft was saved before another change.</p>
          <Button type="button" variant="secondary" disabled={busy} onClick={recover}>Check saved draft</Button></div>}
        {error && <p role="alert">{error}</p>}
        <form onSubmit={save} className="space-y-4">{entries.map((line, index) => <div key={index} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
          <Field label="Opened offer and line"><Select value={`${line.offerId}:${line.sourcingLineId}`} disabled={busy || Boolean(pending) || Boolean(journalError)} onChange={event => {
            const selected = choices.find(choice => `${choice.offerId}:${choice.sourceLineId}` === event.target.value);
            if (selected) update(index, { offerId: selected.offerId, sourcingLineId: selected.sourceLineId, label: selected.label });
          }}><option value=":">Choose an opened offer</option>{choices.map(choice => <option key={`${choice.offerId}:${choice.sourceLineId}`} value={`${choice.offerId}:${choice.sourceLineId}`}>{choice.label}</option>)}</Select></Field>
          <Field label="Quantity"><Input value={line.quantityExact} disabled={busy || Boolean(pending) || Boolean(journalError)} onChange={event => update(index, { quantityExact: event.target.value })} /></Field>
          <Field label="Proposed value"><Input value={line.proposedValueExact} disabled={busy || Boolean(pending) || Boolean(journalError)} onChange={event => update(index, { proposedValueExact: event.target.value })} /></Field>
          <Field label="Reason"><Textarea value={line.rationale} disabled={busy || Boolean(pending) || Boolean(journalError)} onChange={event => update(index, { rationale: event.target.value })} /></Field>
          <Button type="button" variant="secondary" disabled={busy || Boolean(pending) || Boolean(journalError)} onClick={() => setEntries(value => value.filter((_, position) => position !== index))}>Remove line</Button>
        </div>)}
        <div className="flex gap-3"><Button type="button" variant="secondary" disabled={busy || Boolean(pending) || Boolean(journalError) || entries.length >= 500} onClick={() => setEntries(value => [...value, emptyEntry()])}>Add offer line</Button>
          <Button type="submit" disabled={busy || Boolean(pending) || Boolean(journalError)}>{detail ? "Save revised draft" : "Save recommendation draft"}</Button></div>
        </form><p className="text-sm text-muted-foreground">This draft has no submission, award or purchase order effect. Quantities and values are kept exactly as entered and checked by ERP.</p>
      </div></Panel></div>}
    relatedFootnote="Recommendation drafts are internal notes about opened offers. No award or purchase order is created."
    activity={detail ? <ul className="space-y-2">{detail.revisions.map(item => <li key={item.id}><Badge>Draft revision {item.revision}</Badge> · {new Date(item.recordedAt).toLocaleString()}</li>)}</ul>
      : <p>No saved draft history yet.</p>} />;
}
