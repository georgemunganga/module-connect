import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Panel, Select, Switch, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
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
  const { legalEntityId } = useCompany();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<VendorPage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    listVendorDrafts(legalEntityId, { search, status, page, signal: controller.signal })
      .then(setData).catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [legalEntityId, search, status, page]);
  return <div className="p-5 sm:p-8">
    <PageHeader title="Vendors" subtitle="Add vendors, review their details, and manage who can receive new orders." actions={<Link to="/vendors/new"><Button><Plus size={16} className="mr-2 inline" />Add vendor</Button></Link>} />
    <Panel><div className="p-5">
      <form className="mb-4 flex max-w-xl gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(query.trim()); }}>
        <Input aria-label="Search vendors" placeholder="Search vendor name or company ID" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      <Select aria-label="Filter vendors by status" className="mb-4 max-w-xs" value={status}
        onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
        <option value="">All statuses</option><option value="Submitted">Submitted for review</option>
        <option value="More Information Required">More information required</option>
        <option value="Draft">Draft</option><option value="Approved">Approved</option>
        <option value="Active">Active</option><option value="Suspended">Suspended</option>
        <option value="Withdrawn">Withdrawn</option>
      </Select>
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      {loading ? <p role="status">Loading vendors…</p> : data?.items.length ? <div className="overflow-x-auto"><RecordTable>
        <thead><tr><th>Vendor</th><th>Company ID</th><th>Country</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{data.items.map((vendor) => <tr key={vendor.id}>
          <td><Link className="font-medium text-primary hover:underline" to={`/vendors/${vendor.id}`}>{vendor.displayName}</Link><span className="block text-xs text-muted-foreground">{vendor.legalName}</span></td>
          <td>{vendor.number}</td><td>{vendor.countryCode}</td><td><Badge>{vendor.status}</Badge></td>
          <td><Link className="text-sm text-primary hover:underline" to={`/vendors/${vendor.id}`}>Open</Link></td>
        </tr>)}</tbody>
      </RecordTable></div> : search || status
        ? <EmptyState title="No vendors match this view" description="Try a different search or status." />
        : <EmptyState title="Every purchase starts with a vendor" description="Create and manage your vendors and their contact persons, all in one place." action={<Link to="/vendors/new"><Button>Add vendor</Button></Link>} />}
      {data && data.total > data.pageSize && <div className="mt-4 flex items-center gap-3 text-sm"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page}</span><Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</Button></div>}
    </div></Panel>
  </div>;
}

