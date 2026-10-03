import { createFileRoute } from "@tanstack/react-router";
import { procApi, suppliers } from "@/modules/procurement/data";
import { AppShell } from "@/platform/components/AppShell";
import { Async } from "@/platform/components/Async";
import { ApprovalPanel } from "@/platform/components/ApprovalPanel";
import { RecordDetail } from "@/platform/components/RecordDetail";
import { RestrictedState } from "@/platform/components/States";
import { StatusTimeline } from "@/platform/components/StatusTimeline";
import { useMock } from "@/platform/use-mock";

export const Route = createFileRoute("/procurement/requests/$id")({
  head: () => ({
    meta: [
      { title: "Purchase request decision — Meridian ERP Procurement" },
      { name: "description", content: "Approve, return, reject or delegate a purchase request with full policy context." },
      { property: "og:title", content: "Purchase request decision — Meridian ERP Procurement" },
      { property: "og:description", content: "Approve, return, reject or delegate a purchase request with full policy context." },
    ],
  }),
  component: RequestDetail,
});

function RequestDetail() {
  const { id } = Route.useParams();
  const state = useMock(() => procApi.purchaseRequest(id), [id]);

  return (
    <AppShell>
      <Async state={state} rows={3}>
        {(r) => {
          if (!r) return <RestrictedState />;
          const supplier = suppliers.find((s) => s.id === r.supplierId);
          const money = new Intl.NumberFormat("en", { style: "currency", currency: r.currency, maximumFractionDigits: 0 });
          return (
            <RecordDetail
              reference={r.id}
              title={r.title}
              subtitle={`${r.department} · requested by ${r.requester}`}
              status={r.status}
              owner={r.owner}
              nextAction={`${r.nextAction} · due ${r.dueDate}`}
              summary={[
                { label: "Requester", value: r.requester },
                { label: "Department", value: r.department },
                { label: "Supplier", value: supplier ? `${supplier.name} (${supplier.status})` : "Not selected" },
                { label: "Total", value: money.format(r.amount) },
                { label: "Needed by", value: r.neededBy },
                { label: "Submitted", value: r.submittedAt },
              ]}
              timeline={<StatusTimeline title="History" events={r.timeline} />}
            >
              <section aria-labelledby="lines" className="rounded-lg border bg-surface p-4">
                <h2 id="lines" className="text-sm font-semibold">Requested items</h2>
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">Description</th>
                      <th className="pb-2 font-medium text-right">Qty</th>
                      <th className="pb-2 font-medium text-right">Unit price</th>
                      <th className="pb-2 font-medium text-right">Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.lines.map((l) => (
                      <tr key={l.description} className="border-b last:border-0">
                        <td className="py-2 pr-3">{l.description}</td>
                        <td className="tabular py-2 text-right">{l.qty}</td>
                        <td className="tabular py-2 text-right">{money.format(l.unitPrice)}</td>
                        <td className="tabular py-2 text-right font-medium">{money.format(l.qty * l.unitPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <ApprovalPanel
                decisionSummary={`Approve ${money.format(r.amount)} of spend for ${r.department}: ${r.title.toLowerCase()}.`}
                policy={r.policy}
                conflicts={r.conflicts}
                onDecision={() => undefined}
              />
            </RecordDetail>
          );
        }}
      </Async>
    </AppShell>
  );
}
