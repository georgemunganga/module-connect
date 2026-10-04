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
  { name: "No Approval", detail: "No extra person needs to approve the bill. The system still checks the bill, and Finance still records it." },
  { name: "Simple Approval", detail: "One authorized person approves the bill. The person who created it cannot approve it when the rules forbid that." },
  { name: "Multi-Level Approval", detail: "Several people approve the bill in order. Everyone required must approve." },
  { name: "Custom Approval", detail: "Choose different approvers based on the company, amount, type of purchase or problem found." },
] as const;

function BillSettings() {
  const { role } = useApp();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Preferences");
  const [selected, setSelected] = useState<(typeof approvalTypes)[number]["name"] | null>(null);
  if (role !== "proc_admin") return <AppShell><RestrictedState /></AppShell>;
  return <AppShell>
    <PageHeader eyebrow="Settings · Bills" title="Bill settings" description="Review how bills should be checked and approved. Finance records and pays them." />
    <p className="mb-4 rounded-lg border bg-surface p-3 text-sm text-muted-foreground">This page is a preview. Choosing an option here will not change approvals. <Link to="/procurement/configuration/policy" className="text-primary underline">Open buying rules</Link> to see the rules available in this demo.</p>
    <div role="tablist" aria-label="Bill settings" className="mb-5 flex gap-1 overflow-x-auto border-b">{tabs.map((name) => <button key={name} role="tab" aria-selected={tab === name} onClick={() => setTab(name)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === name ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground"}`}>{name}</button>)}</div>
    <section role="tabpanel" aria-label={tab} className="max-w-4xl">
      {tab === "Approvals" ? <><h2 className="text-lg font-semibold">Who approves a bill?</h2><p className="mt-1 text-sm text-muted-foreground">Choose an option to read how it would work. This preview does not turn the option on.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{approvalTypes.map((type) => <button key={type.name} type="button" onClick={() => setSelected(type.name)} aria-pressed={selected === type.name} className={`rounded-lg border bg-surface p-4 text-left hover:border-primary ${selected === type.name ? "border-primary ring-1 ring-primary" : ""}`}><strong className="block text-sm">{type.name}</strong><span className="mt-1 block text-sm text-muted-foreground">{type.detail}</span></button>)}</div>{selected ? <p role="status" className="mt-4 rounded-lg border bg-surface p-3 text-sm">You are viewing {selected}. No rule has been changed.</p> : null}</>
        : <><h2 className="text-lg font-semibold">{tab}</h2><p className="mt-2 text-sm text-muted-foreground">{tab === "Preferences" ? "Choose how bills arrive, how they are compared with orders, and which differences need review." : tab === "Fields" ? "Choose which details people must enter on a bill." : tab === "Validation Rules" ? "Choose which mistakes block a bill and who can approve a correction." : tab === "Buttons" ? "Choose which actions appear at each step and who may use them." : "See the order, delivery, vendor, credit and Finance record linked to a bill."}</p><div className="mt-4"><Button variant="outline" asChild><Link to="/procurement/configuration/policy">Open buying rules</Link></Button></div></>}
    </section>
  </AppShell>;
}
