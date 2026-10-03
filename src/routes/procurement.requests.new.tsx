import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Copy, Info, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AppShell } from "@/platform/components/AppShell";
import { GuidedFlow, NextSteps } from "@/platform/components/GuidedFlow";
import type { FlowStep } from "@/platform/components/GuidedFlow";
import { PageHeader } from "@/platform/components/PageHeader";

export const Route = createFileRoute("/procurement/requests/new")({
  head: () => ({
    meta: [
      { title: "Create request — Meridian ERP Procurement" },
      { name: "description", content: "Guided buying: choose what you need, pick catalog or contract items first, then review approvals before submitting." },
      { property: "og:title", content: "Create request — Meridian ERP Procurement" },
      { property: "og:description", content: "Guided buying with catalog-first search and clear approval expectations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewRequest,
});

type Kind = "Goods" | "Service" | "Asset" | "Subscription";
type Line = { id: string; description: string; qty: number; unitPrice: number; source: "Catalog" | "Contract" | "Non-catalog"; supplier: string };

/** Demo catalog. `block` explains why an item can't be added and what to do instead. */
const catalog: { id: string; name: string; kind: Kind; price: number; supplier: string; source: "Catalog" | "Contract"; block?: string }[] = [
  { id: "c1", name: "Laptop 14\" standard build", kind: "Asset", price: 1230, supplier: "Northwind Devices B.V.", source: "Contract" },
  { id: "c2", name: "Ergonomic office chair", kind: "Goods", price: 360, supplier: "Studio Zit", source: "Catalog" },
  { id: "c3", name: "Safety boots, size range", kind: "Goods", price: 64, supplier: "Kifaru Safety Ltd", source: "Catalog" },
  { id: "c4", name: "Design tool licence (annual)", kind: "Subscription", price: 540, supplier: "—", source: "Catalog", block: "Software needs IT security review first. Raise an IT request, then add it here with the review reference." },
  { id: "c5", name: "Freight, Nairobi → Mombasa", kind: "Service", price: 1450, supplier: "Achieng & Partners Logistics", source: "Catalog", block: "Supplier is not onboarded yet. Choose another freight item, or ask the supplier steward to finish onboarding." },
  { id: "c6", name: "Cleaning service, monthly", kind: "Service", price: 820, supplier: "Sparkle Facilities", source: "Contract" },
];

type Draft = { kind: Kind | null; lines: Line[]; purpose: string; neededBy: string; deliverTo: string; costCentre: string; project: string; evidence: string[] };
const empty: Draft = { kind: null, lines: [], purpose: "", neededBy: "", deliverTo: "Amsterdam HQ, Keizersgracht 100", costCentre: "", project: "", evidence: [] };
const KEY = "proc:draft:new";
const CCY = "EUR";
const fmt = (n: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency: CCY }).format(n);

function NewRequest() {
  const navigate = useNavigate();
  const [d, setD] = useState<Draft>(empty);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [nc, setNc] = useState({ description: "", qty: 1, unitPrice: 0, reason: "" });
  const [ref, setRef] = useState<string | null>(null);
  const [budgetDown, setBudgetDown] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(KEY);
    if (raw) setD({ ...empty, ...JSON.parse(raw) });
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) sessionStorage.setItem(KEY, JSON.stringify(d));
  }, [d, loaded]);

  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const total = d.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const results = useMemo(
    () => catalog.filter((c) => (!d.kind || c.kind === d.kind) && c.name.toLowerCase().includes(q.toLowerCase())),
    [q, d.kind],
  );
  const missing = [
    !d.kind && "what you're buying",
    !d.lines.length && "at least one line",
    !d.purpose.trim() && "a purpose",
    !d.neededBy && "a needed-by date",
    !d.costCentre && "a cost centre",
  ].filter(Boolean) as string[];

  const steps: FlowStep[] = [
    {
      id: "kind",
      title: "What do you need?",
      purpose: "This decides which catalog, rules and approvers apply.",
      render: () => (
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Request type</legend>
          {(["Goods", "Service", "Asset", "Subscription"] as Kind[]).map((k) => (
            <label key={k} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${d.kind === k ? "border-primary bg-primary-soft" : ""}`}>
              <input type="radio" name="kind" checked={d.kind === k} onChange={() => set({ kind: k })} className="mt-1" />
              <span>
                <span className="block text-sm font-medium">{k}</span>
                <span className="text-xs text-muted-foreground">
                  {{ Goods: "Physical items used up or kept", Service: "Work done by a supplier", Asset: "Equipment tracked over years", Subscription: "Recurring software or services" }[k]}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      ),
    },
    {
      id: "items",
      title: "Find items",
      purpose: "Catalog and contract items are faster and pre-approved on price. Use a non-catalog line only if nothing fits.",
      render: () => (
        <div className="space-y-5">
          <div>
            <Label htmlFor="cat-q">Search catalog and contract offers</Label>
            <Input id="cat-q" className="mt-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. chair, laptop, freight" />
          </div>
          {results.length ? (
            <ul className="space-y-2">
              {results.map((c) => (
                <li key={c.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.source} · {c.supplier} · {fmt(c.price)} each (indicative)</p>
                    </div>
                    <Button size="sm" variant="outline" disabled={!!c.block}
                      onClick={() => set({ lines: [...d.lines, { id: crypto.randomUUID(), description: c.name, qty: 1, unitPrice: c.price, source: c.source, supplier: c.supplier }] })}>
                      <Plus className="size-4" aria-hidden /> Add
                    </Button>
                  </div>
                  {c.block ? (
                    <p className="mt-2 flex gap-2 rounded-md bg-warning-soft p-2 text-xs"><AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden /><span><strong>Can't add:</strong> {c.block}</span></p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No catalog items match. Add a non-catalog line below.</p>
          )}
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Nothing fits? Add a non-catalog line</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><Label htmlFor="nc-d">Description</Label><Input id="nc-d" className="mt-1" value={nc.description} onChange={(e) => setNc({ ...nc, description: e.target.value })} /></div>
              <div><Label htmlFor="nc-q">Quantity</Label><Input id="nc-q" type="number" min={1} className="mt-1" value={nc.qty} onChange={(e) => setNc({ ...nc, qty: Number(e.target.value) })} /></div>
              <div><Label htmlFor="nc-p">Estimated unit price ({CCY})</Label><Input id="nc-p" type="number" min={0} className="mt-1" value={nc.unitPrice} onChange={(e) => setNc({ ...nc, unitPrice: Number(e.target.value) })} /></div>
              <div className="sm:col-span-2"><Label htmlFor="nc-r">Why isn't a catalog item suitable? (required)</Label><Textarea id="nc-r" className="mt-1" value={nc.reason} onChange={(e) => setNc({ ...nc, reason: e.target.value })} /></div>
            </div>
            <Button size="sm" className="mt-3" disabled={!nc.description || nc.qty < 1 || nc.unitPrice <= 0 || !nc.reason.trim()}
              onClick={() => { set({ lines: [...d.lines, { id: crypto.randomUUID(), description: nc.description, qty: nc.qty, unitPrice: nc.unitPrice, source: "Non-catalog", supplier: "To be sourced by buyer" }] }); setNc({ description: "", qty: 1, unitPrice: 0, reason: "" }); }}>
              Add non-catalog line
            </Button>
          </details>
          <LineEditor d={d} set={set} />
        </div>
      ),
    },
    {
      id: "delivery",
      title: "Purpose and delivery",
      purpose: "Approvers read the purpose first. The date and place tell the buyer how fast to act.",
      render: () => (
        <div className="grid max-w-lg gap-4">
          <div><Label htmlFor="p">Purpose</Label><Textarea id="p" className="mt-1" placeholder="What is this for, and who benefits?" value={d.purpose} onChange={(e) => set({ purpose: e.target.value })} /></div>
          <div><Label htmlFor="nb">Needed by</Label><Input id="nb" type="date" className="mt-1" value={d.neededBy} onChange={(e) => set({ neededBy: e.target.value })} /></div>
          <div><Label htmlFor="dt">Deliver to</Label><Input id="dt" className="mt-1" value={d.deliverTo} onChange={(e) => set({ deliverTo: e.target.value })} /></div>
        </div>
      ),
    },
    {
      id: "accounting",
      title: "Who pays",
      purpose: "The cost centre decides which budget holder approves.",
      render: () => (
        <div className="grid max-w-lg gap-4">
          <div>
            <Label htmlFor="cc">Cost centre</Label>
            <select id="cc" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" value={d.costCentre} onChange={(e) => set({ costCentre: e.target.value })}>
              <option value="">Choose…</option>
              <option>NL-ENG-410 Engineering</option>
              <option>NL-OPS-200 Operations</option>
              <option>NL-PPL-120 People</option>
            </select>
          </div>
          <div><Label htmlFor="pj">Project (optional)</Label><Input id="pj" className="mt-1" value={d.project} onChange={(e) => set({ project: e.target.value })} /></div>
        </div>
      ),
    },
    {
      id: "evidence",
      title: "Attach evidence",
      optional: true,
      purpose: "Quotes or specs help the buyer and approvers. Demo only — files aren't uploaded anywhere.",
      render: () => (
        <div className="space-y-3">
          <Button variant="outline" onClick={() => set({ evidence: [...d.evidence, `quote-${d.evidence.length + 1}.pdf`] })}>Attach a file (demo)</Button>
          {d.evidence.length ? (
            <ul className="space-y-1 text-sm">{d.evidence.map((f) => <li key={f} className="flex items-center justify-between rounded border px-3 py-1.5">{f}<Button size="sm" variant="ghost" aria-label={`Remove ${f}`} onClick={() => set({ evidence: d.evidence.filter((x) => x !== f) })}><Trash2 className="size-4" /></Button></li>)}</ul>
          ) : <p className="text-sm text-muted-foreground">No files attached.</p>}
        </div>
      ),
    },
    {
      id: "review",
      title: "Review and submit",
      purpose: "Check what happens next before you send it.",
      render: () => (
        <div className="space-y-4 text-sm">
          {missing.length ? (
            <div role="alert" className="rounded-md border border-danger/40 bg-danger-soft p-3">
              <strong>Still needed:</strong> {missing.join(", ")}.
            </div>
          ) : null}
          <div className="rounded-md border p-3">
            <p className="font-medium">Expected approvals</p>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              <li>Budget holder for {d.costCentre || "the chosen cost centre"}</li>
              {total > 10000 ? <li>Procurement: 3 quotes needed above {fmt(10000)} (demo rule, not yet confirmed)</li> : null}
              {d.lines.some((l) => l.source === "Non-catalog") ? <li>Buyer reviews non-catalog lines before sourcing</li> : null}
            </ul>
          </div>
          <div className="rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">Budget</p>
              <Button size="sm" variant="ghost" onClick={() => setBudgetDown((b) => !b)}>{budgetDown ? "Restore" : "Simulate"} budget service outage</Button>
            </div>
            {budgetDown ? (
              <p className="mt-1 flex gap-2 text-warning"><AlertTriangle className="size-4 shrink-0" aria-hidden />Budget check unavailable. You can still submit; the budget holder will check funds before approving.</p>
            ) : (
              <p className="mt-1 flex gap-2 text-muted-foreground"><Info className="size-4 shrink-0" aria-hidden />Indicative: within remaining budget. Funds are <strong>not reserved</strong> — only Finance can confirm that.</p>
            )}
          </div>
        </div>
      ),
    },
  ];

  return (
    <AppShell>
      <PageHeader eyebrow="Procurement" title="Create request" description="Answer a few questions. Your draft saves as you go." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <GuidedFlow
          flowId="proc-request-new"
          steps={steps}
          submitLabel="Submit request"
          onSubmit={async () => {
            if (missing.length) return;
            await new Promise((r) => setTimeout(r, 600));
            setRef(`PR-2026-${1045 + Math.floor(Math.random() * 50)}`);
            sessionStorage.removeItem(KEY);
            sessionStorage.removeItem("flow:proc-request-new");
          }}
          submitted={
            ref ? (
              <NextSteps
                reference={ref}
                title="Request submitted (demo)"
                steps={[
                  `The budget holder for ${d.costCentre} is asked to decide, normally within 3 working days.`,
                  "If approved, a buyer sources or orders it. Nothing has been sent to a supplier yet.",
                  "You'll see status, owner and next step on My requests.",
                ]}
                actions={<><Button onClick={() => navigate({ to: "/procurement/requests" })}>View my requests</Button><Button variant="outline" asChild><Link to="/procurement">Back to Home</Link></Button></>}
              />
            ) : undefined
          }
        />
        {!ref ? (
          <aside aria-label="Request summary" className="h-fit rounded-lg border bg-surface p-4 text-sm xl:sticky xl:top-20">
            <h2 className="font-semibold">Summary</h2>
            <dl className="mt-3 space-y-2">
              <Row k="Type" v={d.kind ?? "—"} />
              <Row k="Lines" v={String(d.lines.length)} />
              <Row k="Estimated total" v={`${fmt(total)} (${CCY})`} />
              <Row k="Needed by" v={d.neededBy || "—"} />
              <Row k="Deliver to" v={d.deliverTo || "—"} />
            </dl>
            <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
              <Button size="sm" variant="outline" onClick={() => set({ lines: [...d.lines, ...d.lines.map((l) => ({ ...l, id: crypto.randomUUID() }))] })} disabled={!d.lines.length}><Copy className="size-4" aria-hidden />Duplicate lines</Button>
              <Button size="sm" variant="ghost" onClick={() => { setD(empty); sessionStorage.removeItem(KEY); }}>Discard draft</Button>
            </div>
          </aside>
        ) : null}
      </div>
    </AppShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v}</dd></div>;
}

function LineEditor({ d, set }: { d: Draft; set: (p: Partial<Draft>) => void }) {
  if (!d.lines.length) return <p className="text-sm text-muted-foreground">No lines yet.</p>;
  return (
    <div>
      <h3 className="text-sm font-semibold">Your lines</h3>
      <ul className="mt-2 space-y-2">
        {d.lines.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
            <span className="min-w-0 flex-1"><span className="block font-medium">{l.description}</span><span className="text-xs text-muted-foreground">{l.source} · {l.supplier}</span></span>
            <Label htmlFor={`q-${l.id}`} className="sr-only">Quantity for {l.description}</Label>
            <Input id={`q-${l.id}`} type="number" min={1} className="w-20" value={l.qty} onChange={(e) => set({ lines: d.lines.map((x) => (x.id === l.id ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x)) })} />
            <span className="w-24 text-right tabular-nums">{fmt(l.qty * l.unitPrice)}</span>
            <Button size="sm" variant="ghost" aria-label={`Remove ${l.description}`} onClick={() => set({ lines: d.lines.filter((x) => x.id !== l.id) })}><Trash2 className="size-4" /></Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
