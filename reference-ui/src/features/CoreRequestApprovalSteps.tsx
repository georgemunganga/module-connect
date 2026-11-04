import { useErpShell } from "../lib/erpShell";
import { useEffect, useState } from "react";
import { Badge, Button, Field, Input, Select } from "../components/ui";
import { lookupRequestApprovers, lookupRequestRoles, lookupRequestDepartments, type RequestDepartment, type RequestCoreRole } from "../../../src/platform/procurement-policy-api";
import { PolicyReviewerPicker, type PolicyPeopleSource } from "./PolicyReviewerPicker";
import { moveCoreStep, newCoreStep, type CoreApprovalStep } from "../lib/core-request-routing";

const people: PolicyPeopleSource = { key: "request-core-approvers-v2", maximum: 1,
  page: (company, search, offset, signal) => lookupRequestApprovers(company, search, offset, signal),
  selected: (company, ids, signal) => lookupRequestApprovers(company, "", 0, signal, ids) };

export type RequestRoleOptions = { roles: RequestCoreRole[]; departments: RequestDepartment[]; loading: boolean; error: string };
export function useRequestRoleOptions(company: string, enabled: boolean): RequestRoleOptions {
  const [roles, setRoles] = useState<RequestCoreRole[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [roleScope, setRoleScope] = useState("");
  const [departments, setDepartments] = useState<RequestDepartment[]>([]);
  useEffect(() => {
    if (!enabled) { setDepartments([]); setRoles([]); setRoleScope(""); setLoading(false); setError(""); return; }
    const abort = new AbortController(); setLoading(true); setDepartments([]); setRoles([]); setRoleScope(""); setError("");
    Promise.all([lookupRequestRoles(company, abort.signal), lookupRequestDepartments(company, abort.signal)]).then(([rows, units]) => { if (!abort.signal.aborted) { setRoles(rows); setDepartments(units); setRoleScope(company); } })
      .catch(() => { if (!abort.signal.aborted) setError("Core roles could not be loaded. Saved selections are unchanged; reload this draft before choosing a role."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [company, enabled]);
  return { roles: roleScope === company ? roles : [], departments: roleScope === company ? departments : [], loading, error };
}

export function CoreRequestApprovalSteps({ company, steps, requesterRoles, onSteps, onRequesterRoles, roleOptions, departmentIds, onDepartments, branchIds, onBranches }: {
  branchIds: string[]; onBranches: (ids: string[]) => void;
  company: string; steps: CoreApprovalStep[]; requesterRoles: string[]; departmentIds: string[]; onDepartments: (ids: string[]) => void; roleOptions: RequestRoleOptions;
  onSteps: (steps: CoreApprovalStep[]) => void; onRequesterRoles: (keys: string[]) => void;
}) {
  const shell = useErpShell();
  const branches = shell.branches.filter(branch => branch.legalEntityId === company);
  const { roles: available, departments, loading, error } = roleOptions;
  const name = (key: string) => available.find(role => role.key === key)?.label ?? "Saved role unavailable";
  const patch = (index: number, change: Partial<CoreApprovalStep>) => onSteps(steps.map((step, i) => i === index ? { ...step, ...change } : step));
  return <div className="space-y-5">
    <Field label="For branches (optional)"><Select value="" disabled={!shell.contextAvailable} onChange={event => { if (event.target.value && !branchIds.includes(event.target.value)) onBranches([...branchIds, event.target.value]); }}><option value="">Any branch unless one is selected</option>{branches.filter(branch => !branchIds.includes(branch.id)).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></Field>
    <div className="flex flex-wrap gap-2">{branchIds.map(id => <span key={id} className="flex items-center gap-2"><Badge>{branches.find(branch => branch.id === id)?.name ?? "Saved branch unavailable"}</Badge><Button variant="secondary" aria-label="Remove selected branch" onClick={() => onBranches(branchIds.filter(value => value !== id))}>Remove</Button></span>)}</div>
    <Field label="For departments (optional)"><Select value="" disabled={loading || !!error} onChange={event => { if (event.target.value && !departmentIds.includes(event.target.value)) onDepartments([...departmentIds, event.target.value]); }}><option value="">Any department unless one is selected</option>{departments.filter(unit => !departmentIds.includes(unit.id)).map(unit => <option key={unit.id} value={unit.id}>{unit.label}</option>)}</Select></Field>
    <div className="flex flex-wrap gap-2">{departmentIds.map(id => <span key={id} className="flex items-center gap-2"><Badge>{departments.find(unit => unit.id === id)?.label ?? "Saved department unavailable"}</Badge><Button variant="secondary" aria-label="Remove selected department" onClick={() => onDepartments(departmentIds.filter(value => value !== id))}>Remove</Button></span>)}</div>
    <Field label="Use this rule when the requester has a role (optional)"><Select value="" disabled={loading || !!error} onChange={event => { if (event.target.value && !requesterRoles.includes(event.target.value)) onRequesterRoles([...requesterRoles, event.target.value]); }}>
      <option value="">Any requester unless a role is selected</option>{available.filter(role => !requesterRoles.includes(role.key)).map(role => <option key={role.key} value={role.key}>{role.label}</option>)}
    </Select></Field>
    <div className="flex flex-wrap gap-2">{requesterRoles.map(key => <span key={key} className="flex items-center gap-2"><Badge>{name(key)}</Badge><Button variant="secondary" aria-label={`Remove requester role ${name(key)}`} onClick={() => onRequesterRoles(requesterRoles.filter(value => value !== key))}>Remove</Button></span>)}</div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <p className="text-sm text-muted-foreground">Use a higher-priority rule for supervisors who submit their own requests. Keep an unrestricted rule for everyone else. No step is skipped automatically.</p>
    <fieldset className="space-y-4"><legend className="text-sm font-semibold">Approval steps, in order</legend>
      {steps.map((step, index) => <section key={index} className="space-y-4 rounded-lg border border-border p-4" aria-label={`Approval step ${index + 1}`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">Step {index + 1}</h4><div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={index === 0} onClick={() => onSteps(moveCoreStep(steps, index, index - 1))}>Move up</Button>
          <Button variant="secondary" disabled={index === steps.length - 1} onClick={() => onSteps(moveCoreStep(steps, index, index + 1))}>Move down</Button>
          <Button variant="secondary" disabled={steps.length === 1} onClick={() => onSteps(steps.filter((_, i) => i !== index))}>Remove step</Button>
        </div></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Step name"><Input required maxLength={100} value={step.code} onChange={event => patch(index, { code: event.target.value.toUpperCase().replace(/\s+/g, '_') })} /></Field>
          <Field label="Who approves"><Select value={step.binding.kind} onChange={event => patch(index, { binding: { kind: event.target.value as "CoreUser" | "CoreRole", key: "" } })}><option value="CoreUser">A specific person</option><option value="CoreRole">Someone with a Core role</option></Select></Field>
          <Field label="Approvals needed"><Select value={step.mode} onChange={event => patch(index, { mode: event.target.value as "One" | "All" })}><option value="One">One explicitly resolved approver</option><option value="All">All eligible selected role members</option></Select></Field>
        </div>
        {step.binding.kind === "CoreUser" ? <PolicyReviewerPicker key={`person-${index}`} company={company} label={`Approver for step ${index + 1}`} schemaVersion={2} source={people}
          selected={step.binding.key ? [step.binding.key] : []} onChange={ids => patch(index, { binding: { kind: "CoreUser", key: ids[0] ?? "" } })}
          helpText="Core users can approve without an employee record. Permission, branch access and an approved spending limit are still required." />
          : <Field label={`Role for step ${index + 1}`}><Select value={step.binding.key} disabled={loading || !!error} onChange={event => patch(index, { binding: { kind: "CoreRole", key: event.target.value } })}><option value="">Choose a Core role</option>
            {step.binding.key && !available.some(role => role.key === step.binding.key) && <option value={step.binding.key}>Saved role unavailable</option>}
            {available.map(role => <option key={role.key} value={role.key}>{role.label}</option>)}
          </Select></Field>}
      </section>)}
      <Button variant="secondary" disabled={steps.length >= 20} onClick={() => onSteps([...steps, newCoreStep(steps.length)])}>Add approval step</Button>
    </fieldset>
    <p className="text-sm text-muted-foreground">If a role resolves to several eligible people, the one-approver setting needs a specific person. Choosing All requires every eligible member. A role or job title does not grant approval power.</p>
  </div>;
}
