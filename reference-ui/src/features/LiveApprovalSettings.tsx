import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge, Button, EmptyState, Field, Input, Modal, Panel, Select, Switch, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { useLiveReadiness } from "../lib/ProcurementLiveGate";
import { LivePolicies } from "./LivePolicies";
import { AuthorityApiError, actOnAuthority, getAuthority, listAuthorities, lookupAuthorities, saveAuthority, validAuthorityAmount, authorityUses, authorityUseForAction, supportedAuthorityUse,
  type AuthoritySpendAction, type Authority, type AuthorityAction, type AuthorityDraft, type AuthorityPage, type LookupKind, type LookupPage } from "../../../src/platform/procurement-authority-api";

const message = (cause: unknown) => cause instanceof Error ? cause.message : "Approval settings are unavailable.";
const local = (value: string) => { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 23); };
const labels: Record<AuthorityAction, string> = { Edit: "Edit draft", Submit: "Send for review", Return: "Return for changes",
  Activate: "Activate limit", Supersede: "Replace active limit", Revoke: "Revoke limit" };

export function LiveApprovalSettings({ initialAction = "PurchaseRequest.Approve" }: { initialAction?: AuthoritySpendAction }) {
  const context = useLiveReadiness();
  if (!context) throw new Error("Approval settings require ERP context.");
  const [tab, setTab] = useState<"steps" | "limits">("steps");
  return <div className="space-y-5"><div role="tablist" aria-label="Purchase approval settings" className="flex gap-2 border-b border-border pb-3">
    <Button role="tab" aria-selected={tab === "steps"} variant={tab === "steps" ? "primary" : "secondary"} onClick={() => setTab("steps")}>Approval steps</Button>
    <Button role="tab" aria-selected={tab === "limits"} variant={tab === "limits" ? "primary" : "secondary"} onClick={() => setTab("limits")}>Approval limits</Button>
  </div>{tab === "steps" ? context.permissions.includes("procurement-configuration-read") ? <LivePolicies key={`${context.legalEntityId}:${initialAction}`} onlyPolicyKey={initialAction === "PurchaseOrder.Approve" ? "PURCHASE_ORDER" : "PURCHASE_REQUEST"} />
    : <p role="alert">You do not have access to approval step settings.</p>
    : <ApprovalLimits key={`${context.legalEntityId}:${initialAction}`} initialAction={initialAction} />}</div>;
}

