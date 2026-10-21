import { FormSelect } from "@/components/ui/form-select";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/platform/app-context";
import { AppShell } from "@/platform/components/AppShell";
import { PageHeader } from "@/platform/components/PageHeader";
import {
  AVAILABLE_METHODS,
  CONFIG_SECTIONS,
  newPolicyVersion,
  simulatePolicy,
  validatePolicyVersion,
  type ConfigSection,
} from "./policy";
import { updateConfig, useConfigStore, type PolicyVersion } from "./config-store";

const today = () => new Date().toISOString().slice(0, 10);
const reviewActors = ["Jonas Keller · Governance reviewer", "Mara Okafor · Procurement admin"];
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-surface p-5">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
function LabeledNumber({
  id,
  label,
  value,
  onChange,
  disabled,
  min,
  max,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled: boolean;
  min?: number;
  max?: number;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
      />
    </div>
  );
}

export function ProcurementPolicyScreen() {
  const { role, entityId } = useApp();
  const state = useConfigStore();
  const published = state.policy;
  const candidate = state.candidate;
  const [section, setSection] = useState<ConfigSection>("Thresholds & approvals");
  const [draft, setDraft] = useState<PolicyVersion>(() => candidate ?? newPolicyVersion(published));
  const [reviewActor, setReviewActor] = useState(reviewActors[0]);
  const [reviewReason, setReviewReason] = useState("");
  const [financeReference, setFinanceReference] = useState("");
  const [notice, setNotice] = useState("");
  const [simAmount, setSimAmount] = useState("12000");
  const [simRisk, setSimRisk] = useState("Standard");
  const [simRoute, setSimRoute] = useState("Direct");
  const [simCategory, setSimCategory] = useState("IT equipment");
  useEffect(() => {
    setDraft(candidate ?? newPolicyVersion(published));
  }, [candidate, published]);
  if (!["proc_admin", "auditor", "buyer"].includes(role))
    return (
      <AppShell>
        <PageHeader
          eyebrow="Procurement"
          title="Settings unavailable"
          description="You do not have access to purchasing rules."
        />
      </AppShell>
    );
  const canManage = role === "proc_admin" && entityId === published.entityId;
  const canEdit =
    canManage && (!candidate || candidate.status === "Draft" || candidate.status === "Returned");
  const errors = validatePolicyVersion(draft, published, entityId);
  const audit = state.policyAudit ?? [];
  const addAudit = (action: string, actor: string, reason?: string) => ({
    at: new Date().toISOString(),
    action,
    actor,
    reason,
  });
  function saveDraft() {
    if (!canEdit) {
      setNotice("Only an administrator for this entity can edit an open draft.");
      return;
    }
    const saved = {
      ...draft,
      version: published.version + 1,
      status: "Draft" as const,
      entityId,
      author: draft.author || "Mara Okafor · Procurement admin",
    };
    updateConfig((s) => ({
      ...s,
      candidate: saved,
      policyAudit: [
        ...(s.policyAudit ?? []),
        addAudit(`Draft v${saved.version} saved`, saved.author!, saved.reason),
      ],
    }));
    setNotice("Draft saved in browser demo state. Published policy is unchanged.");
  }
  function submit() {
    if (!canEdit) {
      setNotice("Only an editable draft can be submitted.");
      return;
    }
    if (errors.length) {
      setNotice(`Cannot submit: ${errors.join(" ")}`);
      return;
    }
    const submitted = {
      ...draft,
      version: published.version + 1,
      status: "Pending review" as const,
      entityId,
      author: draft.author || "Mara Okafor · Procurement admin",
    };
    updateConfig((s) => ({
      ...s,
      candidate: submitted,
      policyAudit: [
        ...(s.policyAudit ?? []),
        addAudit(`Candidate v${submitted.version} submitted`, submitted.author!, submitted.reason),
      ],
    }));
    setNotice(
      "Immutable candidate submitted. Independent review and Finance sign-off are required.",
    );
  }
  function review(decision: "Returned" | "Rejected" | "Approved for publication") {
    if (!canManage || candidate?.status !== "Pending review") {
      setNotice("This candidate is not pending review in your entity.");
      return;
    }
    if (candidate.author === reviewActor) {
      setNotice("Self-approval blocked: choose an independent reviewer.");
      return;
    }
    if (decision !== "Approved for publication" && !reviewReason.trim()) {
      setNotice("Return and rejection require a reason.");
      return;
    }
    const reviewErrors = validatePolicyVersion(candidate, published, entityId);
    if (decision === "Approved for publication" && reviewErrors.length) {
      setNotice(`Review blocked: ${reviewErrors.join(" ")}`);
      return;
    }
    if (decision === "Approved for publication" && !financeReference.trim()) {
      setNotice("Finance sign-off reference is required for financial thresholds and tolerances.");
      return;
    }
    updateConfig((s) => ({
      ...s,
      candidate: {
        ...candidate,
        status: decision,
        reviewer: reviewActor,
        financeReference:
          decision === "Approved for publication"
            ? financeReference.trim()
            : candidate.financeReference,
      },
      policyAudit: [
        ...(s.policyAudit ?? []),
        addAudit(
          `Candidate v${candidate.version} ${decision.toLowerCase()}`,
          reviewActor,
          decision === "Approved for publication"
            ? `Finance sign-off ${financeReference.trim()}`
            : reviewReason.trim(),
        ),
      ],
    }));
    setReviewReason("");
    setNotice(
      decision === "Approved for publication"
        ? "Candidate approved. Publication is available at or after its effective date."
        : `Candidate ${decision.toLowerCase()}; published policy remains active.`,
    );
  }
  function publish() {
    if (
      !canManage ||
      !candidate ||
      !["Approved for publication", "Future effective"].includes(candidate.status)
    ) {
      setNotice("Only an approved candidate can be published.");
      return;
    }
    const currentErrors = validatePolicyVersion(candidate, published, entityId);
    if (
      currentErrors.length ||
      !candidate.reviewer ||
      candidate.reviewer === candidate.author ||
      !candidate.financeReference
    ) {
      setNotice(
        "Publication blocked: validation, independent review and Finance sign-off must still be valid.",
      );
      return;
    }
    if (candidate.effective > today()) {
      updateConfig((s) => ({
        ...s,
        candidate: { ...candidate, status: "Future effective" },
        policyAudit: [
          ...(s.policyAudit ?? []),
          addAudit(
            `Candidate v${candidate.version} scheduled`,
            candidate.reviewer!,
            `Effective ${candidate.effective}`,
          ),
        ],
      }));
      setNotice(
        `Future-effective v${candidate.version} scheduled. v${published.version} remains active until ${candidate.effective}.`,
      );
      return;
    }
    updateConfig((s) => ({
      ...s,
      policyHistory: [{ ...s.policy, status: "Superseded" }, ...(s.policyHistory ?? [])],
      policy: { ...candidate, status: "Published" },
      candidate: undefined,
      policyAudit: [
        ...(s.policyAudit ?? []),
        addAudit(
          `Policy v${candidate.version} published`,
          candidate.reviewer!,
          `Supersedes v${s.policy.version}; Finance ${candidate.financeReference}`,
        ),
      ],
    }));
    setNotice(
      `Version ${candidate.version} published in configuration demo state for ${entityId}. Transaction adapters are not connected to this package yet.`,
    );
  }
  function beginReplacement() {
    if (!canManage) return;
    if (candidate && !["Rejected"].includes(candidate.status)) {
      setNotice("Resolve or publish the current candidate before starting another version.");
      return;
    }
    updateConfig((s) => ({
      ...s,
      candidate: undefined,
      policyHistory:
        s.candidate?.status === "Rejected" ? [s.candidate, ...s.policyHistory] : s.policyHistory,
    }));
    setDraft(newPolicyVersion(published));
    setNotice("New successor draft started from the published version.");
  }
  const update = (change: Partial<PolicyVersion>) =>
    setDraft((current) => ({ ...current, ...change, status: "Draft" }));
  const check = (
    id: string,
    label: string,
    checked: boolean,
    onChange: (value: boolean) => void,
  ) => (
    <label key={id} className="flex items-center gap-3 rounded-md border p-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={!canEdit}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4"
      />
      {label}
    </label>
  );
  return (
    <AppShell>
      <PageHeader
        eyebrow="Procurement / Settings"
        title="Purchasing rules"
        description="Set and review how purchasing works for each company. Changes in this demo stay in your browser and are not connected to live transactions."
      />
      {entityId !== published.entityId && (
        <div
          role="status"
          className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          No purchasing rules have been published for this company in the demo. Switch to Meridian Netherlands to see the sample rules.
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label="Configuration sections" className="flex flex-col gap-1">
          {CONFIG_SECTIONS.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setSection(name)}
              aria-current={section === name ? "page" : undefined}
              className={`rounded-md px-3 py-2 text-left text-sm ${section === name ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {name}
            </button>
          ))}
        </nav>
        <div className="space-y-5">
          <Panel title={`${section} · v${draft.version} ${candidate?.status ?? "unsaved draft"}`}>
            <p className="mb-4 text-sm text-muted-foreground">
              Company: {draft.entityId ?? published.entityId} · {draft.category ?? "All"} categories ·{" "}
              {draft.currency}. Values shown here are illustrative.
            </p>
            {section === "Methods & categories" && (
              <div className="space-y-3">
                <p className="text-sm">Enabled methods</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {AVAILABLE_METHODS.map((method) =>
                    check(method, method, (draft.methods ?? []).includes(method), (on) =>
                      update({
                        methods: on
                          ? [...new Set([...(draft.methods ?? []), method])]
                          : (draft.methods ?? []).filter((item) => item !== method),
                      }),
                    ),
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Category scope remains All until ERP governance defines rule precedence for
                  narrower overrides.
                </p>
              </div>
            )}
            {section === "Thresholds & approvals" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <LabeledNumber
                  id="threshold"
                  label="Competitive sourcing threshold (EUR)"
                  value={draft.threshold}
                  onChange={(threshold) => update({ threshold })}
                  disabled={!canEdit}
                  min={1}
                />
                <LabeledNumber
                  id="quote-count"
                  label="Required quotations above threshold"
                  value={draft.quoteCount ?? 3}
                  onChange={(quoteCount) => update({ quoteCount })}
                  disabled={!canEdit}
                  min={1}
                  max={10}
                />
                <div className="space-y-1">
                  <Label htmlFor="approval-strategy">Approval strategy</Label>
                  <FormSelect
                    id="approval-strategy"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={draft.approvalStrategy ?? "Hierarchical"}
                    disabled={!canEdit}
                    onChange={(e) =>
                      update({
                        approvalStrategy: e.target.value as PolicyVersion["approvalStrategy"],
                      })
                    }
                  >
                    <option>Hierarchical</option>
                    <option>Sequential</option>
                    <option>Parallel</option>
                  </FormSelect>
                </div>
              </div>
            )}
            {section === "Budget & tolerances" && (
              <div className="space-y-3">
                <LabeledNumber
                  id="tolerance"
                  label="Invoice price tolerance (%)"
                  value={draft.tolerance}
                  onChange={(tolerance) => update({ tolerance })}
                  disabled={!canEdit}
                  min={0}
                  max={100}
                />
                {check(
                  "three-way",
                  "Require three-way match for goods",
                  draft.requires3Way ?? true,
                  (requires3Way) => update({ requires3Way }),
                )}
                <p className="text-xs text-muted-foreground">
                  Finance owns available budget and reservation references. Tax rules and exchange
                  rates are linked ERP Core references.
                </p>
              </div>
            )}
            {section === "Numbering" && (
              <div className="space-y-1">
                <Label htmlFor="number-prefix">PO number prefix</Label>
                <Input
                  id="number-prefix"
                  value={draft.numberPrefix ?? "PO-"}
                  disabled={!canEdit}
                  onChange={(e) => update({ numberPrefix: e.target.value.toUpperCase() })}
                />
                <p className="text-xs text-muted-foreground">
                  Atomic number allocation is a shared ERP service; this demo validates the prefix
                  only.
                </p>
              </div>
            )}
            {section === "Calendars & SLAs" && (
              <LabeledNumber
                id="sla-hours"
                label="Approval target (hours, illustrative)"
                value={draft.slaHours ?? 48}
                onChange={(slaHours) => update({ slaHours })}
                disabled={!canEdit}
                min={1}
                max={720}
              />
            )}
            {section === "Supplier rules" &&
              check(
                "supplier-active",
                "Supplier must be active before a new PO",
                draft.supplierMustBeActive ?? true,
                (supplierMustBeActive) => update({ supplierMustBeActive }),
              )}
            {section === "Portal preferences" &&
              check(
                "portal-enabled",
                "Supplier portal enabled for eligible suppliers",
                draft.portalEnabled ?? true,
                (portalEnabled) => update({ portalEnabled }),
              )}
            {section === "Purchasing preferences" && (
              <p className="text-sm">
                Direct buying, competitive sourcing and contract releases use the enabled methods
                and the published approval rule. Open orders retain their source policy version when
                a replacement takes effect.
              </p>
            )}
            {section === "Document templates" && (
              <p className="text-sm">
                PO, invitation and contract templates are held by the shared document service.
                Configure their versioned references after the document integration is connected.
              </p>
            )}
            {section === "Validation" && (
              <div className="space-y-2">
                {errors.length ? (
                  errors.map((error) => (
                    <p
                      key={error}
                      className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-900"
                    >
                      {error}
                    </p>
                  ))
                ) : (
                  <p className="rounded border border-green-200 bg-green-50 p-2 text-sm text-green-900">
                    No local validation errors. Server publication must revalidate all shared
                    references and authority.
                  </p>
                )}
              </div>
            )}
            {section === "Notifications" && (
              <p className="text-sm">
                Approval reminders and escalation consume the shared notification service. SLA
                breach creates a task; it never auto-approves a decision.
              </p>
            )}
            {section === "Integrations & status" && (
              <div className="space-y-2 text-sm">
                <p>Finance budget/tax: demo reference only · no live connector</p>
                <p>Workflow/approvals: shared ERP service · integration pending</p>
                <p>Supplier portal and documents: local UI demonstration</p>
                <Link to="/configuration" className="text-primary underline">
                  Open shared ERP configuration
                </Link>
              </div>
            )}
          </Panel>
          <Panel title="Scope, effective date & reason">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="policy-entity">Legal entity</Label>
                <Input id="policy-entity" value={draft.entityId ?? "ent-nl"} readOnly />
                <p className="mt-1 text-xs text-muted-foreground">Stable ERP organization ID</p>
              </div>
              <div>
                <Label htmlFor="policy-category">Category scope</Label>
                <Input id="policy-category" value={draft.category ?? "All"} readOnly />
              </div>
              <div>
                <Label htmlFor="effective">Effective from</Label>
                <Input
                  id="effective"
                  type="date"
                  value={draft.effective}
                  disabled={!canEdit}
                  onChange={(e) => update({ effective: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="author">Author identity</Label>
                <Input
                  id="author"
                  value={draft.author ?? "Mara Okafor · Procurement admin"}
                  readOnly
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="change-reason">Change reason</Label>
                <Input
                  id="change-reason"
                  value={draft.reason}
                  disabled={!canEdit}
                  onChange={(e) => update({ reason: e.target.value })}
                  placeholder="Why is this policy changing?"
                />
              </div>
            </div>
            {canManage && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={!canEdit} onClick={saveDraft}>
                  Save draft
                </Button>
                <Button type="button" disabled={!canEdit} onClick={submit}>
                  Validate & submit for review
                </Button>
                <Button type="button" variant="outline" onClick={beginReplacement}>
                  Start replacement draft
                </Button>
              </div>
            )}
          </Panel>
          {candidate?.status === "Pending review" && (
            <Panel title="Independent review">
              <p className="mb-3 text-sm">
                Candidate v{candidate.version} was authored by {candidate.author}. Review is a demo
                of a separate identity and a Finance sign-off reference; production permissions
                belong in Identity and Workflow.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="reviewer">Acting reviewer</Label>
                  <FormSelect
                    id="reviewer"
                    className="h-10 w-full rounded-md border bg-background px-3"
                    value={reviewActor}
                    onChange={(e) => setReviewActor(e.target.value)}
                    disabled={!canManage}
                  >
                    {reviewActors.map((actor) => (
                      <option key={actor}>{actor}</option>
                    ))}
                  </FormSelect>
                </div>
                <div>
                  <Label htmlFor="finance-ref">Finance sign-off reference</Label>
                  <Input
                    id="finance-ref"
                    value={financeReference}
                    onChange={(e) => setFinanceReference(e.target.value)}
                    disabled={!canManage}
                    placeholder="FIN-APP-..."
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="review-reason">Return or rejection reason</Label>
                  <Input
                    id="review-reason"
                    value={reviewReason}
                    onChange={(e) => setReviewReason(e.target.value)}
                    disabled={!canManage}
                  />
                </div>
              </div>
              {canManage && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={() => review("Approved for publication")}>
                    Approve candidate
                  </Button>
                  <Button variant="outline" onClick={() => review("Returned")}>
                    Return for changes
                  </Button>
                  <Button variant="outline" onClick={() => review("Rejected")}>
                    Reject
                  </Button>
                </div>
              )}
            </Panel>
          )}
          {candidate &&
            ["Approved for publication", "Future effective"].includes(candidate.status) && (
              <Panel title="Publication">
                <p className="text-sm">
                  Independent reviewer: {candidate.reviewer}. Finance sign-off:{" "}
                  {candidate.financeReference}. Effective {candidate.effective}. The published v
                  {published.version} remains active until replacement takes effect.
                </p>
                {canManage && (
                  <Button className="mt-3" onClick={publish}>
                    {candidate.effective > today()
                      ? "Schedule future publication"
                      : "Publish approved version"}
                  </Button>
                )}
                {candidate.status === "Future effective" && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Activation requires the effective date and a fresh validation. No automatic
                    timer is connected in this demo.
                  </p>
                )}
              </Panel>
            )}
          <Panel title="Policy simulator">
            <p className="mb-3 text-sm text-muted-foreground">
              Synthetic facts only; applies the currently published version. Candidate changes do
              not affect a transaction.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="sim-amount">Amount ({published.currency})</Label>
                <Input
                  id="sim-amount"
                  type="number"
                  value={simAmount}
                  onChange={(e) => setSimAmount(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="sim-category">Category</Label>
                <Input
                  id="sim-category"
                  value={simCategory}
                  onChange={(e) => setSimCategory(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="sim-risk">Supplier risk</Label>
                <FormSelect
                  id="sim-risk"
                  className="h-10 w-full rounded-md border bg-background px-3"
                  value={simRisk}
                  onChange={(e) => setSimRisk(e.target.value)}
                >
                  <option>Standard</option>
                  <option>High</option>
                  <option>Suspended</option>
                </FormSelect>
              </div>
              <div>
                <Label htmlFor="sim-route">Buying route</Label>
                <FormSelect
                  id="sim-route"
                  className="h-10 w-full rounded-md border bg-background px-3"
                  value={simRoute}
                  onChange={(e) => setSimRoute(e.target.value)}
                >
                  {AVAILABLE_METHODS.map((method) => (
                    <option key={method}>{method}</option>
                  ))}
                </FormSelect>
              </div>
            </div>
            <div role="status" className="mt-4 rounded-lg border bg-muted p-3 text-sm">
              <p className="font-medium">
                Result · policy v{published.version} · entity {entityId}
              </p>
              <ul className="mt-1 list-inside list-disc">
                {simulatePolicy(published, {
                  entityId,
                  amount: Number(simAmount),
                  category: simCategory,
                  risk: simRisk,
                  route: simRoute,
                }).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </Panel>
          <Panel title="Version history & audit">
            <div className="space-y-2 text-sm">
              <p>
                <strong>v{published.version} Published</strong> · effective {published.effective} ·{" "}
                {published.reason}
              </p>
              {candidate && (
                <p>
                  <strong>
                    v{candidate.version} {candidate.status}
                  </strong>{" "}
                  · effective {candidate.effective} · {candidate.reason}
                </p>
              )}
              {(state.policyHistory ?? []).map((version) => (
                <p key={`${version.version}-${version.effective}`}>
                  v{version.version} {version.status} · effective {version.effective} ·{" "}
                  {version.reason}
                </p>
              ))}
            </div>
            <ol className="mt-4 space-y-2 border-t pt-3 text-xs">
              {audit
                .slice()
                .reverse()
                .map((event, index) => (
                  <li key={`${event.at}-${index}`}>
                    {new Date(event.at).toLocaleString()} · {event.actor} · {event.action}
                    {event.reason ? ` · ${event.reason}` : ""}
                  </li>
                ))}
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">
              Completed audit events and policy versions must be immutable in the backend. This
              browser demo is resettable local state.
            </p>
          </Panel>
          {notice && (
            <p role="status" className="rounded-lg border bg-surface p-3 text-sm">
              {notice}
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
