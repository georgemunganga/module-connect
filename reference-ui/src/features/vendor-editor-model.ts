import type { VendorDraft, VendorDetail, VendorContactDraft, VendorSiteDraft, VendorQualificationDraft } from "../../../src/platform/procurement-vendors-api";
export type VendorAttributeDraft = NonNullable<VendorDraft["attributes"]>[number];
export type Row<T> = { key: string; id?: string; reviewStatus?: string; value: T };
export type VendorEditorModel = { header: VendorDraft; primary: Row<VendorContactDraft> | null;
  contacts: Row<VendorContactDraft>[]; sites: Row<VendorSiteDraft>[]; qualifications: Row<VendorQualificationDraft>[] };
export const vendorEditorTabs = ["Other Details", "Address", "Contact Persons", "Bank Details", "Custom Fields", "Reporting Tags", "Remarks"];
export const newContact = (): VendorContactDraft => ({ name: "", salutation: "", firstName: "", lastName: "", email: "", phone: "", workPhone: "", mobilePhone: "", languageCode: "en", isPrimary: false });
export const localRow = <T,>(value: T): Row<T> => ({ key: crypto.randomUUID(), value }); // Presentation key, never an API record ID.
export const contactValue = (value: VendorContactDraft): VendorContactDraft => ({ name: value.name, salutation: value.salutation, firstName: value.firstName, lastName: value.lastName,
  role: value.role, email: value.email, phone: value.phone, workPhone: value.workPhone, mobilePhone: value.mobilePhone, languageCode: value.languageCode, isPrimary: value.isPrimary });
export const siteValue = (value: VendorSiteDraft): VendorSiteDraft => ({ kind: value.kind, label: value.label, addressLine1: value.addressLine1, addressLine2: value.addressLine2, city: value.city,
  region: value.region, postalCode: value.postalCode, countryCode: value.countryCode, isPrimary: value.isPrimary, isServiceSite: value.isServiceSite });
export const qualificationValue = (value: VendorQualificationDraft): VendorQualificationDraft => ({ qualificationType: value.qualificationType, issuer: value.issuer,
  referenceNumber: value.referenceNumber, issuedOn: value.issuedOn, expiresOn: value.expiresOn, evidenceDocumentRefId: value.evidenceDocumentRefId });
export function fullVendorDetail(value: VendorDetail): void {
  if (!value.id || !Number.isSafeInteger(value.version) || value.version < 1 || typeof value.legalName !== "string" || !Array.isArray(value.contacts)
    || !Array.isArray(value.sites) || !Array.isArray(value.qualifications) || !Array.isArray(value.attributes))
    throw new Error("Full vendor details are unavailable. Open the saved vendor before editing.");
  if (value.portalAccessState && value.portalAccessState !== "Requested") throw new Error("This vendor's portal state cannot be changed by this editor. Ask the portal owner to review it.");
}
export function newVendorModel(currency: string): VendorEditorModel {
  return { header: { legalName: "", displayName: "", countryCode: "ZM", currencyCode: currency, languageCode: "en", isLocal: true, portalAccessRequested: false, attributes: [] }, primary: null, contacts: [], sites: [], qualifications: [] };
}
export function readVendorModel(value: VendorDetail, currency: string): VendorEditorModel {
  fullVendorDetail(value);
  const primary = value.contacts!.find(row => row.isPrimary);
  return { header: { legalName: value.legalName, displayName: value.displayName, countryCode: value.countryCode, registrationNumber: value.registrationNumber,
    tradingName: value.tradingName, website: value.website, companyIdType: value.companyIdType, taxIdentifierRef: value.taxIdentifierRef, supplierType: value.supplierType,
    categoryCode: value.categoryCode, currencyCode: value.defaultCurrencyCode || currency, paymentTermRef: value.paymentTermRef, taxCategoryRef: value.taxCategoryRef,
    languageCode: value.languageCode, remarks: value.remarks, isLocal: value.isLocal ?? true, portalAccessRequested: value.portalAccessState === "Requested",
    attributes: value.attributes!.filter(row => row.kind === "CustomField" || row.kind === "ReportingTag").map(row => ({ kind: row.kind, key: row.key, value: row.value })) },
    primary: primary ? { key: primary.id, id: primary.id, value: contactValue(primary) } : null,
    contacts: value.contacts!.filter(row => !row.isPrimary).map(row => ({ key: row.id, id: row.id, value: contactValue(row) })),
    sites: value.sites!.map(row => ({ key: row.id, id: row.id, value: siteValue(row) })),
    qualifications: value.qualifications!.map(row => ({ key: row.id, id: row.id, reviewStatus: row.reviewStatus, value: qualificationValue(row) })) };
}
export function validateVendorModel(model: VendorEditorModel): void {
  if (!model.header.legalName.trim() || !model.header.displayName.trim() || !/^[A-Za-z]{2}$/.test(model.header.countryCode)) throw new Error("Add the company name, display name and two-letter country code.");
  if (model.header.currencyCode && !/^[A-Za-z]{3}$/.test(model.header.currencyCode)) throw new Error("Use a three-letter currency code.");
  for (const row of [...model.contacts, ...(model.primary ? [model.primary] : [])]) {
    if (!(row.value.name?.trim() || `${row.value.firstName || ""} ${row.value.lastName || ""}`.trim())) throw new Error("Add a name for each contact.");
    if (row.value.email && !row.value.email.includes("@")) throw new Error("Check the contact email address.");
  }
  if (model.sites.some(row => !row.value.addressLine1.trim() || !/^[A-Za-z]{2}$/.test(row.value.countryCode))) throw new Error("Add an address and two-letter country code for every site.");
  if (model.sites.some(row => !["Billing", "Shipping", "Physical"].includes(row.value.kind))) throw new Error("Choose Billing, Shipping or Physical for each address.");
  for (const kind of ["Billing", "Shipping", "Physical"]) if (model.sites.filter(row => row.value.kind === kind && row.value.isPrimary).length > 1) throw new Error("Choose only one main address for each address type.");
  for (const row of model.qualifications) {
    if (!row.value.qualificationType.trim()) throw new Error("Add a qualification type.");
    if (row.value.issuedOn && row.value.expiresOn && row.value.expiresOn < row.value.issuedOn) throw new Error("Expiry must be on or after the issue date.");
  }
  const attributes = model.header.attributes || [];
  if (attributes.length > 100 || attributes.some(row => !row.key.trim() || row.key.trim().length > 120)) throw new Error("Use up to 100 fields and tags, with names up to 120 characters.");
  const keys = attributes.map(row => `${row.kind}:${row.key.trim()}`); if (new Set(keys).size !== keys.length) throw new Error("Use a different name for each field or tag of the same type.");
}
export function createVendorPayload(model: VendorEditorModel): VendorDraft {
  validateVendorModel(model);
  return { ...model.header, primaryContact: model.primary ? { ...contactValue(model.primary.value), isPrimary: true } : null,
    contacts: model.contacts.map(row => contactValue(row.value)), sites: model.sites.map(row => siteValue(row.value)), qualifications: model.qualifications.map(row => qualificationValue(row.value)) };
}