export function LiveVendorEditor() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const { legalEntityId, defaultCurrencyCode } = useCompany();
  const [draft, setDraft] = useState<VendorDraft>(() => ({ ...empty, currencyCode: defaultCurrencyCode }));
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!id) { setDraft({ ...empty, currencyCode: defaultCurrencyCode }); return; }
    const controller = new AbortController();
    setLoading(true); setError("");
    getVendorDraft(legalEntityId, id, controller.signal).then((detail) => {
      setVersion(detail.version);
      setDraft({ ...empty, legalName: detail.legalName, displayName: detail.displayName,
        countryCode: detail.countryCode, registrationNumber: detail.registrationNumber,
        categoryCode: detail.categoryCode,
        currencyCode: detail.defaultCurrencyCode || defaultCurrencyCode,
        paymentTermRef: detail.paymentTermRef, taxCategoryRef: detail.taxCategoryRef,
        languageCode: detail.languageCode, remarks: detail.remarks,
        isLocal: detail.isLocal ?? true, portalAccessRequested: detail.portalAccessState === "Requested" });
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, legalEntityId, defaultCurrencyCode]);
  const field = (key: keyof VendorDraft, value: string | boolean) => setDraft((current) => ({ ...current, [key]: value }));
  async function save(event: FormEvent) {
    event.preventDefault(); setError(""); setSaving(true);
    try {
      const result = editing && id && version !== null
        ? await updateVendorDraft(legalEntityId, id, version, draft)
        : await createVendorDraft(legalEntityId, draft);
      navigate(`/vendors/${result.id}`, { state: { saved: true } });
    } catch (cause) { setError(message(cause)); }
    finally { setSaving(false); }
  }
  return <div className="p-5 sm:p-8">
    <PageHeader title={editing ? "Edit vendor" : "New vendor"} subtitle="Save a vendor draft. Approval and bank verification happen separately." />
    {loading ? <p role="status">Loading vendor…</p> : <form onSubmit={save} className="max-w-4xl space-y-5">
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}{error.toLowerCase().includes("changed") && <span className="block">Your edits are still here. Open this vendor in another tab to compare before saving again.</span>}</p>}
      <Panel title="Vendor details"><div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Company name"><Input required maxLength={300} value={draft.legalName} onChange={(event) => field("legalName", event.target.value)} /></Field>
        <Field label="Display name"><Input required maxLength={300} value={draft.displayName} onChange={(event) => field("displayName", event.target.value)} /></Field>
        <Field label="Company ID"><Input maxLength={120} value={draft.registrationNumber ?? ""} onChange={(event) => field("registrationNumber", event.target.value)} /></Field>
        <Field label="Vendor category"><Input maxLength={100} value={draft.categoryCode ?? ""} onChange={(event) => field("categoryCode", event.target.value)} /></Field>
        <Field label="Country code" hint="Use a two-letter code, such as ZM."><Input required maxLength={2} value={draft.countryCode} onChange={(event) => field("countryCode", event.target.value.toUpperCase())} /></Field>
      </div></Panel>
      <Panel title="Other details"><div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Currency"><Input maxLength={3} value={draft.currencyCode ?? ""} onChange={(event) => field("currencyCode", event.target.value.toUpperCase())} /></Field>
        <Field label="Payment terms"><Input value={draft.paymentTermRef ?? ""} onChange={(event) => field("paymentTermRef", event.target.value)} /></Field>
        <Field label="Tax category"><Input value={draft.taxCategoryRef ?? ""} onChange={(event) => field("taxCategoryRef", event.target.value)} /></Field>
        <Field label="Language"><Input value={draft.languageCode ?? ""} onChange={(event) => field("languageCode", event.target.value)} /></Field>
        <Field label="Location"><Select value={draft.isLocal ? "local" : "international"} onChange={(event) => field("isLocal", event.target.value === "local")}><option value="local">Local</option><option value="international">International</option></Select></Field>
        <Field label="Portal access"><Select value={draft.portalAccessRequested ? "requested" : "none"} onChange={(event) => field("portalAccessRequested", event.target.value === "requested")}><option value="none">Not requested</option><option value="requested">Request access</option></Select></Field>
        <Field label="Remarks" className="sm:col-span-2"><Textarea maxLength={4000} rows={3} value={draft.remarks ?? ""} onChange={(event) => field("remarks", event.target.value)} /></Field>
      </div></Panel>
      <div className="flex gap-3"><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save draft"}</Button><Link to={editing && id ? `/vendors/${id}` : "/vendors"}><Button variant="secondary">Cancel</Button></Link></div>
    </form>}
  </div>;
}

