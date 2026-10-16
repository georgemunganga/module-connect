import { Link } from "@tanstack/react-router";
import { FileText, PackageCheck, ScrollText, Trophy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { ListPage } from "@/platform/components/ListPage";
import { statusLabel } from "@/platform/components/StatusBadge";
import { EmptyState, NoResultsState } from "@/platform/components/States";
import { downloadCsv } from "@/platform/data-transfer";
import { useApp } from "@/platform/app-context";
import { procurementEntityName, sameEntity } from "@/modules/procurement/access";
import { getProcurement, saveProcurement, useProcurement } from "@/modules/procurement/store";
import type { SourcingEvent } from "@/modules/procurement/sourcing";
import { usePayables } from "@/modules/procurement/payables/store";
import { audit, updateCommercial, useCommercial, getCommercial, nextId } from "./store";
import type { Evaluation, Contract, Order, Receipt } from "./store";

type Area = "evaluations" | "contracts" | "orders" | "receiving";
type CommercialRow = { id: string; name: string; detail: string; status: string; entity: string };
const titles: Record<Area, string> = {
  evaluations: "Compare quotes & choose a vendor",
  contracts: "Contracts",
  orders: "Purchase orders",
  receiving: "Deliveries & completed services",
};
const descriptions: Record<Area, string> = {
  evaluations: "Review vendor replies and record why a vendor was chosen.",
  contracts: "See agreed prices, dates, and how much has been used.",
  orders: "See what was ordered, from whom, and when it is due.",
  receiving: "Open an order to record goods delivered or confirm completed work.",
};
const paths = {
  evaluations: "/procurement/evaluations",
  contracts: "/procurement/contracts",
  orders: "/procurement/orders",
  receiving: "/procurement/receiving",
} as const;
const detailPaths = {
  evaluations: "/procurement/evaluations/$id",
  contracts: "/procurement/contracts/$id",
  orders: "/procurement/orders/$id",
  receiving: "/procurement/receiving/$id",
} as const;
const activeSupplier = (name: string) =>
  getProcurement().suppliers.some((s) => s.name === name && s.status === "Active");
const money = (v: number, c: string) =>
  new Intl.NumberFormat("en", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(
    v,
  );
const section = "rounded-xl border bg-surface p-5";
const actor = (role: string) => `${role} (demo)`;
function permission(area: Area, role: string) {
  if (role === "supplier_user" || role === "employee") return false;
  if (area === "receiving")
    return ["receiver", "buyer", "proc_admin", "auditor", "manager"].includes(role);
  return ["buyer", "proc_admin", "auditor", "manager"].includes(role);
}
function canEdit(area: Area, role: string) {
  return area === "receiving"
    ? role === "receiver" || role === "proc_admin"
    : role === "buyer" || role === "proc_admin";
}
function Guard({ area, children }: { area: Area; children: React.ReactNode }) {
  const { role } = useApp();
  if (!permission(area, role))
    return (
      <AppShell>
        <div className={section}>
          <h1 className="text-xl font-semibold">Access restricted</h1>
          <p className="mt-2 text-muted-foreground">
            This workspace requires an assigned procurement role. Supplier users cannot see other
            suppliers’ commercial records.
          </p>
        </div>
      </AppShell>
    );
  return <>{children}</>;
}
function Header({ area, detail }: { area: Area; detail?: string }) {
  return (
    <PageHeader
      eyebrow="Procurement"
      title={detail || titles[area]}
      description={detail ? "Changes in this demo are saved in this browser." : descriptions[area]}
    />
  );
}
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-fit shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium">
      {children}
    </span>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-medium">{children}</div>
    </div>
  );
}
function AuditView({
  items,
}: {
  items: { at: string; actor: string; action: string; detail: string }[];
}) {
  return (
    <section className={section}>
      <h2 className="font-semibold">Decision and change history</h2>
      <ol className="mt-3 space-y-2 text-sm">
        {items.map((a, i) => (
          <li key={i} className="border-l-2 pl-3">
            <strong>{a.action}</strong> · {a.actor} · {a.at}
            <p className="text-muted-foreground">{a.detail}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
function NotFound({ area }: { area: Area }) {
  return (
    <AppShell>
      <div className={section}>
        <h1 className="font-semibold">We couldn't open this record</h1>
        <p className="text-sm text-muted-foreground">Check the reference number or switch to the right company.</p>
        <Link className="text-primary underline" to={paths[area]}>
          Back to {titles[area]}
        </Link>
      </div>
    </AppShell>
  );
}
function entityAllowed(entity: string, entityId: string, _role: string) {
  return sameEntity(entity, entityId);
}

export function CommercialList({ area }: { area: Area }) {
  const data = useCommercial();
  const sourcingEvents = useProcurement().sourcing;
  const { role, entityId } = useApp();
  const [q, setQ] = useState("");
  const [listStyle, setListStyle] = useState<"cards" | "table">("cards");
  const records: CommercialRow[] =
    area === "evaluations"
      ? data.evaluations.map((x) => ({
          id: x.id,
          name: sourcingEvents.find((e) => e.id === x.eventId)?.title || x.eventId,
          detail: `${x.bids.length} vendor ${x.bids.length === 1 ? "reply" : "replies"}`,
          status: x.state,
          entity: sourcingEvents.find((e) => e.id === x.eventId)?.entity || "",
        }))
      : area === "contracts"
        ? data.contracts.map((x) => ({
            id: x.id,
            name: x.supplier,
            detail: `${x.category} · ${money(x.committed, x.currency)} used of ${money(x.ceiling, x.currency)}`,
            status: x.state,
            entity: x.entity,
          }))
        : area === "orders"
          ? data.orders.map((x) => ({
              id: x.id,
              name: x.supplier,
              detail: `${x.line.description} · ${x.line.qty} ${x.line.unit} · due ${x.due}`,
              status: x.status,
              entity: x.entity,
            }))
          : data.orders
              .filter((x) => x.status === "Issued" || x.status === "Acknowledged")
              .map((x) => ({
                id: x.id,
                name: x.line.description,
                detail: `${x.supplier} · ${x.line.received} of ${x.line.qty} delivered · due ${x.due}`,
                status: `${x.line.received} / ${x.line.qty} accepted`,
                entity: x.entity,
              }));
  const visible = records.filter(
    (x) =>
      entityAllowed(x.entity, entityId, role) &&
      `${x.id} ${x.name} ${x.detail}`.toLowerCase().includes(q.toLowerCase()),
  );
  const entityRecords = records.filter((x) => entityAllowed(x.entity, entityId, role));
  const empty = {
    evaluations: { title: "No quotes to compare yet", body: "Close a quote request and open the vendor replies to begin comparing them.", to: "/procurement/sourcing" as const, action: "Open quote requests", icon: <Trophy className="size-10" aria-hidden /> },
    contracts: { title: "No contracts yet", body: "Add a standalone agreement or start one from an approved award.", to: "/procurement/contracts/new" as const, action: "Add contract", icon: <ScrollText className="size-10" aria-hidden /> },
    orders: { title: "No purchase orders yet", body: "Start with an approved request or a chosen vendor.", to: "/procurement/requests" as const, action: "Open requests", icon: <FileText className="size-10" aria-hidden /> },
    receiving: { title: "No deliveries yet", body: "Send a purchase order before recording what arrived or which services were completed.", to: "/procurement/orders" as const, action: "Open orders", icon: <PackageCheck className="size-10" aria-hidden /> },
  }[area];
  return (
    <Guard area={area}>
      <AppShell>
        <Header area={area} />
        {area === "contracts" && canEdit(area, role) && <div className="mb-4"><Button asChild><Link to="/procurement/contracts/new">Add contract</Link></Button></div>}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Showing records for your company. Open one to see details or take action.</p>
          <div className="inline-flex rounded-md border bg-surface p-1" role="group" aria-label="List display">
            <Button size="sm" variant={listStyle === "cards" ? "secondary" : "ghost"} aria-pressed={listStyle === "cards"} onClick={() => setListStyle("cards")}>Cards</Button>
            <Button size="sm" variant={listStyle === "table" ? "secondary" : "ghost"} aria-pressed={listStyle === "table"} onClick={() => setListStyle("table")}>Table</Button>
          </div>
        </div>
        {listStyle === "table" ? (
          <ListPage<CommercialRow>
            rows={entityRecords}
            searchPlaceholder="Search number, vendor or item"
            searchFields={(row) => `${row.id} ${row.name} ${row.detail}`}
            filters={[{ id: "status", label: "Status", options: [...new Set(entityRecords.map((row) => row.status))], match: (row, value) => row.status === value }]}
            sortOptions={[
              { id: "reference", label: "Reference", value: (row) => row.id },
              { id: "name", label: "Vendor or item", value: (row) => row.name },
              { id: "status", label: "Status", value: (row) => row.status },
            ]}
            columns={[
              { id: "reference", header: "Reference", cell: (row) => <Link className="font-mono text-primary underline" to={detailPaths[area]} params={{ id: row.id }}>{row.id}</Link> },
              { id: "name", header: area === "receiving" ? "Item or service" : "Vendor or event", cell: (row) => row.name },
              { id: "detail", header: "Details", cell: (row) => row.detail },
              { id: "status", header: "Status", cell: (row) => <Tag>{statusLabel(row.status)}</Tag> },
              { id: "entity", header: "Company", defaultVisible: false, cell: (row) => row.entity },
            ]}
            onExport={(scope, exportRows, shown) => downloadCsv(
              `${area}-${scope}.csv`,
              shown.map((column) => ({ key: column.id, label: column.header })),
              exportRows.map((row) => Object.fromEntries(shown.map((column) => [column.id, column.id === "reference" ? row.id : column.id === "name" ? row.name : column.id === "detail" ? row.detail : column.id === "status" ? row.status : row.entity]))),
            )}
            emptyState={{ title: empty.title, body: empty.body, icon: empty.icon, action: <Button variant="outline" asChild><Link to={empty.to}>{empty.action}</Link></Button> }}
          />
        ) : <>
        <div className={section}>
          <Label htmlFor="find-commercial">Search</Label>
          <Input id="find-commercial" className="mt-2 max-w-md" placeholder="Number, vendor or item" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="grid gap-3">
          {visible.map((x) => (
            <Link
              key={x.id}
              to={detailPaths[area]}
              params={{ id: x.id }}
              className={`${section} block transition-colors hover:border-primary`}
            >
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {x.id} · {x.entity}
                  </p>
                  <h2 className="mt-1 font-semibold">{x.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{x.detail}</p>
                </div>
                <Tag>{statusLabel(x.status)}</Tag>
              </div>
            </Link>
          ))}
          {!visible.length && !entityRecords.length ? <EmptyState title={empty.title} body={empty.body} icon={empty.icon} action={<Button variant="outline" asChild><Link to={empty.to}>{empty.action}</Link></Button>} /> : null}
          {!visible.length && entityRecords.length ? <NoResultsState title="No matches" body="Try a different number or vendor name." action={<Button variant="outline" onClick={() => setQ("")}>Clear search</Button>} /> : null}
        </div>
        </>}
      </AppShell>
    </Guard>
  );
}

export function CommercialDetail({ area, id }: { area: Area; id: string }) {
  const data = useCommercial();
  const sourcingEvents = useProcurement().sourcing;
  const { role, entityId } = useApp();
  const record =
    area === "evaluations"
      ? data.evaluations.find((x) => x.id === id)
      : area === "contracts"
        ? data.contracts.find((x) => x.id === id)
        : area === "orders"
          ? data.orders.find((x) => x.id === id)
          : data.orders.find((x) => x.id === id);
  const entity =
    area === "evaluations"
      ? sourcingEvents.find((e) => e.id === (record as Evaluation | undefined)?.eventId)?.entity
      : (record as Contract | Order | undefined)?.entity;
  if (!record || !entity || !entityAllowed(entity, entityId, role)) return <NotFound area={area} />;
  return (
    <Guard area={area}>
      <AppShell>
        <Link className="text-sm text-primary underline" to={paths[area]}>
          ← {titles[area]}
        </Link>
        <Header area={area} detail={id} />
        {area === "evaluations" ? (
          <EvaluationView item={record as Evaluation} role={role} event={sourcingEvents.find((event) => event.id === (record as Evaluation).eventId)!} />
        ) : area === "contracts" ? (
          <ContractView item={record as Contract} role={role} />
        ) : area === "orders" ? (
          <OrderView item={record as Order} role={role} />
        ) : (
          <ReceivingView
            item={record as Order}
            role={role}
            receipts={data.receipts.filter((x) => x.poId === id)}
          />
        )}
      </AppShell>
    </Guard>
  );
}

export function ContractNew() {
  const { role, entityId } = useApp();
  const suppliers = useProcurement().suppliers.filter((supplier) => sameEntity(supplier.country, entityId) && supplier.status === "Active");
  const [supplier, setSupplier] = useState("");
  const [kind, setKind] = useState<Contract["kind"]>("Standard");
  const [category, setCategory] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [notice, setNotice] = useState("");
  const [ceiling, setCeiling] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [rate, setRate] = useState("");
  const [obligations, setObligations] = useState("");
  const [reason, setReason] = useState("");
  const [created, setCreated] = useState("");
  const [error, setError] = useState("");
  if (!canEdit("contracts", role)) return <Guard area="contracts"><AppShell><p>Only a buyer or Procurement administrator can add a contract.</p></AppShell></Guard>;
  const create = () => {
    if (!suppliers.some((item) => item.name === supplier) || !category.trim() || !start || !end || end < start || !notice || notice > end || !Number.isFinite(Number(ceiling)) || Number(ceiling) <= 0 || !rate.trim() || !obligations.trim() || !reason.trim()) {
      setError("Choose an active vendor and complete the category, dates, limit, rates, obligations and reason. The notice date must be on or before the end date.");
      return;
    }
    const id = nextId("CON", Math.max(2000, ...getCommercial().contracts.map((contract) => Number(contract.id.match(/(\d+)$/)?.[1] || 0))) + 1);
    const contract: Contract = { id, supplier, entity: procurementEntityName(entityId), owner: actor(role), category: category.trim(), kind, state: "Draft", version: 1, start, end, notice, ceiling: Number(ceiling), committed: 0, currency, rate: rate.trim(), obligations: obligations.trim(), source: "Standalone", audit: [audit(actor(role), "Created standalone draft", reason.trim())] };
    updateCommercial((state) => ({ ...state, contracts: [contract, ...state.contracts] }));
    setCreated(id);
    setError("");
  };
  return <AppShell><PageHeader eyebrow="Contracts" title="Add contract" description="Record proposed terms for review. Nothing is active or available for ordering until signed." />
    {created ? <div className={section}><h2 className="font-semibold">Draft saved</h2><p className="mt-1 text-sm">{created} is ready for review.</p><Button className="mt-3" asChild><Link to="/procurement/contracts/$id" params={{ id: created }}>Open contract</Link></Button></div> : <div className={section}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="contract-supplier">Vendor</Label><select id="contract-supplier" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={supplier} onChange={(event) => setSupplier(event.target.value)}><option value="">Choose an active vendor</option>{suppliers.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></div>
        <div><Label htmlFor="contract-kind">Contract type</Label><select id="contract-kind" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={kind} onChange={(event) => setKind(event.target.value as Contract["kind"])}><option>Standard</option><option>Framework</option><option>Recurring</option></select></div>
        <div><Label htmlFor="contract-category">Category</Label><Input id="contract-category" value={category} onChange={(event) => setCategory(event.target.value)} /></div>
        <div><Label htmlFor="contract-currency">Currency</Label><select id="contract-currency" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={currency} onChange={(event) => setCurrency(event.target.value)}>{["EUR", "KES", "USD", "ZMW", "GBP"].map((value) => <option key={value}>{value}</option>)}</select></div>
        <div><Label htmlFor="contract-start">Starts</Label><Input id="contract-start" type="date" value={start} onChange={(event) => setStart(event.target.value)} /></div>
        <div><Label htmlFor="contract-end">Ends</Label><Input id="contract-end" type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></div>
        <div><Label htmlFor="contract-notice">Renewal decision by</Label><Input id="contract-notice" type="date" value={notice} onChange={(event) => setNotice(event.target.value)} /></div>
        <div><Label htmlFor="contract-ceiling">Spending limit</Label><Input id="contract-ceiling" type="number" min="0.01" step="0.01" value={ceiling} onChange={(event) => setCeiling(event.target.value)} /></div>
        <div className="sm:col-span-2"><Label htmlFor="contract-rate">Rates or price schedule</Label><Input id="contract-rate" value={rate} onChange={(event) => setRate(event.target.value)} /></div>
        <div className="sm:col-span-2"><Label htmlFor="contract-obligations">Supplier obligations</Label><Textarea id="contract-obligations" value={obligations} onChange={(event) => setObligations(event.target.value)} /></div>
        <div className="sm:col-span-2"><Label htmlFor="contract-reason">Why this contract is needed</Label><Textarea id="contract-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></div>
      </div>{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}<div className="mt-4 flex gap-2"><Button onClick={create}>Save draft</Button><Button variant="outline" asChild><Link to="/procurement/contracts">Cancel</Link></Button></div>
    </div>}
  </AppShell>;
}

function EvaluationView({ item, role, event }: { item: Evaluation; role: string; event: SourcingEvent }) {
  const sourceLines = event.sourceLines.map((source) => { const [requestId, lineId] = source.split(" / "); const line = getProcurement().metadata[requestId]?.lines.find((candidate) => candidate.id === lineId); return line ? { requestId, lineId, line } : null; }).filter((source): source is NonNullable<typeof source> => source !== null);
  const approvedSourceValue = sourceLines.length === event.sourceLines.length && sourceLines.length > 0 ? sourceLines.reduce((sum, source, index) => sum + Math.min(event.items[index]?.qty ?? source.line.approvedQty, Math.max(0, source.line.approvedQty - source.line.orderedQty - source.line.cancelledQty)) * source.line.unitPrice, 0) : undefined;
  const sourceRequest = sourceLines.length === 1 ? getProcurement().requests.find((request) => request.id === sourceLines[0].requestId) : undefined;
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState(item.selectedBidId || "");
  const [error, setError] = useState("");
  const editable = canEdit("evaluations", role) && event.opened && event.state === "Closed";
  const latest = event.bids.filter(
    (b) => !event.bids.some((x) => x.supplier === b.supplier && x.version > b.version),
  );
  const change = (id: string, patch: Partial<Evaluation["bids"][number]>) =>
    updateCommercial((s) => ({
      ...s,
      evaluations: s.evaluations.map((x) =>
        x.id === item.id
          ? {
              ...x,
              bids: x.bids.map((b) => (b.id === id ? { ...b, ...patch } : b)),
              audit: [
                ...x.audit,
                audit(actor(role), "Evaluated bid", `${id}: ${JSON.stringify(patch)}`),
              ],
            }
          : x,
      ),
    }));
  const rec = () => {
    const b = item.bids.find((x) => x.id === selected);
    const source = event.bids.find((x) => x.id === selected);
    if (!b || !source || b.compliant !== true || b.conflict || b.score === null || !reason.trim())
      return setError(
        "Select a compliant scored bid without an unresolved conflict and explain the recommendation.",
      );
    if (
      source.sealedContent.currency !==
      event.bids.find((x) => x.id === item.bids[0]?.id)?.sealedContent.currency
    )
      return setError("Currency mismatch requires a documented conversion basis.");
    const val = source.sealedContent.total + b.deliveryCost + b.tax;
    if (sourceRequest && source.sealedContent.currency !== sourceRequest.currency) return setError("Bid currency differs from the approved request. Record an authorized conversion basis before award.");
    if (approvedSourceValue !== undefined && val > approvedSourceValue) return setError(`Award exceeds approved request value of ${money(approvedSourceValue, source.sealedContent.currency)}. Reapprove the source first.`);
    if (val > 12000000 && event.entity.includes("Kenya"))
      return setError(
        "Award exceeds the demo source authority of KES 12,000,000. Renew approval first.",
      );
    updateCommercial((s) => ({
      ...s,
      evaluations: s.evaluations.map((x) =>
        x.id === item.id
          ? {
              ...x,
              state: "Recommendation pending",
              selectedBidId: selected,
              rationale: reason,
              awardValue: val,
              audit: [
                ...x.audit,
                audit(
                  actor(role),
                  "Submitted recommendation",
                  `${b.supplier}; ${money(val, source.sealedContent.currency)}; ${reason}`,
                ),
              ],
            }
          : x,
      ),
    }));
    setError("");
  };
  const approve = () =>
    updateCommercial((s) => ({
      ...s,
      evaluations: s.evaluations.map((x) =>
        x.id === item.id
          ? {
              ...x,
              state: "Awarded",
              audit: [
                ...x.audit,
                audit(actor(role), "Approved award", `Reference ${item.id}; does not issue a PO`),
              ],
            }
          : x,
      ),
    }));
  const awardBid = event.bids.find((b) => b.id === item.selectedBidId);
  const createFromAward = (kind: "PO" | "Contract") => {
    if (item.state !== "Awarded" || !awardBid || !item.awardValue)
      return setError("An approved award is required.");
    if (kind === "PO" && !activeSupplier(awardBid.supplier))
      return setError(
        "Supplier is not active in the supplier master; draft PO conversion is blocked.",
      );
    if (kind === "PO" && event.items.length !== 1) return setError("This event has multiple items. Record line-level award allocations before creating POs.");
    updateCommercial((state) => {
      if (kind === "PO") {
        if (state.orders.some((o) => o.source === item.id)) return state;
        const qty = event.items[0]?.qty || 1;
        const id = nextId(
          "PO",
          Math.max(2000, ...state.orders.map((o) => Number(o.id.match(/(\d+)$/)?.[1] || 0))) + 1,
        );
        const order: Order = {
          id,
          supplier: awardBid.supplier,
          entity: event.entity,
          source: item.id,
          originRequest: sourceLines.length === 1 ? `${sourceLines[0].requestId} / ${sourceLines[0].lineId}` : undefined,
          sourceApprovedValue: approvedSourceValue ?? item.awardValue!,
          status: "Draft",
          version: 1,
          currency: awardBid.sealedContent.currency,
          shipTo: sourceLines.length === 1 ? getProcurement().metadata[sourceLines[0].requestId]?.deliverTo ?? "Set delivery location" : "Set delivery location",
          billTo: event.entity,
          taxRef: "Review tax reference",
          terms: event.terms,
          due: sourceRequest?.neededBy ?? event.closesAt.slice(0, 10),
          line: {
            catalogItemId: sourceLines.length === 1 ? sourceLines[0].line.catalogItemId : undefined,
            description: event.items[0]?.description || event.title,
            qty,
            price: item.awardValue! / qty,
            received: 0,
            invoiced: 0,
            unit: event.items[0]?.unit || "each",
            type: ["trip", "subscription"].includes(event.items[0]?.unit) ? "Service" : "Goods",
          },
          supplierActive: true,
          revisions: [],
          audit: [
            audit(
              actor(role),
              "Created from approved award",
              `${item.id}; draft only; no supplier dispatch`,
            ),
          ],
        };
        return {
          ...state,
          orders: [...state.orders, order],
          evaluations: state.evaluations.map((x) =>
            x.id === item.id
              ? { ...x, audit: [...x.audit, audit(actor(role), "Created draft PO", id)] }
              : x,
          ),
        };
      }
      if (state.contracts.some((c) => c.source === item.id)) return state;
      const id = nextId(
        "CON",
        Math.max(2000, ...state.contracts.map((c) => Number(c.id.match(/(\d+)$/)?.[1] || 0))) + 1,
      );
      const contract: Contract = {
        id,
        supplier: awardBid.supplier,
        entity: event.entity,
        owner: event.buyer,
        category: event.method,
        kind: "Standard",
        state: "Draft",
        version: 1,
        start: new Date().toISOString().slice(0, 10),
        end: "2027-12-31",
        notice: "2027-10-01",
        ceiling: item.awardValue!,
        committed: 0,
        currency: awardBid.sealedContent.currency,
        rate: "Review approved award rate schedule",
        obligations: "Complete legal terms and signature before release",
        source: item.id,
        audit: [audit(actor(role), "Created from approved award", `${item.id}; draft only`)],
      };
      return {
        ...state,
        contracts: [...state.contracts, contract],
        evaluations: state.evaluations.map((x) =>
          x.id === item.id
            ? { ...x, audit: [...x.audit, audit(actor(role), "Created draft contract", id)] }
            : x,
        ),
      };
    });
    setError("");
  };
  return (
    <>
      <div className={section}>
        <div className="flex justify-between">
          <div>
            <h2 className="font-semibold">{event.title}</h2>
            <p className="text-sm text-muted-foreground">
              {event.id} · {event.method} · {event.entity}
            </p>
          </div>
          <Tag>{item.state}</Tag>
        </div>
        <p className="mt-3 text-sm">
          Opened by {event.openingAuthorisedBy || "—"}. Criteria:{" "}
          {event.criteria.map((c) => `${c.name} ${c.weight}%`).join(", ")}. Scores are out of 100
          and must be documented by each evaluator.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Demo estimated cost = offer + entered delivery + entered tax. No savings claim is
          calculated.
        </p>
      </div>
      {!event.opened ? (
        <p className={section}>Bids are sealed. Evaluation is blocked until authorized opening.</p>
      ) : !latest.length ? (
        <p className={section}>
          No responses. Record a no-award decision or begin a new sourcing route.
        </p>
      ) : (
        <div className="grid gap-3">
          {latest.map((offer) => {
            const b = item.bids.find((x) => x.id === offer.id);
            if (!b) return null;
            return (
              <section key={b.id} className={section}>
                <div className="flex justify-between">
                  <div>
                    <h3 className="font-semibold">
                      {b.supplier} · v{offer.version}
                    </h3>
                    <p className="text-sm">
                      {money(offer.sealedContent.total, offer.sealedContent.currency)} · delivery{" "}
                      {offer.sealedContent.leadTimeDays} days · {offer.sealedContent.notes}
                    </p>
                  </div>
                  <Tag>{offer.late ? "Late" : "On time"}</Tag>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Received {offer.receivedAt}; {offer.channel}. Evidence:{" "}
                  {offer.evidence || "Portal submission"}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label>Required checks</Label>
                    <select
                      aria-label={`${b.supplier} compliance`}
                      disabled={!editable || item.state !== "In evaluation" || offer.late}
                      value={b.compliant === null ? "" : String(b.compliant)}
                      onChange={(e) => change(b.id, { compliant: e.target.value === "true" })}
                      className="mt-1 h-9 w-full rounded-md border bg-background px-2"
                    >
                      <option value="">Not checked</option>
                      <option value="true">Pass</option>
                      <option value="false">Fail</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor={`score-${b.id}`}>Score out of 100</Label>
                    <Input
                      id={`score-${b.id}`}
                      type="number"
                      min="0"
                      max="100"
                      disabled={
                        !editable ||
                        b.compliant !== true ||
                        b.conflict ||
                        item.state !== "In evaluation"
                      }
                      value={b.score ?? ""}
                      onChange={(e) =>
                        change(b.id, {
                          score:
                            e.target.value === ""
                              ? null
                              : Math.min(100, Math.max(0, Number(e.target.value))),
                        })
                      }
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={b.conflict}
                      disabled={!editable || item.state !== "In evaluation"}
                      onChange={(e) =>
                        change(b.id, {
                          conflict: e.target.checked,
                          score: e.target.checked ? null : b.score,
                        })
                      }
                    />{" "}
                    Conflict declared
                  </label>
                </div>
                {b.compliant === false && (
                  <Input
                    className="mt-3"
                    placeholder="Mandatory failure reason"
                    aria-label={`${b.supplier} failure reason`}
                    value={b.reason}
                    disabled={!editable || item.state !== "In evaluation"}
                    onChange={(e) => change(b.id, { reason: e.target.value })}
                  />
                )}
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor={`delivery-${b.id}`}>Delivery adjustment</Label>
                    <Input
                      id={`delivery-${b.id}`}
                      type="number"
                      min="0"
                      disabled={!editable || item.state !== "In evaluation"}
                      value={b.deliveryCost}
                      onChange={(e) =>
                        change(b.id, { deliveryCost: Math.max(0, Number(e.target.value)) })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor={`tax-${b.id}`}>Tax adjustment</Label>
                    <Input
                      id={`tax-${b.id}`}
                      type="number"
                      min="0"
                      disabled={!editable || item.state !== "In evaluation"}
                      value={b.tax}
                      onChange={(e) => change(b.id, { tax: Math.max(0, Number(e.target.value)) })}
                    />
                  </div>
                </div>
                <p className="mt-2 text-sm">
                  Normalized estimate:{" "}
                  <strong>
                    {money(
                      offer.sealedContent.total + b.deliveryCost + b.tax,
                      offer.sealedContent.currency,
                    )}
                  </strong>
                </p>
              </section>
            );
          })}
        </div>
      )}
      {item.state === "In evaluation" && editable && (
        <section className={section}>
          <h2 className="font-semibold">Recommended vendor</h2>
          <Label htmlFor="winner" className="mt-3 block">
            Recommended supplier
          </Label>
          <select
            id="winner"
            className="mt-1 h-9 w-full rounded-md border bg-background px-3"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Select</option>
            {item.bids
              .filter((x) => x.compliant && !x.conflict && x.score !== null)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.supplier}
                </option>
              ))}
          </select>
          <Label htmlFor="rationale" className="mt-3 block">
            Rationale and risks
          </Label>
          <Textarea
            id="rationale"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Include technical, cost and risk basis"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Recommendation requires separate award approval. No PO is issued here.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button onClick={rec}>Send recommendation</Button>
            <Button
              variant="outline"
              onClick={() => {
                if (!reason.trim()) return setError("Give a reason for no award.");
                updateCommercial((s) => ({
                  ...s,
                  evaluations: s.evaluations.map((x) =>
                    x.id === item.id
                      ? {
                          ...x,
                          state: "No award",
                          rationale: reason,
                          audit: [...x.audit, audit(actor(role), "No award", reason)],
                        }
                      : x,
                  ),
                }));
              }}
            >
              No award
            </Button>
          </div>
        </section>
      )}
      {item.state === "Recommendation pending" && (
        <section className={section}>
          <h2 className="font-semibold">Waiting for another person to approve</h2>
          <p className="text-sm">
            {item.rationale} ·{" "}
            {item.awardValue &&
              money(item.awardValue, event.bids[0]?.sealedContent.currency || "KES")}
          </p>
          {role === "proc_admin" && (
            <Button className="mt-3" onClick={approve}>
              Approve award reference
            </Button>
          )}
        </section>
      )}
      {item.state === "Awarded" && (
        <section className={section}>
          <h2 className="font-semibold">Approved award reference {item.id}</h2>
          <p className="mt-1 text-sm">
            Supplier outcome notices have not been sent in this demo. Downstream records begin as
            drafts and retain this award as their source.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {canEdit("evaluations", role) && (
              <>
                <Button onClick={() => createFromAward("PO")}>Start purchase order</Button>
                <Button variant="outline" onClick={() => createFromAward("Contract")}>
                  Create draft contract
                </Button>
              </>
            )}
          </div>
          {getCommercial()
            .orders.filter((o) => o.source === item.id)
            .map((o) => (
              <p key={o.id} className="mt-2 text-sm">
                <Link
                  className="text-primary underline"
                  to="/procurement/orders/$id"
                  params={{ id: o.id }}
                >
                  {o.id} · {o.status}
                </Link>
              </p>
            ))}
          {getCommercial()
            .contracts.filter((c) => c.source === item.id)
            .map((c) => (
              <p key={c.id} className="mt-2 text-sm">
                <Link
                  className="text-primary underline"
                  to="/procurement/contracts/$id"
                  params={{ id: c.id }}
                >
                  {c.id} · {c.state}
                </Link>
              </p>
            ))}
          {error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </section>
      )}
      <AuditView items={item.audit} />
    </>
  );
}

function ContractView({ item, role }: { item: Contract; role: string }) {
  const commercial = useCommercial();
  const linkedOrders = commercial.orders.filter((o) => o.source === item.id);
  const pendingValue = linkedOrders
    .filter((o) => ["Draft", "Pending approval", "Approved"].includes(o.status))
    .reduce((sum, o) => sum + o.line.qty * o.line.price, 0);
  const [reason, setReason] = useState("");
  const [signedRef, setSignedRef] = useState("");
  const [ceiling, setCeiling] = useState(item.ceiling);
  const [renewEnd, setRenewEnd] = useState("");
  const [renewNotice, setRenewNotice] = useState("");
  const [renewCeiling, setRenewCeiling] = useState(String(item.ceiling));
  const [release, setRelease] = useState(0);
  const [error, setError] = useState("");
  const edit = canEdit("contracts", role);
  const remaining = item.ceiling - item.committed - pendingValue;
  const patch = (change: Partial<Contract>, action: string, detail: string) =>
    updateCommercial((s) => ({
      ...s,
      contracts: s.contracts.map((x) =>
        x.id === item.id
          ? { ...x, ...change, audit: [...x.audit, audit(actor(role), action, detail)] }
          : x,
      ),
    }));
  const transition = () => {
    const next: Record<string, Contract["state"]> = {
      Draft: "Review",
      Review: "Approved",
      Approved: "Awaiting signature",
      "Awaiting signature": "Active",
      Active: "Expiring",
      Renewed: "Expiring",
    };
    const state = next[item.state];
    if (!state) return;
    if (state === "Approved" && role !== "proc_admin") return setError("A Procurement administrator must approve terms in this demo.");
    if (state === "Active" && !signedRef.trim())
      return setError("Enter the signed document reference before activation.");
    const signed = state === "Active";
    const renewal = signed && item.renewal?.status === "Awaiting signature" ? item.renewal : undefined;
    const newCeiling = renewal?.proposedCeiling ?? (signed && item.amendment?.approved ? item.amendment.proposedCeiling : item.ceiling);
    const newEnd = renewal?.proposedEnd ?? item.end;
    const newNotice = renewal?.proposedNotice ?? item.notice;
    patch(
      { state: renewal ? "Renewed" : state, signedVersion: signed ? item.version : item.signedVersion,
        ...(signed ? { ceiling: newCeiling, end: newEnd, notice: newNotice, signedTerms: { start: item.start, end: newEnd, notice: newNotice, ceiling: newCeiling },
          signedHistory: item.signedVersion ? [...(item.signedHistory ?? []), { version: item.signedVersion, ...(item.signedTerms ?? { start: item.start, end: item.end, notice: item.notice, ceiling: item.ceiling }) }] : item.signedHistory,
          amendment: undefined, renewal: undefined } : {}) },
      `Moved to ${renewal ? "Renewed" : state}`,
      signed ? `Signed version ${item.version}: ${signedRef.trim()}; previous signed version retained in history` : "Review decision recorded",
    );
    if (signed) setSignedRef("");
    setError("");
  };
  const addRelease = () => {
    if (
      release <= 0 ||
      release > remaining ||
      !["Active", "Expiring", "Renewed"].includes(item.state) ||
      !item.signedVersion
    )
      return setError(
        "Draft release needs active signed terms and must fit the remaining ceiling.",
      );
    if (new Date(item.end).getTime() < Date.now())
      return setError("Contract has expired. Renew before release.");
    if (!activeSupplier(item.supplier))
      return setError("Supplier is not active. New contract releases are blocked.");
    const id = nextId(
      "PO",
      Math.max(2000, ...getCommercial().orders.map((o) => Number(o.id.match(/(\d+)$/)?.[1] || 0))) +
        1,
    );
    updateCommercial((s) => ({
      ...s,
      orders: [
        ...s.orders,
        {
          id,
          supplier: item.supplier,
          entity: item.entity,
          source: item.id,
          sourceApprovedValue: release,
          status: "Draft",
          version: 1,
          currency: item.currency,
          shipTo: "Set delivery location",
          billTo: item.entity,
          taxRef: "Review tax reference",
          terms: `Contract ${item.id} signed v${item.signedVersion}`,
          due: item.end,
          line: {
            description: `${item.category} contract release`,
            qty: 1,
            price: release,
            received: 0,
            invoiced: 0,
            unit: "release",
            type: "Service",
          },
          supplierActive: true,
          revisions: [],
          audit: [
            audit(
              actor(role),
              "Created contract release",
              `${item.id}; draft only; no commitment or supplier dispatch`,
            ),
          ],
        },
      ],
      contracts: s.contracts.map((c) =>
        c.id === item.id
          ? {
              ...c,
              audit: [
                ...c.audit,
                audit(
                  actor(role),
                  "Created draft PO release",
                  `${id}: ${money(release, item.currency)}; capacity reserved until disposition`,
                ),
              ],
            }
          : c,
      ),
    }));
    setRelease(0);
    setError("");
  };
  const propose = () => {
    if (item.state === "Awaiting signature" || item.renewal?.status === "Pending decision") return setError("Finish the pending signature or renewal decision before another change.");
    if (!reason.trim() || ceiling < item.committed + pendingValue)
      return setError("Give a reason and a limit that covers committed spending and draft orders.");
    patch(
      { amendment: { reason, proposedCeiling: ceiling } },
      "Proposed amendment",
      `Ceiling ${money(item.ceiling, item.currency)} → ${money(ceiling, item.currency)}; ${reason}`,
    );
    setError("");
  };
  const approveAmend = () => {
    if (!item.amendment) return;
    patch(
      {
        version: item.version + 1,
        state: "Awaiting signature",
        amendment: { ...item.amendment, approved: true },
      },
      "Approved amendment",
      `New v${item.version + 1} pending signature; old signed v${item.signedVersion || "none"} stays effective until signed.`,
    );
  };
  const proposeRenewal = () => {
    const nextCeiling = Number(renewCeiling);
    if (!reason.trim() || !renewEnd || renewEnd <= item.end || !renewNotice || renewNotice > renewEnd || !Number.isFinite(nextCeiling) || nextCeiling < item.committed)
      return setError("Enter a reason, later end date, notice date before the new end, and a limit no lower than committed spending.");
    patch({ renewal: { proposedEnd: renewEnd, proposedNotice: renewNotice, proposedCeiling: nextCeiling, reason: reason.trim(), status: "Pending decision" } }, "Proposed renewal", `End ${item.end} → ${renewEnd}; limit ${money(item.ceiling, item.currency)} → ${money(nextCeiling, item.currency)}; ${reason}`);
    setReason("");
    setError("");
  };
  const decideRenewal = (approve: boolean) => {
    if (!item.renewal || item.renewal.status !== "Pending decision" || role !== "proc_admin") return;
    if (!approve && !reason.trim()) return setError("Give a reason for declining renewal.");
    patch({ state: approve ? "Awaiting signature" : "Expiring", version: approve ? item.version + 1 : item.version,
      renewal: { ...item.renewal, status: approve ? "Awaiting signature" : "Declined", decidedBy: actor(role) },
      signedTerms: item.signedTerms ?? (item.signedVersion ? { start: item.start, end: item.end, notice: item.notice, ceiling: item.ceiling } : undefined) },
    approve ? "Renewal approved pending signature" : "Renewal declined", approve ? `Proposed v${item.version + 1}; old signed v${item.signedVersion ?? "none"} remains recorded` : reason.trim());
    setReason("");
    setError("");
  };
  return (
    <>
      <section className={section}>
        <div className="flex justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{item.supplier}</h2>
            <p className="text-sm text-muted-foreground">
              {item.kind} · {item.category} · {item.entity}
            </p>
          </div>
          <Tag>{item.state}</Tag>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Field label="Owner">{item.owner}</Field>
          <Field label="Effective period">
            {item.start} → {item.end}
          </Field>
          <Field label="Renewal notice">{item.notice}</Field>
          <Field label="Ceiling">{money(item.ceiling, item.currency)}</Field>
          <Field label="Committed drawdown">{money(item.committed, item.currency)}</Field>
          <Field label="Available for new releases">
            {money(remaining, item.currency)} (includes {money(pendingValue, item.currency)}{" "}
            reserved in draft POs)
          </Field>
          <Field label="Rate schedule">{item.rate}</Field>
          <Field label="Source">
            {item.source.startsWith("EV-") ? (
              <Link
                className="text-primary underline"
                to="/procurement/evaluations/$id"
                params={{ id: item.source }}
              >
                {item.source}
              </Link>
            ) : (
              item.source
            )}
          </Field>
          <Field label="Version">
            v{item.version} · signed v{item.signedVersion || "none"}
          </Field>
        </div>
        <p className="mt-4 text-sm">
          <strong>Obligations:</strong> {item.obligations}
        </p>
        {item.kind === "Recurring" && (
          <p className="mt-2 text-sm">
            Expected {item.frequency?.toLowerCase()} commitment. Finance owns recurring bills and
            payment.
          </p>
        )}
        {item.signedHistory?.length ? <div className="mt-3 text-xs text-muted-foreground"><strong>Earlier signed terms:</strong> {item.signedHistory.map((version) => `v${version.version}: ends ${version.end}, limit ${money(version.ceiling, item.currency)}`).join(" · ")}</div> : null}
      </section>
      <section className={section}>
        <h2 className="font-semibold">Contract dates and renewal</h2>
        {item.state === "Awaiting signature" && (
          <p className="mt-2 text-sm text-amber-700">
            Proposed v{item.version} needs a signed document. {item.signedVersion ? `Signed v${item.signedVersion} remains recorded; new releases are paused until signature.` : "No release is allowed."}
          </p>
        )}
        {item.state === "Expiring" && (
          <p className="mt-2 text-sm text-amber-700">
            Renewal decision due by {item.notice}; current signed terms remain in force until
            expiry.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {edit && (
          <div className="mt-3 flex flex-wrap gap-2">
            {["Draft", "Review", "Approved", "Awaiting signature", "Active", "Renewed"].includes(
              item.state,
            ) && (item.state !== "Review" || role === "proc_admin") && (
              <Button onClick={transition}>
                {
                  (
                    {
                      Draft: "Send for review",
                      Review: "Approve terms",
                      Approved: "Request signature",
                      "Awaiting signature": "Record signature",
                      Active: "Mark expiring",
                      Renewed: "Mark expiring",
                    } as Record<string, string>
                  )[item.state]
                }
              </Button>
            )}
            {item.state === "Expiring" && (
              <Button
                variant="outline"
                onClick={() => patch({ state: "Expired" }, "Expired", "No new releases allowed")}
              >
                Let expire
              </Button>
            )}
            {["Active", "Expiring", "Renewed"].includes(item.state) && (
              <Button
                variant="outline"
                onClick={() => {
                  if (!reason.trim()) return setError("Termination requires a reason.");
                  patch({ state: "Terminated" }, "Terminated", reason);
                }}
              >
                Terminate with reason
              </Button>
            )}
          </div>
        )}
        {item.state === "Expiring" && edit && <div className="mt-4 rounded-lg border p-4"><h3 className="font-medium">Renewal decision</h3><p className="mt-1 text-xs text-muted-foreground">A proposal and approval do not extend the signed end date. The new terms take effect after signature.</p>
          {item.renewal?.status === "Pending decision" ? <div className="mt-3 text-sm"><p>Proposed end {item.renewal.proposedEnd} · decision by {item.renewal.proposedNotice} · limit {money(item.renewal.proposedCeiling, item.currency)}.</p><p className="mt-1">Reason: {item.renewal.reason}</p>{role === "proc_admin" && <div className="mt-3 flex gap-2"><Button onClick={() => decideRenewal(true)}>Approve for signature</Button><Button variant="outline" onClick={() => decideRenewal(false)}>Decline with reason</Button></div>}</div> : <div className="mt-3 grid gap-3 sm:grid-cols-3"><div><Label htmlFor="renew-end">New end date</Label><Input id="renew-end" type="date" value={renewEnd} onChange={(e) => setRenewEnd(e.target.value)} /></div><div><Label htmlFor="renew-notice">New decision date</Label><Input id="renew-notice" type="date" value={renewNotice} onChange={(e) => setRenewNotice(e.target.value)} /></div><div><Label htmlFor="renew-limit">New spending limit</Label><Input id="renew-limit" type="number" min="0" value={renewCeiling} onChange={(e) => setRenewCeiling(e.target.value)} /></div><div className="sm:col-span-3"><Label htmlFor="renew-reason">Renewal reason</Label><Textarea id="renew-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div><div><Button onClick={proposeRenewal}>Propose renewal</Button></div></div>}
        </div>}
        {item.state === "Awaiting signature" && edit && (
          <div className="mt-3">
            <Label htmlFor="signed-ref">Signed document reference</Label>
            <Input
              id="signed-ref"
              value={signedRef}
              onChange={(e) => setSignedRef(e.target.value)}
              placeholder="Signed document ID or secure attachment reference"
            />
          </div>
        )}
      </section>
      {item.kind === "Framework" && (
        <section className={section}>
          <h2 className="font-semibold">Contract spending</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Contract ceiling is separate from a blanket PO limit and Finance budget. A release
            creates a draft PO; commercial commitment is recorded only when issued.
          </p>
          {linkedOrders.map((o) => (
            <p key={o.id} className="mt-1 text-sm">
              <Link
                className="text-primary underline"
                to="/procurement/orders/$id"
                params={{ id: o.id }}
              >
                {o.id} · {o.status} · {money(o.line.qty * o.line.price, o.currency)}
              </Link>
            </p>
          ))}
          {edit && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor="release">Amount for the new order</Label>
                <Input
                  id="release"
                  type="number"
                  min="0"
                  value={release || ""}
                  onChange={(e) => setRelease(Number(e.target.value))}
                />
              </div>
              <Button onClick={addRelease}>Start order from contract</Button>
            </div>
          )}
        </section>
      )}
      {edit && (
        <section className={section}>
          <h2 className="font-semibold">Change this contract</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="new-ceiling">New spending limit</Label>
              <Input
                id="new-ceiling"
                type="number"
                min="1"
                value={ceiling}
                onChange={(e) => setCeiling(Number(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="amend-reason">Reason / terms change</Label>
              <Input id="amend-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          {item.amendment ? (
            <div className="mt-3 text-sm">
              <p>
                {item.amendment.approved ? "Approved, awaiting signature" : "Pending"}: {money(item.ceiling, item.currency)} →{" "}
                {money(item.amendment.proposedCeiling, item.currency)}. {item.amendment.reason}
              </p>
              {role === "proc_admin" && !item.amendment.approved && (
                <Button className="mt-2" onClick={approveAmend}>
                  Approve amendment; request new signature
                </Button>
              )}
            </div>
          ) : (
            <Button className="mt-3" variant="outline" onClick={propose}>
              Propose amendment
            </Button>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Historical PO terms and signed versions are retained.
          </p>
        </section>
      )}
      <AuditView items={item.audit} />
    </>
  );
}

function OrderView({ item, role }: { item: Order; role: string }) {
  const invoices = usePayables().invoices.filter((invoice) => invoice.po === item.id);
  const invoicedQty = Math.max(
    item.line.invoiced,
    invoices.reduce(
      (sum, invoice) => sum + invoice.lines.reduce((lineSum, line) => lineSum + line.quantity, 0),
      0,
    ),
  );
  const [qty, setQty] = useState(item.line.qty);
  const [price, setPrice] = useState(item.line.price);
  const [releaseAmount, setReleaseAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const total = item.line.qty * item.line.price;
  const edit = canEdit("orders", role);
  const supplierActive = () =>
    getProcurement().suppliers.some((s) => s.name === item.supplier && s.status === "Active");
  const patch = (change: Partial<Order>, action: string, detail: string) =>
    updateCommercial((s) => ({
      ...s,
      orders: s.orders.map((x) =>
        x.id === item.id
          ? { ...x, ...change, audit: [...x.audit, audit(actor(role), action, detail)] }
          : x,
      ),
    }));
  const issue = () => {
    if (!supplierActive())
      return setError("Supplier is not active in the supplier master. Issue blocked.");
    if (total > item.sourceApprovedValue)
      return setError("PO exceeds approved source authority. Obtain renewed approval.");
    if (item.status !== "Approved") return setError("Only an approved PO can be issued.");
    const contract = getCommercial().contracts.find((c) => c.id === item.source);
    if (contract) {
      if (!["Active", "Expiring", "Renewed"].includes(contract.state) || !contract.signedVersion)
        return setError("Linked contract has no active signed terms.");
      if (new Date(contract.end).getTime() < Date.now())
        return setError("Linked contract has expired.");
      if (contract.committed + total > contract.ceiling)
        return setError("Issue exceeds the contract ceiling. Amend and sign first.");
    }
    updateCommercial((state) => ({
      ...state,
      orders: state.orders.map((order) =>
        order.id === item.id
          ? {
              ...order,
              status: "Issued",
              issuedAt: new Date().toISOString(),
              issueChannel: "Supplier portal",
              deliveryResult: "Delivered",
              audit: [
                ...order.audit,
                audit(
                  actor(role),
                  "Issued PO",
                  `v${order.version}; supplier portal; delivered (demo)`,
                ),
              ],
            }
          : order,
      ),
      contracts: state.contracts.map((c) =>
        c.id === item.source
          ? {
              ...c,
              committed: c.committed + total,
              audit: [
                ...c.audit,
                audit(
                  actor(role),
                  "PO commitment recorded",
                  `${item.id}: ${money(total, item.currency)}`,
                ),
              ],
            }
          : c,
      ),
    }));
    const [requestId, lineId] = (item.originRequest ?? item.source).split(" / ");
    if (requestId?.startsWith("PR-") && lineId)
      saveProcurement((state) => {
        const meta = state.metadata[requestId];
        if (!meta) return state;
        return {
          ...state,
          metadata: {
            ...state.metadata,
            [requestId]: {
              ...meta,
              lines: meta.lines.map((line) =>
                line.id === lineId
                  ? {
                      ...line,
                      allocatedQty: Math.max(0, line.allocatedQty - item.line.qty),
                      orderedQty: line.orderedQty + item.line.qty,
                      related: line.related.some((reference) => reference.kind === "PO" && reference.ref === item.id) ? line.related : [...line.related, { kind: "PO" as const, ref: item.id }],
                    }
                  : line,
              ),
            },
          },
          requests: state.requests.map((request) =>
            request.id === requestId
              ? {
                  ...request,
                  nextAction: `PO ${item.id} issued; track receipt`,
                  timeline: [
                    {
                      id: crypto.randomUUID(),
                      at: new Date().toISOString(),
                      actor: actor(role),
                      event: `Issued ${item.id} for ${item.line.qty} units`,
                    },
                    ...request.timeline,
                  ],
                }
              : request,
          ),
        };
      });
    setError("");
  };
  const propose = () => {
    if (!reason.trim() || qty <= 0 || price <= 0)
      return setError("Quantity, price and reason are required.");
    if (qty < item.line.received) return setError("Quantity cannot fall below accepted receipts.");
    patch(
      { status: "Change pending", proposed: { qty, price, reason } },
      "Requested PO change",
      `v${item.version}: ${item.line.qty} × ${money(item.line.price, item.currency)} → ${qty} × ${money(price, item.currency)}; ${reason}`,
    );
    setError("");
  };
  const approveChange = () => {
    if (!item.proposed) return;
    const p = item.proposed;
    const next = p.qty * p.price;
    if (next > item.sourceApprovedValue)
      return setError("Revised value exceeds source authority. Request renewed approval.");
    const before = `${item.line.qty} × ${money(item.line.price, item.currency)}`;
    const after = `${p.qty} × ${money(p.price, item.currency)}`;
    patch(
      {
        line: { ...item.line, qty: p.qty, price: p.price },
        version: item.version + 1,
        status: "Approved",
        proposed: undefined,
        supplierRequest: undefined,
        revisions: [
          ...item.revisions,
          {
            version: item.version + 1,
            before,
            after,
            reason: p.reason,
            at: new Date().toISOString(),
          },
        ],
      },
      "Approved PO revision",
      `v${item.version + 1}: ${before} → ${after}; dispatch again required`,
    );
    setError("");
  };
  const releaseBlanket = () => {
    const b = item.blanket;
    if (!b) return;
    if (!supplierActive() || !["Issued", "Acknowledged"].includes(item.status))
      return setError("Blanket PO must be issued and supplier active.");
    if (new Date(b.end).getTime() < Date.now()) return setError("Blanket PO is expired.");
    if (releaseAmount <= 0 || releaseAmount > b.ceiling - b.used)
      return setError("Release exceeds the remaining blanket limit.");
    const reference = nextId("REL", b.releases.length + 2);
    patch(
      {
        blanket: {
          ...b,
          used: b.used + releaseAmount,
          releases: [
            ...b.releases,
            { reference, amount: releaseAmount, at: new Date().toISOString().slice(0, 10) },
          ],
        },
      },
      "Blanket release",
      `${reference}: ${money(releaseAmount, item.currency)}; remaining ${money(b.ceiling - b.used - releaseAmount, item.currency)}`,
    );
    setReleaseAmount(0);
    setError("");
  };
  const close = () => {
    if (item.line.received < item.line.qty || invoicedQty < item.line.qty)
      return setError(
        "Open receipt or invoice balance. Cancel the remainder with a reason or reconcile first.",
      );
    patch(
      { status: "Closed" },
      "Closed PO",
      "Fully received and invoiced; remaining commitment released (demo)",
    );
  };
  const cancelRemaining = () => {
    const remaining = item.line.qty - item.line.received;
    if (!reason.trim()) return setError("Cancellation requires a reason.");
    if (invoicedQty > item.line.received)
      return setError(
        "Invoice quantity exceeds accepted quantity. Resolve the invoice discrepancy before closing this balance.",
      );
    patch({ status: "Closed" }, "Cancelled remaining PO balance", `${remaining} units; ${reason}`);
    const [requestId, lineId] = (item.originRequest ?? item.source).split(" / ");
    if (requestId?.startsWith("PR-") && lineId && remaining > 0)
      saveProcurement((state) => {
        const meta = state.metadata[requestId];
        if (!meta) return state;
        return {
          ...state,
          metadata: {
            ...state.metadata,
            [requestId]: {
              ...meta,
              lines: meta.lines.map((line) =>
                line.id === lineId
                  ? {
                      ...line,
                      orderedQty: Math.max(0, line.orderedQty - remaining),
                      cancelledQty: line.cancelledQty + remaining,
                    }
                  : line,
              ),
            },
          },
        };
      });
    setError("");
  };
  return (
    <>
      <section className={section}>
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{item.supplier}</h2>
            <p className="text-sm text-muted-foreground">
              Source{" "}
              {item.source.startsWith("CON-") ? (
                <Link
                  className="text-primary underline"
                  to="/procurement/contracts/$id"
                  params={{ id: item.source }}
                >
                  {item.source}
                </Link>
              ) : item.source.startsWith("EV-") ? (
                <Link
                  className="text-primary underline"
                  to="/procurement/evaluations/$id"
                  params={{ id: item.source }}
                >
                  {item.source}
                </Link>
              ) : item.source.startsWith("PR-") ? (
                <Link
                  className="text-primary underline"
                  to="/procurement/requests/$id"
                  params={{ id: (item.originRequest ?? item.source).split(" / ")[0] }}
                >
                  {item.source}
                </Link>
              ) : (
                item.source
              )}
              {item.originRequest ? (
                <>
                  {" "}
                  · Request{" "}
                  <Link
                    className="text-primary underline"
                    to="/procurement/requests/$id"
                    params={{ id: item.originRequest.split(" / ")[0] }}
                  >
                    {item.originRequest}
                  </Link>
                </>
              ) : null}{" "}
              · {item.entity}
            </p>
          </div>
          <Tag>{item.status}</Tag>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Current issued version">v{item.version}</Field>
          <Field label="Order total">{money(total, item.currency)}</Field>
          <Field label="Approved source authority">
            {money(item.sourceApprovedValue, item.currency)}
          </Field>
          <Field label="Ship to / Bill to">
            {item.shipTo} / {item.billTo}
          </Field>
          <Field label="Tax & terms">
            {item.taxRef} · {item.terms}
          </Field>
          <Field label="Expected delivery">{item.due}</Field>
        </div>
        <p className="mt-4 text-sm">
          {item.line.qty} {item.line.unit} × {money(item.line.price, item.currency)} —{" "}
          {item.line.description} ({item.line.type})
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Dispatch: {item.issuedAt || "not issued"} · {item.issueChannel || "—"} ·{" "}
          {item.deliveryResult || "—"}; acknowledgment {item.acknowledgedAt || "pending"}
        </p>
        {item.deliveryNotice && <p className="mt-1 text-xs text-muted-foreground">Supplier delivery notice: {item.deliveryNotice.reference} · {item.deliveryNotice.at}</p>}
      </section>
      {item.supplierRequest && (
        <section className={section}>
          <h2 className="font-semibold">Supplier {item.supplierRequest.kind.toLowerCase()} awaiting buyer review</h2>
          <p className="mt-2 text-sm">{item.supplierRequest.reason} · {item.supplierRequest.at}</p>
          {edit && item.status === "On hold" && <div className="mt-3"><Label htmlFor="supplier-response-reason">Buyer resolution reason</Label><Input id="supplier-response-reason" value={reason} onChange={(event) => setReason(event.target.value)} /><Button className="mt-2" variant="outline" onClick={() => { if (!reason.trim()) return setError("Record why this supplier request was resolved."); patch({ status: "Issued", supplierRequest: undefined }, "Resolved supplier request", reason); setReason(""); setError(""); }}>Resume issued PO</Button><p className="mt-2 text-xs text-muted-foreground">To change commercial terms, use the numbered revision action below instead.</p></div>}
        </section>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <section className={section}>
          <h2 className="font-semibold">Delivery progress</h2>
          <p className="text-2xl font-semibold">
            {item.line.received} / {item.line.qty}
          </p>
          <p className="text-sm text-muted-foreground">
            {item.line.qty - item.line.received} remaining
          </p>
          <Link
            className="text-sm text-primary underline"
            to="/procurement/receiving/$id"
            params={{ id: item.id }}
          >
            Open receiving →
          </Link>
        </section>
        <section className={section}>
          <h2 className="font-semibold">Bill progress</h2>
          <p className="text-2xl font-semibold">
            {invoicedQty} / {item.line.qty}
          </p>
          <p className="text-sm text-muted-foreground">
            Finance/AP status is separate from receipt and commercial state.
          </p>
          {invoices.map((invoice) => (
            <Link
              key={invoice.id}
              className="mt-1 block text-sm text-primary underline"
              to="/procurement/invoices/$id"
              params={{ id: invoice.id }}
            >
              {invoice.number} · {invoice.status}
            </Link>
          ))}
        </section>
      </div>
      {item.blanket && (
        <section className={section}>
          <h2 className="font-semibold">Standing order limit</h2>
          <p>
            {money(item.blanket.used, item.currency)} used /{" "}
            {money(item.blanket.ceiling, item.currency)} ceiling · ends {item.blanket.end}
          </p>
          <p className="text-sm text-muted-foreground">
            Remaining {money(item.blanket.ceiling - item.blanket.used, item.currency)}. Releases
            consume this PO limit; contract ceiling is checked separately.
          </p>
          {item.blanket.releases.map((r) => (
            <p key={r.reference} className="mt-1 text-sm">
              {r.reference} · {money(r.amount, item.currency)} · {r.at}
            </p>
          ))}
          {edit && (
            <div className="mt-3 flex items-end gap-2">
              <div>
                <Label htmlFor="blanket-release">New release amount</Label>
                <Input
                  id="blanket-release"
                  type="number"
                  min="1"
                  value={releaseAmount || ""}
                  onChange={(e) => setReleaseAmount(Number(e.target.value))}
                />
              </div>
              <Button onClick={releaseBlanket}>Record release</Button>
            </div>
          )}
        </section>
      )}
      {error && (
        <p role="alert" className="rounded border border-destructive p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {edit && (
        <section className={section}>
          <h2 className="font-semibold">Order actions</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {item.status === "Draft" && (
              <Button
                onClick={() => {
                  if (!supplierActive())
                    return setError("Supplier is suspended; approval blocked.");
                  if (total > item.sourceApprovedValue)
                    return setError("Exceeds source authority.");
                  patch(
                    { status: "Pending approval" },
                    "Submitted for approval",
                    "Source and supplier checked",
                  );
                }}
              >
                Submit for approval
              </Button>
            )}
            {item.status === "Pending approval" && role === "proc_admin" && (
              <Button
                onClick={() =>
                  patch(
                    { status: "Approved" },
                    "Approved PO",
                    `v${item.version}; separate authority`,
                  )
                }
              >
                Approve PO
              </Button>
            )}
            {item.status === "Approved" && <Button onClick={issue}>Send approved order</Button>}
            {item.status === "Issued" && (
              <Button
                variant="outline"
                onClick={() =>
                  patch(
                    { status: "Acknowledged", acknowledgedAt: new Date().toISOString() },
                    "Supplier acknowledged",
                    "Portal response (demo)",
                  )
                }
              >
                Record supplier acknowledgment
              </Button>
            )}
            {["Issued", "Acknowledged"].includes(item.status) && (
              <Button variant="outline" onClick={close}>
                Close PO
              </Button>
            )}
          </div>
          {["Issued", "Acknowledged", "Approved", "On hold"].includes(item.status) && (
            <div className="mt-5 border-t pt-4">
              <h3 className="font-medium">Request numbered revision</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <div>
                  <Label htmlFor="po-qty">Quantity</Label>
                  <Input
                    id="po-qty"
                    type="number"
                    min="1"
                    value={qty}
                    onChange={(e) => setQty(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label htmlFor="po-price">Unit price</Label>
                  <Input
                    id="po-price"
                    type="number"
                    min="1"
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label htmlFor="po-reason">Change reason</Label>
                  <Input
                    id="po-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              </div>
              <p className="mt-2 text-sm">
                Before {money(total, item.currency)} → proposed {money(qty * price, item.currency)}
              </p>
              <Button className="mt-2" variant="outline" onClick={propose}>
                Request change
              </Button>
            </div>
          )}
          {item.proposed && (
            <div className="mt-4 border-t pt-4">
              <h3 className="font-medium">Revision awaiting approval</h3>
              <p className="text-sm">
                {item.line.qty} × {money(item.line.price, item.currency)} → {item.proposed.qty} ×{" "}
                {money(item.proposed.price, item.currency)} · {item.proposed.reason}
              </p>
              {role === "proc_admin" && (
                <Button className="mt-2" onClick={approveChange}>
                  Approve revision
                </Button>
              )}
            </div>
          )}
          {["Issued", "Acknowledged", "On hold"].includes(item.status) && (
            <div className="mt-4 border-t pt-4">
              <Label htmlFor="po-cancel">Reason to cancel unfulfilled balance</Label>
              <Input id="po-cancel" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button variant="outline" className="mt-2" onClick={cancelRemaining}>
                Cancel remaining balance
              </Button>
            </div>
          )}
        </section>
      )}
      {item.revisions.length > 0 && (
        <section className={section}>
          <h2 className="font-semibold">Earlier versions</h2>
          {item.revisions.map((r) => (
            <p key={r.version} className="mt-2 text-sm">
              v{r.version}: {r.before} → {r.after} · {r.reason}
            </p>
          ))}
        </section>
      )}
      <AuditView items={item.audit} />
    </>
  );
}

function ReceivingView({
  item,
  role,
  receipts,
}: {
  item: Order;
  role: string;
  receipts: Receipt[];
}) {
  const [qty, setQty] = useState(0),
    [rejected, setRejected] = useState(0),
    [note, setNote] = useState(""),
    [evidence, setEvidence] = useState(""),
    [inspection, setInspection] = useState(""),
    [period, setPeriod] = useState(""),
    [deliverable, setDeliverable] = useState(""),
    [error, setError] = useState(""),
    [returnId, setReturnId] = useState(""),
    [returnReason, setReturnReason] = useState("");
  const editable = canEdit("receiving", role);
  const remaining = item.line.qty - item.line.received;
  const kind = item.line.type;
  const syncRequestReceipt = (delta: number, receiptRef?: string) => {
    const [requestId, lineId] = (item.originRequest ?? item.source).split(" / ");
    if (!requestId?.startsWith("PR-") || !lineId) return;
    saveProcurement((state) => {
      const meta = state.metadata[requestId];
      if (!meta) return state;
      return {
        ...state,
        metadata: {
          ...state.metadata,
          [requestId]: {
            ...meta,
            lines: meta.lines.map((line) =>
              line.id === lineId
                ? { ...line, receivedQty: Math.max(0, line.receivedQty + delta), related: receiptRef && !line.related.some((reference) => reference.kind === "Receipt" && reference.ref === receiptRef) ? [...line.related, { kind: "Receipt" as const, ref: receiptRef }] : line.related }
                : line,
            ),
          },
        },
      };
    });
  };
  const record = () => {
    if (!["Issued", "Acknowledged"].includes(item.status))
      return setError("Only an issued PO can be received.");
    if (qty < 0 || rejected < 0 || qty + rejected <= 0)
      return setError("Enter accepted or rejected quantity.");
    if (qty > remaining)
      return setError(
        "Accepted quantity exceeds remaining PO balance. Exception approval required.",
      );
    if (!note.trim() || !evidence.trim())
      return setError("Delivery/service reference and evidence are required.");
    if (kind === "Service" && (!period.trim() || !deliverable.trim()))
      return setError("Service period and deliverable are required.");
    if (kind === "Goods" && !inspection.trim())
      return setError("Complete the inspection outcome before acceptance.");
    const id = nextId(kind === "Goods" ? "GRN" : "SVC", Date.now() % 10000);
    const receipt: Receipt = {
      id,
      poId: item.id,
      kind,
      status: qty === 0 ? "Rejected" : qty < remaining ? "Partially accepted" : "Accepted",
      qty,
      rejected,
      date: new Date().toISOString().slice(0, 10),
      site: item.shipTo,
      note,
      evidence,
      actor: actor(role),
      servicePeriod: period || undefined,
      deliverable: deliverable || undefined,
      inspection: inspection || undefined,
      handoff: kind === "Goods" ? "Pending" : "Not required",
      audit: [
        audit(
          actor(role),
          "Recorded acceptance",
          `${qty} accepted, ${rejected} rejected; evidence ${evidence}`,
        ),
      ],
    };
    updateCommercial((s) => ({
      ...s,
      receipts: [...s.receipts, receipt],
      orders: s.orders.map((x) =>
        x.id === item.id
          ? {
              ...x,
              line: { ...x.line, received: x.line.received + qty },
              audit: [
                ...x.audit,
                audit(actor(role), "Receipt recorded", `${receipt.id}: ${qty} accepted`),
              ],
            }
          : x,
      ),
    }));
    syncRequestReceipt(qty, receipt.id);
    setQty(0);
    setRejected(0);
    setNote("");
    setEvidence("");
    setInspection("");
    setPeriod("");
    setDeliverable("");
    setError("");
  };
  const reverse = (r: Receipt) => {
    if (!returnReason.trim()) return setError("Reversal requires a reason.");
    updateCommercial((s) => ({
      ...s,
      receipts: s.receipts.map((x) =>
        x.id === r.id
          ? {
              ...x,
              status: "Reversed",
              audit: [...x.audit, audit(actor(role), "Reversed receipt", returnReason)],
            }
          : x,
      ),
      orders: s.orders.map((x) =>
        x.id === item.id
          ? {
              ...x,
              line: { ...x.line, received: Math.max(0, x.line.received - r.qty) },
              audit: [
                ...x.audit,
                audit(
                  actor(role),
                  "Adjusted accepted balance",
                  `${r.id}: -${r.qty}; original retained`,
                ),
              ],
            }
          : x,
      ),
    }));
    syncRequestReceipt(-r.qty);
    setReturnReason("");
    setReturnId("");
    setError("");
  };
  const requestReturn = (r: Receipt) => {
    if (!returnReason.trim()) return setError("Return requires a reason.");
    updateCommercial((s) => ({
      ...s,
      receipts: s.receipts.map((x) =>
        x.id === r.id
          ? {
              ...x,
              status: "Return requested",
              returnReason,
              audit: [...x.audit, audit(actor(role), "Requested return", returnReason)],
            }
          : x,
      ),
    }));
    setReturnReason("");
    setReturnId("");
    setError("");
  };
  return (
    <>
      <section className={section}>
        <div className="flex justify-between">
          <div>
            <h2 className="text-lg font-semibold">{item.line.description}</h2>
            <p className="text-sm text-muted-foreground">
              {item.id} · {item.supplier} · {item.shipTo}
            </p>
          </div>
          <Tag>{item.status}</Tag>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <Field label="Ordered">
            {item.line.qty} {item.line.unit}
          </Field>
          <Field label="Previously accepted">{item.line.received}</Field>
          <Field label="Remaining">{remaining}</Field>
          <Field label="Record type">{kind}</Field>
        </div>
        <Link
          className="mt-3 inline-block text-sm text-primary underline"
          to="/procurement/orders/$id"
          params={{ id: item.id }}
        >
          View commercial PO
        </Link>
      </section>
      {error && (
        <p role="alert" className="border border-destructive p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {editable && remaining > 0 && ["Issued", "Acknowledged"].includes(item.status) && (
        <section className={section}>
          <h2 className="font-semibold">
            {kind === "Goods"
              ? "Record goods delivery and inspection"
              : "Certify service milestone"}
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="received-qty">
                Accepted {kind === "Goods" ? "quantity" : "milestones"}
              </Label>
              <Input
                id="received-qty"
                type="number"
                min="0"
                max={remaining}
                value={qty || ""}
                onChange={(e) => setQty(Number(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="rejected-qty">Rejected / damaged</Label>
              <Input
                id="rejected-qty"
                type="number"
                min="0"
                value={rejected || ""}
                onChange={(e) => setRejected(Number(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="delivery-note">
                {kind === "Goods" ? "Delivery note" : "Service reference"}
              </Label>
              <Input id="delivery-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="evidence">Supporting document name</Label>
              <Input
                id="evidence"
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder="Signed document or attachment reference"
              />
            </div>
            {kind === "Goods" ? (
              <div className="sm:col-span-2">
                <Label htmlFor="inspection">Check result and any damage</Label>
                <Textarea
                  id="inspection"
                  value={inspection}
                  onChange={(e) => setInspection(e.target.value)}
                  placeholder="Checklist result; describe any damaged or wrong items"
                />
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="period">Service period</Label>
                  <Input
                    id="period"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    placeholder="1–31 October 2026"
                  />
                </div>
                <div>
                  <Label htmlFor="deliverable">Work completed</Label>
                  <Input
                    id="deliverable"
                    value={deliverable}
                    onChange={(e) => setDeliverable(e.target.value)}
                    placeholder="Monitoring report delivered"
                  />
                </div>
              </>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Rejected units are excluded from invoice eligibility. Inventory/Asset systems own
            downstream stock and registers.
          </p>
          <Button className="mt-3" onClick={record}>
            Record {kind === "Goods" ? "GRN" : "service acceptance"}
          </Button>
        </section>
      )}
      <section className={section}>
        <h2 className="font-semibold">Delivery and service history</h2>
        {!receipts.length && (
          <p className="mt-2 text-sm text-muted-foreground">Nothing has been accepted yet.</p>
        )}
        {receipts.map((r) => (
          <div key={r.id} className="mt-3 rounded-lg border p-3 text-sm">
            <div className="flex justify-between">
              <strong>
                {r.id} · {r.date}
              </strong>
              <Tag>{r.status}</Tag>
            </div>
            <p>
              {r.qty} accepted · {r.rejected} rejected · {r.site} · {r.actor}
            </p>
            <p className="text-muted-foreground">
              Reference {r.note}; evidence {r.evidence}; {r.inspection || r.deliverable || ""}{" "}
              {r.servicePeriod || ""}
            </p>
            <p className="text-xs text-muted-foreground">
              Inventory/Asset handoff: {r.handoff}. Credit/replacement:{" "}
              {r.creditRef || "pending if returned"}.
            </p>
            {editable && r.status !== "Reversed" && (
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setReturnId(r.id)}>
                  Return / correct
                </Button>
              </div>
            )}
            {returnId === r.id && (
              <div className="mt-2 border-t pt-2">
                <Label htmlFor={`return-${r.id}`}>Reason and supplier disposition</Label>
                <Input
                  id={`return-${r.id}`}
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                />
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => requestReturn(r)}>
                    Request return
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => reverse(r)}>
                    Reverse acceptance
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Reversal adjusts accepted balance while preserving this original record and
                  history.
                </p>
              </div>
            )}
            <div className="mt-2">
              <AuditView items={r.audit} />
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
