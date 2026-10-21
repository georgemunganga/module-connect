import { FormToggle } from "@/components/ui/form-toggle";
import { FormSelect } from "@/components/ui/form-select";
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
import { useApp, useEntity } from "@/platform/app-context";
import { submitRequest } from "@/modules/procurement/store";
import { useProcurement } from "@/modules/procurement/store";
import { useCatalog } from "@/modules/procurement/catalog";
import { requesterRole, sameEntity, demoRequester, procurementEntityName } from "@/modules/procurement/access";
import { RestrictedState } from "@/platform/components/States";

export const Route = createFileRoute("/procurement/requests_/new")({
  validateSearch: (search: Record<string, unknown>) => ({ item: typeof search.item === "string" ? search.item : undefined }),
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
type Line = { id: string; catalogItemId?: string; description: string; qty: number; unitPrice: number; source: "Catalog" | "Contract" | "Non-catalog"; supplier: string; kind: Kind };

type Draft = { kind: Kind | null; lines: Line[]; purpose: string; neededBy: string; deliverTo: string; costCentre: string; project: string; evidence: string[] };
const empty: Draft = { kind: null, lines: [], purpose: "", neededBy: "", deliverTo: "", costCentre: "", project: "", evidence: [] };

function NewRequest() {
  const { item: selectedItem } = Route.useSearch();
  const { role } = useApp();
  const entity = useEntity();
  const draftKey = `proc:draft:new:${entity.id}`;
  const costCentres = entity.id === "ent-ke" ? ["KE-OPS-200 Operations", "KE-LOG-310 Logistics"] : entity.id === "ent-de" ? ["DE-ENG-410 Engineering", "DE-OPS-200 Operations"] : ["NL-ENG-410 Engineering", "NL-OPS-200 Operations", "NL-PPL-120 People"];
  const suppliers = useProcurement().suppliers;
  const catalogItems = useCatalog();
  const CCY = entity.country === "Kenya" ? "KES" : "EUR";
  const fmt = (amount: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency: CCY }).format(amount);
  const catalog = useMemo(() => catalogItems.filter((item) => item.entities.some((allowed) => sameEntity(allowed, entity.id))).map((item) => {
    const offer = item.offers.find((candidate) => candidate.currency === CCY);
    const supplier = suppliers.find((record) => record.name === offer?.supplier);
    return { id: item.id, name: item.name, kind: item.kind === "Consumable" ? "Goods" as Kind : item.kind as Kind, price: offer?.price ?? 0, supplier: offer?.supplier ?? "No offer", source: offer?.source ?? "Catalog" as "Catalog" | "Contract", block: item.block ?? (!offer ? "No offer in this entity's currency." : supplier?.status !== "Active" ? "Supplier is not active. Ask Procurement to choose another source." : undefined) };
  }), [CCY, entity.id, suppliers, catalogItems]);
  const navigate = useNavigate();
  const [d, setD] = useState<Draft>(() => ({ ...empty, deliverTo: entity.branches[0] }));
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [allKinds, setAllKinds] = useState(false);
  const [nc, setNc] = useState({ description: "", qty: 1, unitPrice: 0, reason: "" });
  const [ncKind, setNcKind] = useState<Kind>("Service");
  const [ref, setRef] = useState<string | null>(null);
  const [budgetDown, setBudgetDown] = useState(false);
  const [prefillDone, setPrefillDone] = useState(false);
  const [prefillNotice, setPrefillNotice] = useState("");

  useEffect(() => {
    const raw = sessionStorage.getItem(draftKey);
    setD(raw ? { ...empty, deliverTo: entity.branches[0], ...JSON.parse(raw) } : { ...empty, deliverTo: entity.branches[0] });
    setLoaded(true);
  }, [draftKey, entity.branches]);
  useEffect(() => {
    if (loaded) sessionStorage.setItem(draftKey, JSON.stringify(d));
  }, [d, loaded, draftKey]);
  useEffect(() => {
    if (!loaded || !selectedItem || prefillDone) return;
    const choice = catalog.find((candidate) => candidate.id === selectedItem);
    if (!choice) {
      if (catalogItems.some((candidate) => candidate.id === selectedItem)) { setPrefillNotice("This item is not eligible in the selected entity."); setPrefillDone(true); }
      return;
    }
    if (choice.block) { setPrefillNotice(choice.block); setPrefillDone(true); return; }
    setD((current) => current.lines.some((line) => line.catalogItemId === selectedItem) ? current : { ...current, kind: current.kind ?? choice.kind, lines: [...current.lines, { id: crypto.randomUUID(), catalogItemId: selectedItem, description: choice.name, qty: 1, unitPrice: choice.price, source: choice.source, supplier: choice.supplier, kind: choice.kind }] });
    setPrefillNotice(`${choice.name} added to your draft. Check the quantity and complete the remaining steps.`);
    setPrefillDone(true);
  }, [loaded, selectedItem, prefillDone, catalog, catalogItems]);

  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const total = d.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const results = useMemo(
    () => catalog.filter((c) => (allKinds || !d.kind || c.kind === d.kind) && c.name.toLowerCase().includes(q.toLowerCase())),
    [q, d.kind, catalog, allKinds],
  );
  const missing = [
    !d.kind && "what you're buying",
    !d.lines.length && "at least one line",
    !d.purpose.trim() && "a purpose",
    !d.neededBy && "a needed-by date",
    !d.deliverTo.trim() && "a delivery destination",
    !d.costCentre && "a cost centre",
  ].filter(Boolean) as string[];

  const steps: FlowStep[] = [
    {
      id: "kind",
      title: "What do you need?",
      purpose: "This helps us show the right items and send your request to the right people.",
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
      purpose: "Choose from the listed items when you can. If nothing fits, describe what you need below.",
      render: () => (
        <div className="space-y-5">
          <div>
            <Label htmlFor="cat-q">Search catalog and contract offers</Label>
            <Input id="cat-q" className="mt-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. chair, laptop, freight" />
            <label className="mt-2 flex items-center gap-2 text-sm"><FormToggle type="checkbox" checked={allKinds} onChange={(event) => setAllKinds(event.target.checked)} />Include other item types in this request</label>
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
                      onClick={() => set({ lines: [...d.lines, { id: crypto.randomUUID(), catalogItemId: c.id, description: c.name, qty: 1, unitPrice: c.price, source: c.source, supplier: c.supplier, kind: c.kind }] })}>
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
            <p className="text-sm text-muted-foreground">No listed items match. Describe what you need below.</p>
          )}
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Can't find it? Add something new</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><Label htmlFor="nc-kind">Line type</Label><FormSelect id="nc-kind" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={ncKind} onChange={(event) => setNcKind(event.target.value as Kind)}>{(["Goods", "Service", "Asset", "Subscription"] as Kind[]).map((kind) => <option key={kind}>{kind}</option>)}</FormSelect></div>
              <div className="sm:col-span-2"><Label htmlFor="nc-d">Description</Label><Input id="nc-d" className="mt-1" value={nc.description} onChange={(e) => setNc({ ...nc, description: e.target.value })} /></div>
              <div><Label htmlFor="nc-q">Quantity</Label><Input id="nc-q" type="number" min={1} className="mt-1" value={nc.qty} onChange={(e) => setNc({ ...nc, qty: Number(e.target.value) })} /></div>
              <div><Label htmlFor="nc-p">Estimated unit price ({CCY})</Label><Input id="nc-p" type="number" min={0} className="mt-1" value={nc.unitPrice} onChange={(e) => setNc({ ...nc, unitPrice: Number(e.target.value) })} /></div>
              <div className="sm:col-span-2"><Label htmlFor="nc-r">Why isn't a catalog item suitable? (required)</Label><Textarea id="nc-r" className="mt-1" value={nc.reason} onChange={(e) => setNc({ ...nc, reason: e.target.value })} /></div>
            </div>
            <Button size="sm" className="mt-3" disabled={!nc.description || nc.qty < 1 || nc.unitPrice <= 0 || !nc.reason.trim()}
              onClick={() => { set({ lines: [...d.lines, { id: crypto.randomUUID(), description: nc.description, qty: nc.qty, unitPrice: nc.unitPrice, source: "Non-catalog", supplier: "To be sourced by buyer", kind: ncKind }] }); setNc({ description: "", qty: 1, unitPrice: 0, reason: "" }); }}>
              Add an item not listed
            </Button>
          </details>
          <LineEditor d={d} set={set} currency={CCY} />
        </div>
      ),
    },
    {
      id: "delivery",
      title: "Purpose and delivery",
      purpose: "Tell us why you need it, when you need it, and where it should go.",
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
      purpose: "Choose the team budget that should pay for this purchase.",
      render: () => (
        <div className="grid max-w-lg gap-4">
          <div>
            <Label htmlFor="cc">Cost centre</Label>
            <FormSelect id="cc" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" value={d.costCentre} onChange={(e) => set({ costCentre: e.target.value })}>
              <option value="">Choose…</option>
              {costCentres.map((costCentre) => <option key={costCentre}>{costCentre}</option>)}
            </FormSelect>
          </div>
          <div><Label htmlFor="pj">Project (optional)</Label><Input id="pj" className="mt-1" value={d.project} onChange={(e) => set({ project: e.target.value })} /></div>
        </div>
      ),
    },
    {
      id: "evidence",
      title: "Add supporting files",
      optional: true,
      purpose: "Quotes or product details can help reviewers. This demo lists sample file names only; it does not upload files.",
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
            <p className="font-medium">Who will check this?</p>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              <li>The person responsible for {d.costCentre || "the chosen team budget"}</li>
              {total > 10000 ? <li>The purchasing team may ask for 3 quotes above {fmt(10000)} (sample rule)</li> : null}
              {d.lines.some((l) => l.source === "Non-catalog") ? <li>The purchasing team will check items you added yourself</li> : null}
            </ul>
          </div>
          <div className="rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">Budget</p>
              <Button size="sm" variant="ghost" onClick={() => setBudgetDown((b) => !b)}>{budgetDown ? "Restore" : "Try"} budget check demo</Button>
            </div>
            {budgetDown ? (
              <p className="mt-1 flex gap-2 text-warning"><AlertTriangle className="size-4 shrink-0" aria-hidden />Budget check unavailable. You can still submit; the budget holder will check funds before approving.</p>
            ) : (
              <p className="mt-1 flex gap-2 text-muted-foreground"><Info className="size-4 shrink-0" aria-hidden />This looks within budget. Finance has not set the money aside yet.</p>
            )}
          </div>
        </div>
      ),
    },
  ];

  if (!requesterRole(role)) return <AppShell><RestrictedState /></AppShell>;
  return (
    <AppShell>
      <PageHeader eyebrow="Procurement" title="Create request" description="Answer a few questions. Your draft saves as you go." />
      {prefillNotice ? <p role="status" className="mb-4 rounded-lg border bg-surface p-3 text-sm">{prefillNotice}</p> : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <GuidedFlow
          flowId={`proc-request-new:${entity.id}`}
          steps={steps}
          submitLabel="Submit request"
          submitDisabled={missing.length > 0}
          onSubmit={async () => {
            if (missing.length) return;
            await new Promise((r) => setTimeout(r, 600));
            setRef(submitRequest({ title: d.purpose.trim(), requester: demoRequester(role, entity.id), department: d.costCentre.split(" ").slice(1).join(" ") || "Operations", entity: procurementEntityName(entity.id), currency: CCY, neededBy: d.neededBy, deliverTo: d.deliverTo, costCentre: d.costCentre, project: d.project, evidence: d.evidence, lines: d.lines.map(({ catalogItemId, description, qty, unitPrice, supplier, kind }) => ({ catalogItemId, description, qty, unitPrice, supplier, kind })) }));
            sessionStorage.removeItem(draftKey);
            sessionStorage.removeItem(`flow:proc-request-new:${entity.id}`);
          }}
          submitted={
            ref ? (
              <NextSteps
                reference={ref}
                title="Request submitted (demo)"
                steps={[
                  `The budget holder for ${d.costCentre} is asked to decide, normally within 3 working days.`,
                  "If approved, the purchasing team will get quotes or place an order. The vendor has not been contacted yet.",
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
              <Row k="Items" v={String(d.lines.length)} />
              <Row k="Estimated total" v={`${fmt(total)} (${CCY})`} />
              <Row k="Needed by" v={d.neededBy || "—"} />
              <Row k="Deliver to" v={d.deliverTo || "—"} />
            </dl>
            <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
              <Button size="sm" variant="outline" onClick={() => set({ lines: [...d.lines, ...d.lines.map((l) => ({ ...l, id: crypto.randomUUID() }))] })} disabled={!d.lines.length}><Copy className="size-4" aria-hidden />Copy items</Button>
              <Button size="sm" variant="ghost" onClick={() => { setD({ ...empty, deliverTo: entity.branches[0] }); sessionStorage.removeItem(draftKey); }}>Discard draft</Button>
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

function LineEditor({ d, set, currency }: { d: Draft; set: (p: Partial<Draft>) => void; currency: string }) {
  const fmt = (amount: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(amount);
  if (!d.lines.length) return <p className="text-sm text-muted-foreground">No items added yet.</p>;
  return (
    <div>
      <h3 className="text-sm font-semibold">Your items</h3>
      <ul className="mt-2 space-y-2">
        {d.lines.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
            <span className="min-w-0 flex-1"><span className="block font-medium">{l.description}</span><span className="text-xs text-muted-foreground">{l.kind ?? "Goods"} · {l.source} · {l.supplier}</span></span>
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
