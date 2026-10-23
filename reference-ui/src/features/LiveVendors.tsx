import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Panel, Select, Switch, Textarea } from "../components/ui";
import { VendorDetailFrame, vendorDetailTabs } from "../components/vendors/VendorDetailFrame";
import { DetailSection, DetailValue } from "../components/data/DetailPrimitives";
import { useErpShell } from "../lib/erpShell";
import { RecordTable } from "../components/data/RecordTable";
import { LiveCatalogDirectory } from "../components/data/LiveCatalogDirectory";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import {
  addVendorContact, addVendorSite, addVendorQualification, createVendorDraft, getVendorDraft,
  getVendorOpenOrders,
  updateVendorContact, updateVendorSite, updateVendorQualification,
  removeVendorContact, removeVendorSite, removeVendorQualification,
  listVendorDrafts, updateVendorDraft, withdrawVendorDraft,
  submitVendorForReview,
  returnVendorForInformation, approveVendor, rejectVendor, suspendVendor, reactivateVendor,
  reviewVendorQualification,
  type VendorContactDraft, type VendorDetail, type VendorDraft, type VendorOpenOrders, type VendorPage,
  type VendorQualificationDraft, type VendorSiteDraft,
} from "../../../src/platform/procurement-vendors-api";

const empty: VendorDraft = {
  legalName: "", displayName: "", countryCode: "ZM", registrationNumber: "",
  currencyCode: "", paymentTermRef: "", taxCategoryRef: "", languageCode: "en",
  remarks: "", isLocal: true, portalAccessRequested: false,
};
const message = (error: unknown) => error instanceof Error ? error.message : "The vendor action failed. Try again.";

function useCompany() {
  const readiness = useLiveReadiness();
  if (!readiness) throw new Error("Vendor workspace requires ERP company context.");
  return readiness;
}

export function LiveVendorList() {
  const readiness = useCompany();
  const { legalEntityId, permissions } = readiness;
  const { selection, authEpoch } = useErpShell();
  if (selection.entityId && selection.entityId !== legalEntityId)
    return <p role="status">Checking the selected company…</p>;
  return <VendorListRecord key={[authEpoch, readiness.tenantId, legalEntityId, selection.branch ?? "",
    readiness.principalId, permissions.slice().sort().join("|")].join(":")} />;
}

const vendorStatuses = ["Submitted", "More Information Required", "Draft", "Approved", "Active", "Suspended", "Withdrawn"]
  .map(value => ({ value, label: value === "Submitted" ? "Submitted for review" : value }));

