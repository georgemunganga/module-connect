import { useEffect, useRef, useState } from "react";
import { Button, Field, Input, Panel, Textarea } from "../components/ui";
import { RecordTable } from "../components/data/RecordTable";
import { contractRateJournal } from "../lib/contract-rate-journal";
import { ContractApiError, getOwnContractDraft, type ContractDetail } from "../../../src/platform/procurement-contracts-api";
import {
  addOwnContractRate, listOwnContractRates, removeOwnContractRate, updateOwnContractRate,
  validContractRateDraft, type ContractRate, type ContractRateDraft, type ContractRates,
} from "../../../src/platform/procurement-contract-rates-api";

const blank = (): ContractRateDraft => ({
  catalogItemId: null, description: "", unitCode: "", unitPriceExact: "",
  maximumQuantityExact: null,
});
const explain = (cause: unknown) => cause instanceof Error ? cause.message : "The rate result is unavailable.";

/** This panel extends the imported contract detail; it never supplies approval or release authority. */
export function ContractDraftRates({ companyId, contract, enabled, canEdit, scopeKey, onFreshContract }: {
  companyId: string; contract: ContractDetail; enabled: boolean; canEdit: boolean;
  scopeKey: string;
  onFreshContract: (value: ContractDetail) => void;
}) {
  const scope = scopeKey;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [loaded, setLoaded] = useState<{ scope: string; rates: ContractRates } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<ContractRateDraft>(blank);
  const [removing, setRemoving] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    currentScope.current = scope;
    setLoaded(null); setError(""); setEditing(null); setRemoving(null); setReason("");
    if (!enabled) return;
    try { setBlocked(contractRateJournal.read(window.sessionStorage, scope)); }
    catch (cause) { setBlocked(true); setError(explain(cause)); }
    const controller = new AbortController();
    setLoading(true);
    listOwnContractRates(companyId, contract.id, controller.signal)
      .then((rates) => { if (!controller.signal.aborted && currentScope.current === scope)
        setLoaded({ scope, rates }); })
      .catch((cause: unknown) => { if (!controller.signal.aborted && currentScope.current === scope)
        setError(explain(cause)); })
      .finally(() => { if (!controller.signal.aborted && currentScope.current === scope)
        setLoading(false); });
    return () => { controller.abort(); currentScope.current = ""; };
  }, [companyId, contract.id, enabled, scope]);

  async function review() {
    if (busy) return;
    const captured = scope;
    setLoading(true); setError("");
    try {
      const [freshContract, rates] = await Promise.all([
        getOwnContractDraft(companyId, contract.id),
        listOwnContractRates(companyId, contract.id),
      ]);
      if (currentScope.current !== captured) return;
      if (freshContract.id !== contract.id || rates.contractId !== contract.id
        || freshContract.version !== rates.contractVersion)
        throw new ContractApiError(0, "The contract and rates changed during refresh. Try reviewing again.");
      if (contractRateJournal.read(window.sessionStorage, captured))
        contractRateJournal.clear(window.sessionStorage, captured);
      onFreshContract(freshContract);
      setLoaded({ scope: captured, rates }); setBlocked(false);
      setEditing(null); setRemoving(null); setReason("");
    } catch (cause) {
      if (currentScope.current === captured) { setError(explain(cause)); setBlocked(true); }
    } finally { if (currentScope.current === captured) setLoading(false); }
  }
  const rates = loaded?.scope === scope ? loaded.rates : null;
  const writable = enabled && canEdit && contract.status === "Draft"
    && contract.draftVersion?.status === "Draft" && !busy && !loading && !blocked
    && rates !== null && rates.contractVersion === contract.version;
  function startEdit(rate: ContractRate) {
    if (!writable || rate.status !== "Active") return;
    setEditing(rate.id);
    setRemoving(null);
    setDraft({ catalogItemId: rate.catalogItemId, description: rate.description,
      unitCode: rate.unitCode, unitPriceExact: rate.unitPriceExact,
      maximumQuantityExact: rate.maximumQuantityExact });
    setError("");
  }
  async function save() {
    if (!writable || !editing || !rates) return;
    const issue = validContractRateDraft(draft);
    if (issue) { setError(issue); return; }
    const current = editing === "new" ? null : rates.items.find((row) => row.id === editing);
    if (editing !== "new" && (!current || current.status !== "Active")) return;
    const captured = scope;
    setBusy(true); setError("");
    try {
      contractRateJournal.claim(window.sessionStorage, captured);
      if (current) await updateOwnContractRate(companyId, contract.id, current.id,
        rates.contractVersion, current.version, draft);
      else await addOwnContractRate(companyId, contract.id, rates.contractVersion, draft);
      if (currentScope.current === captured) await reviewAfterWrite(captured);
    } catch (cause) {
      if (currentScope.current === captured) {
        setError(explain(cause));
        if (cause instanceof ContractApiError && cause.status === 422) {
          try { contractRateJournal.clear(window.sessionStorage, captured); }
          catch { setBlocked(true); }
        } else setBlocked(true);
      }
    } finally { if (currentScope.current === captured) setBusy(false); }
  }
  async function remove() {
    if (!writable || !rates || !removing || !reason.trim()) return;
    const current = rates.items.find((row) => row.id === removing);
    if (!current || current.status !== "Active") return;
    const captured = scope;
    setBusy(true); setError("");
    try {
      contractRateJournal.claim(window.sessionStorage, captured);
      await removeOwnContractRate(companyId, contract.id, current.id,
        rates.contractVersion, current.version, reason);
      if (currentScope.current === captured) await reviewAfterWrite(captured);
    } catch (cause) {
      if (currentScope.current === captured) {
        setError(explain(cause));
        if (cause instanceof ContractApiError && cause.status === 422) {
          try { contractRateJournal.clear(window.sessionStorage, captured); }
          catch { setBlocked(true); }
        } else setBlocked(true);
      }
    } finally { if (currentScope.current === captured) setBusy(false); }
  }
  async function reviewAfterWrite(captured: string) {
    const [freshContract, freshRates] = await Promise.all([
      getOwnContractDraft(companyId, contract.id),
      listOwnContractRates(companyId, contract.id),
    ]);
    if (currentScope.current !== captured) return;
    if (freshContract.id !== contract.id || freshRates.contractId !== contract.id
      || freshContract.version !== freshRates.contractVersion)
      throw new ContractApiError(0, "The saved rates changed during refresh. Review again.");
    contractRateJournal.clear(window.sessionStorage, captured);
    onFreshContract(freshContract);
    setLoaded({ scope: captured, rates: freshRates });
    setEditing(null); setRemoving(null); setReason(""); setDraft(blank());
  }

  return <Panel title="Rates and price schedule" className="mt-5"><div className="space-y-4 p-5">
    {!enabled ? <p className="text-sm text-muted-foreground">Detailed draft rates are not available for this ERP company yet.</p> : <>
      <p className="text-sm text-muted-foreground">Draft rates describe proposed prices. They are not signed terms or approval to purchase.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {loading ? <p role="status">Loading rates…</p> : null}
      {blocked && <p role="status" className="text-sm">The last result needs review. No rate will be submitted again automatically.</p>}
      {(blocked || error) && !busy && <Button variant="secondary" onClick={() => void review()}>Review saved contract and rates</Button>}
      {rates && !loading ? rates.items.length ? <div className="overflow-x-auto"><RecordTable>
        <thead><tr><th>Line</th><th>Description</th><th>Unit</th><th>Unit price</th><th>Maximum quantity</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{rates.items.map((rate) => <tr key={rate.id}>
          <td>{rate.lineNumber}</td><td>{rate.description}{rate.statusReason ? <span className="block text-xs text-muted-foreground">Reason: {rate.statusReason}</span> : null}</td>
          <td>{rate.unitCode}</td><td>{rate.unitPriceExact}</td><td>{rate.maximumQuantityExact ?? "—"}</td><td>{rate.status}</td>
          <td>{writable && rate.status === "Active" ? <div className="flex gap-2">
            <Button variant="secondary" onClick={() => startEdit(rate)}>Edit</Button>
            <Button variant="secondary" onClick={() => { setRemoving(rate.id); setEditing(null); setReason(""); }}>Remove</Button>
          </div> : "—"}</td>
        </tr>)}</tbody>
      </RecordTable></div> : <p className="text-sm text-muted-foreground">No rates recorded for this contract draft.</p> : null}
      {writable && !editing && !removing && <Button variant="secondary" onClick={() => { setDraft(blank()); setEditing("new"); setError(""); }}>Add rate</Button>}
      {writable && editing && <div className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
        <Field label="Description" className="sm:col-span-2"><Input maxLength={1000} value={draft.description}
          onChange={(event) => setDraft((old) => ({ ...old, description: event.target.value }))} /></Field>
        <Field label="Unit"><Input maxLength={40} value={draft.unitCode}
          onChange={(event) => setDraft((old) => ({ ...old, unitCode: event.target.value }))} /></Field>
        <Field label="Unit price"><Input inputMode="decimal" value={draft.unitPriceExact}
          onChange={(event) => setDraft((old) => ({ ...old, unitPriceExact: event.target.value }))} /></Field>
        <Field label="Maximum quantity (optional)"><Input inputMode="decimal" value={draft.maximumQuantityExact ?? ""}
          onChange={(event) => setDraft((old) => ({ ...old, maximumQuantityExact: event.target.value || null }))} /></Field>
        {draft.catalogItemId && <p className="text-sm text-muted-foreground">This rate remains linked to its existing catalog item.</p>}
        <div className="flex gap-2 sm:col-span-2"><Button disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : editing === "new" ? "Save rate" : "Save changes"}</Button>
          <Button variant="secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button></div>
      </div>}
      {writable && removing && <div className="rounded-lg border border-border p-4">
        <Field label="Why remove this rate?"><Textarea maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
        <div className="mt-3 flex gap-2"><Button variant="danger" disabled={busy || !reason.trim()} onClick={() => void remove()}>{busy ? "Removing…" : "Remove rate"}</Button>
          <Button variant="secondary" disabled={busy} onClick={() => setRemoving(null)}>Cancel</Button></div>
      </div>}
      {rates && rates.contractVersion !== contract.version && <p role="status" className="text-sm">This contract changed. Review it before editing rates.</p>}
    </>}
  </div></Panel>;
}
