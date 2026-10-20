import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useApp, useEntity } from "@/platform/app-context";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { RestrictedState } from "@/platform/components/States";
import { SettingsTabs } from "@/modules/procurement/SettingsTabs";
import { settingsPanelProps } from "@/modules/procurement/settings-tab-utils";
import { useConfigStore } from "@/modules/procurement/payables/config-store";

export const Route = createFileRoute("/procurement/configuration_/$section")({ component: ModuleSettings });

const tabs = ["Preferences", "Approvals", "Fields", "Validation Rules", "Buttons", "Related Lists"] as const;
type Tab = (typeof tabs)[number];
type SectionKey = "vendors" | "items" | "purchases" | "requests" | "quotes" | "receives" | "credits";
type SettingsContent = {
  title: string;
  purpose: string;
  preferences: string[];
  approval: string;
  fields: string[];
  validation: string[];
  actions: string[];
  related: string[];
  destination: string;
  destinationLabel: string;
};

const content: Record<SectionKey, SettingsContent> = {
  vendors: {
    title: "Vendors", purpose: "Set up the information and checks needed before a vendor can receive an order.",
    preferences: ["A proposed vendor remains unavailable for orders until approved.", "Sensitive bank changes require a separate Finance check.", "Supplier portal access is limited to that vendor's own records."],
    approval: "Supplier activation, suspension and sensitive changes need independent review. The shared workflow engine applies the published policy.",
    fields: ["Company and display names", "Registration and tax references", "Contacts and addresses", "Categories and qualifications", "Restricted bank reference"],
    validation: ["Check likely duplicates by legal ID and normalized name.", "Require evidence by risk tier and category.", "Block ordering from suspended or unapproved vendors."],
    actions: ["Add vendor", "Invite", "Submit for review", "Approve or return", "Suspend"],
    related: ["Purchase requests", "Quote invitations", "Purchase orders", "Bills", "Contracts", "Review history"],
    destination: "/procurement/suppliers", destinationLabel: "Open vendors",
  },
  items: {
    title: "Items", purpose: "Define the goods and services employees can find when they make a request.",
    preferences: ["Show approved items in the employee catalog.", "Keep inactive items visible in past transactions.", "Use Inventory and Assets as the owners of stock and asset records."],
    approval: "An item or vendor price can require buyer review before it becomes available in the catalog.",
    fields: ["Name and item code", "Goods or service type", "Category and unit", "Eligible company and location", "Preferred vendor and price validity"],
    validation: ["Require a unique item code within its owner scope.", "Do not offer expired or blocked prices as current.", "Preserve earlier versions when item terms change."],
    actions: ["Add item", "Import items", "Edit", "Activate or deactivate", "Request this item"],
    related: ["Vendor offers", "Purchase requests", "Purchase orders", "Change history"],
    destination: "/procurement/catalog", destinationLabel: "Open items",
  },
  purchases: {
    title: "Purchases", purpose: "Explain the buying routes and when a request becomes a formal order.",
    preferences: ["Choose direct buying, competitive quotes, contract release or a controlled exception per policy.", "Track each approved request line separately.", "Keep budget commitment with the authoritative Finance service."],
    approval: "The shared workflow engine checks value, category, company, budget and sourcing method before commitment.",
    fields: ["Source request line", "Buying method", "Vendor", "Funding reference", "Amount and currency", "Business reason"],
    validation: ["Only approved quantities may be converted.", "Prevent duplicate allocation of the same request line.", "Escalate an amount or scope beyond source approval."],
    actions: ["Choose buying route", "Ask for quotes", "Make order", "Record exception"],
    related: ["Purchase requests", "Quote requests", "Contracts", "Purchase orders", "Budget decision"],
    destination: "/procurement/requests", destinationLabel: "Open purchase requests",
  },
  requests: {
    title: "Purchase requests", purpose: "Set the information employees provide and the path to approval.",
    preferences: ["Employees can choose a catalog item or describe a new need.", "A manager sees requests in their authority scope.", "Approved lines can move independently to quotes, contract buying or orders."],
    approval: "Need, funding and policy reviews are separate decisions. Self-approval is blocked unless a published exception says otherwise.",
    fields: ["Requester and company", "Purpose and required date", "Item, quantity and estimated cost", "Cost center or project", "Delivery location"],
    validation: ["Require valid coding and an active requester.", "Check budget and sourcing policy before approval.", "Recheck material changes after submission."],
    actions: ["Save draft", "Submit", "Approve", "Return", "Reject", "Withdraw"],
    related: ["Approval history", "Budget decision", "Quote requests", "Purchase orders", "Deliveries"],
    destination: "/procurement/requests", destinationLabel: "Open purchase requests",
  },
  quotes: {
    title: "Request for quotes", purpose: "Control vendor invitations, sealed replies and award recommendations.",
    preferences: ["Publish only after source and buyer review.", "Keep bids sealed until closing.", "Record late replies and supplier clarifications with timestamps."],
    approval: "Publication, exception to competition and final award can require different approvers and conflict checks.",
    fields: ["Title and requirements", "Approved source lines", "Invited vendors", "Closing date and time zone", "Scoring criteria and documents"],
    validation: ["Choose a future deadline.", "Use eligible vendors and approved quantities.", "Require scoring weights to total 100 percent."],
    actions: ["Save draft", "Submit for approval", "Publish", "Invite", "Close", "Compare bids", "Recommend award"],
    related: ["Purchase request lines", "Invitations", "Vendor replies", "Evaluation", "Award", "Purchase order"],
    destination: "/procurement/sourcing", destinationLabel: "Open quote requests",
  },
  receives: {
    title: "Purchase receives", purpose: "Record what physically arrived or which service was accepted.",
    preferences: ["Goods and services have separate acceptance details.", "Allow partial delivery against open quantity.", "Send accepted stock or asset information to the owning ERP module."],
    approval: "A receiver or service owner certifies acceptance. Over-delivery and reversal use controlled exceptions.",
    fields: ["Purchase order and delivery note", "Date and location", "Received and accepted quantity", "Condition or milestone", "Evidence and receiver"],
    validation: ["Do not accept more than remaining authorized quantity without approval.", "Keep rejected quantity distinct.", "Correct receipts through reversal with a reason."],
    actions: ["Record delivery", "Inspect", "Accept", "Reject", "Request return", "Reverse"],
    related: ["Purchase order", "Inspections", "Returns", "Inventory or asset handoff", "Bills"],
    destination: "/procurement/receiving", destinationLabel: "Open deliveries",
  },
  credits: {
    title: "Vendor credits", purpose: "Connect a vendor's commercial correction to the original bill and delivery.",
    preferences: ["Use a credit reference for returns, overbilling or cancelled services.", "Finance owns applying credits to the supplier ledger or processing refunds."],
    approval: "A buyer or AP reviewer confirms the commercial reason before Finance receives a credit reference.",
    fields: ["Original bill", "Vendor and company", "Credit amount and currency", "Reason and document reference"],
    validation: ["Credit cannot exceed the eligible original amount without review.", "Require a valid source transaction.", "Preserve credit and refund status separately."],
    actions: ["Add credit reference", "Review", "Send to Finance", "View status"],
    related: ["Vendor", "Original bill", "Return", "Finance credit status"],
    destination: "/procurement/payables/credits", destinationLabel: "Open vendor credits",
  },
};

