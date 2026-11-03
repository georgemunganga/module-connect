import { roundBrowserTimeZone } from "../../../shared/procurement-round-schedule";
import { useEffect, useState } from "react";
import { Badge, Button, Modal } from "../components/ui";
import { DetailSection, DetailValue } from "../components/data/DetailPrimitives";
import { RecordTable } from "../components/data/RecordTable";
import { getRoundPlanHistory, getRoundPlanVersion, type RoundRecord, type RoundScope, type RoundHistory, type RoundDraft } from "../../../src/platform/procurement-round-plan-api";
import { roundDutyLabel } from "./RoundPlanDraftFields";
export function draftFromRound(record: RoundRecord): RoundDraft {
  if (!record.content) throw new Error("The saved plan content is unavailable.");
  const { requirements, proposedPolicyReference, disclosureProposal, documentRequirements, opensAt, closesAt, technicalReleaseAt, commercialReleaseAt, criteria, participants } = record.content;
  return { requirements, proposedPolicyReference, disclosureProposal, documentRequirements, opensAt, closesAt, technicalReleaseAt, commercialReleaseAt,
    criteria: criteria.map(row => ({ ...row })), participants: participants.map(row => ({ ...row })) };
}
export function RoundPlanEvidence({ record }: { record: RoundRecord }) {
  if (!record.enrolled || !record.content || !record.revision) return <p className="text-sm">This RFQ has no saved evaluation plan.</p>;
  const content = record.content;
  return <div className="space-y-5"><DetailSection title="Evaluation plan"><div className="space-y-3 text-sm"><p><Badge>{record.revision.status}</Badge> · Saved version {record.revision.version}</p>
    <p>This is an incomplete planning proposal. Saving it does not approve criteria, open bids, contact suppliers or award work.</p>
    <p className="text-muted-foreground">Recorded {new Date(record.revision.recordedAt).toLocaleString()} · Company time zone {content.companyTimeZoneId}</p>
    {record.revision.reason && <p>{record.revision.reason}</p>}
    <p role="status">Review and publication for enrolled evaluation plans are not available yet.</p>
  </div></DetailSection>
    <div className="grid gap-5 lg:grid-cols-2"><DetailSection title="Requirement"><p className="whitespace-pre-wrap text-sm">{content.requirements || "Not proposed yet."}</p></DetailSection>
      <DetailSection title="Eligibility and terms"><dl className="space-y-3 text-sm"><DetailValue label="Proposed policy reference" value={content.proposedPolicyReference || "Not proposed yet."} /><DetailValue label="Proposed disclosure terms" value={content.disclosureProposal || "Not proposed yet."} /></dl></DetailSection>
      <DetailSection title="Response documents required"><p className="whitespace-pre-wrap text-sm">{content.documentRequirements || "Not proposed yet."}</p><p className="mt-2 text-sm text-muted-foreground">These are proposed requirements. Supporting files will be added in a later step.</p></DetailSection>
      <DetailSection title="Proposed schedule"><dl className="space-y-3 text-sm">{([["opensAt", "Opening"], ["closesAt", "Closing"], ["technicalReleaseAt", "Technical release"], ["commercialReleaseAt", "Commercial release"]] as const).map(([key, label]) => <DetailValue key={key} label={label} value={content[key] ? <span title={content[key]!}>{new Date(content[key]!).toLocaleString()}</span> : "Not proposed yet."} />)}</dl><p className="mt-3 text-sm text-muted-foreground">Shown in your browser’s local time zone ({roundBrowserTimeZone()}).</p></DetailSection>
    </div>
    <DetailSection title="Evaluation criteria (proposed)">{content.criteria.length ? <div className="overflow-x-auto"><RecordTable><thead><tr><th>Criterion</th><th>Stage</th><th>Assessment</th><th>Weight</th><th>Minimum</th><th>Maximum</th><th>Scoring guidance</th></tr></thead><tbody>{content.criteria.map(c => <tr key={c.logicalId}><td>{c.code}<p className="whitespace-pre-wrap text-sm text-muted-foreground">{c.description}</p></td><td>{c.stage}</td><td>{c.kind === "PassFail" ? "Pass or fail" : "Weighted score"}</td><td>{c.weight ?? "—"}</td><td>{c.minimumScore ?? "—"}</td><td>{c.maximumScore ?? "—"}</td><td className="whitespace-pre-wrap">{c.rubric || "Not proposed yet."}</td></tr>)}</tbody></RecordTable></div> : <p className="text-sm">No proposed criteria.</p>}</DetailSection>
    <DetailSection title="Internal colleagues"><p className="mb-3 text-sm text-muted-foreground">Planning participants only. ERP permissions and approval routing remain separate.</p>{content.participants.length ? <div className="overflow-x-auto"><RecordTable><thead><tr><th>Colleague</th><th>Proposed duty</th><th>Declared conflict note</th></tr></thead><tbody>{content.participants.map(p => <tr key={p.logicalId}><td>{record.people?.find(person => person.id === p.principalId)?.displayName || p.principalId}</td><td>{roundDutyLabel(p.duty)}</td><td className="whitespace-pre-wrap">{p.conflictNote || "Not recorded"}</td></tr>)}</tbody></RecordTable></div> : <p className="text-sm">No colleagues proposed.</p>}</DetailSection>
  </div>;
}
export function RoundPlanHistoryPanel({ scope, eventId }: { scope: RoundScope; eventId: string }) {
  const [data, setData] = useState<RoundHistory | null>(null), [error, setError] = useState(""), [after, setAfter] = useState(0), [pages, setPages] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null), [evidence, setEvidence] = useState<RoundRecord | null>(null), [versionError, setVersionError] = useState("");
  useEffect(() => {
    const abort = new AbortController(); setData(null); setError("");
    getRoundPlanHistory(scope, eventId, after, abort.signal).then(value => { if (!abort.signal.aborted && scope.current()) setData(value); }).catch(e => { if (!abort.signal.aborted && scope.current()) setError(e instanceof Error ? e.message : "History is unavailable."); });
    return () => abort.abort();
  }, [eventId, after]);
  useEffect(() => {
    setEvidence(null); setVersionError(""); if (selected === null) return; const abort = new AbortController();
    getRoundPlanVersion(scope, eventId, selected, abort.signal).then(value => { if (!abort.signal.aborted && scope.current()) setEvidence(value); }).catch(e => { if (!abort.signal.aborted && scope.current()) setVersionError(e instanceof Error ? e.message : "The saved version is unavailable."); });
    return () => abort.abort();
  }, [eventId, selected]);
  return <DetailSection title="Evaluation plan history">{error ? <p role="alert">{error}</p> : !data ? <p role="status">Loading saved versions…</p> : <div className="space-y-4"><div className="overflow-x-auto"><RecordTable><thead><tr><th>Version</th><th>Action</th><th>Status</th><th>Recorded</th><th>Evidence</th></tr></thead><tbody>{data.items.map(row => <tr key={row.id}><td>{row.version}</td><td>{row.operation === "Create" ? "Created" : row.operation === "Revise" ? "Revised" : "Cancelled"}</td><td><Badge>{row.status}</Badge></td><td>{new Date(row.recordedAt).toLocaleString()}</td><td><Button variant="secondary" onClick={() => setSelected(row.version)}>Open version {row.version}</Button></td></tr>)}</tbody></RecordTable></div>
    <div className="flex gap-3"><Button variant="secondary" disabled={!pages.length} onClick={() => { setAfter(pages[pages.length - 1]); setPages(pages.slice(0, -1)); }}>Previous versions</Button><Button variant="secondary" disabled={data.nextVersion === null} onClick={() => { if (data.nextVersion !== null) { setPages([...pages, after]); setAfter(data.nextVersion); } }}>More versions</Button></div></div>}
    {selected !== null && <Modal title={`Saved evaluation plan version ${selected}`} onClose={() => setSelected(null)}>{versionError ? <p role="alert">{versionError}</p> : evidence ? <RoundPlanEvidence record={evidence} /> : <p role="status">Loading saved version…</p>}</Modal>}
  </DetailSection>;
}
