import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, CircleHelp, ClipboardList, CreditCard, Settings2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useApp, useEntity } from "@/platform/app-context";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { RestrictedState } from "@/platform/components/States";
import { gettingStartedSteps, useGettingStarted } from "@/modules/procurement/getting-started";
import type { GettingStartedStep } from "@/modules/procurement/getting-started";

export const Route = createFileRoute("/procurement/getting-started")({
  head: () => ({ meta: [
    { title: "Getting started — Meridian ERP Procurement" },
    { name: "description", content: "Review buying controls, make a first purchase, and connect invoice and Finance workflows in three steps." },
  ] }),
  component: GettingStarted,
});

const steps: {
  id: GettingStartedStep;
  title: string;
  summary: string;
  icon: typeof Settings2;
  tasks: { title: string; detail: string; href: string; action: string }[];
}[] = [
  {
    id: "controls", title: "Set buying controls", icon: Settings2,
    summary: "Review what people may buy, who can supply it, and who may approve it.",
    tasks: [
      { title: "Check buying rules and approvals", detail: "Choose spending limits, when quotes are needed, and who approves a purchase.", href: "/procurement/configuration/policy", action: "Open buying rules" },
      { title: "Check vendors", detail: "See which vendors are approved and whether Finance has checked their payment details.", href: "/procurement/suppliers", action: "Open vendors" },
      { title: "Check items", detail: "Make approved goods and services easy for employees to find.", href: "/procurement/catalog", action: "Open items" },
    ],
  },
  {
    id: "first-purchase", title: "Run a first purchase", icon: ClipboardList,
    summary: "Follow one request from approval to an order and delivery.",
    tasks: [
      { title: "Ask to buy something", detail: "Create a request from an item on the list, or describe something new.", href: "/procurement/requests", action: "Open requests" },
      { title: "Review an approval", detail: "A manager can approve, send back or decline a request and see what needs fixing.", href: "/procurement/approvals", action: "Open approvals" },
      { title: "Follow the order", detail: "See what was ordered and what has arrived or been completed.", href: "/procurement/orders", action: "Open orders" },
    ],
  },
  {
    id: "finance", title: "Check bills and payments", icon: CreditCard,
    summary: "See how a bill is checked, sent to Finance, and marked paid.",
    tasks: [
      { title: "Check incoming bills", detail: "Add a bill and compare it with the order and delivery. The system also checks for duplicates.", href: "/procurement/invoices", action: "Open bills" },
      { title: "Check bill rules", detail: "Decide when a delivery must be checked and who handles differences.", href: "/procurement/configuration/policy", action: "Open buying rules" },
      { title: "Check the Finance connection", detail: "Finance records and pays bills. This demo shows sample updates only.", href: "/procurement/configuration", action: "Open settings" },
    ],
  },
];

function GettingStarted() {
  const { role, entityId } = useApp();
  const entity = useEntity();
  const { progress, loaded, reviewedCount, setReviewed } = useGettingStarted(entityId);
  const [active, setActive] = useState<GettingStartedStep>("controls");
  if (role !== "proc_admin") return <AppShell><RestrictedState title="Procurement setup is for administrators" body="Ask your Procurement administrator for the setup guide. Employees can start from the catalog or My requests." /></AppShell>;

  const selected = steps.find((step) => step.id === active)!;
  const Icon = selected.icon;
  return <AppShell>
    <PageHeader eyebrow="First use · Procurement" title="Getting started" description={`Three steps to prepare ${entity.name} for purchasing. Work through them in any order; your review progress is saved in this browser.`} primaryAction={<Button asChild variant="outline"><Link to="/procurement">Go to home</Link></Button>} />

    <section className="mt-5 rounded-xl border bg-surface p-4" aria-label="Setup progress">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><p className="font-medium">{loaded ? `${reviewedCount} of 3 steps reviewed` : "Loading progress"}</p><p className="text-muted-foreground">{entity.name}</p></div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${reviewedCount / 3 * 100}%` }} /></div>
      <p className="mt-2 text-xs text-muted-foreground">Marking a step reviewed only tracks your progress. It does not turn on a rule or approve spending.</p>
    </section>

    <div className="mt-5 grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <nav aria-label="Getting started steps" className="space-y-2">
        {steps.map((step, index) => {
          const StepIcon = step.icon;
          return <button key={step.id} type="button" onClick={() => setActive(step.id)} aria-current={active === step.id ? "step" : undefined} className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${active === step.id ? "border-primary bg-primary/5" : "bg-surface hover:border-border-strong"}`}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-background">{progress[step.id] ? <Check className="size-4 text-success" aria-hidden /> : <StepIcon className="size-4" aria-hidden />}</span>
            <span className="min-w-0"><span className="block text-xs text-muted-foreground">Step {index + 1}</span><span className="block text-sm font-medium">{step.title}</span></span>
          </button>;
        })}
      </nav>
      <section className="min-w-0 rounded-xl border bg-surface p-5" aria-labelledby="step-heading">
        <div className="flex items-start gap-3"><span className="rounded-lg bg-primary/10 p-2"><Icon className="size-5 text-primary" aria-hidden /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step {gettingStartedSteps.indexOf(active) + 1} of 3</p><h2 id="step-heading" className="text-lg font-semibold">{selected.title}</h2><p className="mt-1 text-sm text-muted-foreground">{selected.summary}</p></div></div>
        <ul className="mt-5 divide-y border-y">
          {selected.tasks.map((task) => <li key={task.title} className="flex flex-wrap items-start justify-between gap-3 py-4"><div className="max-w-xl"><h3 className="text-sm font-medium">{task.title}</h3><p className="mt-1 text-xs text-muted-foreground">{task.detail}</p></div><a href={task.href} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">{task.action}<ArrowRight className="size-4" aria-hidden /></a></li>)}
        </ul>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <Button variant={progress[active] ? "outline" : "default"} onClick={() => setReviewed(active, !progress[active])} disabled={!loaded}>{progress[active] ? "Mark as not reviewed" : "Mark step reviewed"}</Button>
          {active !== "finance" ? <Button variant="ghost" onClick={() => setActive(gettingStartedSteps[gettingStartedSteps.indexOf(active) + 1])}>Next step <ArrowRight className="ml-1 size-4" aria-hidden /></Button> : <Button variant="ghost" asChild><Link to="/procurement">Open work queue <ArrowRight className="ml-1 size-4" aria-hidden /></Link></Button>}
        </div>
      </section>
    </div>

    <aside className="mt-5 flex items-start gap-3 rounded-lg border bg-surface-muted p-4 text-sm"><CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden /><p><strong>Need help?</strong> Start with the links above. This is a demo: it does not send real bank, vendor or accounting messages.</p></aside>
  </AppShell>;
}
