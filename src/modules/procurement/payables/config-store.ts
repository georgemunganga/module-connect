import { useEffect, useState } from "react";

export interface PolicyVersion {
  version: number;
  status:
    | "Published"
    | "Superseded"
    | "Draft"
    | "Pending review"
    | "Returned"
    | "Rejected"
    | "Approved for publication"
    | "Future effective";
  threshold: number;
  currency: string;
  tolerance: number;
  effective: string;
  reason: string;
  entityId: string;
  category: string;
  author: string;
  reviewer?: string;
  financeReference?: string;
  methods: string[];
  quoteCount: number;
  numberPrefix: string;
  slaHours: number;
  supplierMustBeActive: boolean;
  portalEnabled: boolean;
  requires3Way: boolean;
  approvalStrategy: "Hierarchical" | "Sequential" | "Parallel";
}
export interface ConfigAudit {
  at: string;
  action: string;
  actor: string;
  reason?: string;
}
export interface ConfigState {
  policy: PolicyVersion;
  candidate?: PolicyVersion;
  policyHistory: PolicyVersion[];
  policyAudit: ConfigAudit[];
}
export const initialConfig: ConfigState = {
  policy: {
    version: 1,
    status: "Published",
    threshold: 10000,
    currency: "EUR",
    tolerance: 2,
    effective: "2026-10-01",
    reason: "Illustrative demo policy",
    entityId: "ent-nl",
    category: "All",
    author: "Procurement governance",
    methods: ["Direct", "RFQ", "Contract", "Emergency"],
    quoteCount: 3,
    numberPrefix: "PO-",
    slaHours: 48,
    supplierMustBeActive: true,
    portalEnabled: true,
    requires3Way: true,
    approvalStrategy: "Hierarchical",
  },
  policyHistory: [],
  policyAudit: [],
};
const key = "meridian.procurement.config.v1";
let snapshot = initialConfig;
let loaded = false;
const listeners = new Set<() => void>();
function hydrate() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const saved = JSON.parse(raw) as ConfigState;
      snapshot = {
        ...initialConfig,
        ...saved,
        policy: { ...initialConfig.policy, ...saved.policy },
        candidate: saved.candidate ? { ...initialConfig.policy, ...saved.candidate } : undefined,
      };
    }
  } catch {
    snapshot = initialConfig;
  }
  listeners.forEach((listener) => listener());
}
export function useConfigStore() {
  const [state, setState] = useState(snapshot);
  useEffect(() => {
    hydrate();
    const update = () => setState(snapshot);
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);
  return state;
}
export function updateConfig(change: (current: ConfigState) => ConfigState) {
  hydrate();
  snapshot = change(snapshot);
  if (typeof window !== "undefined") localStorage.setItem(key, JSON.stringify(snapshot));
  listeners.forEach((listener) => listener());
}