const approvalTypes = ["No Approval", "Simple Approval", "Multi-Level Approval", "Custom Approval"] as const;

function ModuleSettings() {
  const { section } = Route.useParams();
  const { role, entityId } = useApp();
  const entity = useEntity();
  const config = useConfigStore();
  const [tab, setTab] = useState<Tab>("Preferences");
  const [preview, setPreview] = useState<(typeof approvalTypes)[number]>("Multi-Level Approval");
  if (role !== "proc_admin") return <AppShell><RestrictedState title="Procurement settings are for administrators" /></AppShell>;
  const settings = content[section as SectionKey];
  if (!settings) return <AppShell><PageHeader eyebrow="Settings" title="Setting unavailable" /><Button asChild variant="outline"><Link to="/procurement/configuration">All settings</Link></Button></AppShell>;
  const policy = config.policy.entityId === entityId && config.policy.status === "Published" ? config.policy : null;
  const points = tab === "Preferences" ? settings.preferences : tab === "Fields" ? settings.fields : tab === "Validation Rules" ? settings.validation : tab === "Buttons" ? settings.actions : settings.related;
  return <AppShell>
    <Link to="/procurement/configuration" className="text-sm text-primary underline">← All settings</Link>
    <PageHeader eyebrow={`Settings · ${entity.name}`} title={settings.title} description={settings.purpose} primaryAction={<Button variant="outline" asChild><Link to={settings.destination as never}>{settings.destinationLabel}</Link></Button>} />
    <div role="status" className="mt-5 rounded-xl border bg-surface p-4 text-sm"><strong>Published buying rules</strong><p className="mt-1 text-muted-foreground">{policy ? `Version ${policy.version} applies to ${entity.name}. Transaction settings below explain the intended behavior; approval changes must use a reviewed policy version.` : `No published demo policy for ${entity.name}. The examples below are guidance only.`}</p><Button asChild variant="outline" size="sm" className="mt-3"><Link to="/procurement/configuration/policy">Open buying rules</Link></Button></div>
    <SettingsTabs id={`setting-${section}`} label={`${settings.title} settings`} tabs={tabs} value={tab} onChange={setTab} />
    <section {...settingsPanelProps(`setting-${section}`, tabs, tab)} className="mt-5 max-w-5xl rounded-xl border bg-surface p-5">
      <h2 className="text-lg font-semibold">{tab}</h2>
      {tab === "Approvals" ? <><p className="mt-2 text-sm text-muted-foreground">{settings.approval}</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{approvalTypes.map((name) => <button key={name} type="button" aria-pressed={preview === name} onClick={() => setPreview(name)} className={`rounded-lg border p-4 text-left hover:border-primary ${preview === name ? "border-primary bg-primary/5" : ""}`}><strong className="text-sm">{name}</strong><span className="mt-1 block text-xs text-muted-foreground">{name === "No Approval" ? "Only where a published policy explicitly permits it." : name === "Simple Approval" ? "One authorized reviewer makes the decision." : name === "Multi-Level Approval" ? "Required reviewers decide in order." : "The shared workflow engine selects reviewers by rule."}</span></button>)}</div><p role="status" className="mt-4 rounded-lg border bg-surface-muted p-3 text-sm">Previewing {preview} for {settings.title.toLowerCase()}. No approval rule has changed.</p></>
        : <><p className="mt-2 text-sm text-muted-foreground">{tab === "Preferences" ? "The current design for this transaction is:" : tab === "Fields" ? "The essential information is:" : tab === "Validation Rules" ? "These checks should run before the relevant action:" : tab === "Buttons" ? "Actions shown when role, scope and state permit:" : "Related records stay inside the user's company and access scope:"}</p><ul className="mt-4 grid gap-3 sm:grid-cols-2">{points.map((point) => <li key={point} className="rounded-lg border p-3 text-sm">{point}</li>)}</ul></>}
    </section>
    <p className="mt-3 text-xs text-muted-foreground">Frontend guidance only. These previews do not publish policy, assign an approver or call another ERP service.</p>
  </AppShell>;
}
