import { useState } from "react";
import { Button } from "../components/ui";
import { DetailSection } from "../components/data/DetailPrimitives";
import { RoundPlanEvidence } from "./RoundPlanEvidence";
import { RoundPlanEditor, RoundPlanRecovery, type RoundPeopleProvider } from "./RoundPlanEditor";
import { roundPlanActionAvailable } from "../lib/round-plan-access";
import { roundPlanJournal } from "../lib/round-plan-journal";
import type { RoundRecord, RoundScope, RoundLocator } from "../../../src/platform/procurement-round-plan-api";
type Access = { capabilities: { roundPlanRead: boolean; roundPlanRecord: boolean }; permissions: readonly string[] };
/** Record/action selectors are supplied by the owning RFQ detail, never guessed from maker identity. */
export function RoundPlanPanel({ scope, record, currentEventVersion, allowedActions, access, peopleProvider, onChanged }: {
  scope: RoundScope; record: RoundRecord; currentEventVersion: number; allowedActions: readonly string[]; access: Access;
  peopleProvider: RoundPeopleProvider; onChanged: () => void;
}) {
  const [operation, setOperation] = useState<RoundLocator["operation"] | null>(null), journal = roundPlanJournal(scope, record.source.id);
  const canAct = (action: RoundLocator["operation"]) => roundPlanActionAvailable(access, scope, allowedActions, action);
  return <div className="space-y-5"><RoundPlanRecovery scope={scope} eventId={record.source.id} onRecovered={() => { setOperation(null); onChanged(); }} />
    {record.enrolled ? <RoundPlanEvidence record={record} /> : <DetailSection title="Evaluation plan"><p className="text-sm">No evaluation plan is saved for this RFQ. Its existing review process remains available subject to its current state, permissions and policy.</p><p className="mt-2 text-sm text-muted-foreground">Set up a proposal only when this RFQ needs evaluation planning. Saving will enroll this RFQ and hold its review and publication for the next controlled workflow.</p></DetailSection>}
    <div className="flex flex-wrap gap-3">{(["Create", "Revise", "Cancel"] as const).filter(canAct).map(action => <Button key={action} variant={action === "Cancel" ? "danger" : "secondary"} disabled={journal.state().blocked} onClick={() => setOperation(action)}>{action === "Create" ? "Set up evaluation plan" : action === "Revise" ? "Revise evaluation plan" : "Cancel evaluation plan"}</Button>)}</div>
    {!access.capabilities.roundPlanRecord && record.enrolled && <p className="text-sm text-muted-foreground">Changes to this evaluation plan are unavailable. Its saved details, versions and original save result remain readable.</p>}
    {operation && canAct(operation) && <RoundPlanEditor key={`${record.source.id}:${operation}`} scope={scope} record={record} eventVersion={currentEventVersion} operation={operation} peopleProvider={peopleProvider} canAct={() => canAct(operation)} onClose={() => setOperation(null)} onSaved={() => { setOperation(null); onChanged(); }} />}
  </div>;
}
