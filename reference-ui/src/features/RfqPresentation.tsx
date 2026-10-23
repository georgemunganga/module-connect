import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Badge, Button } from "../components/ui";
import { DetailTabs, DetailSection } from "../components/data/DetailPrimitives";

const stages = ["Basic Details", "Items", "Terms", "Documents", "Bidding Preferences", "Team"];

/** The imported wizard structure, with steps the live API does not own kept visible. */
export function RfqWizardLayout({ title, back, children, footer, approved = false, busy = false }: {
  title: string; back: string; children: ReactNode; footer?: ReactNode; approved?: boolean; busy?: boolean;
}) {
  return <div className="min-h-[calc(100dvh-5rem)] bg-muted/30">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-5 py-4 sm:px-8">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-primary">Procurement / RFQs</p><h1 className="mt-1 text-xl font-semibold">{title}</h1></div>
      <Link to={back} onClick={event => { if (busy) event.preventDefault(); }} aria-disabled={busy}><Button type="button" variant="secondary" disabled={busy}>Back to quote requests</Button></Link>
    </header>
    <div className="mx-auto flex max-w-[1480px] flex-col lg:flex-row">
      <aside className="border-b border-border bg-surface lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r" aria-label="Quote request stages">
        <ol className="flex gap-1 overflow-x-auto p-3 lg:block lg:space-y-1 lg:p-5">{stages.map((stage, index) =>
          <li key={stage} className="min-w-40 lg:min-w-0"><button type="button" onClick={() => document.getElementById(`rfq-stage-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm ${index < 2 ? "bg-primary/5 text-foreground" : "text-muted-foreground hover:bg-primary/5"}`}>
            <span className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs ${index < 2 ? "border-primary text-primary" : "border-border"}`}>{index + 1}</span>
            <span>{stage}{approved && index === 1 ? <span className="block text-xs text-muted-foreground">Approved request lines</span> : null}</span>
          </button></li>)}</ol>
        <p className="px-5 pb-5 text-xs text-muted-foreground">Terms, documents, bidding preferences and team setup become available when their controlled workflows are connected.</p>
      </aside>
      <main className="min-w-0 flex-1 p-5 sm:p-8"><div className="max-w-5xl space-y-5">{children}
        <section aria-label="Additional quote setup" className="grid gap-3 sm:grid-cols-2">{[
          ["Terms", "Supplier terms and requirements are not available for this draft yet."],
          ["Documents", "Quote documents cannot be attached to this draft yet."],
          ["Bidding Preferences", "Bid format and supplier invitations are not available yet."],
          ["Team", "Organizer and collaborator assignment is not available yet."],
        ].map(([heading, description], index) => <div id={`rfq-stage-${index + 2}`} key={heading} className="scroll-mt-28 rounded-xl border border-border bg-surface p-4"><h2 className="text-sm font-semibold">{heading}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>)}</section>
      </div>{footer && <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-5">{footer}</div>}</main>
    </div>
  </div>;
}

export function RfqDetailLayout({ title, number, method, currency, status, back, actions, overview, items, itemCount, related, activity }: {
  title: string; number: string; method: string; currency: string; status: string; back: string;
  actions?: ReactNode; overview: ReactNode; items: ReactNode; itemCount: number; related?: ReactNode; activity?: ReactNode;
}) {
  const [active, setActive] = useState("overview");
  return <div className="min-h-[calc(100dvh-5rem)] bg-muted/30">
    <header className="sticky top-14 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-5 py-4 sm:px-8">
      <div className="min-w-0"><Link to={back} className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"><ArrowLeft size={13} />Request for Quotes</Link>
        <h1 className="truncate text-xl font-semibold">{title}</h1><p className="text-sm text-muted-foreground">{number} · {method} · {currency}</p></div>
      <div className="flex flex-wrap items-center gap-2"><Badge>{status}</Badge>{actions}</div>
    </header>
    <DetailTabs tabs={[{ key: "overview", label: "Overview" }, { key: "items", label: `Items (${itemCount})` }, { key: "related", label: "Related" }, { key: "comments", label: "Comments" }, { key: "history", label: "History" }]} active={active} onChange={setActive} />
    <div className="mx-auto max-w-7xl space-y-5 p-5 sm:p-8">
      <div hidden={active !== "overview"} inert={active !== "overview" ? true : undefined}>{overview}</div>
      {active === "items" && <DetailSection title="Items / Line Details">{items}</DetailSection>}
      {active === "related" && <DetailSection title="Related records">{related}<p className="text-sm text-muted-foreground">Related bids, purchase orders and awards are not available yet.</p></DetailSection>}
      {active === "comments" && <DetailSection title="Comments"><p className="text-sm text-muted-foreground">Comments are not available for this quote request yet.</p></DetailSection>}
      {active === "history" && <DetailSection title="History">{activity || <p className="text-sm text-muted-foreground">An activity history is not available for this quote request yet.</p>}</DetailSection>}
    </div>
  </div>;
}
