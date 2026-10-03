import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/platform/app-context";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { RestrictedState } from "@/platform/components/States";

export const Route = createFileRoute("/procurement/configuration_/bills")({
  head: () => ({ meta: [{ title: "Bill settings — Meridian ERP Procurement" }] }),
  component: BillSettings,
});

const tabs = ["Preferences", "Approvals", "Fields", "Validation Rules", "Buttons", "Related Lists"] as const;
const approvalTypes = [
  { name: "No Approval", detail: "No extra human bill approval. Required validation, matching and Finance posting controls still apply." },
  { name: "Simple Approval", detail: "One eligible user with approve permission, record scope and no duty conflict approves the bill." },
  { name: "Multi-Level Approval", detail: "All configured levels must approve in sequence before handoff." },
  { name: "Custom Approval", detail: "A versioned rule selects approvers using entity, amount, category, risk and exception type." },
] as const;

function BillSettings() {
  const { role } = useApp();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Preferences");
  const [selected, setSelected] = useState<(typeof approvalTypes)[number]["name"] | null>(null);
  if (role !== "proc_admin") return <AppShell><RestrictedState /></AppShell>;
  return <AppShell>
    <PageHeader eyebrow="Configuration · Module Settings" title="Bills" description="Review procurement-side bill preferences. Finance owns AP posting and payment execution." />
    <p className="mb-4 rounded-lg border bg-surface p-3 text-sm text-muted-foreground">Configuration preview: choices on this page are not saved or applied to bill workflows. <Link to="/procurement/configuration/policy" className="text-primary underline">Open the versioned policy studio</Link> for rules currently supported by this demo.</p>
    <div role="tablist" aria-label="Bill settings" className="mb-5 flex gap-1 overflow-x-auto border-b">{tabs.map((name) => <button key={name} role="tab" aria-selected={tab === name} onClick={() => setTab(name)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === name ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground"}`}>{name}</button>)}</div>
    <section role="tabpanel" aria-label={tab} className="max-w-4xl">
      {tab === "Approvals" ? <><h2 className="text-lg font-semibold">Approval Type</h2><p className="mt-1 text-sm text-muted-foreground">Choose a model to review its behavior. Activation requires a shared workflow engine, authority matrix and policy version.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{approvalTypes.map((type) => <button key={type.name} type="button" onClick={() => setSelected(type.name)} aria-pressed={selected === type.name} className={`rounded-lg border bg-surface p-4 text-left hover:border-primary ${selected === type.name ? "border-primary ring-1 ring-primary" : ""}`}><strong className="block text-sm">{type.name}</strong><span className="mt-1 block text-sm text-muted-foreground">{type.detail}</span></button>)}</div>{selected ? <p role="status" className="mt-4 rounded-lg border bg-surface p-3 text-sm">{selected} selected for review. No approval rule has been changed.</p> : null}</>
        : <><h2 className="text-lg font-semibold">{tab}</h2><p className="mt-2 text-sm text-muted-foreground">{tab === "Preferences" ? "Invoice intake, match method, duplicate checks, tolerances and Finance handoff belong in versioned procurement policy." : tab === "Fields" ? "Required invoice fields and data ownership must be set by legal entity and document type." : tab === "Validation Rules" ? "Validation rules need an owner, policy version, error message and override authority." : tab === "Buttons" ? "Transaction actions must be permissioned and tied to a valid state transition." : "Related records include PO, receipt, supplier, credit and Finance handoff references."}</p><div className="mt-4"><Button variant="outline" asChild><Link to="/procurement/configuration/policy">Open procurement policy</Link></Button></div></>}
    </section>
  </AppShell>;
}
