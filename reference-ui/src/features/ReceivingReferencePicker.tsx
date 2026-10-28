import { useEffect, useState } from "react";
import { Badge, Button, Field, Input, Select } from "../components/ui";
import { lookupReceivingReferences, lookupSelectedReceivingReferences,
  type ReceivingLookupPage } from "../../../src/platform/procurement-policy-api";

/** Purpose-scoped Core names; stored policy keeps the owner IDs, never display text. */
export function ReceivingReferencePicker({ company, kind, label, selected, onChange, disabled, maxSelected = 100 }: {
  company: string; kind: "people" | "principals" | "sites"; label: string; selected: string[];
  onChange: (ids: string[]) => void; disabled?: boolean; maxSelected?: number;
}) {
  const [search, setSearch] = useState(""), [offset, setOffset] = useState(0);
  const [page, setPage] = useState<ReceivingLookupPage | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const [names, setNames] = useState<Record<string, string>>({}), [namesError, setNamesError] = useState("");
  const selectedKey = [...selected].sort().join(",");
  const [namesScope, setNamesScope] = useState("");
  const scope = `${company}:${kind}:${selectedKey}`;
  useEffect(() => {
    const abort = new AbortController(); setNamesScope(scope); setNames({}); setNamesError("");
    const ids = selectedKey ? selectedKey.split(",") : [];
    if (!ids.length) return () => abort.abort();
    const chunks = Array.from({ length: Math.ceil(ids.length / 25) }, (_, i) => ids.slice(i * 25, i * 25 + 25));
    Promise.all(chunks.map(chunk => lookupSelectedReceivingReferences(company, kind, chunk, abort.signal)))
      .then(values => { if (!abort.signal.aborted) setNames(Object.fromEntries(values.flatMap(value => value.items.map(item => [item.id, item.displayName])))); })
      .catch(() => { if (!abort.signal.aborted) setNamesError("Saved names are unavailable. Your selections remain unchanged."); });
    return () => abort.abort();
  }, [company, kind, selectedKey, scope]);
  useEffect(() => {
    const abort = new AbortController(); setPage(null); setError(""); setLoading(true);
    const timer = setTimeout(() => {
      lookupReceivingReferences(company, kind, search, offset, abort.signal)
        .then(value => { if (!abort.signal.aborted) setPage(value); })
        .catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Current names are unavailable."); })
        .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [company, kind, search, offset]);
  return <div className="min-w-0 space-y-3 sm:col-span-2"><Field label={`Find ${label.toLowerCase()}`}><Input maxLength={100} disabled={disabled} value={search} onChange={event => { setSearch(event.target.value); setOffset(0); }} /></Field>
    <Field label={label}><Select value="" disabled={disabled || loading || !!error || selected.length >= maxSelected} onChange={event => {
      if (event.target.value && !selected.includes(event.target.value)) onChange([...selected, event.target.value]);
    }}><option value="">{loading ? "Loading names…" : `Add ${label.toLowerCase()}`}</option>
      {page?.items.filter(item => !selected.includes(item.id)).map(item => <option key={item.id} value={item.id}>{item.displayName}{item.code ? ` · ${item.code}` : ""}</option>)}</Select></Field>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {namesError && <p role="alert" className="text-sm text-destructive">{namesError}</p>}
    <div className="flex flex-wrap gap-2">{selected.map((id, index) => <span key={id} className="flex items-center gap-2"><Badge>{namesScope === scope ? names[id] || "Saved name unavailable" : "Loading saved name…"}</Badge>
      <Button variant="secondary" disabled={disabled} aria-label={`Remove ${names[id] || `saved selection ${index + 1}`}`} onClick={() => onChange(selected.filter(value => value !== id))}>Remove</Button></span>)}</div>
    <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={disabled || loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>Previous</Button>
      <Button variant="secondary" disabled={disabled || loading || page?.nextOffset == null} onClick={() => setOffset(page!.nextOffset!)}>More</Button></div>
  </div>;
}

/** Policies store category code; the picker resolves it from a current owned category. */
export function ReceivingCategoryPicker({ company, value, onChange, disabled }: {
  company: string; value: string; onChange: (code: string) => void; disabled?: boolean;
}) {
  const [search, setSearch] = useState(""), [offset, setOffset] = useState(0);
  const [page, setPage] = useState<ReceivingLookupPage | null>(null);
  const [error, setError] = useState(""), [loading, setLoading] = useState(true);
  useEffect(() => {
    const abort = new AbortController(); setPage(null); setLoading(true); setError("");
    const timer = setTimeout(() => lookupReceivingReferences(company, "categories", search, offset, abort.signal)
      .then(result => { if (!abort.signal.aborted) setPage(result); })
      .catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Categories are unavailable."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); }), 200);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [company, search, offset]);
  return <div className="min-w-0 space-y-2"><Field label="Find purchase category"><Input maxLength={100} disabled={disabled} value={search} onChange={event => { setSearch(event.target.value); setOffset(0); }} /></Field>
    <Field label="Purchase category"><Select required disabled={disabled || loading || !!error} value={value} onChange={event => onChange(event.target.value)}>
      <option value="">{loading ? "Loading categories…" : "Choose category"}</option>
      {value && !page?.items.some(item => item.code === value) && <option value={value}>{value} · saved selection</option>}
      {page?.items.filter(item => item.code).map(item => <option key={item.id} value={item.code!}>{item.displayName} · {item.code}</option>)}</Select></Field>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {value && <p className="text-xs text-muted-foreground">Saved category code: {value}. ERP checks that it is still valid before saving.</p>}
    <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={disabled || loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>Previous categories</Button>
      <Button variant="secondary" disabled={disabled || loading || page?.nextOffset == null} onClick={() => setOffset(page!.nextOffset!)}>More categories</Button></div>
  </div>;
}
