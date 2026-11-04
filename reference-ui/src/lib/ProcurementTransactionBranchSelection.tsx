import { Field, Select } from "../components/ui";
import { useErpShell } from "./erpShell";

/** Reuses verified Core choices; selecting here changes the existing ERP context.
 * This never grants branch access or submits a business record. */
export function ProcurementTransactionBranchSelection() {
  const { selection, entities, branches, selectBranch } = useErpShell();
  const company = entities.find(entity => entity.id === selection.entityId);
  const choices = company ? branches.filter(branch => branch.legalEntityId === company.id) : [];
  return <section className="p-5 sm:p-8" aria-label="Choose transaction branch">
    <h1 className="text-xl font-semibold">Choose a branch to continue</h1>
    <p className="mt-3 text-sm text-muted-foreground">You are viewing the whole company. Choose the branch this work belongs to. Nothing is saved until you complete the form.</p>
    <div className="mt-5 max-w-sm"><Field label="Branch for this work"><Select value="" disabled={!choices.length} onChange={event => {
      const chosen = choices.find(branch => branch.id === event.target.value);
      if (chosen && company) selectBranch(chosen.id, company.id);
    }}><option value="">Choose a branch</option>{choices.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></Field></div>
    {!choices.length && <p role="alert" className="mt-3 text-sm">No permitted branch is available for this company. Ask your ERP administrator to check your branch access.</p>}
  </section>;
}
