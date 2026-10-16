import { useEffect, useState } from "react";
import { procurementEntity, procurementEntityName, sameEntity } from "./access";
import type { ProcurementState } from "./store";
import type { CatalogItem } from "./catalog";
import type { ConfigState } from "./payables/config-store";

const KEY = "proc:getting-started:v1";
export const gettingStartedSteps = ["controls", "first-purchase", "finance"] as const;
export type GettingStartedStep = (typeof gettingStartedSteps)[number];

type Progress = Record<GettingStartedStep, boolean>;
const emptyProgress = (): Progress => ({ controls: false, "first-purchase": false, finance: false });

export type ReadinessKey = "policy" | "supplier" | "item" | "first-request" | "finance";
export type ReadinessState = "ready" | "needs action" | "not connected";
export interface ReadinessCheck {
  key: ReadinessKey;
  label: string;
  owner: string;
  state: ReadinessState;
  detail: string;
  href: string;
}

/** Demo record evidence only; a Finance callback simulation never counts as a connector. */
export function procurementReadiness(entityId: string, config: ConfigState, procurement: ProcurementState, items: CatalogItem[]): ReadinessCheck[] {
  const today = new Date().toISOString().slice(0, 10);
  const policyReady = config.policy.status === "Published" && config.policy.entityId === entityId && config.policy.effective <= today;
  const supplierReady = procurement.suppliers.some((supplier) =>
    supplier.country === procurementEntity(entityId) && supplier.status === "Active" &&
    supplier.procurementDecision.state === "Approved" && supplier.bank?.verification.state === "Approved",
  );
  const itemReady = items.some((item) =>
    item.entities.includes(procurementEntityName(entityId)) && item.status === "Active" &&
    item.activeFrom <= today && (!item.activeTo || item.activeTo >= today) && !item.block,
  );
  const firstRequestReady = procurement.requests.some((request) =>
    sameEntity(procurement.metadata[request.id]?.entity, entityId) &&
    !["Draft", "Cancelled", "Withdrawn"].includes(request.status),
  );
  return [
    { key: "policy", label: "Buying rules", owner: "Procurement admin", state: policyReady ? "ready" : "needs action",
      detail: policyReady ? `Published policy v${config.policy.version} covers this company.` : "No currently effective published policy covers this company.", href: "/procurement/configuration/policy" },
    { key: "supplier", label: "Approved vendor", owner: "Supplier steward and Finance", state: supplierReady ? "ready" : "needs action",
      detail: supplierReady ? "An active vendor has Procurement and Finance approval." : "Approve an active vendor and record independent Finance verification.", href: "/procurement/suppliers" },
    { key: "item", label: "Available item", owner: "Procurement buyer", state: itemReady ? "ready" : "needs action",
      detail: itemReady ? "An active, unrestricted item is available for this company." : "Add or enable an item available to this company.", href: "/procurement/catalog" },
    { key: "first-request", label: "First request", owner: "Requester and approver", state: firstRequestReady ? "ready" : "needs action",
      detail: firstRequestReady ? "A submitted request exists in the demo records for this company." : "Submit a purchase request for this company.", href: "/procurement/requests" },
    { key: "finance", label: "Finance connection", owner: "Finance and ERP integration", state: "not connected",
      detail: "No live Finance budget, AP or payment connector is configured. Demo payment updates do not connect Finance.", href: "/procurement/configuration" },
  ];
}

/** Review acknowledgements only. They do not activate a policy or integration. */
export function useGettingStarted(entityId: string) {
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    try {
      const saved = localStorage.getItem(`${KEY}:${entityId}`);
      setProgress(saved ? { ...emptyProgress(), ...JSON.parse(saved) } : emptyProgress());
    } catch {
      setProgress(emptyProgress());
    }
    setLoaded(true);
  }, [entityId]);

  const setReviewed = (step: GettingStartedStep, reviewed: boolean) => {
    setProgress((current) => {
      const next = { ...current, [step]: reviewed };
      localStorage.setItem(`${KEY}:${entityId}`, JSON.stringify(next));
      return next;
    });
  };

  return { progress, loaded, reviewedCount: gettingStartedSteps.filter((step) => progress[step]).length, setReviewed };
}
