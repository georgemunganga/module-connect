import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { RestrictedState } from "@/platform/components/States";
import { useApp, useEntity } from "@/platform/app-context";
import { useConfigStore } from "@/modules/procurement/payables/config-store";

export const Route = createFileRoute("/procurement/configuration_/orders")({ component: OrderSettings });

const tabs = ["Preferences", "Approvals", "Fields", "Validation Rules", "Buttons", "Related Lists"] as const;
type Tab = (typeof tabs)[number];
const approvalModels = [
  { name: "No approval", detail: "A purchase order can move forward without a separate order approval only when an approved policy allows it." },
  { name: "Simple approval", detail: "One authorized approver reviews the order after its source request or award is checked." },
  { name: "Multi-level approval", detail: "Approvers decide in sequence; value, category and entity can determine each level." },
  { name: "Custom approval", detail: "The shared workflow engine chooses approvers using versioned rules and delegated authority." },
] as const;

function OrderSettings() {
  const { role, entityId } = useApp();
  const entity = useEntity();
  const config = useConfigStore();
  const [tab, setTab] = useState<Tab>("Preferences");
  const [preview, setPreview] = useState<(typeof approvalModels)[number]["name"]>("Multi-level approval");
  if (role !== "proc_admin") return <AppShell><RestrictedState title="Purchase order settings are for administrators" /></AppShell>;

  const policy = config.policy.entityId === entityId && config.policy.status === "Published" ? config.policy : null;
  return <AppShell>
    <Link to="/procurement/configuration" className="text-sm text-primary underline">← All settings</Link>
    <PageHeader eyebrow="Settings · Procurement" title="Purchase orders" description="Review how order approvals, issue and changes should work for this company. Preview choices on this page do not change any rule." />
    <div className="mt-5 rounded-xl border bg-surface p-4 text-sm" role="status">
      <strong>Current demo policy · {entity.name}</strong>
      <p className="mt-1 text-muted-foreground">{policy ? `Published v${policy.version}, effective ${policy.effective}. ${policy.approvalStrategy} approval model; competitive sourcing from ${policy.currency} ${policy.threshold.toLocaleString()}.` : "No published demo policy covers this company. The examples below are guidance only."}</p>
      <Button asChild variant="outline" size="sm" className="mt-3"><Link to="/procurement/configuration/policy">Open versioned buying rules</Link></Button>
    </div>
    <div role="tablist" aria-label="Purchase order settings" className="mt-5 flex gap-1 overflow-x-auto border-b">
      {tabs.map((name) => <button key={name} type="button" role="tab" aria-selected={tab === name} onClick={() => setTab(name)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === name ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{name}</button>)}
    </div>
    <section role="tabpanel" aria-label={tab} className="mt-5 max-w-5xl rounded-xl border bg-surface p-5">
      <h2 className="text-lg font-semibold">{tab}</h2>
      {tab === "Approvals" ? <>
        <p className="mt-1 text-sm text-muted-foreground">Compare approval paths before the business sets authority limits. The published policy above is the current demo rule; the selection below is only a preview.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{approvalModels.map((model) => <button key={model.name} type="button" aria-pressed={preview === model.name} onClick={() => setPreview(model.name)} className={`rounded-lg border p-4 text-left hover:border-primary ${preview === model.name ? "border-primary bg-primary/5" : ""}`}><strong className="text-sm">{model.name}</strong><span className="mt-1 block text-xs text-muted-foreground">{model.detail}</span></button>)}</div>
        <div className="mt-4 rounded-lg border bg-surface-muted p-4 text-sm"><strong>Preview: {preview}</strong><ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground"><li>Check approved request or award, vendor, coding and budget reference.</li><li>{preview === "No approval" ? "Confirm the published rule permits no separate order approval." : preview === "Simple approval" ? "Send to one authorized approver." : preview === "Multi-level approval" ? "Route through each required authority level." : "Evaluate the shared workflow rule and assign the matching approvers."}</li><li>Issue the order only after the required decisions and record the policy version.</li></ol></div>
      </> : tab === "Preferences" ? <div className="mt-3 grid gap-3 sm:grid-cols-2 text-sm"><div className="rounded-lg border p-3"><strong>Issue and acknowledgment</strong><p className="mt-1 text-muted-foreground">Record the issued version, delivery result and vendor response. Dispatch failures need an operator retry.</p></div><div className="rounded-lg border p-3"><strong>Changes after issue</strong><p className="mt-1 text-muted-foreground">Price, quantity, supplier or terms changes create a numbered revision and may require reapproval.</p></div><div className="rounded-lg border p-3"><strong>Receiving and closing</strong><p className="mt-1 text-muted-foreground">Track delivered and invoiced balances separately. Close only after open obligations are resolved.</p></div><div className="rounded-lg border p-3"><strong>Finance boundary</strong><p className="mt-1 text-muted-foreground">Finance owns budget balances, AP posting and payment. Procurement stores references and statuses.</p></div></div>
      : tab === "Fields" ? <p className="mt-2 text-sm text-muted-foreground">An order needs the legal entity, active vendor, currency, delivery and billing locations, source approval, item or service lines, price, tax reference, payment terms and due dates. Shared ERP metadata should own any additional custom fields.</p>
      : tab === "Validation Rules" ? <p className="mt-2 text-sm text-muted-foreground">Block an inactive vendor, unapproved source, expired contract, over-limit release or missing budget decision. Material changes return to approval. The server must enforce these rules; this page only describes the intended checks.</p>
      : tab === "Buttons" ? <p className="mt-2 text-sm text-muted-foreground">Available actions depend on state and permission: Save draft, Submit for approval, Approve, Issue, Record vendor response, Request change, Cancel and Close. A buyer cannot approve their own order where separation rules prohibit it.</p>
      : <p className="mt-2 text-sm text-muted-foreground">Show linked request lines, quote award, contract, revisions, deliveries, bills, vendor messages and audit history on the order. Each related list must respect company and record permissions.</p>}
    </section>
    <p className="mt-3 text-xs text-muted-foreground">Frontend guidance only. No approval, number series, workflow action or Finance integration is changed here.</p>
  </AppShell>;
}
