import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppShell } from "@/platform/components/AppShell";
import { GuidedFlow, NextSteps } from "@/platform/components/GuidedFlow";
import type { FlowStep } from "@/platform/components/GuidedFlow";
import { PageHeader } from "@/platform/components/PageHeader";
import { supplierRecords } from "@/modules/procurement/suppliers";

export const Route = createFileRoute("/procurement/suppliers_/new")({
  head: () => ({
    meta: [
      { title: "Propose supplier — Meridian ERP Procurement" },
      { name: "description", content: "Step-by-step supplier onboarding: identity, legal references, contacts, categories, documents and review." },
      { property: "og:title", content: "Propose supplier — Meridian ERP Procurement" },
      { property: "og:description", content: "Guided supplier onboarding with duplicate checks." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewSupplier,
});

function NewSupplier() {
  const [f, setF] = useState({ name: "", country: "Netherlands", registration: "", taxRef: "", contact: "", email: "", categories: "", reviewer: "Priya Raman" });
  const [docs, setDocs] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const dupes = f.name.length > 2 ? supplierRecords.filter((s) => s.name.toLowerCase().includes(f.name.toLowerCase().slice(0, 4))) : [];
  const required = f.country === "Kenya" ? ["KRA PIN certificate", "Bank letter"] : ["Chamber of Commerce extract", "Bank confirmation letter"];

  const field = (id: keyof typeof f, label: string, type = "text") => (
    <div><Label htmlFor={id}>{label}</Label><Input id={id} type={type} className="mt-1" value={f[id]} onChange={set(id)} /></div>
  );

  const steps: FlowStep[] = [
    { id: "identity", title: "Company identity", purpose: "We check for existing suppliers before creating a new one.", render: () => (
      <div className="grid max-w-lg gap-4">
        {field("name", "Trading name")}
        <div><Label htmlFor="country">Country</Label><select id="country" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" value={f.country} onChange={set("country")}><option>Netherlands</option><option>Germany</option><option>Kenya</option></select></div>
        {dupes.length ? <p role="status" className="flex gap-2 rounded-md bg-warning-soft p-3 text-sm"><AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />Possible duplicate: {dupes.map((d) => d.name).join(", ")}. The reviewer will confirm.</p> : null}
      </div>) },
    { id: "legal", title: "Legal and tax references", purpose: "Used for verification. Format isn't validated against any tax authority in this demo.", render: () => <div className="grid max-w-lg gap-4">{field("registration", "Company registration number")}{field("taxRef", "Tax reference")}</div> },
    { id: "contacts", title: "Contacts and categories", purpose: "Who we deal with, and what they supply.", render: () => <div className="grid max-w-lg gap-4">{field("contact", "Main contact name")}{field("email", "Contact email", "email")}{field("categories", "Categories (comma separated)")}</div> },
    { id: "documents", title: "Required documents", purpose: "Activation is blocked until these are present. Demo only — nothing is uploaded.", render: () => (
      <ul className="space-y-2">{required.map((r) => (
        <li key={r} className="flex items-center justify-between rounded-lg border p-3 text-sm">{r}
          {docs.includes(r) ? <span className="text-success">Attached</span> : <Button size="sm" variant="outline" onClick={() => setDocs([...docs, r])}>Attach (demo)</Button>}
        </li>))}</ul>) },
    { id: "review", title: "Review and assign", purpose: "A supplier steward reviews it. Payment details are verified separately by Finance.", render: () => (
      <div className="space-y-3 text-sm">
        <div><Label htmlFor="reviewer">Reviewer</Label><select id="reviewer" className="mt-1 h-9 w-full max-w-sm rounded-md border bg-background px-3 text-sm" value={f.reviewer} onChange={set("reviewer")}><option>Priya Raman</option><option>Grace Wanjiru</option></select></div>
        <p>{f.name || "Unnamed supplier"} · {f.country} · {f.registration || "no registration yet"}</p>
        <p>{docs.length}/{required.length} documents attached{docs.length < required.length ? " — the supplier will start as “More information required”." : "."}</p>
      </div>) },
  ];

  return (
    <AppShell>
      <PageHeader eyebrow="Suppliers" title="Propose a supplier" description="Five short steps. Your progress saves as a draft." />
      <GuidedFlow flowId="proc-supplier-new" steps={steps} submitLabel="Send for review"
        onSubmit={async () => { if (!f.name.trim()) return; await new Promise((r) => setTimeout(r, 500)); setDone(true); sessionStorage.removeItem("flow:proc-supplier-new"); }}
        submitted={done ? <NextSteps reference="SUP-2026-0019" title="Sent for review (demo)" steps={[`${f.reviewer} reviews identity, duplicates and documents.`, "Finance verifies payment details separately once the supplier provides them.", "The supplier can't be used on orders until both are approved."]} actions={<Button asChild><Link to="/procurement/suppliers">Back to suppliers</Link></Button>} /> : undefined}
      />
    </AppShell>
  );
}
