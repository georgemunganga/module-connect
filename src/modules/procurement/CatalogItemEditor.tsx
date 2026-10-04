import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/platform/app-context";
import { useProcurement } from "@/modules/procurement/store";
import { sameEntity } from "./access";
import { catalogEntities, getCatalog, saveCatalog, type CatalogItem, type ItemKind, type SupplierOffer } from "./catalog";

const kinds: ItemKind[] = ["Goods", "Service", "Asset", "Consumable", "Subscription"];

export function CatalogItemEditor({ item, onSaved, onCancel }: { item?: CatalogItem; onSaved: (id: string) => void; onCancel: () => void }) {
  const { entityId } = useApp();
  const suppliers = useProcurement().suppliers;
  const [name, setName] = useState(item?.name ?? "");
  const [kind, setKind] = useState<ItemKind>(item?.kind ?? "Goods");
  const [category, setCategory] = useState(item?.category ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "each");
  const [spec, setSpec] = useState(item?.spec ?? "");
  const [taxRef, setTaxRef] = useState(item?.taxRef ?? "");
  const [entities, setEntities] = useState(item?.entities ?? catalogEntities.filter((entity) => sameEntity(entity, entityId)));
  const [status, setStatus] = useState<CatalogItem["status"]>(item?.status ?? "Active");
  const [activeFrom, setActiveFrom] = useState(item?.activeFrom ?? new Date().toISOString().slice(0, 10));
  const [activeTo, setActiveTo] = useState(item?.activeTo ?? "");
  const [offerSupplier, setOfferSupplier] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [offerCurrency, setOfferCurrency] = useState(entities.some((entity) => entity.includes("Kenya")) ? "KES" : "EUR");
  const [offerSource, setOfferSource] = useState<SupplierOffer["source"]>("Catalog");
  const [offerValidTo, setOfferValidTo] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !category.trim() || !unit.trim() || !spec.trim() || !taxRef.trim() || !entities.length || !activeFrom) return setError("Enter the item name, category, unit, details, tax code, company, and start date.");
    if (activeTo && activeTo < activeFrom) return setError("The end date cannot be before the start date.");
    if (item && !reason.trim()) return setError("Enter a reason for this change.");
    if (offerSupplier && (Number(offerPrice) <= 0 || !offerValidTo)) return setError("Enter a price above zero and a valid-until date.");
    if (!item && getCatalog().some((candidate) => candidate.name.toLowerCase() === name.trim().toLowerCase() && candidate.entities.some((entity) => entities.includes(entity)))) return setError("An item with this name already exists for this company.");

    const id = item?.id ?? `itm-${crypto.randomUUID()}`;
    const offers = [...(item?.offers ?? [])];
    if (offerSupplier) {
      const offer: SupplierOffer = { supplier: offerSupplier, price: Number(offerPrice), currency: offerCurrency, source: offerSource, validTo: offerValidTo, leadTimeDays: 0, preferred: offers.length === 0 };
      const existing = offers.findIndex((candidate) => candidate.supplier === offerSupplier && candidate.currency === offerCurrency);
      if (existing >= 0) offers[existing] = { ...offers[existing], ...offer };
      else offers.push(offer);
    }
    const version = (item?.versions[0]?.version ?? 0) + 1;
    const next: CatalogItem = {
      ...(item ?? { id, authoritativeOwner: kind === "Asset" ? "Asset Management" : undefined, block: undefined }),
      id, name: name.trim(), kind, category: category.trim(), unit: unit.trim(), spec: spec.trim(), taxRef: taxRef.trim(),
      entities, status, activeFrom, activeTo: activeTo || undefined, offers,
      versions: [{ version, date: new Date().toISOString().slice(0, 10), by: "Procurement buyer (demo)", change: item ? reason.trim() : "Created item reference" }, ...(item?.versions ?? [])],
    };
    saveCatalog((current) => item ? current.map((candidate) => candidate.id === id ? next : candidate) : [...current, next]);
    onSaved(id);
  };

  return (
    <form onSubmit={save} className="rounded-xl border bg-surface p-5">
      <h2 className="text-lg font-semibold">{item ? `Edit ${item.name}` : "Add item"}</h2>
      <p className="mt-1 text-xs text-muted-foreground">Changes are saved in this browser. Earlier prices and company access remain in the change history.</p>
      {error ? <p role="alert" className="mt-3 rounded border border-destructive p-2 text-sm text-destructive">{error}</p> : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="item-name">Item name</Label><Input id="item-name" value={name} onChange={(event) => setName(event.target.value)} /></div>
        <div><Label htmlFor="item-kind">Type</Label><select id="item-kind" className="h-10 w-full rounded-md border bg-background px-3" value={kind} onChange={(event) => setKind(event.target.value as ItemKind)}>{kinds.map((value) => <option key={value}>{value}</option>)}</select></div>
        <div><Label htmlFor="item-category">Category</Label><Input id="item-category" value={category} onChange={(event) => setCategory(event.target.value)} /></div>
        <div><Label htmlFor="item-unit">Unit</Label><Input id="item-unit" value={unit} onChange={(event) => setUnit(event.target.value)} /></div>
        <div className="sm:col-span-2"><Label htmlFor="item-spec">Description and details</Label><Textarea id="item-spec" value={spec} onChange={(event) => setSpec(event.target.value)} /></div>
        <div><Label htmlFor="item-tax">Tax code</Label><Input id="item-tax" value={taxRef} onChange={(event) => setTaxRef(event.target.value)} /></div>
        <div><Label htmlFor="item-status">Availability</Label><select id="item-status" className="h-10 w-full rounded-md border bg-background px-3" value={status} onChange={(event) => setStatus(event.target.value as CatalogItem["status"])}><option>Active</option><option>Inactive</option></select></div>
        <div><Label htmlFor="item-from">Active from</Label><Input id="item-from" type="date" value={activeFrom} onChange={(event) => setActiveFrom(event.target.value)} /></div>
        <div><Label htmlFor="item-to">Active until (optional)</Label><Input id="item-to" type="date" value={activeTo} onChange={(event) => setActiveTo(event.target.value)} /></div>
      </div>
      <fieldset className="mt-4"><legend className="text-sm font-medium">Available to these companies</legend><div className="mt-2 flex flex-wrap gap-3">{catalogEntities.map((entity) => <label key={entity} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={entities.includes(entity)} onChange={(event) => setEntities((current) => event.target.checked ? [...current, entity] : current.filter((value) => value !== entity))} />{entity}</label>)}</div></fieldset>
      <fieldset className="mt-5 border-t pt-4"><legend className="text-sm font-medium">Add or change a vendor price</legend><p className="text-xs text-muted-foreground">Leave vendor blank to keep existing prices. You can add prices only for approved vendors.</p><div className="mt-2 grid gap-3 sm:grid-cols-3">
        <div><Label htmlFor="offer-supplier">Vendor</Label><select id="offer-supplier" className="h-10 w-full rounded-md border bg-background px-3" value={offerSupplier} onChange={(event) => setOfferSupplier(event.target.value)}><option value="">Keep current price</option>{suppliers.filter((supplier) => supplier.status === "Active").map((supplier) => <option key={supplier.id} value={supplier.name}>{supplier.name}</option>)}</select></div>
        <div><Label htmlFor="offer-price">Unit price</Label><Input id="offer-price" type="number" min="0.01" step="0.01" value={offerPrice} onChange={(event) => setOfferPrice(event.target.value)} /></div>
        <div><Label htmlFor="offer-currency">Currency</Label><select id="offer-currency" className="h-10 w-full rounded-md border bg-background px-3" value={offerCurrency} onChange={(event) => setOfferCurrency(event.target.value)}><option>EUR</option><option>KES</option></select></div>
        <div><Label htmlFor="offer-source">Price source</Label><select id="offer-source" className="h-10 w-full rounded-md border bg-background px-3" value={offerSource} onChange={(event) => setOfferSource(event.target.value as SupplierOffer["source"])}><option>Catalog</option><option>Contract</option></select></div>
        <div><Label htmlFor="offer-valid">Valid until</Label><Input id="offer-valid" type="date" value={offerValidTo} onChange={(event) => setOfferValidTo(event.target.value)} /></div>
      </div></fieldset>
      {item ? <div className="mt-4"><Label htmlFor="item-reason">Reason for change</Label><Textarea id="item-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></div> : null}
      <div className="mt-5 flex gap-2"><Button type="submit">{item ? "Save changes" : "Create item"}</Button><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}
