import { useEffect, useState } from "react";
import { Badge, Button, Field, Input, Select } from "../components/ui";
import { lookupSelectedSourcingReviewers, lookupSourcingReviewers, type SourcingReviewerPage } from "../../../src/platform/procurement-policy-api";

/** Shared per-step named picker. Search/page changes never replace or clear retained selected IDs. */
export function PolicyReviewerPicker({ company, label, selected, disabled, onChange }: {
  company: string; label: string; selected: string[]; disabled?: boolean; onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState(""), [offset, setOffset] = useState(0);
  const [page, setPage] = useState<SourcingReviewerPage | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [names, setNames] = useState<Record<string, string>>({}), [namesLoading, setNamesLoading] = useState(false), [namesError, setNamesError] = useState("");
  const selectedKey = [...selected].sort().join(",");
  const [nameScope, setNameScope] = useState("");
  const currentNameScope = `${company}:${selectedKey}`;
  const savedName = (id: string) => nameScope === currentNameScope ? names[id] : undefined;
  useEffect(() => {
    const abort = new AbortController(); setNameScope(`${company}:${selectedKey}`); setNames({}); setNamesError("");
    const ids = selectedKey ? selectedKey.split(",") : [];
    if (!ids.length) { setNamesLoading(false); return () => abort.abort(); }
    setNamesLoading(true);
    if (ids.length > 100) { setNamesLoading(false); setNamesError("Saved reviewer names are unavailable. Your selections have not changed."); return () => abort.abort(); }
    const chunks = Array.from({ length: Math.ceil(ids.length / 25) }, (_, i) => ids.slice(i * 25, i * 25 + 25));
    Promise.all(chunks.map(chunk => lookupSelectedSourcingReviewers(company, chunk, abort.signal))).then(pages => {
      if (!abort.signal.aborted) setNames(Object.fromEntries(pages.flatMap(page => page.items.map(item => [item.principalId, item.displayName]))));
    }).catch(() => { if (!abort.signal.aborted) setNamesError("Saved reviewer names are unavailable. Your selections have not changed."); })
      .finally(() => { if (!abort.signal.aborted) setNamesLoading(false); });
    return () => abort.abort();
  }, [company, selectedKey]);
  useEffect(() => {
    const abort = new AbortController(); setPage(null); setError(""); setLoading(true);
    const timer = setTimeout(() => {
      lookupSourcingReviewers(company, search, offset, abort.signal).then(result => {
        if (abort.signal.aborted) return;
        setPage(result);
      }).catch((cause: unknown) => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Reviewer names are unavailable."); })
        .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [company, search, offset]);
  return <div className="space-y-3 sm:col-span-3">
    <Field label={`Find ${label.toLowerCase()}`}><Input maxLength={100} disabled={disabled} value={search} onChange={event => { setSearch(event.target.value); setOffset(0); }} /></Field>
    <Field label={label}><Select value="" disabled={disabled || loading || !!error || selected.length >= 100} onChange={event => {
      if (event.target.value && !selected.includes(event.target.value)) onChange([...selected, event.target.value]);
    }}><option value="">{loading ? "Loading names…" : "Add a named reviewer"}</option>{page?.items.filter(item => !selected.includes(item.principalId)).map(item =>
      <option key={item.principalId} value={item.principalId}>{item.displayName}</option>)}</Select></Field>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!loading && !error && !page?.items.length && <p className="text-sm text-muted-foreground">No matching names. Your selected reviewers are unchanged.</p>}
    {namesError && <p role="alert" className="text-sm text-red-700">{namesError}</p>}
    <div className="flex flex-wrap gap-2">{selected.map((id, index) => <div key={id} className="flex items-center gap-2">
      <Badge>{namesLoading || nameScope !== currentNameScope ? "Loading saved reviewer name…" : savedName(id) || "Reviewer name unavailable"}</Badge>
      <Button variant="secondary" disabled={disabled} aria-label={`Remove ${savedName(id) || `saved reviewer ${index + 1}`}`}
        onClick={() => onChange(selected.filter(value => value !== id))}>Remove</Button>
    </div>)}</div>
    <div className="flex gap-2"><Button variant="secondary" disabled={disabled || loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>Previous reviewer names</Button>
      <Button variant="secondary" disabled={disabled || loading || page?.nextOffset == null} onClick={() => setOffset(page!.nextOffset!)}>More reviewer names</Button></div>
    <p className="text-sm text-muted-foreground">Names only. Selection does not grant permission, an approval limit or authority to publish a request for quotes.</p>
  </div>;
}
