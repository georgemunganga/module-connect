import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, EmptyState, PageHeader, Panel } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { listAssignedOrderApprovals, type AssignedOrderApprovalPage } from "../../../src/platform/procurement-order-execution-api";
export function LiveOrderApprovalQueue() {
  const context = useLiveReadiness()!, [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [data, setData] = useState<AssignedOrderApprovalPage | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const permitted = context.capabilities.orders && context.permissions.includes("procurement-po-approve");
  useEffect(() => {
    const abort = new AbortController(); setData(null); setError(""); setLoading(true);
    if (!permitted) { setLoading(false); return () => abort.abort(); }
    listAssignedOrderApprovals(context.legalEntityId, page, abort.signal)
      .then((result) => { if (!abort.signal.aborted) setData(result); })
      .catch((cause: unknown) => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Order approvals are unavailable."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [context.legalEntityId, page, revision, permitted]);
  return <div className="p-5 sm:p-8"><PageHeader title="Order approvals" subtitle="Purchase orders waiting for your assigned decision." actions={<Button variant="secondary" onClick={() => setRevision((n) => n + 1)}>Refresh approvals</Button>} />
    {!permitted ? <p role="alert">You do not have access to order approvals.</p> : <Panel><div className="p-5">
      {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
      {loading ? <p role="status">Loading assigned orders…</p> : data?.items.length ? <div className="overflow-x-auto"><RecordTable><thead><tr><th>Order</th><th>Currency</th><th>Step</th><th>Status</th><th>Waiting since</th><th>Action</th></tr></thead>
        <tbody>{data.items.map((row) => <tr key={row.assignmentId}><td>{row.number}</td><td>{row.currencyCode}</td><td>{row.code}</td><td><Badge>{row.status}</Badge></td><td>{new Date(row.openedAt).toLocaleString()}</td><td><Link className="text-sm text-primary hover:underline" to={`/purchase-orders/${row.orderId}`}>Review order approval</Link></td></tr>)}</tbody></RecordTable></div>
        : !error && <EmptyState title="You're all caught up" description="No order approvals are waiting for your decision." />}
      {data && data.total > data.pageSize && <div className="mt-5 flex items-center gap-3"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous approvals</Button><span>Page {page}</span><Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next approvals</Button></div>}
    </div></Panel>}
  </div>;
}
