# Full vendor editor — persisted existing supplier records

The original seven-tab New Vendor layout uses ERP shared controls and Core company currency. It retains Other Details, Address, Contact Persons, Bank Details, Custom Fields, Reporting Tags and Remarks. The existing vendor directory/detail suffix is preserved.

Create uses one existing atomic supplier POST with supported primary/secondary contacts, sites, qualifications and attributes. Edit makes the boundary explicit: **Save vendor details** updates header, attributes and remarks; each contact/address/qualification has its own Save. After child save, the receipt identifies the actual child and supplier CAS; a GET must match that CAS before adopting only that saved child. Other unsaved values are preserved. Saved child removal remains reasoned in the existing detail UI.

Bank details belong to Finance; this editor collects none. Unsupported tax-rate, file-upload and external portal activation functions remain unavailable. Existing document-linked or reviewed qualifications are read-only here. Unknown attribute kinds remain retained server-side. No browser-local transaction fallback or fake supplier activation.

Company/branch/worker/record changes remount the editor; old reads abort and command completions cannot navigate after unmount. Failed edit loads cannot create. Stale or uncertain writes block repeated mutations and offer explicit read-only reconciliation. Ordinary sign-out/login reloads the document. Cross-tab canonical auth invalidation is a separate shared-shell increment; worker ID alone is not proof of principal equality.

Verification checkpoint: TypeScript,10 model/child-receipt units and live staged build passed. Focused browser suite in progress; actual private API persistence test still pending at this source checkpoint. Two initial browser failures were incomplete readiness mock and ambiguous Remarks selector, fixed in tests only; failed traces retained. No production deployment claimed.
