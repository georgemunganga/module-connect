import { useState } from "react";
import { Link } from "react-router-dom";
import { ActivityTimeline, DetailSection } from "../components/data/DetailPrimitives";
import { Button, Field, Modal, Textarea } from "../components/ui";
import type { ReceivingDocuments, ReceivingEffect } from "../../../src/platform/procurement-receiving-api";
export function ReceivingUnavailableAction({ label, reason }: { label: string; reason: string }) {
  const [open, setOpen] = useState(false);
  return <><Button variant="secondary" onClick={() => setOpen(true)}>{label}</Button>{open && <Modal onClose={() => setOpen(false)} title={label}><p className="text-sm">{reason}</p><Button className="mt-5" variant="secondary" onClick={() => setOpen(false)}>Close explanation</Button></Modal>}</>;
}
export function ReceivingActivity({ effects, recordedAt }: { effects: ReceivingEffect[]; recordedAt?: string | null }) {
  return <ActivityTimeline items={[
    ...(recordedAt && !effects.some((effect) => effect.kind === "Physical observation") ? [{ id: "physical-recorded", title: "Arrival recorded", date: new Date(recordedAt).toLocaleString() }] : []),
    ...effects.map((effect) => ({ id: effect.id, title: effect.kind, detail: `${effect.quantity}${effect.netAmount !== null ? ` · ${effect.netAmount}` : ""} · ${effect.evidenceReference}`, date: new Date(effect.occurredAt).toLocaleString() })),
  ]} />;
}
export function ReceivingRelated({ orderId, orderNumber, canReadOrder, allowBillAction = true }: { orderId?: string | null; orderNumber?: string; canReadOrder: boolean; allowBillAction?: boolean }) {
  return <DetailSection title="Related Records"><p className="text-sm">Source purchase order: {orderId && canReadOrder ? <Link className="text-primary hover:underline" to={`/purchase-orders/${orderId}`}>{orderNumber ?? "View source order"}</Link> : orderNumber ?? "Shown in the retained line details"}</p>{allowBillAction && <div className="mt-4"><ReceivingUnavailableAction label="Create bill" reason="Creating a bill directly from a delivery is not connected yet. No invoice or matching approval will be created here." /></div>}</DetailSection>;
}
export function ReceivingDocumentsSection({ documents }: { documents?: ReceivingDocuments }) {
  return <DetailSection title="Documents"><div className="space-y-3">
    {documents?.references.map((file) => <div key={file.id} className="rounded-lg border border-border p-3 text-sm"><p>{file.fileName}</p><p className="text-xs text-muted-foreground">Version {file.documentVersion} · {file.classification}</p><ReceivingUnavailableAction label={`Download ${file.fileName}`} reason="Secure document downloads are not connected for receiving records yet." /></div>)}
    {!documents?.references.length && <p className="text-sm text-muted-foreground">No document references are available in this view.</p>}
    <ReceivingUnavailableAction label="Attach files" reason="Secure document upload is not connected for receiving records yet. Use the evidence reference when recording or accepting a delivery." />
  </div></DetailSection>;
}
export function ReceivingComments() {
  return <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"><DetailSection title="Add Comment"><Field label="Internal comment"><Textarea disabled placeholder="Comments are not connected for deliveries yet." /></Field><div className="mt-4"><ReceivingUnavailableAction label="Add Comment" reason="Delivery comments are not connected yet. No comment will be saved only in this browser." /></div></DetailSection><DetailSection title="All Comments"><p className="text-sm text-muted-foreground">Delivery comments will appear here when the shared comments service is connected.</p></DetailSection></div>;
}

/** Preserve an internal vendor return context without treating its URL as data authority. */
export function receivingVendorContext(search: URLSearchParams, canReadVendor: boolean) {
  const id = search.get("fromVendor") ?? "", tab = search.get("vendorTab") ?? "transactions";
  if (!canReadVendor || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { path: "/purchase-receives", query: "" };
  const selectedTab = ["overview", "comments", "transactions", "mails", "statement"].includes(tab) ? tab : "transactions";
  return { path: `/vendors/${id}/${selectedTab}`, query: `&fromVendor=${encodeURIComponent(id)}&vendorTab=${selectedTab}` };
}