function VendorListRecord() {
  const { legalEntityId, permissions } = useCompany();
  const canCreate = permissions.includes("procurement-vendor-create");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<VendorPage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setData(null);
    listVendorDrafts(legalEntityId, { search, status, page, signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [legalEntityId, search, status, page, revision]);
  return <div className="p-5 sm:p-8">
    <LiveCatalogDirectory key={`${search}:${status}:${page}`} title="Vendors" entity="vendors"
      subtitle="Add vendors, review their details, and manage who can receive new orders."
      columns={[{ key: "number", label: "Vendor / Reference", width: 250 }, { key: "legal", label: "Legal name", width: 210 },
        { key: "country", label: "Country", width: 100 }, { key: "orderable", label: "Ready for orders", width: 140 },
        { key: "created", label: "Created", width: 130 }, { key: "status", label: "Status", width: 125 }]}
      rows={(data?.items ?? []).map(vendor => ({ id: vendor.id, number: vendor.number, title: vendor.displayName,
        status: vendor.status, path: `/vendors/${vendor.id}`, fields: { legal: vendor.legalName,
          country: vendor.countryCode, orderable: vendor.isOrderable ? "Yes" : "No", created: vendor.createdAt?.slice(0, 10) || "" } }))}
      total={data?.total ?? 0} page={page} pageSize={data?.pageSize || 25} loading={loading} error={error}
      search={search} onSearch={value => { setPage(1); setSearch(value); }} status={status} statuses={vendorStatuses}
      onStatusChange={value => { setPage(1); setStatus(value); }} onPage={setPage} onRefresh={() => setRevision(value => value + 1)}
      action={canCreate ? <Link to="/vendors/new"><Button><Plus size={16} className="mr-2 inline" />Add vendor</Button></Link> : undefined}
      emptyTitle="Every purchase starts with a vendor"
      emptyDescription="Create and manage your vendors and their contact persons, all in one place." />
  </div>;
}

export { FullVendorEditor as LiveVendorEditor } from "./FullVendorEditor";

/** Reset the complete live record on company/branch/employee-mapping/record changes. URL
 * tabs keep the same record; no browser-local catalog data is used as a fallback. */
export function LiveVendorDetail() {
  const { id } = useParams();
  const readiness = useCompany();
  const { selection } = useErpShell();
  if (selection.entityId && selection.entityId !== readiness.legalEntityId)
    return <p role="status">Checking the selected company…</p>;
  return <LiveVendorRecord key={`${readiness.tenantId}:${readiness.legalEntityId}:${selection.branch ?? ""}:${readiness.principalId}:${id}`} />;
}

function VendorDirectory({ companyId, selectedId, canCreate }: { companyId: string; selectedId: string; canCreate: boolean }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<VendorPage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setData(null); setError("");
    listVendorDrafts(companyId, { search, page, pageSize: 25, signal: abort.signal })
      .then(value => { if (!abort.signal.aborted) setData(value); })
      .catch(cause => { if (!abort.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [companyId, search, page]);
  return <>
    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-4"><div><p className="text-sm text-muted-foreground">Directory</p><Link className="font-semibold hover:text-primary" to="/vendors">Vendors</Link></div>
      {canCreate && <Link to="/vendors/new" aria-label="Add vendor"><Button variant="secondary"><Plus size={16} /></Button></Link>}
    </div>
    <form className="space-y-2 border-b border-border p-3" onSubmit={event => { event.preventDefault(); setPage(1); setSearch(query.trim()); }}>
      <Input aria-label="Search vendor directory" placeholder="Find a vendor" value={query} onChange={event => setQuery(event.target.value)} />
      <Button type="submit" variant="secondary">Search directory</Button>
    </form>
    <div className="max-h-52 overflow-y-auto xl:max-h-[calc(100dvh-22rem)]">
      {loading ? <p role="status" className="p-4 text-sm text-muted-foreground">Loading directory…</p> : error ? <p role="alert" className="p-4 text-sm text-destructive">{error}</p> : data?.items.length ? data.items.map(row =>
        <Link key={row.id} to={`/vendors/${row.id}`} aria-current={row.id === selectedId ? "page" : undefined} className={`block border-b border-border px-4 py-3 hover:bg-muted ${row.id === selectedId ? "bg-muted" : ""}`}>
          <span className="block truncate text-sm font-medium">{row.displayName}</span><span className="mt-1 block text-sm text-muted-foreground">{row.number} · {row.status}</span>
        </Link>) : <p className="p-4 text-sm text-muted-foreground">No vendors found.</p>}
    </div>
    {data && data.total > data.pageSize && <div className="flex flex-wrap items-center gap-2 p-3"><Button variant="secondary" disabled={page===1 || loading} onClick={()=>setPage(page-1)}>Previous vendors</Button><span className="text-sm">Page {page}</span><Button variant="secondary" disabled={page*data.pageSize>=data.total || loading} onClick={()=>setPage(page+1)}>Next vendors</Button></div>}
  </>;
}

function LiveVendorRecord() {
  const { id, tab } = useParams();
  const { legalEntityId, permissions } = useCompany();
  const navigate = useNavigate();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [businessReason, setBusinessReason] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [duplicatesReviewed, setDuplicatesReviewed] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [reactivateReason, setReactivateReason] = useState("");
  const [diligenceReviewed, setDiligenceReviewed] = useState(false);
  const [ordersReviewed, setOrdersReviewed] = useState(false);
  const [openOrders, setOpenOrders] = useState<VendorOpenOrders | null>(null);
  const [ordersError, setOrdersError] = useState("");
  const [contact, setContact] = useState<VendorContactDraft>({ name: "", email: "", phone: "", isPrimary: false });
  const [site, setSite] = useState<VendorSiteDraft>({ kind: "Billing", addressLine1: "", city: "", countryCode: "ZM", isPrimary: false, isServiceSite: false });
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [editingQualificationId, setEditingQualificationId] = useState<string | null>(null);
  const [removingDetail, setRemovingDetail] = useState<{ kind: "contact" | "site" | "qualification"; id: string; label: string } | null>(null);
  const [removalReason, setRemovalReason] = useState("");
  const [qualification, setQualification] = useState({ qualificationType: "", issuer: "", referenceNumber: "", issuedOn: "", expiresOn: "" });
  const reload = () => { if (!id || !mounted.current) return; setLoading(true); getVendorDraft(legalEntityId, id).then(value => { if (mounted.current) setVendor(value); }).catch((cause: unknown) => { if (mounted.current) setError(message(cause)); }).finally(() => { if (mounted.current) setLoading(false); }); };
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true); setError(""); setVendor(null);
    getVendorDraft(legalEntityId, id, controller.signal).then(value => { if (!controller.signal.aborted) setVendor(value); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, legalEntityId]);
  useEffect(() => {
    if (!vendor?.canSuspend) return;
    const controller = new AbortController();
    setOpenOrders(null); setOrdersError(""); setOrdersReviewed(false);
    getVendorOpenOrders(legalEntityId, vendor.id, controller.signal)
      .then(value => { if (!controller.signal.aborted) setOpenOrders(value); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setOrdersError(message(cause)); });
    return () => controller.abort();
  }, [vendor?.canSuspend, vendor?.id, vendor?.version, legalEntityId]);
  async function act(operation: () => Promise<unknown>): Promise<boolean> {
    if (!mounted.current) return false;
    setBusy(true); setError("");
    try { await operation(); if (!mounted.current) return false; reload(); return true; }
    catch (cause) { if (mounted.current) setError(message(cause)); return false; }
    finally { if (mounted.current) setBusy(false); }
  }
  if (loading) return <div className="p-5 sm:p-8" role="status">Loading vendor…</div>;
  if (!vendor) return <div className="p-5 sm:p-8" role="alert">{error || "Vendor not found."}</div>;
  const editable = permissions.includes("procurement-vendor-edit") && (vendor.status === "Draft" || vendor.status === "More Information Required");
  const qualificationDatesInvalid = Boolean(qualification.issuedOn && qualification.expiresOn
    && qualification.expiresOn < qualification.issuedOn);
  const activeTab = vendorDetailTabs.some(value => value.key === tab) ? tab! : "overview";
  const contactPerson = vendor.contacts?.find(row => row.isPrimary) ?? vendor.contacts?.[0];
  return <VendorDetailFrame title={vendor.displayName} status={vendor.status}
    subtitle={[vendor.number, vendor.legalName].filter(Boolean).join(" · ")}
    directory={<VendorDirectory companyId={legalEntityId} selectedId={vendor.id} canCreate={permissions.includes("procurement-vendor-create")} />}
    actions={editable ? <Link to={`/vendors/${vendor.id}/edit`}><Button variant="secondary">Edit vendor</Button></Link> : undefined}
    activeTab={activeTab} onTabChange={value => navigate(value === "overview" ? `/vendors/${vendor.id}` : `/vendors/${vendor.id}/${value}`)}>
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    {activeTab !== "overview" ? <DetailSection title={vendorDetailTabs.find(value => value.key === activeTab)!.label}>
      <p className="text-sm text-muted-foreground">{activeTab === "comments" ? "Vendor comments are not connected yet." : activeTab === "transactions" ? "Linked purchase transactions are not connected to this vendor view yet." : activeTab === "mails" ? "Vendor email history and sending are not connected yet." : "Vendor statements and payable balances are not connected to Finance yet."}</p>
      <p className="mt-2 text-sm text-muted-foreground">No records or balances are inferred from this unavailable information.</p>
    </DetailSection> : <>
    <div className="grid gap-4 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.6fr)]">
      <DetailSection title="Vendor contact"><div className="flex items-start gap-3"><span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-primary">{vendor.displayName.trim().split(/\s+/).slice(0,2).map(value => value[0]).join("")}</span><div className="min-w-0"><p className="font-semibold">{contactPerson?.name || vendor.displayName}</p><p className="mt-1 text-sm text-muted-foreground">{vendor.legalName || "Company details unavailable"}</p><p className="mt-2 break-all text-sm">{contactPerson?.email || (vendor.contacts === undefined ? "Contact details unavailable" : "Email not provided")}</p><p className="mt-1 text-sm">{contactPerson?.workPhone || contactPerson?.phone || "Work phone not provided"}</p>{contactPerson?.mobilePhone && <p className="mt-1 text-sm">{contactPerson.mobilePhone}</p>}</div></div></DetailSection>
      <DetailSection title="Payables"><dl className="grid gap-4 sm:grid-cols-3"><DetailValue label="Currency" value={vendor.defaultCurrencyCode || "Not provided"} /><DetailValue label="Outstanding payables" value="Unavailable" /><DetailValue label="Unused credits" value="Unavailable" /></dl><p className="mt-4 text-sm text-muted-foreground">Finance balances are not connected to this vendor view.</p></DetailSection>
    </div>
    {vendor.status === "Submitted" && <p className="mb-5 rounded-lg border border-border bg-surface-muted p-4 text-sm">Submitted for review{vendor.statusDecidedAt ? ` on ${new Date(vendor.statusDecidedAt).toLocaleDateString()}` : ""}. This vendor cannot receive new purchase orders yet.{vendor.statusReason ? ` Reason: ${vendor.statusReason}` : ""}</p>}
    {vendor.status === "More Information Required" && <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">More information is needed before this vendor can be approved.{vendor.statusReason ? ` Reviewer note: ${vendor.statusReason}` : ""} Update the details below, then send the vendor for review again.</p>}
    {vendor.status === "Suspended" && <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">This vendor is on hold and cannot receive new orders.{vendor.statusReason ? ` Reason: ${vendor.statusReason}` : ""} Existing orders remain available for review.</p>}
    {(vendor.canReturnForInformation || vendor.canApprove || vendor.canReject) && <Panel title="Review vendor" className="mb-5"><div className="space-y-3 p-5">
      <p className="text-sm text-muted-foreground">Check the company details and documents, then record your decision. Finance verifies payment details separately.</p>
      <Field label="Reason for your decision"><Textarea rows={3} maxLength={1000} required value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} /></Field>
      {vendor.canApprove && <label className="flex items-center gap-3 text-sm"><Switch checked={duplicatesReviewed} onChange={(event) => setDuplicatesReviewed(event.target.checked)} />I checked for duplicate vendors</label>}
      <div className="flex flex-wrap gap-2">
        {vendor.canApprove && <Button disabled={busy || !reviewReason.trim() || !duplicatesReviewed} onClick={() => { void act(() => approveVendor(legalEntityId, vendor.id, vendor.version, reviewReason.trim(), duplicatesReviewed)); }}>Approve vendor</Button>}
        {vendor.canReturnForInformation && <Button variant="secondary" disabled={busy || !reviewReason.trim()} onClick={() => { void act(() => returnVendorForInformation(legalEntityId, vendor.id, vendor.version, reviewReason.trim())); }}>Send back for changes</Button>}
        {vendor.canReject && <Button variant="danger" disabled={busy || !reviewReason.trim()} onClick={() => { void act(() => rejectVendor(legalEntityId, vendor.id, vendor.version, reviewReason.trim())); }}>Reject vendor</Button>}
      </div>
    </div></Panel>}
    {vendor.canSuspend && <Panel title="Place vendor on hold" className="mb-5"><div className="space-y-3 p-5">
      <p className="text-sm text-muted-foreground">Stop new orders while the vendor issue is reviewed. Existing orders stay in the system.</p>
      {ordersError && <p role="alert" className="text-sm text-red-700">{ordersError}</p>}
      {!openOrders && !ordersError && <p role="status" className="text-sm text-muted-foreground">Checking existing orders…</p>}
      {openOrders && <div className="text-sm"><p>{openOrders.count === 0 ? "No open orders." : `${openOrders.count} open order${openOrders.count === 1 ? "" : "s"} to review.`}</p>
        {openOrders.items.length > 0 && <ul className="mt-2 list-disc pl-5">{openOrders.items.map((order) => <li key={order.id}>{order.number} · {order.status} · {order.currencyCode}</li>)}</ul>}
        {openOrders.count > openOrders.items.length && <p className="mt-2 text-muted-foreground">More open orders exist. Check the full order list before confirming.</p>}
      </div>}
      <Field label="Why is this vendor on hold?"><Textarea rows={3} maxLength={1000} value={suspendReason} onChange={(event) => setSuspendReason(event.target.value)} /></Field>
      <label className="flex items-center gap-3 text-sm"><Switch checked={ordersReviewed} disabled={!openOrders} onChange={(event) => setOrdersReviewed(event.target.checked)} />I checked existing orders and will follow up on any open commitments</label>
      <Button variant="danger" disabled={busy || !openOrders || !suspendReason.trim() || !ordersReviewed}
        onClick={() => { void act(() => suspendVendor(legalEntityId, vendor.id, vendor.version, suspendReason, ordersReviewed)); }}>
        Place on hold
      </Button>
    </div></Panel>}
    {vendor.canReactivate && <Panel title="Return vendor to active" className="mb-5"><div className="space-y-3 p-5">
      <p className="text-sm text-muted-foreground">Confirm the issue is resolved and check current vendor details, qualifications and payment verification before allowing new orders.</p>
      <Field label="How was the issue resolved?"><Textarea rows={3} maxLength={1000} value={reactivateReason} onChange={(event) => setReactivateReason(event.target.value)} /></Field>
      <label className="flex items-center gap-3 text-sm"><Switch checked={diligenceReviewed} onChange={(event) => setDiligenceReviewed(event.target.checked)} />I checked the current vendor details and qualifications</label>
      <Button disabled={busy || !reactivateReason.trim() || !diligenceReviewed}
        onClick={() => { void act(() => reactivateVendor(legalEntityId, vendor.id, vendor.version, reactivateReason, diligenceReviewed)); }}>
        Return to active
      </Button>
    </div></Panel>}
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Addresses"><div className="p-5"><ul className="space-y-2 text-sm">{vendor.sites?.map((row) => <li key={row.id} className="flex flex-wrap items-center gap-2"><span>{row.kind}: {row.addressLine1}{row.city ? `, ${row.city}` : ""}{row.isPrimary ? " · Main" : ""}</span>{editable && <><Button variant="secondary" disabled={busy} onClick={() => { setEditingSiteId(row.id); setSite({ ...row }); }}>Edit</Button><Button variant="secondary" disabled={busy} onClick={() => { setRemovingDetail({ kind: "site", id: row.id, label: row.addressLine1 }); setRemovalReason(""); }}>Remove</Button></>}</li>)}</ul>{!vendor.sites?.length && <p className="text-sm text-muted-foreground">{vendor.sites === undefined ? "Address details are unavailable for this account." : "No addresses yet."}</p>}
        {editable && <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); const value = { ...site, isPrimary: editingSiteId ? site.isPrimary : !vendor.sites?.some((row) => row.kind === site.kind && row.isPrimary) || site.isPrimary }; void act(() => editingSiteId ? updateVendorSite(legalEntityId, vendor.id, editingSiteId, vendor.version, value) : addVendorSite(legalEntityId, vendor.id, vendor.version, value)).then((saved) => { if (saved) { setSite({ kind: "Billing", addressLine1: "", city: "", countryCode: "ZM", isPrimary: false, isServiceSite: false }); setEditingSiteId(null); } }); }}>
          {editingSiteId && <p className="font-medium">Edit address</p>}<Field label="Address type"><Select value={site.kind} onChange={(event) => setSite({ ...site, kind: event.target.value })}><option>Billing</option><option>Shipping</option><option>Physical</option></Select></Field><Field label="Address line 1"><Input required value={site.addressLine1} onChange={(event) => setSite({ ...site, addressLine1: event.target.value })} /></Field><Field label="City"><Input value={site.city || ""} onChange={(event) => setSite({ ...site, city: event.target.value })} /></Field><Field label="Country code"><Input required maxLength={2} value={site.countryCode} onChange={(event) => setSite({ ...site, countryCode: event.target.value.toUpperCase() })} /></Field><div className="flex gap-2"><Button type="submit" disabled={busy}>{editingSiteId ? "Save address" : "Add address"}</Button>{editingSiteId && <Button variant="secondary" type="button" onClick={() => { setEditingSiteId(null); setSite({ kind: "Billing", addressLine1: "", city: "", countryCode: "ZM", isPrimary: false, isServiceSite: false }); }}>Cancel</Button>}</div>
        </form>}</div></Panel>
      <Panel title="Other details"><dl className="grid grid-cols-2 gap-4 p-5 text-sm"><dt>Company ID</dt><dd>{vendor.registrationNumber || "—"}</dd><dt>Category</dt><dd>{vendor.categoryCode || "—"}</dd><dt>Country</dt><dd>{vendor.countryCode}</dd><dt>Currency</dt><dd>{vendor.defaultCurrencyCode || "—"}</dd><dt>Payment terms</dt><dd>{vendor.paymentTermRef || "—"}</dd><dt>Can receive new orders?</dt><dd>{vendor.isOrderable ? "Yes" : vendor.status === "Suspended" ? "No — on hold" : "No — approval required"}</dd></dl></Panel>
      <Panel title="Contact persons"><div className="p-5"><ul className="space-y-2 text-sm">{vendor.contacts?.map((row) => <li key={row.id} className="flex flex-wrap items-center gap-2"><span>{row.name}{row.email ? ` · ${row.email}` : ""}{row.isPrimary ? " · Main" : ""}</span>{editable && <><Button variant="secondary" disabled={busy} onClick={() => { setEditingContactId(row.id); setContact({ ...row }); }}>Edit</Button><Button variant="secondary" disabled={busy} onClick={() => { setRemovingDetail({ kind: "contact", id: row.id, label: row.name }); setRemovalReason(""); }}>Remove</Button></>}</li>)}</ul>{!vendor.contacts?.length && <p className="text-sm text-muted-foreground">{vendor.contacts === undefined ? "Contact details are unavailable for this account." : "No contacts yet."}</p>}
        {editable && <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); const value = { ...contact, isPrimary: editingContactId ? contact.isPrimary : !vendor.contacts?.length || contact.isPrimary }; void act(() => editingContactId ? updateVendorContact(legalEntityId, vendor.id, editingContactId, vendor.version, value) : addVendorContact(legalEntityId, vendor.id, vendor.version, value)).then((saved) => { if (saved) { setContact({ name: "", email: "", phone: "", isPrimary: false }); setEditingContactId(null); } }); }}>
          {editingContactId && <p className="font-medium">Edit contact</p>}<Field label="Contact name"><Input required value={contact.name} onChange={(event) => setContact({ ...contact, name: event.target.value })} /></Field><Field label="Email"><Input type="email" value={contact.email || ""} onChange={(event) => setContact({ ...contact, email: event.target.value })} /></Field><Field label="Phone"><Input value={contact.phone || ""} onChange={(event) => setContact({ ...contact, phone: event.target.value })} /></Field><div className="flex gap-2"><Button type="submit" disabled={busy}>{editingContactId ? "Save contact" : "Add contact"}</Button>{editingContactId && <Button variant="secondary" type="button" onClick={() => { setEditingContactId(null); setContact({ name: "", email: "", phone: "", isPrimary: false }); }}>Cancel</Button>}</div>
        </form>}</div></Panel>
      <DetailSection title="Bank Account Details"><p className="text-sm text-muted-foreground">Bank details and verification are managed by Finance. They are not connected to this view.</p></DetailSection>
      <Panel title="Qualifications"><div className="p-5"><ul className="space-y-2 text-sm">{vendor.qualifications?.map((row) => <li key={row.id} className="flex flex-wrap items-center gap-2">
        <span>{row.qualificationType}{row.issuer ? ` · ${row.issuer}` : ""}{row.expiresOn ? ` · Expires ${row.expiresOn}` : ""}</span>
        <span className="text-muted-foreground">{row.reviewStatus}</span>
        {editable && row.reviewStatus === "Pending" && <>
          <Button variant="secondary" disabled={busy} onClick={() => { setEditingQualificationId(row.id); setQualification({ qualificationType: row.qualificationType, issuer: row.issuer || "", referenceNumber: row.referenceNumber || "", issuedOn: row.issuedOn || "", expiresOn: row.expiresOn || "" }); }}>Edit</Button>
          <Button variant="secondary" disabled={busy} onClick={() => { setRemovingDetail({ kind: "qualification", id: row.id, label: row.qualificationType }); setRemovalReason(""); }}>Remove</Button>
        </>}
        {vendor.canReturnForInformation && row.reviewStatus === "Pending" && <span className="inline-flex gap-2"><Button variant="secondary" disabled={busy || !reviewReason.trim()} onClick={() => { void act(() => reviewVendorQualification(legalEntityId, vendor.id, row.id, vendor.version, "Verified", reviewReason.trim())); }}>Verify</Button><Button variant="danger" disabled={busy || !reviewReason.trim()} onClick={() => { void act(() => reviewVendorQualification(legalEntityId, vendor.id, row.id, vendor.version, "Rejected", reviewReason.trim())); }}>Mark invalid</Button></span>}
      </li>)}</ul>{!vendor.qualifications?.length && <p className="text-sm text-muted-foreground">{vendor.qualifications === undefined ? "Qualification details are unavailable for this account." : "No qualifications added yet."}</p>}
        {editable && <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); if (qualificationDatesInvalid) return; const value = { ...qualification, issuedOn: qualification.issuedOn || null, expiresOn: qualification.expiresOn || null } as VendorQualificationDraft; void act(() => editingQualificationId ? updateVendorQualification(legalEntityId, vendor.id, editingQualificationId, vendor.version, value) : addVendorQualification(legalEntityId, vendor.id, vendor.version, value)).then((saved) => { if (saved) { setQualification({ qualificationType: "", issuer: "", referenceNumber: "", issuedOn: "", expiresOn: "" }); setEditingQualificationId(null); } }); }}>
          {editingQualificationId && <p className="font-medium">Edit qualification</p>}
          <Field label="Qualification type"><Input required maxLength={80} value={qualification.qualificationType} onChange={(event) => setQualification({ ...qualification, qualificationType: event.target.value })} /></Field>
          <Field label="Issued by"><Input value={qualification.issuer} onChange={(event) => setQualification({ ...qualification, issuer: event.target.value })} /></Field>
          <Field label="Reference number"><Input value={qualification.referenceNumber} onChange={(event) => setQualification({ ...qualification, referenceNumber: event.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Issue date"><Input type="date" value={qualification.issuedOn} onChange={(event) => setQualification({ ...qualification, issuedOn: event.target.value })} /></Field><Field label="Expiry date"><Input type="date" value={qualification.expiresOn} onChange={(event) => setQualification({ ...qualification, expiresOn: event.target.value })} /></Field></div>
          {qualificationDatesInvalid && <p role="alert" className="text-sm text-red-700">Expiry date must be on or after the issue date.</p>}
          <div className="flex gap-2"><Button type="submit" disabled={busy || qualificationDatesInvalid}>{editingQualificationId ? "Save qualification" : "Add qualification"}</Button>{editingQualificationId && <Button variant="secondary" type="button" onClick={() => { setEditingQualificationId(null); setQualification({ qualificationType: "", issuer: "", referenceNumber: "", issuedOn: "", expiresOn: "" }); }}>Cancel</Button>}</div>
        </form>}</div></Panel>
      <Panel title="Notes"><p className="p-5 text-sm">{vendor.remarks || "No remarks."}</p></Panel>
    </div>
    {editable && removingDetail && <Panel title={`Remove ${removingDetail.kind === "contact" ? "contact" : removingDetail.kind === "site" ? "address" : "qualification"}`} className="mt-5"><div className="space-y-3 p-5"><p className="text-sm">{removingDetail.label} will be removed from this draft. The change stays in the vendor history.</p><Field label="Why remove this detail?"><Textarea rows={2} maxLength={500} value={removalReason} onChange={(event) => setRemovalReason(event.target.value)} /></Field><div className="flex gap-2"><Button variant="danger" disabled={busy || !removalReason.trim()} onClick={() => { const target = removingDetail; void act(() => target.kind === "contact" ? removeVendorContact(legalEntityId, vendor.id, target.id, vendor.version, removalReason.trim()) : target.kind === "site" ? removeVendorSite(legalEntityId, vendor.id, target.id, vendor.version, removalReason.trim()) : removeVendorQualification(legalEntityId, vendor.id, target.id, vendor.version, removalReason.trim())).then((saved) => { if (saved) { setRemovingDetail(null); setRemovalReason(""); if (target.kind === "qualification" && editingQualificationId === target.id) { setEditingQualificationId(null); setQualification({ qualificationType: "", issuer: "", referenceNumber: "", issuedOn: "", expiresOn: "" }); } } }); }}>Remove detail</Button><Button variant="secondary" disabled={busy} onClick={() => setRemovingDetail(null)}>Cancel</Button></div></div></Panel>}
    {editable && <Panel title={vendor.status === "Draft" ? "Submit for review" : "Resubmit for review"} className="mt-5"><div className="space-y-3 p-5">
      <p className="text-sm text-muted-foreground">Add a vendor category and contact person before submitting. Submission starts review; it does not allow purchase orders yet.</p>
      <Field label="Why do you need this vendor?"><Textarea rows={2} maxLength={1000} value={businessReason} onChange={(event) => setBusinessReason(event.target.value)} /></Field>
      <Button disabled={busy || !businessReason.trim() || !vendor.categoryCode || !vendor.contacts?.length}
        onClick={() => { void act(() => submitVendorForReview(legalEntityId, vendor.id, vendor.version, businessReason.trim())); }}>{vendor.status === "Draft" ? "Submit for review" : "Resubmit for review"}</Button>
    </div></Panel>}
    {editable && <div className="mt-6"><Button variant="danger" disabled={busy} onClick={() => { const reason = window.prompt("Why are you withdrawing this vendor draft?"); if (reason?.trim()) void act(async () => { await withdrawVendorDraft(legalEntityId, vendor.id, vendor.version, reason.trim()); if (mounted.current) navigate("/vendors"); }); }}>Withdraw draft</Button></div>}
    <div className="grid gap-4 xl:grid-cols-2"><DetailSection title="Record info"><dl className="grid gap-4 sm:grid-cols-2"><DetailValue label="Record ID" value={vendor.id} /><DetailValue label="Created" value={vendor.createdAt ? new Date(vendor.createdAt).toLocaleString() : "Not provided"} /><DetailValue label="Status" value={vendor.status} /><DetailValue label="Revision" value={vendor.version} /></dl></DetailSection>
    <DetailSection title="Recent Activity"><p className="text-sm text-muted-foreground">Vendor activity history is not connected to this view. Current details above come from the saved vendor record.</p></DetailSection></div>
    </>}
  </VendorDetailFrame>;
}
