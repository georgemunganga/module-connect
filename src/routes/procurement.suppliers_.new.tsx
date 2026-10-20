import { FormToggle } from "@/components/ui/form-toggle";
import { FormSelect } from "@/components/ui/form-select";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApp, useEntity } from "@/platform/app-context";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import { RestrictedState } from "@/platform/components/States";
import { sameEntity, supplierRole } from "@/modules/procurement/access";
import { saveProcurement, useProcurement } from "@/modules/procurement/store";
import type { SupplierRecord, VendorOnboardingDetails } from "@/modules/procurement/suppliers";

export const Route = createFileRoute("/procurement/suppliers_/new")({
  validateSearch: (search: Record<string, unknown>) => ({ edit: typeof search.edit === "string" ? search.edit : undefined }),
  head: () => ({ meta: [{ title: "New vendor — Meridian ERP Procurement" }, { name: "description", content: "Add a vendor and all onboarding details." }] }),
  component: NewVendor,
});

const tabs = ["Other Details", "Address", "Contact Persons", "Bank Details", "Custom Fields", "Reporting Tags", "Remarks"] as const;
type Tab = (typeof tabs)[number];
type Address = NonNullable<VendorOnboardingDetails["billingAddress"]>;
type Pair = { name: string; value: string };
type Contact = SupplierRecord["contacts"][number];
type Document = { id: string; name: string; size: number; kind: string };
type Form = { salutation: string; firstName: string; lastName: string; companyName: string; displayName: string; email: string; workPhone: string; mobile: string; language: string; companyId: string; taxRef: string; taxRateRef: string; currency: string; paymentTerms: string; portalAccessRequested: boolean; categories: string; bankName: string; bankLast4: string; remarks: string };

const newAddress = (country: string): Address => ({ line1: "", line2: "", city: "", region: "", postalCode: "", country });
const newForm = (country: string): Form => ({ salutation: "", firstName: "", lastName: "", companyName: "", displayName: "", email: "", workPhone: "", mobile: "", language: "English", companyId: "", taxRef: "", taxRateRef: "", currency: country === "Kenya" ? "KES" : "EUR", paymentTerms: "Net 30", portalAccessRequested: false, categories: "", bankName: "", bankLast4: "", remarks: "" });
const emailValid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const editSnapshot = (form: Form, billing: Address, shipping: Address, sameShipping: boolean, contacts: Contact[], customFields: Pair[], reportingTags: Pair[], documents: Document[]) => JSON.stringify({ form, billing, shipping, sameShipping, contacts, customFields, reportingTags, documents: documents.map(({ name, size, kind }) => ({ name, size, kind })) });

function Field({ id, label, value, onChange, type = "text", required = false, placeholder }: { id: string; label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; placeholder?: string }) {
  return <div><Label htmlFor={id}>{label}{required ? " *" : ""}</Label><Input id={id} className="mt-1" type={type} value={value} placeholder={placeholder} required={required} onChange={(event) => onChange(event.target.value)} /></div>;
}

function AddressFields({ prefix, title, value, onChange }: { prefix: string; title: string; value: Address; onChange: (value: Address) => void }) {
  const set = (key: keyof Address, fieldValue: string) => onChange({ ...value, [key]: fieldValue });
  return <section className="rounded-lg border p-4"><h3 className="font-semibold">{title}</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><Field id={`${prefix}-line1`} label="Address line 1" value={value.line1} onChange={(x) => set("line1", x)} /></div><div className="sm:col-span-2"><Field id={`${prefix}-line2`} label="Address line 2" value={value.line2 ?? ""} onChange={(x) => set("line2", x)} /></div><Field id={`${prefix}-city`} label="City" value={value.city} onChange={(x) => set("city", x)} /><Field id={`${prefix}-region`} label="State / Province" value={value.region ?? ""} onChange={(x) => set("region", x)} /><Field id={`${prefix}-postal`} label="Postal code" value={value.postalCode ?? ""} onChange={(x) => set("postalCode", x)} /><Field id={`${prefix}-country`} label="Country" value={value.country} onChange={(x) => set("country", x)} /></div></section>;
}

