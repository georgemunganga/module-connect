import { Button, Field, Modal, Textarea } from "../ui";
import type { ApprovalAction } from "../../../../src/platform/procurement-approvals-api";

/** Shared decision interaction only. PR/PO adapters retain their own typed contracts,
 * permissions, state/version guards, command recovery and server-owned approval engine. */
export function ApprovalDecisionDialog({ action, recordLabel, reason, busy, error, locked = false, uncertain = false,
  attestationRequired = false, attested = false, onAttestation, onReason, onConfirm, onCancel }: { action: ApprovalAction; recordLabel: "request" | "order" | "original invoice units"; reason: string; busy: boolean;
  error?: string; locked?: boolean; uncertain?: boolean; attestationRequired?: boolean; attested?: boolean; onAttestation?: (checked: boolean) => void;
  onReason: (reason: string) => void; onConfirm: () => void; onCancel: () => void }) {
  return <Modal title={action === "Return" ? `Return ${recordLabel} for changes` : `${action} ${recordLabel}`} onClose={() => { if (!busy && !uncertain) onCancel(); }}>
    <div className="space-y-4">{error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <Field label={action === "Approve" ? "Comment (optional)" : "Reason"} hint={action === "Approve" ? undefined : "Explain what needs to change."}>
        <Textarea rows={3} maxLength={2000} disabled={busy || locked} value={reason} onChange={(event) => onReason(event.target.value)} />
      </Field>
      {attestationRequired && action === "Approve" && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={attested} disabled={busy || locked}
        onChange={(event) => onAttestation?.(event.target.checked)} />I checked the original invoice document and confirm the units shown for its lines.</label>}
      {uncertain && <p className="text-sm">The response was interrupted. Retry this same decision to confirm whether it was saved.</p>}
      <div className="flex gap-3"><Button disabled={busy || action !== "Approve" && !reason.trim() || attestationRequired && action === "Approve" && !attested} onClick={onConfirm}>{busy ? "Saving…" : uncertain ? "Retry same decision" : "Confirm decision"}</Button>
        <Button variant="secondary" disabled={busy || uncertain} onClick={onCancel}>Cancel</Button></div>
    </div>
  </Modal>;
}
