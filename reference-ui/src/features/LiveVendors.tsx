import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Panel, Select, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import {
  addVendorContact, addVendorSite, createVendorDraft, getVendorDraft,
  listVendorDrafts, updateVendorDraft, withdrawVendorDraft,
  submitVendorForReview,
  type VendorContactDraft, type VendorDetail, type VendorDraft, type VendorPage,
  type VendorSiteDraft,
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
  const [page, setPage] = useState(1);
  const [data, setData] = useState<VendorPage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    listVendorDrafts(legalEntityId, { search, page, signal: controller.signal })
      .then(setData).catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [legalEntityId, search, page]);
  return <div className="p-5 sm:p-8">
    <PageHeader title="Vendors" subtitle="Create and manage vendor drafts for this company." actions={<Link to="/vendors/new"><Button><Plus size={16} className="mr-2 inline" />Add vendor</Button></Link>} />
    <Panel><div className="p-5">
      <form className="mb-4 flex max-w-md gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(query.trim()); }}>
        <Input aria-label="Search vendors" placeholder="Search vendor name or company ID" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      {loading ? <p role="status">Loading vendors…</p> : data?.items.length ? <div className="overflow-x-auto"><RecordTable>
        <thead><tr><th>Vendor</th><th>Company ID</th><th>Country</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{data.items.map((vendor) => <tr key={vendor.id}>
          <td><Link className="font-medium text-primary hover:underline" to={`/vendors/${vendor.id}`}>{vendor.displayName}</Link><span className="block text-xs text-muted-foreground">{vendor.legalName}</span></td>
          <td>{vendor.number}</td><td>{vendor.countryCode}</td><td><Badge>{vendor.status}</Badge></td>
          <td><Link className="text-sm text-primary hover:underline" to={`/vendors/${vendor.id}`}>Open</Link></td>
        </tr>)}</tbody>
      </RecordTable></div> : <EmptyState title="Every purchase starts with a vendor" description="Create and manage your vendors and their contact persons, all in one place." action={<Link to="/vendors/new"><Button>Add vendor</Button></Link>} />}
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
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [site, setSite] = useState({ kind: "Billing", addressLine1: "", city: "", countryCode: "ZM" });
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
  async function act(operation: () => Promise<unknown>): Promise<boolean> {
    setBusy(true); setError("");
    try { await operation(); reload(); return true; }
    catch (cause) { setError(message(cause)); return false; }
    finally { setBusy(false); }
  }
  if (loading) return <div className="p-5 sm:p-8" role="status">Loading vendor…</div>;
  if (!vendor) return <div className="p-5 sm:p-8" role="alert">{error || "Vendor not found."}</div>;
  const editable = vendor.status === "Draft" || vendor.status === "More Information Required";
  return <div className="p-5 sm:p-8">
    <PageHeader title={vendor.displayName} subtitle={[vendor.number, vendor.legalName].filter(Boolean).join(" · ")} actions={<><Badge>{vendor.status}</Badge>{editable && <Link to={`/vendors/${vendor.id}/edit`}><Button variant="secondary">Edit vendor</Button></Link>}</>} />
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    {vendor.status === "Submitted" && <p className="mb-5 rounded-lg border border-border bg-surface-muted p-4 text-sm">Submitted for review{vendor.statusDecidedAt ? ` on ${new Date(vendor.statusDecidedAt).toLocaleDateString()}` : ""}. This vendor cannot receive new purchase orders yet.{vendor.statusReason ? ` Reason: ${vendor.statusReason}` : ""}</p>}
    {vendor.status === "More Information Required" && <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">More information is needed before this vendor can be approved.{vendor.statusReason ? ` Reviewer note: ${vendor.statusReason}` : ""} Update the details below, then send the vendor for review again.</p>}
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Vendor overview"><dl className="grid grid-cols-2 gap-4 p-5 text-sm"><dt>Company ID</dt><dd>{vendor.registrationNumber || "—"}</dd><dt>Category</dt><dd>{vendor.categoryCode || "—"}</dd><dt>Country</dt><dd>{vendor.countryCode}</dd><dt>Currency</dt><dd>{vendor.defaultCurrencyCode || "—"}</dd><dt>Payment terms</dt><dd>{vendor.paymentTermRef || "—"}</dd><dt>Orderable</dt><dd>{vendor.isOrderable ? "Yes" : "No — approval required"}</dd></dl></Panel>
      <Panel title="Contact persons"><div className="p-5"><ul className="space-y-2 text-sm">{vendor.contacts?.map((row) => <li key={row.id}>{row.name}{row.email ? ` · ${row.email}` : ""}</li>)}</ul>{!vendor.contacts?.length && <p className="text-sm text-muted-foreground">No contacts yet.</p>}
        {editable && <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); void act(() => addVendorContact(legalEntityId, vendor.id, vendor.version, { ...contact, isPrimary: !vendor.contacts?.length } as VendorContactDraft)).then((saved) => { if (saved) setContact({ name: "", email: "", phone: "" }); }); }}>
          <Field label="Contact name"><Input required value={contact.name} onChange={(event) => setContact({ ...contact, name: event.target.value })} /></Field><Field label="Email"><Input type="email" value={contact.email} onChange={(event) => setContact({ ...contact, email: event.target.value })} /></Field><Field label="Phone"><Input value={contact.phone} onChange={(event) => setContact({ ...contact, phone: event.target.value })} /></Field><Button type="submit" disabled={busy}>Add contact</Button>
        </form>}</div></Panel>
      <Panel title="Addresses"><div className="p-5"><ul className="space-y-2 text-sm">{vendor.sites?.map((row) => <li key={row.id}>{row.kind}: {row.addressLine1}{row.city ? `, ${row.city}` : ""}</li>)}</ul>{!vendor.sites?.length && <p className="text-sm text-muted-foreground">No addresses yet.</p>}
        {editable && <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); void act(() => addVendorSite(legalEntityId, vendor.id, vendor.version, { ...site, isPrimary: !vendor.sites?.length, isServiceSite: false } as VendorSiteDraft)).then((saved) => { if (saved) setSite((current) => ({ ...current, addressLine1: "", city: "" })); }); }}>
          <Field label="Address type"><Select value={site.kind} onChange={(event) => setSite({ ...site, kind: event.target.value })}><option>Billing</option><option>Shipping</option><option>Physical</option></Select></Field><Field label="Address line 1"><Input required value={site.addressLine1} onChange={(event) => setSite({ ...site, addressLine1: event.target.value })} /></Field><Field label="City"><Input value={site.city} onChange={(event) => setSite({ ...site, city: event.target.value })} /></Field><Field label="Country code"><Input required maxLength={2} value={site.countryCode} onChange={(event) => setSite({ ...site, countryCode: event.target.value.toUpperCase() })} /></Field><Button type="submit" disabled={busy}>Add address</Button>
        </form>}</div></Panel>
      <Panel title="Notes"><p className="p-5 text-sm">{vendor.remarks || "No remarks."}</p></Panel>
    </div>
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