function PairFields({ title, items, onChange }: { title: "Custom Fields" | "Reporting Tags"; items: Pair[]; onChange: (value: Pair[]) => void }) {
  return <div className="space-y-3"><p className="text-sm text-muted-foreground">Add name and value pairs for this vendor.</p>{items.map((item, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><Input aria-label={`${title} name ${index + 1}`} placeholder="Name" value={item.name} onChange={(event) => onChange(items.map((entry, current) => current === index ? { ...entry, name: event.target.value } : entry))} /><Input aria-label={`${title} value ${index + 1}`} placeholder="Value" value={item.value} onChange={(event) => onChange(items.map((entry, current) => current === index ? { ...entry, value: event.target.value } : entry))} /><Button type="button" size="icon" variant="outline" aria-label={`Remove ${title} ${index + 1}`} onClick={() => onChange(items.filter((_, current) => current !== index))}><Trash2 className="size-4" aria-hidden /></Button></div>)}<Button type="button" variant="outline" onClick={() => onChange([...items, { name: "", value: "" }])}><Plus className="mr-2 size-4" aria-hidden />Add {title === "Custom Fields" ? "custom field" : "reporting tag"}</Button></div>;
}

function NewVendor() {
  const { edit: editId } = Route.useSearch();
  const { role, hydrated } = useApp();
  const entity = useEntity();
  const existing = useProcurement().suppliers;
  const editVendor = editId ? existing.find((vendor) => vendor.id === editId) : undefined;
  const [form, setForm] = useState<Form>(() => newForm(entity.country));
  const [tab, setTab] = useState<Tab>("Other Details");
  const [billing, setBilling] = useState<Address>(() => newAddress(entity.country));
  const [shipping, setShipping] = useState<Address>(() => newAddress(entity.country));
  const [sameShipping, setSameShipping] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [customFields, setCustomFields] = useState<Pair[]>([]);
  const [reportingTags, setReportingTags] = useState<Pair[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [error, setError] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [loadedEditId, setLoadedEditId] = useState<string | null>(null);
  const initialEdit = useRef<string | null>(null);
  const initialAddresses = useRef<string | null>(null);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }));
  const requiredDocs = entity.country === "Kenya" ? ["KRA PIN certificate", "Bank letter"] : ["Company registration", "Bank confirmation"];
  const duplicates = existing.filter((vendor) => vendor.id !== editId && vendor.country === entity.country && ((form.displayName.trim() && normalize(vendor.name) === normalize(form.displayName)) || (form.companyId.trim() && normalize(vendor.registration) === normalize(form.companyId))));

  useEffect(() => {
    if (!hydrated) return;
    setForm((current) => current.companyName || current.displayName || current.firstName ? current : newForm(entity.country));
    setBilling((current) => current.line1 ? current : newAddress(entity.country));
    setShipping((current) => current.line1 ? current : newAddress(entity.country));
  }, [entity.country, hydrated]);

  useEffect(() => {
    if (!hydrated || !editId || !editVendor || loadedEditId === editId) return;
    const first = editVendor.contacts[0];
    const parts = first?.name.trim().split(/\s+/) ?? [];
    const billingAddress = editVendor.onboarding?.billingAddress ?? { ...newAddress(entity.country), line1: editVendor.sites[0]?.address ?? "" };
    const shippingAddress = editVendor.onboarding?.shippingAddress ?? billingAddress;
    const nextForm: Form = { ...newForm(entity.country), salutation: editVendor.onboarding?.salutation ?? "", firstName: editVendor.onboarding?.firstName ?? parts.slice(0, -1).join(" "), lastName: editVendor.onboarding?.lastName ?? parts.at(-1) ?? "", companyName: editVendor.legalName, displayName: editVendor.name, email: first?.email ?? "", workPhone: editVendor.onboarding?.workPhone ?? "", mobile: editVendor.onboarding?.mobile ?? "", language: editVendor.onboarding?.language ?? "English", companyId: editVendor.registration, taxRef: editVendor.taxRef ?? "", taxRateRef: editVendor.onboarding?.taxRateRef ?? "", currency: editVendor.onboarding?.currency ?? (entity.country === "Kenya" ? "KES" : "EUR"), paymentTerms: editVendor.onboarding?.paymentTerms ?? "Net 30", portalAccessRequested: editVendor.onboarding?.portalAccessRequested ?? false, categories: editVendor.categories.join(", "), bankName: editVendor.onboarding?.bankName ?? "", bankLast4: editVendor.bank?.masked.match(/\d{4}$/)?.[0] ?? "", remarks: editVendor.onboarding?.remarks ?? "" };
    setForm(nextForm);
    setBilling(billingAddress); setShipping(shippingAddress);
    const nextSameShipping = JSON.stringify(billingAddress) === JSON.stringify(shippingAddress);
    const nextContacts = editVendor.contacts.slice(1);
    const nextCustomFields = editVendor.onboarding?.customFields ?? [];
    const nextReportingTags = editVendor.onboarding?.reportingTags ?? [];
    const nextDocuments = editVendor.documents.map((document) => ({ id: crypto.randomUUID(), name: document.name, size: document.size ?? 0, kind: document.kind ?? "Other" }));
    setSameShipping(nextSameShipping);
    setContacts(nextContacts);
    setCustomFields(nextCustomFields);
    setReportingTags(nextReportingTags);
    setDocuments(nextDocuments);
    initialEdit.current = editSnapshot(nextForm, billingAddress, shippingAddress, nextSameShipping, nextContacts, nextCustomFields, nextReportingTags, nextDocuments);
    initialAddresses.current = JSON.stringify([billingAddress, shippingAddress, nextSameShipping]);
    setLoadedEditId(editId);
  }, [hydrated, editId, editVendor, loadedEditId, entity.country]);

  if (!supplierRole(role) || role === "auditor" || (editId && (!editVendor || !sameEntity(editVendor.country, entity.id) || !["supplier_steward", "proc_admin"].includes(role) || ["Rejected", "Suspended", "Inactive", "Expired"].includes(editVendor.status)))) return <AppShell><RestrictedState /></AppShell>;

  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (documents.length + files.length > 10) return setError("You can add a maximum of 10 documents.");
    if (files.some((file) => file.size > 10 * 1024 * 1024)) return setError("Each document must be 10 MB or smaller.");
    if (files.some((file) => documents.some((document) => document.name === file.name))) return setError("A document with that name is already selected.");
    setDocuments((current) => [...current, ...files.map((file) => ({ id: crypto.randomUUID(), name: file.name, size: file.size, kind: "Other" }))]);
    setError("");
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editId && (!editVendor || loadedEditId !== editId)) return setError("Wait for the vendor details to load before saving.");
    if (editVendor && initialEdit.current === editSnapshot(form, billing, shipping, sameShipping, contacts, customFields, reportingTags, documents)) { setDone(editVendor.id); return; }
    if (!form.companyName.trim() || !form.displayName.trim() || !form.companyId.trim() || !form.firstName.trim() || !form.lastName.trim() || !emailValid(form.email.trim())) return setError("Complete company name, display name, company ID and the primary contact's first name, last name and valid email.");
    if (form.bankLast4 && !/^\d{4}$/.test(form.bankLast4)) { setTab("Bank Details"); return setError("Enter exactly four digits for the masked bank account reference."); }
    if (contacts.some((contact) => !contact.name.trim() || !contact.role.trim() || !emailValid(contact.email.trim()))) { setTab("Contact Persons"); return setError("Each contact person needs a name, role and valid email."); }
    const emails = [form.email.trim().toLowerCase(), ...contacts.map((contact) => contact.email.trim().toLowerCase())];
    if (new Set(emails).size !== emails.length) { setTab("Contact Persons"); return setError("Each contact person must have a different email address."); }
    if ([...customFields, ...reportingTags].some((item) => Boolean(item.name.trim()) !== Boolean(item.value.trim()))) return setError("Each custom field and reporting tag needs both a name and a value.");
    if (editVendor?.bank && !form.bankLast4) { setTab("Bank Details"); return setError("Payment details cannot be removed here. Ask Finance to review a removal."); }
    const ref = `sup-demo-${crypto.randomUUID()}`;
    const missing = requiredDocs.filter((kind) => !documents.some((document) => document.kind === kind));
    const now = new Date().toISOString();
    const primaryName = `${form.salutation ? `${form.salutation} ` : ""}${form.firstName.trim()} ${form.lastName.trim()}`.trim();
    const finalShipping = sameShipping ? billing : shipping;
    const site = (name: string, address: Address) => address.line1.trim() ? [{ name, address: [address.line1, address.line2, address.city, address.region, address.postalCode, address.country].filter(Boolean).join(", ") }] : [];
    const vendor: SupplierRecord = {
      id: ref, name: form.displayName.trim(), legalName: form.companyName.trim(), country: entity.country, registration: form.companyId.trim(), taxRef: form.taxRef.trim(), status: missing.length ? "More information required" : "Under diligence",
      owner: entity.country === "Kenya" ? "Grace Wanjiru" : "Priya Raman", nextAction: missing.length ? `Collect ${missing.join(" and ")}` : "Review identity, documents and Finance verification", dueDate: "—",
      categories: form.categories.split(",").map((category) => category.trim()).filter(Boolean), sites: [...site("Billing", billing), ...(!sameShipping ? site("Shipping", finalShipping) : [])],
      contacts: [{ name: primaryName, role: "Primary contact", email: form.email.trim() }, ...contacts.map((contact) => ({ name: contact.name.trim(), role: contact.role.trim(), email: contact.email.trim() }))],
      qualifications: requiredDocs.map((name) => ({ name, status: "Missing" as const })),
      documents: documents.map((document) => ({ name: document.name, uploaded: editVendor?.documents.find((prior) => prior.name === document.name && (prior.size ?? 0) === document.size && (prior.kind ?? "Other") === document.kind)?.uploaded ?? now.slice(0, 10), size: document.size, kind: document.kind })),
      bank: form.bankLast4 ? { masked: `•••• ${form.bankLast4}`, verification: { state: "Pending", note: "Independent Finance verification required" } } : undefined,
      onboarding: { displayName: form.displayName.trim(), salutation: form.salutation, firstName: form.firstName.trim(), lastName: form.lastName.trim(), workPhone: form.workPhone.trim(), mobile: form.mobile.trim(), language: form.language, currency: form.currency, paymentTerms: form.paymentTerms, taxRateRef: form.taxRateRef.trim(), portalAccessRequested: form.portalAccessRequested, billingAddress: billing, shippingAddress: finalShipping, bankName: form.bankName.trim(), customFields: customFields.filter((item) => item.name.trim()).map((item) => ({ name: item.name.trim(), value: item.value.trim() })), reportingTags: reportingTags.filter((item) => item.name.trim()).map((item) => ({ name: item.name.trim(), value: item.value.trim() })), remarks: form.remarks.trim() },
      procurementDecision: { state: "Pending" }, duplicates: duplicates.map((vendor) => ({ name: vendor.name, reason: "Same display name or company ID" })), openPOs: 0, openInvoices: 0, reviewVersion: 1,
      timeline: [{ id: crypto.randomUUID(), at: now, actor: `${role} (demo)`, event: "Vendor submitted for review", reason: "Document names and classifications recorded in browser demo; file contents were not uploaded" }],
    };
    if (editVendor) {
      const bankChanged = form.bankLast4 !== (editVendor.bank?.masked.match(/\d{4}$/)?.[0] ?? "") || form.bankName.trim() !== (editVendor.onboarding?.bankName ?? "");
      const before = JSON.stringify([editVendor.legalName, editVendor.registration, editVendor.taxRef, editVendor.categories, editVendor.sites, editVendor.contacts, editVendor.onboarding, editVendor.documents]);
      const after = JSON.stringify([vendor.legalName, vendor.registration, vendor.taxRef, vendor.categories, vendor.sites, vendor.contacts, vendor.onboarding, vendor.documents]);
      const changed = before !== after || bankChanged;
      if (changed && !changeReason.trim()) return setError("Add a reason for changing this vendor's profile.");
      const updated: SupplierRecord = {
        ...editVendor,
        legalName: vendor.legalName, registration: vendor.registration, taxRef: vendor.taxRef,
        categories: vendor.categories, sites: initialAddresses.current === JSON.stringify([billing, shipping, sameShipping]) ? editVendor.sites : vendor.sites, contacts: vendor.contacts,
        onboarding: vendor.onboarding, documents: vendor.documents,
        bank: bankChanged ? { masked: vendor.bank?.masked ?? "Not provided", verification: { state: "Pending", note: "Finance must verify changed payment details" } } : editVendor.bank,
        status: changed ? "Under diligence" : editVendor.status,
        procurementDecision: changed ? { state: "Pending", note: "Profile changed; Procurement must review this version" } : editVendor.procurementDecision,
        duplicates: vendor.duplicates,
        duplicateReview: vendor.duplicates?.length ? undefined : editVendor.duplicateReview,
        reviewVersion: changed ? editVendor.reviewVersion + 1 : editVendor.reviewVersion,
        nextAction: changed ? bankChanged ? "Procurement and Finance to review updated vendor" : "Procurement to review updated vendor" : editVendor.nextAction,
        timeline: changed ? [{ id: crypto.randomUUID(), at: now, actor: `${role} (demo)`, event: "Vendor profile revised", reason: changeReason.trim(), before: `review v${editVendor.reviewVersion}`, after: `review v${editVendor.reviewVersion + 1}` }, ...editVendor.timeline] : editVendor.timeline,
      };
      saveProcurement((current) => ({ ...current, suppliers: current.suppliers.map((item) => item.id === editVendor.id ? updated : item) }));
      setDone(editVendor.id); setError("");
    } else {
      saveProcurement((current) => ({ ...current, suppliers: [vendor, ...current.suppliers] }));
      setDone(ref); setError("");
    }
  };

  if (done) return <AppShell><PageHeader eyebrow="Vendors" title={editId ? "Vendor profile saved" : "Vendor saved for review"} description="You can use this vendor on new orders after the required checks and approvals are complete." /><div role="status" className="max-w-2xl rounded-lg border bg-surface p-6"><p className="font-medium">{form.displayName} · {done}</p><p className="mt-2 text-sm text-muted-foreground">The purchasing team checks changed company details. Finance checks changed payment details separately. Portal access was {form.portalAccessRequested ? "requested, but is not on yet" : "not requested"}.</p><div className="mt-4 flex gap-2"><Button asChild><Link to="/procurement/suppliers/$id" params={{ id: done }}>Open vendor</Link></Button><Button variant="outline" asChild><Link to="/procurement/suppliers">Back to vendors</Link></Button></div></div></AppShell>;

  return <AppShell><PageHeader eyebrow="Vendors" title={editId ? "Edit vendor details" : "New Vendor"} description={editId ? "Changes to an existing vendor go back through review. Payment detail changes also need a new Finance check." : `Add a vendor for ${entity.name}. You can use them on orders after the required checks are complete.`} /><form onSubmit={submit} noValidate className="space-y-6">
    <section className="rounded-lg border bg-surface p-5"><h2 className="text-lg font-semibold">Primary Contact</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div><Label htmlFor="salutation">Salutation</Label><FormSelect id="salutation" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" value={form.salutation} onChange={(event) => set("salutation", event.target.value)}><option value="">Select</option>{["Mr.", "Ms.", "Mrs.", "Dr.", "Prof."].map((x) => <option key={x}>{x}</option>)}</FormSelect></div>
      <Field id="first-name" label="First Name" value={form.firstName} required onChange={(x) => set("firstName", x)} /><Field id="last-name" label="Last Name" value={form.lastName} required onChange={(x) => set("lastName", x)} />
      <Field id="company-name" label="Company Name" value={form.companyName} required onChange={(x) => set("companyName", x)} />
      <div><Label htmlFor="display-name">Display Name *</Label><Input id="display-name" className="mt-1" list="display-suggestions" placeholder="Select or type to add" value={form.displayName} onChange={(event) => set("displayName", event.target.value)} disabled={Boolean(editId)} required /><datalist id="display-suggestions"><option value={form.companyName} /><option value={`${form.firstName} ${form.lastName}`.trim()} /></datalist>{editId ? <p className="mt-1 text-xs text-muted-foreground">The display name stays fixed because existing orders use it. Legal name can be revised below.</p> : null}</div>
      <Field id="vendor-email" label="Email Address" type="email" value={form.email} required onChange={(x) => set("email", x)} /><Field id="work-phone" label="Work Phone" type="tel" value={form.workPhone} onChange={(x) => set("workPhone", x)} /><Field id="mobile" label="Mobile" type="tel" value={form.mobile} onChange={(x) => set("mobile", x)} />
      <div><Label htmlFor="vendor-language">Vendor Language</Label><FormSelect id="vendor-language" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" value={form.language} onChange={(event) => set("language", event.target.value)}>{["English", "Dutch", "German", "French", "Swahili"].map((x) => <option key={x}>{x}</option>)}</FormSelect></div>
    </div></section>
    <section className="rounded-lg border bg-surface p-5"><h2 className="text-lg font-semibold">Add more details</h2><div role="tablist" aria-label="More vendor details" className="mt-4 flex gap-1 overflow-x-auto border-b">{tabs.map((name) => <button key={name} type="button" role="tab" aria-selected={tab === name} onClick={() => setTab(name)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === name ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground"}`}>{name}</button>)}</div><div role="tabpanel" aria-label={tab} className="mt-5 min-h-48">
      {tab === "Other Details" ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field id="company-id" label="Company ID / Registration" value={form.companyId} required onChange={(x) => set("companyId", x)} /><Field id="tax-ref" label="Tax ID / Reference" value={form.taxRef} onChange={(x) => set("taxRef", x)} /><Field id="tax-rate" label="Tax Rate Reference" value={form.taxRateRef} onChange={(x) => set("taxRateRef", x)} /><p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">To associate more than one tax, create a tax group in Settings. Finance owns tax rules.</p><div><Label htmlFor="currency">Currency</Label><FormSelect id="currency" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" value={form.currency} onChange={(event) => set("currency", event.target.value)}>{["EUR", "KES", "USD", "ZMW", "GBP"].map((x) => <option key={x}>{x}</option>)}</FormSelect></div><div><Label htmlFor="payment-terms">Payment Terms</Label><FormSelect id="payment-terms" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" value={form.paymentTerms} onChange={(event) => set("paymentTerms", event.target.value)}>{["Due on receipt", "Net 15", "Net 30", "Net 45", "Net 60"].map((x) => <option key={x}>{x}</option>)}</FormSelect></div><Field id="categories" label="Products / Services Supplied" value={form.categories} onChange={(x) => set("categories", x)} placeholder="Comma-separated categories" /><label className="flex items-start gap-2 rounded-md border p-3 text-sm sm:col-span-2 lg:col-span-3"><FormToggle type="checkbox" className="mt-1" checked={form.portalAccessRequested} onChange={(event) => set("portalAccessRequested", event.target.checked)} /><span><strong>Enable Portal?</strong><span className="block text-muted-foreground">Request portal access for this vendor. Access starts only after approval and identity checks.</span></span></label></div>
      : tab === "Address" ? <div className="grid gap-4 xl:grid-cols-2"><AddressFields prefix="billing" title="Billing Address" value={billing} onChange={setBilling} /><div className="space-y-3"><label className="flex items-center gap-2 text-sm"><FormToggle type="checkbox" checked={sameShipping} onChange={(event) => setSameShipping(event.target.checked)} />Shipping address is the same as billing</label>{sameShipping ? <p className="rounded-lg border p-4 text-sm text-muted-foreground">The billing address will also be used for delivery.</p> : <AddressFields prefix="shipping" title="Shipping Address" value={shipping} onChange={setShipping} />}</div></div>
      : tab === "Contact Persons" ? <div className="space-y-4"><p className="text-sm text-muted-foreground">The primary contact above is included automatically.</p>{contacts.map((contact, index) => <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"><Input aria-label={`Contact ${index + 1} name`} placeholder="Full name" value={contact.name} onChange={(event) => setContacts(contacts.map((item, current) => current === index ? { ...item, name: event.target.value } : item))} /><Input aria-label={`Contact ${index + 1} role`} placeholder="Role" value={contact.role} onChange={(event) => setContacts(contacts.map((item, current) => current === index ? { ...item, role: event.target.value } : item))} /><Input aria-label={`Contact ${index + 1} email`} type="email" placeholder="Email" value={contact.email} onChange={(event) => setContacts(contacts.map((item, current) => current === index ? { ...item, email: event.target.value } : item))} /><Button type="button" size="icon" variant="outline" aria-label={`Remove contact ${index + 1}`} onClick={() => setContacts(contacts.filter((_, current) => current !== index))}><Trash2 className="size-4" aria-hidden /></Button></div>)}<Button type="button" variant="outline" onClick={() => setContacts([...contacts, { name: "", role: "", email: "" }])}><Plus className="mr-2 size-4" aria-hidden />Add contact person</Button></div>
      : tab === "Bank Details" ? <div className="max-w-2xl space-y-4"><p className="rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm">Enter only the bank name and last four account digits here. Give full bank details to Finance through its secure process. Finance must check them before you can use this vendor.</p><Field id="bank-name" label="Bank Name" value={form.bankName} onChange={(x) => set("bankName", x)} /><Field id="bank-last4" label="Account last four digits" value={form.bankLast4} onChange={(x) => set("bankLast4", x)} placeholder="1234" /></div>
      : tab === "Custom Fields" ? <PairFields title="Custom Fields" items={customFields} onChange={setCustomFields} />
      : tab === "Reporting Tags" ? <PairFields title="Reporting Tags" items={reportingTags} onChange={setReportingTags} />
      : <div className="max-w-3xl"><Label htmlFor="remarks">Remarks</Label><Textarea id="remarks" className="mt-1 min-h-32" value={form.remarks} onChange={(event) => set("remarks", event.target.value)} /></div>}
    </div></section>
    <section className="rounded-lg border bg-surface p-5"><h2 className="text-lg font-semibold">Documents</h2><p className="mt-1 text-sm text-muted-foreground">Choose up to 10 files, 10 MB each. This demo saves file names and types only. It does not upload the files.</p><div className="mt-4 max-w-xl"><Label htmlFor="vendor-documents">Add documents</Label><Input id="vendor-documents" className="mt-1" type="file" multiple onChange={addFiles} /></div><p className="mt-2 text-xs text-muted-foreground">Needed for review: {requiredDocs.join(" and ")}. Choose a type for each file.</p><ul className="mt-3 space-y-2">{documents.map((document) => <li key={document.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm"><span className="min-w-0 flex-1 truncate">{document.name} · {(document.size / 1024 / 1024).toFixed(2)} MB</span><FormSelect aria-label={`Document type for ${document.name}`} className="h-9 rounded-md border bg-background px-2 text-sm" value={document.kind} onChange={(event) => setDocuments(documents.map((item) => item.id === document.id ? { ...item, kind: event.target.value } : item))}><option>Other</option>{requiredDocs.map((kind) => <option key={kind}>{kind}</option>)}</FormSelect><Button type="button" size="icon" variant="outline" aria-label={`Remove ${document.name}`} onClick={() => setDocuments(documents.filter((item) => item.id !== document.id))}><Trash2 className="size-4" aria-hidden /></Button></li>)}</ul></section>
    {duplicates.length ? <p role="status" className="flex gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm"><AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />Possible duplicate: {duplicates.map((vendor) => vendor.name).join(", ")}. Review is required before activation.</p> : null}
    {editId ? <div className="max-w-2xl"><Label htmlFor="vendor-change-reason">Reason for changes *</Label><Textarea id="vendor-change-reason" className="mt-1" value={changeReason} onChange={(event) => setChangeReason(event.target.value)} placeholder="Explain what changed and why" /></div> : null}
    {error ? <p role="alert" className="rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}
    <div className="flex flex-wrap gap-2"><Button type="submit">{editId ? "Save changes for review" : "Save vendor for review"}</Button><Button type="button" variant="outline" asChild>{editId ? <Link to="/procurement/suppliers/$id" params={{ id: editId }}>Cancel</Link> : <Link to="/procurement/suppliers">Cancel</Link>}</Button></div>
  </form></AppShell>;
}
