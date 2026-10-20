import { Button, Field, Modal, Textarea } from "../ui";
import type { ApprovalAction } from "../../../../src/platform/procurement-approvals-api";

/** Shared decision interaction only. PR/PO adapters retain their own typed contracts,
 * permissions, state/version guards, command recovery and server-owned approval engine. */
export function ApprovalDecisionDialog({ action, recordLabel, reason, busy, error, locked = false, uncertain = false,
  onReason, onConfirm, onCancel }: { action: ApprovalAction; recordLabel: "request" | "order"; reason: string; busy: boolean;
  error?: string; locked?: boolean; uncertain?: boolean; onReason: (reason: string) => void; onConfirm: () => void; onCancel: () => void }) {
  return <Modal title={action === "Return" ? `Return ${recordLabel} for changes` : `${action} ${recordLabel}`} onClose={() => { if (!busy && !uncertain) onCancel(); }}>
    <div className="space-y-4">{error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <Field label={action === "Approve" ? "Comment (optional)" : "Reason"} hint={action === "Approve" ? undefined : "Explain what needs to change."}>
        <Textarea rows={3} maxLength={2000} disabled={busy || locked} value={reason} onChange={(event) => onReason(event.target.value)} />
      </Field>
      {uncertain && <p className="text-sm">The response was interrupted. Retry this same decision to confirm whether it was saved.</p>}
      <div className="flex gap-3"><Button disabled={busy || action !== "Approve" && !reason.trim()} onClick={onConfirm}>{busy ? "Saving…" : uncertain ? "Retry same decision" : "Confirm decision"}</Button>
        <Button variant="secondary" disabled={busy || uncertain} onClick={onCancel}>Cancel</Button></div>
    </div>
  </Modal>;
}
