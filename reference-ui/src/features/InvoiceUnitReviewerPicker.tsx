import { useEffect, useState } from "react";
import { Button, Input } from "../components/ui";
import { lookupUnitReviewers, type UnitReviewerPage } from "../../../src/platform/procurement-policy-api";
/** Existing Core people lookup; no identities or permissions are created here. */
export function InvoiceUnitReviewerPicker({ company, selected, onChange, disabled }: {
  company: string; selected: string[]; onChange: (ids: string[]) => void; disabled: boolean;
}) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState(""), [offset, setOffset] = useState(0);
  const [page, setPage] = useState<UnitReviewerPage | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); setLoading(true); setPage(null); setError("");
    const timer = window.setTimeout(() => {
      lookupUnitReviewers(company, search, offset, controller.signal).then(value => {
        if (!controller.signal.aborted) { setPage(value); setNames(current => ({ ...current, ...Object.fromEntries(value.items.map(row => [row.principalId, row.displayName])) })); }
      }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Reviewer names are unavailable."); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [company, open, search, offset]);
  return <div className="space-y-3">
    <ul className="space-y-2" aria-label="Selected reviewers">{selected.map((id, index) => <li key={id} className="flex items-center justify-between gap-3 text-sm">
      <span>{names[id] || `Saved reviewer ${index + 1}`}</span><Button variant="secondary" disabled={disabled} onClick={() => onChange(selected.filter(value => value !== id))}>Remove reviewer {index + 1}</Button>
    </li>)}</ul>
    {selected.some(id => !names[id]) && <p className="text-xs text-muted-foreground">Saved people stay selected. Search for their names to confirm current details; the server rechecks eligibility before review.</p>}
    <Button variant="secondary" disabled={disabled} onClick={() => setOpen(value => !value)}>{open ? "Close reviewer search" : "Choose reviewers"}</Button>
    {open && <div className="space-y-3 rounded-lg border border-border p-3">
      <Input aria-label="Search reviewer names" placeholder="Search by name" maxLength={100} disabled={disabled} value={search} onChange={event => { setSearch(event.target.value); setOffset(0); }} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loading ? <p role="status" className="text-sm">Finding current reviewers…</p> : page && <>
        <ul className="space-y-2">{page.items.map(person => <li key={person.principalId} className="flex items-center justify-between gap-3 text-sm">
          <span>{person.displayName}{!person.canReviewOriginalUnits && <span className="text-muted-foreground"> · Review access not assigned</span>}</span>
          <Button variant="secondary" disabled={disabled || !person.canReviewOriginalUnits || selected.includes(person.principalId) || selected.length >= 32}
            onClick={() => onChange([...selected, person.principalId])}>{selected.includes(person.principalId) ? "Selected" : "Add reviewer"}</Button>
        </li>)}</ul>
        {!page.items.length && <p className="text-sm">No matching people.</p>}
        <div className="flex gap-2"><Button variant="secondary" disabled={disabled || offset === 0} onClick={() => setOffset(value => Math.max(0, value - 25))}>Previous people</Button>
          <Button variant="secondary" disabled={disabled || offset + page.items.length >= page.candidateTotal} onClick={() => setOffset(value => value + 25)}>More people</Button></div>
      </>}
    </div>}
  </div>;
}