export function LiveVendorDetail() {
  const { id } = useParams();
  const { legalEntityId } = useCompany();
  const navigate = useNavigate();
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
  const reload = () => { if (!id) return; setLoading(true); getVendorDraft(legalEntityId, id).then(setVendor).catch((cause: unknown) => setError(message(cause))).finally(() => setLoading(false)); };
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true); setError("");
    getVendorDraft(legalEntityId, id, controller.signal).then(setVendor)
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, legalEntityId]);
  useEffect(() => {
    if (!vendor?.canSuspend) return;
    const controller = new AbortController();
    setOpenOrders(null); setOrdersError(""); setOrdersReviewed(false);
    getVendorOpenOrders(legalEntityId, vendor.id, controller.signal)
      .then(setOpenOrders)
      .catch((cause: unknown) => { if (!controller.signal.aborted) setOrdersError(message(cause)); });
    return () => controller.abort();
  }, [vendor?.canSuspend, vendor?.id, vendor?.version, legalEntityId]);
  async function act(operation: () => Promise<unknown>): Promise<boolean> {
    setBusy(true); setError("");
    try { await operation(); reload(); return true; }
    catch (cause) { setError(message(cause)); return false; }
    finally { setBusy(false); }
  }
  if (loading) return <div className="p-5 sm:p-8" role="status">Loading vendor…</div>;
  if (!vendor) return <div className="p-5 sm:p-8" role="alert">{error || "Vendor not found."}</div>;
  const editable = vendor.status === "Draft" || vendor.status === "More Information Required";
  const qualificationDatesInvalid = Boolean(qualification.issuedOn && qualification.expiresOn
    && qualification.expiresOn < qualification.issuedOn);
  return <div className="p-5 sm:p-8">
    <PageHeader title={vendor.displayName} subtitle={[vendor.number, vendor.legalName].filter(Boolean).join(" · ")} actions={<><Badge>{vendor.status}</Badge>{editable && <Link to={`/vendors/${vendor.id}/edit`}><Button variant="secondary">Edit vendor</Button></Link>}</>} />
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
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
      <Panel title="Vendor overview"><dl className="grid grid-cols-2 gap-4 p-5 text-sm"><dt>Company ID</dt><dd>{vendor.registrationNumber || "—"}</dd><dt>Category</dt><dd>{vendor.categoryCode || "—"}</dd><dt>Country</dt><dd>{vendor.countryCode}</dd><dt>Currency</dt><dd>{vendor.defaultCurrencyCode || "—"}</dd><dt>Payment terms</dt><dd>{vendor.paymentTermRef || "—"}</dd><dt>Can receive new orders?</dt><dd>{vendor.isOrderable ? "Yes" : vendor.status === "Suspended" ? "No — on hold" : "No — approval required"}</dd></dl></Panel>
      <Panel title="Contact persons"><div className="p-5"><ul className="space-y-2 text-sm">{vendor.contacts?.map((row) => <li key={row.id} className="flex flex-wrap items-center gap-2"><span>{row.name}{row.email ? ` · ${row.email}` : ""}{row.isPrimary ? " · Main" : ""}</span>{editable && <><Button variant="secondary" disabled={busy} onClick={() => { setEditingContactId(row.id); setContact({ ...row }); }}>Edit</Button><Button variant="secondary" disabled={busy} onClick={() => { setRemovingDetail({ kind: "contact", id: row.id, label: row.name }); setRemovalReason(""); }}>Remove</Button></>}</li>)}</ul>{!vendor.contacts?.length && <p className="text-sm text-muted-foreground">No contacts yet.</p>}
        {editable && <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); const value = { ...contact, isPrimary: editingContactId ? contact.isPrimary : !vendor.contacts?.length || contact.isPrimary }; void act(() => editingContactId ? updateVendorContact(legalEntityId, vendor.id, editingContactId, vendor.version, value) : addVendorContact(legalEntityId, vendor.id, vendor.version, value)).then((saved) => { if (saved) { setContact({ name: "", email: "", phone: "", isPrimary: false }); setEditingContactId(null); } }); }}>
          {editingContactId && <p className="font-medium">Edit contact</p>}<Field label="Contact name"><Input required value={contact.name} onChange={(event) => setContact({ ...contact, name: event.target.value })} /></Field><Field label="Email"><Input type="email" value={contact.email || ""} onChange={(event) => setContact({ ...contact, email: event.target.value })} /></Field><Field label="Phone"><Input value={contact.phone || ""} onChange={(event) => setContact({ ...contact, phone: event.target.value })} /></Field><div className="flex gap-2"><Button type="submit" disabled={busy}>{editingContactId ? "Save contact" : "Add contact"}</Button>{editingContactId && <Button variant="secondary" type="button" onClick={() => { setEditingContactId(null); setContact({ name: "", email: "", phone: "", isPrimary: false }); }}>Cancel</Button>}</div>
        </form>}</div></Panel>
      <Panel title="Addresses"><div className="p-5"><ul className="space-y-2 text-sm">{vendor.sites?.map((row) => <li key={row.id} className="flex flex-wrap items-center gap-2"><span>{row.kind}: {row.addressLine1}{row.city ? `, ${row.city}` : ""}{row.isPrimary ? " · Main" : ""}</span>{editable && <><Button variant="secondary" disabled={busy} onClick={() => { setEditingSiteId(row.id); setSite({ ...row }); }}>Edit</Button><Button variant="secondary" disabled={busy} onClick={() => { setRemovingDetail({ kind: "site", id: row.id, label: row.addressLine1 }); setRemovalReason(""); }}>Remove</Button></>}</li>)}</ul>{!vendor.sites?.length && <p className="text-sm text-muted-foreground">No addresses yet.</p>}
        {editable && <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); const value = { ...site, isPrimary: editingSiteId ? site.isPrimary : !vendor.sites?.some((row) => row.kind === site.kind && row.isPrimary) || site.isPrimary }; void act(() => editingSiteId ? updateVendorSite(legalEntityId, vendor.id, editingSiteId, vendor.version, value) : addVendorSite(legalEntityId, vendor.id, vendor.version, value)).then((saved) => { if (saved) { setSite({ kind: "Billing", addressLine1: "", city: "", countryCode: "ZM", isPrimary: false, isServiceSite: false }); setEditingSiteId(null); } }); }}>
          {editingSiteId && <p className="font-medium">Edit address</p>}<Field label="Address type"><Select value={site.kind} onChange={(event) => setSite({ ...site, kind: event.target.value })}><option>Billing</option><option>Shipping</option><option>Physical</option></Select></Field><Field label="Address line 1"><Input required value={site.addressLine1} onChange={(event) => setSite({ ...site, addressLine1: event.target.value })} /></Field><Field label="City"><Input value={site.city || ""} onChange={(event) => setSite({ ...site, city: event.target.value })} /></Field><Field label="Country code"><Input required maxLength={2} value={site.countryCode} onChange={(event) => setSite({ ...site, countryCode: event.target.value.toUpperCase() })} /></Field><div className="flex gap-2"><Button type="submit" disabled={busy}>{editingSiteId ? "Save address" : "Add address"}</Button>{editingSiteId && <Button variant="secondary" type="button" onClick={() => { setEditingSiteId(null); setSite({ kind: "Billing", addressLine1: "", city: "", countryCode: "ZM", isPrimary: false, isServiceSite: false }); }}>Cancel</Button>}</div>
        </form>}</div></Panel>
      <Panel title="Qualifications"><div className="p-5"><ul className="space-y-2 text-sm">{vendor.qualifications?.map((row) => <li key={row.id} className="flex flex-wrap items-center gap-2">
        <span>{row.qualificationType}{row.issuer ? ` · ${row.issuer}` : ""}{row.expiresOn ? ` · Expires ${row.expiresOn}` : ""}</span>
        <span className="text-muted-foreground">{row.reviewStatus}</span>
        {editable && row.reviewStatus === "Pending" && <>
          <Button variant="secondary" disabled={busy} onClick={() => { setEditingQualificationId(row.id); setQualification({ qualificationType: row.qualificationType, issuer: row.issuer || "", referenceNumber: row.referenceNumber || "", issuedOn: row.issuedOn || "", expiresOn: row.expiresOn || "" }); }}>Edit</Button>
          <Button variant="secondary" disabled={busy} onClick={() => { setRemovingDetail({ kind: "qualification", id: row.id, label: row.qualificationType }); setRemovalReason(""); }}>Remove</Button>
        </>}
        {vendor.canReturnForInformation && row.reviewStatus === "Pending" && <span className="inline-flex gap-2"><Button variant="secondary" disabled={busy || !reviewReason.trim()} onClick={() => { void act(() => reviewVendorQualification(legalEntityId, vendor.id, row.id, vendor.version, "Verified", reviewReason.trim())); }}>Verify</Button><Button variant="danger" disabled={busy || !reviewReason.trim()} onClick={() => { void act(() => reviewVendorQualification(legalEntityId, vendor.id, row.id, vendor.version, "Rejected", reviewReason.trim())); }}>Mark invalid</Button></span>}
      </li>)}</ul>{!vendor.qualifications?.length && <p className="text-sm text-muted-foreground">No qualifications added yet.</p>}
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
    {editable && <div className="mt-6"><Button variant="danger" disabled={busy} onClick={() => { const reason = window.prompt("Why are you withdrawing this vendor draft?"); if (reason?.trim()) void act(async () => { await withdrawVendorDraft(legalEntityId, vendor.id, vendor.version, reason.trim()); navigate("/vendors"); }); }}>Withdraw draft</Button></div>}
    <Link to="/vendors" className="mt-5 inline-block text-sm text-primary hover:underline">Back to vendors</Link>
  </div>;
}
