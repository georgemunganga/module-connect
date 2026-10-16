import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp, useEntity } from "@/platform/app-context";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { RestrictedState } from "@/platform/components/States";
import { SettingsTabs } from "@/modules/procurement/SettingsTabs";
import { settingsPanelProps } from "@/modules/procurement/settings-tab-utils";
import { useConfigStore } from "@/modules/procurement/payables/config-store";

export const Route = createFileRoute("/procurement/configuration_/bills")({
  head: () => ({ meta: [{ title: "Bill settings — Meridian ERP Procurement" }] }),
  component: BillSettings,
});

const tabs = ["Preferences", "Approvals", "Fields", "Validation Rules", "Buttons", "Related Lists"] as const;
const approvalTypes = [
  { name: "No Approval", detail: "No extra bill approver when a published policy permits it. Matching and Finance posting still apply." },
  { name: "Simple Approval", detail: "One authorized person approves after validation. Separation of duties still applies." },
  { name: "Multi-Level Approval", detail: "Required people approve in order before the bill goes to Finance." },
  { name: "Custom Approval", detail: "Shared workflow rules select approvers by company, amount, category or exception." },
] as const;

function BillSettings() {
  const { role, entityId } = useApp();
  const entity = useEntity();
  const config = useConfigStore();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Preferences");
  const [selected, setSelected] = useState<(typeof approvalTypes)[number]["name"] | null>(null);
  const [kind, setKind] = useState<"Goods" | "Service">("Goods");
  const [ordered, setOrdered] = useState("100");
  const [accepted, setAccepted] = useState("80");
  const [invoiced, setInvoiced] = useState("100");
  if (role !== "proc_admin") return <AppShell><RestrictedState /></AppShell>;

  const policy = config.policy.entityId === entityId && config.policy.status === "Published" ? config.policy : null;
  const orderQty = Number(ordered);
  const acceptedQty = Number(accepted);
  const invoiceQty = Number(invoiced);
  const needsReceipt = kind === "Goods";
  const valid = [orderQty, invoiceQty].every((value) => Number.isInteger(value) && value > 0) && (!needsReceipt || Number.isInteger(acceptedQty) && acceptedQty >= 0 && acceptedQty <= orderQty);
  const issues = valid ? [
    ...(invoiceQty > orderQty ? [`Bill quantity ${invoiceQty} exceeds ordered quantity ${orderQty}.`] : []),
    ...(needsReceipt && invoiceQty > acceptedQty ? [`Bill quantity ${invoiceQty} exceeds accepted quantity ${acceptedQty}.`] : []),
  ] : [];
  return <AppShell>
    <Link to="/procurement/configuration" className="text-sm text-primary underline">← All settings</Link>
    <PageHeader eyebrow="Settings · Bills" title="Bill settings" description="Review how bills are checked and approved. Finance records and pays them." />
    <div className="mt-5 rounded-lg border bg-surface p-4 text-sm" role="status">
      <strong>Current demo policy · {entity.name}</strong>
      <p className="mt-1 text-muted-foreground">{policy ? `Published v${policy.version}; ${policy.requires3Way ? "goods need receipt matching" : "receipt requirement is policy controlled"}; price tolerance ${policy.tolerance}%.` : "No published demo policy covers this company. Examples below are guidance only."}</p>
      <Button asChild variant="outline" size="sm" className="mt-3"><Link to="/procurement/configuration/policy">Open versioned buying rules</Link></Button>
    </div>
    <SettingsTabs id="bill-settings" label="Bill settings" tabs={tabs} value={tab} onChange={setTab} />
    <section {...settingsPanelProps("bill-settings", tabs, tab)} className="mt-5 max-w-5xl rounded-xl border bg-surface p-5">
      <h2 className="text-lg font-semibold">{tab}</h2>
      {tab === "Approvals" ? <><p className="mt-1 text-sm text-muted-foreground">Compare approval paths. This selection does not change the published policy.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{approvalTypes.map((type) => <button key={type.name} type="button" onClick={() => setSelected(type.name)} aria-pressed={selected === type.name} className={`rounded-lg border p-4 text-left hover:border-primary ${selected === type.name ? "border-primary bg-primary/5" : ""}`}><strong className="block text-sm">{type.name}</strong><span className="mt-1 block text-sm text-muted-foreground">{type.detail}</span></button>)}</div>{selected && <p role="status" className="mt-4 rounded-lg border bg-surface-muted p-3 text-sm">Previewing {selected}. Matching, exception routing and Finance posting still apply. No rule changed.</p>}</>
      : tab === "Preferences" ? <><p className="mt-1 text-sm text-muted-foreground">Try quantities to see where a bill would need review. Goods use order, receipt and bill; this service example uses order and bill. Actual match rules come from a published policy.</p><div className="mt-4 grid gap-3 sm:grid-cols-4"><div><Label htmlFor="bill-kind">Purchase type</Label><select id="bill-kind" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={kind} onChange={(event) => setKind(event.target.value as "Goods" | "Service")}><option>Goods</option><option>Service</option></select></div><div><Label htmlFor="ordered-qty">Ordered</Label><Input id="ordered-qty" type="number" min="1" step="1" value={ordered} onChange={(event) => setOrdered(event.target.value)} /></div><div><Label htmlFor="accepted-qty">Accepted</Label><Input id="accepted-qty" type="number" min="0" step="1" value={accepted} onChange={(event) => setAccepted(event.target.value)} disabled={!needsReceipt} /></div><div><Label htmlFor="invoice-qty">On bill</Label><Input id="invoice-qty" type="number" min="1" step="1" value={invoiced} onChange={(event) => setInvoiced(event.target.value)} /></div></div><div role="status" className="mt-4 rounded-lg border bg-surface-muted p-4 text-sm"><strong>{needsReceipt ? "Three-way example" : "Two-way service example"}</strong>{!valid ? <p className="mt-1 text-destructive">Enter whole numbers above zero for ordered and billed; accepted may be zero but cannot exceed ordered.</p> : issues.length ? <ul className="mt-2 list-disc space-y-1 pl-5">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : <p className="mt-1">Quantities match in this example. Tax, price, duplicates, vendor and coding still need checking.</p>}</div></>
      : tab === "Fields" ? <p className="mt-2 text-sm text-muted-foreground">A bill needs vendor, company, bill number and date, currency, PO or contract reference, line amounts, tax reference and source document. Extra fields belong to shared ERP metadata.</p>
      : tab === "Validation Rules" ? <p className="mt-2 text-sm text-muted-foreground">Check duplicate bill number by vendor and company, order status, accepted quantity, price and tax tolerances. Every exception needs an owner, reason and resolution history.</p>
      : tab === "Buttons" ? <p className="mt-2 text-sm text-muted-foreground">Actions depend on state and permission: Save, Validate, Match, Resolve exception, Approve and Send to Finance. Finance alone posts and pays.</p>
      : <p className="mt-2 text-sm text-muted-foreground">Show the linked vendor, order, delivery, credit and Finance posting reference. Related records follow the user's company and record access.</p>}
    </section>
    <p className="mt-3 text-xs text-muted-foreground">Frontend preview only. No bill is submitted, no approval is assigned, and no Finance connector is activated.</p>
  </AppShell>;
}