function Lookup({ company, action, kind, label, value, selectedLabel, onChange }: { company: string; action: AuthoritySpendAction; kind: LookupKind; label: string;
  value: string; selectedLabel?: string; onChange: (value: string, label: string) => void }) {
  const [search, setSearch] = useState(""), [offset, setOffset] = useState(0), [data, setData] = useState<LookupPage | null>(null);
  const [error, setError] = useState(""), [loading, setLoading] = useState(true);
  useEffect(() => {
    const abort = new AbortController(); setData(null); setLoading(true); setError("");
    const timer = setTimeout(() => {
      lookupAuthorities(company, kind, search, offset, abort.signal, action).then((result) => { if (!abort.signal.aborted) setData(result); })
        .catch((cause: unknown) => { if (!abort.signal.aborted) setError(message(cause)); })
        .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [company, action, kind, search, offset]);
  const choices = data?.items.map((item) => ({ value: kind === "people" ? item.principalId! : kind === "categories" ? item.code! : item.id!,
    label: kind === "people" ? item.displayName! : `${item.name} (${item.code})` })) ?? [];
  return <div className="space-y-2"><Field label={`Find ${label.toLowerCase()}`}><Input maxLength={100} value={search} onChange={(event) => { setOffset(0); setSearch(event.target.value); }} /></Field>
    <Field label={label}><Select value={value} disabled={loading || !!error} onChange={(event) => onChange(event.target.value, choices.find((choice) => choice.value === event.target.value)?.label ?? "")}>
      <option value="">{loading ? "Loading choices…" : "Choose an option"}</option>
      {value && !choices.some((choice) => choice.value === value) && <option value={value}>{selectedLabel || "Current selection"}</option>}
      {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
    </Select></Field>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!loading && !error && !choices.length && <p className="text-sm text-muted-foreground">No eligible matches on this page.</p>}
    <div className="flex gap-2"><Button variant="secondary" disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>Previous choices</Button>
      <Button variant="secondary" disabled={loading || data?.nextOffset == null} onClick={() => setOffset(data!.nextOffset!)}>More choices</Button></div>
  </div>;
}

function ApprovalLimits({ initialAction }: { initialAction: AuthoritySpendAction }) {
  const context = useLiveReadiness()!; const company = context.legalEntityId;
  const canRead = context.permissions.includes("procurement-authority-read");
  const [spendAction, setSpendAction] = useState<AuthoritySpendAction>(initialAction);
  const [data, setData] = useState<AuthorityPage | null>(null), [page, setPage] = useState(1), [state, setState] = useState("");
  const [revision, setRevision] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Authority | "new" | null>(null), [review, setReview] = useState<{ record: Authority; action: Exclude<AuthorityAction, "Edit"> } | null>(null);
  const [newVersionSeed, setNewVersionSeed] = useState<Authority | null>(null);
  const [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const mounted = useRef(true), detailSequence = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; detailSequence.current++; }; }, []);
  useEffect(() => {
    if (!canRead) return;
    const abort = new AbortController(); setData(null); setLoading(true); setError("");
    listAuthorities(company, page, state, abort.signal, spendAction).then((result) => { if (!abort.signal.aborted) setData(result); })
      .catch((cause: unknown) => { if (!abort.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [company, page, state, revision, canRead, spendAction]);
  const canCreate = data?.canCreate === true && data.createAction === spendAction;
  const grantUse = (row: Authority) => { const use = supportedAuthorityUse(row); return use?.action === spendAction ? use : null; };
  if (!canRead) return <p role="alert">You do not have access to approval limits.</p>;
  async function choose(record: Authority, action: AuthorityAction) {
    const sequence = ++detailSequence.current; setEditing(null); setReview(null); setNewVersionSeed(null); setError(""); setNotice(""); setUncertain(false); setBusy(true);
    try {
      const fresh = await getAuthority(company, record.id);
      if (!mounted.current || sequence !== detailSequence.current) return;
      if (!grantUse(fresh)) throw new Error("This approval type is not supported by this editor. Keep it read-only.");
      if (!fresh.allowedActions.includes(action)) throw new Error("Your available actions changed. Refresh the list.");
      if (action === "Edit") setEditing(fresh); else { setReview({ record: fresh, action }); setReason(""); }
    } catch (cause) { if (mounted.current && sequence === detailSequence.current) setError(message(cause)); }
    finally { if (mounted.current && sequence === detailSequence.current) setBusy(false); }
  }
  async function confirm(event: FormEvent) {
    event.preventDefault(); if (!review || uncertain) return;
    setBusy(true); setError("");
    try {
      await actOnAuthority(company, review.record, review.action, reason);
      if (mounted.current) { setReview(null); setNotice("Approval limit updated."); setRevision((n) => n + 1); }
    } catch (cause) {
      if (!mounted.current) return;
      setError(message(cause));
      if (!(cause instanceof AuthorityApiError) || cause.status === 0 || cause.status >= 500) setUncertain(true);
      if (cause instanceof AuthorityApiError && [403, 404, 409].includes(cause.status)) { setReview(null); setRevision((n) => n + 1); }
    } finally { if (mounted.current) setBusy(false); }
  }
  function reconcile() { setEditing(null); setReview(null); setUncertain(false); setNotice("Check the current record before starting another action. An interrupted response is not proof that saving failed."); setRevision((n) => n + 1); }
  return <div className="space-y-5"><p className="text-sm text-muted-foreground">Give named people finite spending limits. Drafts grant no authority; a separate authorised person must activate them. Request limits use the estimated line amount. Order limits use the approved order line amount (quantity × unit price, before discounts, tax and delivery). Finance confirms the full amount including tax separately.</p>
    <div className="flex flex-wrap items-end justify-between gap-3"><Field label="Approval type"><Select value={spendAction} disabled={busy || uncertain} onChange={(event) => { detailSequence.current++; setEditing(null); setReview(null); setNewVersionSeed(null); setPage(1); setNotice(""); setSpendAction(event.target.value as AuthoritySpendAction); }}>{authorityUses.map((use) => <option key={use.action} value={use.action}>{use.label}</option>)}</Select></Field><Field label="Limit status"><Select value={state} disabled={busy || uncertain} onChange={(event) => { detailSequence.current++; setEditing(null); setReview(null); setPage(1); setState(event.target.value); }}><option value="">All statuses</option>{["Draft", "PendingReview", "Active", "Revoked", "Superseded"].map((value) => <option key={value}>{value}</option>)}</Select></Field>
      <div className="flex gap-2"><Button variant="secondary" disabled={busy} onClick={reconcile}>Refresh limits</Button>{canCreate && <Button disabled={busy || uncertain} onClick={() => { detailSequence.current++; setNewVersionSeed(null); setEditing("new"); setReview(null); setError(""); setNotice(""); }}>Add approval limit</Button>}</div></div>
    {error && !review && !editing && <p role="alert" className="text-sm text-red-700">{error}</p>}{notice && <p role="status" className="text-sm">{notice}</p>}
    {loading ? <p role="status">Loading approval limits…</p> : data?.items.length ? <Panel><div className="overflow-x-auto p-5"><RecordTable><thead><tr><th>Person</th><th>Reference</th><th>Approval use</th><th>Maximum amount</th><th>Effective dates</th><th>Status</th><th>Action</th></tr></thead><tbody>{data.items.map((row) => <tr key={row.id}><td>{row.principalDisplayName || "Person unavailable"}</td><td>{row.authorityReference} · v{row.authorityVersion}</td><td>{grantUse(row)?.label ?? "Unsupported type — read-only"}</td><td>{row.currencyCode} {row.maximumAmount}</td><td>{new Date(row.effectiveFrom).toLocaleDateString()} → {row.effectiveUntil ? new Date(row.effectiveUntil).toLocaleDateString() : "No end date"}</td><td><Badge>{row.state}</Badge></td><td><div className="flex flex-wrap gap-2">{(grantUse(row) ? row.allowedActions : []).map((action) => <Button key={action} variant="secondary" disabled={busy || uncertain} onClick={() => void choose(row, action)}>{labels[action]}</Button>)}{canCreate && grantUse(row) && row.state === "Active" && <Button variant="secondary" disabled={busy || uncertain} onClick={() => { detailSequence.current++; setNewVersionSeed(row); setEditing("new"); setReview(null); setError(""); }}>Create new version</Button>}</div></td></tr>)}</tbody></RecordTable></div></Panel>
      : data && <EmptyState title="No approval limits yet" description="Add a draft limit for a named person. It will need independent review." />}
    {data && data.total > data.pageSize && <div className="flex gap-3"><Button variant="secondary" disabled={page === 1 || busy} onClick={() => { setEditing(null); setReview(null); setPage((n) => n - 1); }}>Previous limits</Button><span className="text-sm">Page {page} of {Math.ceil(data.total / data.pageSize)}</span><Button variant="secondary" disabled={page * data.pageSize >= data.total || busy} onClick={() => { setEditing(null); setReview(null); setPage((n) => n + 1); }}>Next limits</Button></div>}
    {editing && data && data.createAction === spendAction && <AuthorityForm key={editing === "new" ? `new:${newVersionSeed?.id ?? ""}` : `${editing.id}:${editing.version}`} company={company} currency={context.defaultCurrencyCode} createAction={data.createAction} record={editing} seed={newVersionSeed} scope={data.scope} onBusy={(value) => { if (mounted.current) setBusy(value); }} onUnconfirmed={() => { if (mounted.current) setUncertain(true); }}
      onSaved={() => { setEditing(null); setRevision((n) => n + 1); setNotice("Draft saved. It does not grant approval authority."); }} onCancel={() => setEditing(null)} onReconcile={reconcile} />}
    {review && <Modal title={`${labels[review.action]} · ${review.record.authorityReference}`} onClose={() => { if (!busy && !uncertain) setReview(null); }}><form onSubmit={(event) => void confirm(event)} className="space-y-4">
      <p className="text-sm">{review.record.principalDisplayName || "Named account"} · {review.record.currencyCode} {review.record.maximumAmount} · {supportedAuthorityUse(review.record)?.label}. {review.action === "Supersede" ? "This will retire the previous active version in the same transaction." : review.action === "Revoke" ? "This removes the active limit. Existing approval decisions remain in history." : "ERP will recheck your permission, scope and required independence."}</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {review.action !== "Submit" && <Field label="Reason"><Textarea required maxLength={2000} disabled={busy || uncertain} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>}
      {uncertain ? <Button onClick={reconcile}>Refresh and check saved result</Button> : <div className="flex gap-2"><Button type="submit" disabled={busy || review.action !== "Submit" && !reason.trim()}>{busy ? "Saving…" : labels[review.action]}</Button><Button variant="secondary" disabled={busy} onClick={() => setReview(null)}>Cancel</Button></div>}
    </form></Modal>}
  </div>;
}

function AuthorityForm({ company, currency, createAction, record, seed, scope, onSaved, onCancel, onReconcile, onBusy, onUnconfirmed }: { company: string; currency: string; createAction: AuthoritySpendAction;
  record: Authority | "new"; seed: Authority | null; scope: AuthorityPage["scope"]; onSaved: () => void; onCancel: () => void; onReconcile: () => void; onBusy: (value: boolean) => void; onUnconfirmed: () => void }) {
  const existing = record === "new" ? null : record;
  const initial = existing ?? seed;
  const use = initial ? supportedAuthorityUse(initial) : authorityUseForAction(createAction);
  const [reference, setReference] = useState(initial?.authorityReference ?? ""), [principal, setPrincipal] = useState(initial?.principalId ?? "");
  const [personLabel, setPersonLabel] = useState(initial?.principalDisplayName ?? "");
  const [draft, setDraft] = useState<AuthorityDraft>(initial ? { currencyCode: initial.currencyCode, amountBasis: initial.amountBasis,
    maximumAmount: initial.maximumAmount, effectiveFrom: initial.effectiveFrom, effectiveUntil: initial.effectiveUntil,
    allBranches: initial.allBranches, branchRef: initial.branchRef, allDepartments: initial.allDepartments,
    departmentRef: initial.departmentRef, allCategories: initial.allCategories, categoryCodes: [...initial.categoryCodes] } : { currencyCode: currency, amountBasis: use?.amountBasis ?? "", maximumAmount: "0",
    effectiveFrom: new Date().toISOString(), effectiveUntil: null, allBranches: false, branchRef: scope.branchId,
    allDepartments: false, departmentRef: scope.departmentId, allCategories: false, categoryCodes: [] });
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    // StrictMode replays setup after cleanup in development; the same ref must
    // become live again so successful saves and unconfirmed results stay visible.
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const field = <K extends keyof AuthorityDraft>(key: K, value: AuthorityDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  async function save(event: FormEvent) {
    event.preventDefault(); if (uncertain) return;
    if (!use) { setError("This approval type is not supported by this editor. Keep it read-only."); return; }
    if (!validAuthorityAmount(draft.maximumAmount) && draft.maximumAmount !== "0") { setError("Use a finite amount with up to four decimal places."); return; }
    setBusy(true); onBusy(true); setError("");
    try { await saveAuthority(company, draft, existing ? { id: existing.id, version: existing.version, action: use.action } : { authorityReference: reference.trim(), principalId: principal, action: use.action }); if (alive.current) onSaved(); }
    catch (cause) { if (alive.current) { setError(message(cause)); if (!(cause instanceof AuthorityApiError) || cause.status === 0 || cause.status >= 500) { setUncertain(true); onUnconfirmed(); } } }
    finally { onBusy(false); if (alive.current) setBusy(false); }
  }
  return <form onSubmit={(event) => void save(event)}><Panel title={existing ? "Edit approval limit draft" : "New approval limit draft"}><div className="space-y-5 p-5">
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {existing?.reviewReturnReason && <p className="text-sm">Reviewer note: {existing.reviewReturnReason}</p>}
    <fieldset disabled={busy || uncertain || !use} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2">
      <Field label="Limit reference"><Input required maxLength={100} disabled={!!initial} value={reference} onChange={(event) => setReference(event.target.value)} /></Field>
      {initial ? <Field label="Person"><Input readOnly value={personLabel || "Person unavailable"} /></Field> : <Lookup company={company} action={use?.action ?? createAction} kind="people" label="Person" value={principal} selectedLabel={personLabel} onChange={(value, name) => { setPrincipal(value); setPersonLabel(name); }} />}
      <Field label="Approval use"><Input readOnly value={use?.label ?? "Unsupported type — read-only"} /></Field>
      <Field label="Reviewers"><Input readOnly value={use?.reviewers ?? "Not available"} /></Field>
      <Field label="Company currency"><Input readOnly value={draft.currencyCode} /></Field>
      <Field label="Maximum amount" hint="Up to four decimal places. Zero may be saved as a draft, but cannot be activated."><Input inputMode="decimal" required value={draft.maximumAmount} onChange={(event) => field("maximumAmount", event.target.value)} /></Field>
      <Field label="Starts"><Input type="datetime-local" step="0.001" required value={local(draft.effectiveFrom)} onChange={(event) => { if (event.target.value) field("effectiveFrom", new Date(event.target.value).toISOString()); }} /></Field>
      <Field label="Ends (optional)"><Input type="datetime-local" step="0.001" value={draft.effectiveUntil ? local(draft.effectiveUntil) : ""} onChange={(event) => field("effectiveUntil", event.target.value ? new Date(event.target.value).toISOString() : null)} /></Field>
    </div><p className="text-sm text-muted-foreground">{use?.basisLabel ?? "Unsupported amount basis"}: quantity × unit price before discounts, tax and delivery. Finance confirms the full amount including tax separately. A limit does not assign this person to an approval step.</p><div className="grid gap-5 md:grid-cols-3">
      <div className="space-y-3"><label className="flex items-center gap-2 text-sm"><Switch disabled={!!scope.branchId || scope.confined} checked={draft.allBranches} onChange={(event) => { field("allBranches", event.target.checked); field("branchRef", event.target.checked ? null : scope.branchId); }} />All branches</label>{!draft.allBranches && <Lookup company={company} action={use?.action ?? createAction} kind="branches" label="Branch" value={draft.branchRef ?? ""} onChange={(value) => field("branchRef", value || null)} />}</div>
      <div className="space-y-3"><label className="flex items-center gap-2 text-sm"><Switch disabled={!!scope.departmentId} checked={draft.allDepartments} onChange={(event) => { field("allDepartments", event.target.checked); field("departmentRef", event.target.checked ? null : scope.departmentId); }} />All departments</label>{!draft.allDepartments && <Lookup company={company} action={use?.action ?? createAction} kind="departments" label="Department" value={draft.departmentRef ?? ""} onChange={(value) => field("departmentRef", value || null)} />}</div>
      <div className="space-y-3"><label className="flex items-center gap-2 text-sm"><Switch checked={draft.allCategories} onChange={(event) => { field("allCategories", event.target.checked); field("categoryCodes", []); }} />All categories</label>{!draft.allCategories && <><Lookup company={company} action={use?.action ?? createAction} kind="categories" label="Category" value="" onChange={(value) => { if (value) field("categoryCodes", [...new Set([...draft.categoryCodes, value])]); }} />{draft.categoryCodes.map((code) => <Button key={code} variant="secondary" onClick={() => field("categoryCodes", draft.categoryCodes.filter((value) => value !== code))}>Remove {code}</Button>)}</>}</div>
    </div></fieldset>
    {uncertain ? <div className="space-y-3"><p className="text-sm">The response was interrupted. This form will not repeat the create or update. Check the saved list before starting another action.</p><Button onClick={onReconcile}>Refresh and check saved result</Button></div>
      : <div className="flex gap-3"><Button type="submit" disabled={busy || !use || !principal || !reference.trim()}>{busy ? "Saving…" : "Save limit draft"}</Button><Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button></div>}
  </div></Panel></form>;
}
