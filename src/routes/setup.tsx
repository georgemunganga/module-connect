import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { entities } from "@/mock/data";
import { useApp } from "@/platform/app-context";
import { AppShell } from "@/platform/components/AppShell";
import { GuidedFlow, NextSteps } from "@/platform/components/GuidedFlow";
import type { FlowStep } from "@/platform/components/GuidedFlow";
import { PageHeader } from "@/platform/components/PageHeader";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "HR setup guide — Meridian ERP" },
      { name: "description", content: "Set up the HR module from empty: organisation, roles, capabilities, policies and first workers." },
      { property: "og:title", content: "HR setup guide — Meridian ERP" },
      { property: "og:description", content: "Set up the HR module from empty in six short, resumable steps." },
    ],
  }),
  component: SetupPage,
});

const tiers = [
  { id: "core", label: "Core people records", detail: "Workers, org structure, documents.", on: true, locked: true },
  { id: "leave", label: "Leave and absence", detail: "Balances, policies, approvals.", on: true },
  { id: "attendance", label: "Attendance and time", detail: "Clocking, corrections, shift rules.", on: true },
  { id: "cases", label: "HR requests and cases", detail: "Letters, data changes, queries.", on: true },
  { id: "pay", label: "Pay visibility", detail: "Payslips and calculation explanations.", on: false },
  { id: "speakup", label: "Protected disclosures", detail: "Anonymous intake, restricted handling.", on: false },
];

function Field({ id, label, hint, defaultValue }: { id: string; label: string; hint?: string; defaultValue?: string }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} defaultValue={defaultValue} className="mt-1" aria-describedby={hint ? `${id}-hint` : undefined} />
      {hint ? <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function SetupPage() {
  const { completeSetup, setupComplete, resetSetup } = useApp();
  const navigate = useNavigate();
  const [done, setDone] = useState(false);
  const [enabled, setEnabled] = useState(() => Object.fromEntries(tiers.map((t) => [t.id, t.on])));

  const steps: FlowStep[] = [
    {
      id: "org",
      title: "Organisation basics",
      purpose: "Who you are as an employer. This drives references, calendars and statutory defaults.",
      render: () => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="org-name" label="Organisation name" defaultValue="Meridian Industrial Services" />
          <Field id="org-entity" label="Primary legal entity" defaultValue={entities[0].name} hint="You can add the other entities later." />
          <Field id="org-country" label="Primary country" defaultValue="Netherlands" />
          <Field id="org-currency" label="Reporting currency" defaultValue="EUR" />
        </div>
      ),
    },
    {
      id: "people",
      title: "Invite HR staff and assign roles",
      purpose: "Give the people who will run HR the right access before any worker data exists.",
      render: () => (
        <div className="space-y-3">
          {[
            { email: "priya.r@meridian.example", role: "HR operations" },
            { email: "wanjiru.kamau@meridian.example", role: "Payroll" },
          ].map((p) => (
            <div key={p.email} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border bg-surface-muted p-3">
              <span className="min-w-0 truncate text-sm">{p.email}</span>
              <span className="text-xs text-muted-foreground">{p.role}</span>
            </div>
          ))}
          <Field id="invite" label="Invite someone else" hint="Mock only — no email is sent." />
        </div>
      ),
      optional: true,
    },
    {
      id: "tiers",
      title: "Choose capability tiers",
      purpose: "Turn on only what you need now. Safe defaults are preselected and nothing is irreversible.",
      render: () => (
        <ul className="space-y-3">
          {tiers.map((t) => (
            <li key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-md border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.detail}{t.locked ? " · Always on" : ""}</p>
              </div>
              <Switch
                checked={enabled[t.id]}
                disabled={t.locked}
                aria-label={t.label}
                onCheckedChange={(v) => setEnabled((s) => ({ ...s, [t.id]: v }))}
              />
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: "policies",
      title: "Core policies",
      purpose: "Defaults chosen to be safe and compliant. Change them now, or later in Configuration.",
      render: () => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="p-annual" label="Annual leave entitlement (days)" defaultValue="25" />
          <Field id="p-notice" label="Leave notice period (days)" defaultValue="21" />
          <Field id="p-sick" label="Medical certificate required after (days)" defaultValue="2" />
          <Field id="p-approver" label="Default approver" defaultValue="Line manager" />
        </div>
      ),
    },
    {
      id: "workers",
      title: "Add or import your first workers",
      purpose: "Nothing else in HR works without people. Import a file or add a few by hand.",
      render: () => (
        <div className="space-y-3">
          <div className="rounded-md border border-dashed p-6 text-center">
            <p className="text-sm font-medium">Drop a CSV here</p>
            <p className="mt-1 text-xs text-muted-foreground">Mock import — the sample dataset of 8 workers is already loaded.</p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox defaultChecked aria-label="Use sample data" className="mt-0.5" />
            <span>Keep the sample worker dataset so screens have realistic content.</span>
          </label>
        </div>
      ),
      optional: true,
    },
    {
      id: "review",
      title: "Review and go live",
      purpose: "Confirm what you've set up. After this, Home becomes your work queue.",
      render: () => (
        <dl className="grid gap-3 sm:grid-cols-2">
          {[
            ["Organisation", "Meridian Industrial Services · NL"],
            ["HR staff invited", "2 people"],
            ["Capabilities on", Object.entries(enabled).filter(([, v]) => v).length + " of " + tiers.length],
            ["Policies", "4 defaults accepted"],
            ["Workers loaded", "8 sample workers"],
            ["Go-live", "Immediate"],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-md border bg-surface-muted px-3 py-2">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="text-sm font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      ),
    },
  ];

  return (
    <AppShell>
      <PageHeader
        eyebrow="First-run setup"
        title="Set up HR"
        description="Six short steps. Your progress saves automatically, so you can stop and come back."
        primaryAction={
          setupComplete ? (
            <Button variant="outline" onClick={resetSetup}>
              Reopen setup
            </Button>
          ) : (
            <Button variant="ghost" asChild>
              <Link to="/">Skip for now</Link>
            </Button>
          )
        }
      />
      <GuidedFlow
        flowId="hr-setup"
        steps={steps}
        submitLabel="Go live"
        allowSkip
        onSubmit={() => {
          completeSetup();
          setDone(true);
        }}
        submitted={
          done ? (
            <NextSteps
              reference="Setup complete"
              title="HR is live"
              steps={[
                "Home now shows your prioritised work queue.",
                "Employees can raise leave, attendance and HR requests.",
                "Everything else — policies, roles, integrations — lives under Configuration.",
              ]}
              actions={
                <Button onClick={() => navigate({ to: "/" })}>Go to Home</Button>
              }
            />
          ) : undefined
        }
      />
    </AppShell>
  );
}
