import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui";
import { DetailSection } from "../components/data/DetailPrimitives";
import { RecordTable } from "../components/data/RecordTable";
import { LiveRecordDirectory } from "../components/data/LiveRecordDirectory";
import { RfqDetailLayout } from "./RfqPresentation";
import { RoundPlanPanel } from "./RoundPlanPanel";
import { RoundPlanHistoryPanel } from "./RoundPlanEvidence";
import { RoundPlanRecovery } from "./RoundPlanEditor";
import { useRoundPlanContext } from "../lib/RoundPlanContext";
import { roundPlanReadAvailable } from "../lib/round-plan-access";
import { getRoundPlan, listRoundPlans, listRoundPlanSources, searchRoundPeople, type RoundRecord } from "../../../src/platform/procurement-round-plan-api";
const explain = (e: unknown) => e instanceof Error ? e.message : "Evaluation planning is unavailable.";
export function useRfqRoundPlan(eventId: string, onChanged?: () => void) {
  const { scope, readiness, key } = useRoundPlanContext(), enabled = roundPlanReadAvailable(readiness);
  const [revision, setRevision] = useState(0), [state, setState] = useState<{ key: string; data?: RoundRecord; error?: string }>({ key: "" });
  const loadKey = JSON.stringify([key, eventId, revision]);
  useEffect(() => {
    if (!enabled) return; const abort = new AbortController(); setState({ key: loadKey });
    getRoundPlan(scope, eventId, abort.signal).then(data => { if (!abort.signal.aborted && scope.current()) setState({ key: loadKey, data }); })
      .catch(e => { if (!abort.signal.aborted && scope.current()) setState({ key: loadKey, error: explain(e) }); });
    return () => abort.abort();
  }, [loadKey, enabled]);
  const data = state.key === loadKey ? state.data : undefined, error = state.key === loadKey ? state.error : undefined;
  const refresh = () => { setRevision(n => n + 1); onChanged?.(); };
  const overview = !enabled ? null : data ? <RoundPlanPanel scope={scope} record={data} currentEventVersion={data.source.version} allowedActions={data.allowedActions} access={readiness}
    peopleProvider={(q, after, signal) => searchRoundPeople(scope, eventId, q, after, signal)} onChanged={refresh} />
    : <DetailSection title="Evaluation plan">{error ? <p role="alert">{error}</p> : <p role="status">Loading evaluation plan…</p>}<RoundPlanRecovery scope={scope} eventId={eventId} onRecovered={refresh} /></DetailSection>;
  const history = enabled && data?.enrolled ? <RoundPlanHistoryPanel key={loadKey} scope={scope} eventId={eventId} /> : null;
  return { data, error, enabled, overview, history, refresh };
}
export function RoundPlanRfqDetail({ id }: { id: string }) {
  const round = useRfqRoundPlan(id);
  if (!round.enabled) return <p role="alert" className="p-5 sm:p-8">Evaluation planning is not available with your current access.</p>;
  if (!round.data) return <div className="space-y-5 p-5 sm:p-8">{round.overview}<Link to="/rfqs?source=round-plan">Back to quote requests</Link></div>;
  const source = round.data.source;
  return <RfqDetailLayout title={source.title} number={source.number} method={source.method.label} currency={source.currencyCode} status={source.status} back="/rfqs?source=round-plan" itemCount={source.lines.length}
    actions={<Button variant="secondary" onClick={round.refresh}>Refresh RFQ</Button>}
    overview={round.overview}
    items={<div className="overflow-x-auto"><RecordTable><thead><tr><th>Item or service</th><th>Quantity</th><th>Unit</th><th>Approved estimate</th><th>Source balance</th></tr></thead><tbody>{source.lines.map(line => <tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td><td>{line.unitCode}</td><td>{source.currencyCode} {line.approvedUnitEstimate}</td><td>{line.allocationState === "Reserved" ? "Held for this RFQ" : "Released"}</td></tr>)}</tbody></RecordTable></div>}
    related={<DetailSection title="Approved purchase requests"><ul className="space-y-1 text-sm">{[...new Set(source.lines.map(line => line.purchaseRequestId))].map(id => <li key={id}>{id}</li>)}</ul></DetailSection>}
    activity={round.history ?? <p className="text-sm">No evaluation plan is saved for this RFQ yet.</p>} />;
}
export function RoundPlanRfqList() {
  const { scope, readiness, key } = useRoundPlanContext(), enabled = roundPlanReadAvailable(readiness);
  const [saved, setSaved] = useState(true), [page, setPage] = useState(1), [query, setQuery] = useState(""), [revision, setRevision] = useState(0);
  const [data, setData] = useState<{ items: { id: string; number: string; title: string; status: string; path: string; fields: Record<string, string> }[]; total: number; pageSize: number } | null>(null), [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return; const abort = new AbortController(); setData(null); setError("");
    const load = saved ? listRoundPlans(scope, page, abort.signal) : listRoundPlanSources(scope, page, query, abort.signal);
    load.then(result => { if (!abort.signal.aborted && scope.current()) setData({ total: result.total, pageSize: result.pageSize,
      items: result.items.map(row => ({ id: row.id, number: row.number, title: row.title, status: row.status, path: `/rfqs/${"eventId" in row ? row.eventId : row.id}?source=round-plan`, fields: {} })) }); })
      .catch(e => { if (!abort.signal.aborted && scope.current()) setError(explain(e)); });
    return () => abort.abort();
  }, [key, saved, page, query, revision, enabled]);
  if (!enabled) return <p role="alert" className="p-5 sm:p-8">Evaluation planning is not available with your current access.</p>;
  return <div className="p-5 sm:p-8"><div className="mb-5 flex gap-3" role="tablist" aria-label="Evaluation planning views"><Button role="tab" aria-selected={saved} variant={saved ? "primary" : "secondary"} onClick={() => { setSaved(true); setPage(1); }}>Saved evaluation plans</Button><Button role="tab" aria-selected={!saved} variant={saved ? "secondary" : "primary"} onClick={() => { setSaved(false); setPage(1); }}>RFQs ready for planning</Button></div>
    <LiveRecordDirectory key={`${saved}:${page}`} title="Request for Quotes" subtitle={saved ? "Saved evaluation proposals for your current company and branch." : "Unpublished quote drafts that may be eligible for evaluation planning. Final eligibility is checked when saving; opening a draft does not enroll it."} entity="quote requests"
      columns={[{ key: "number", label: "Reference / Description", width: 300 }, { key: "status", label: "Status", width: 130 }]} rows={data?.items ?? []} loading={!data && !error} error={error} total={data?.total ?? 0} page={page} pageSize={data?.pageSize ?? 25} onPage={setPage} onRefresh={() => setRevision(n => n + 1)}
      serverQuery={saved ? undefined : { search: query, onSearch: text => { setQuery(text); setPage(1); } }} emptyTitle={saved ? "No saved evaluation plans" : "No quote drafts ready for planning"} emptyDescription="Records for your current account and organisation scope appear here." />
  </div>;
}
