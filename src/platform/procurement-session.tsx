import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface ProcurementContext {
  tenantId: string;
  legalEntityId: string;
  principalId: string;
  workerId: string | null;
  company: { id: string; code: string; name: string };
  branch: { id: string; code: string; name: string } | null;
  orgUnit: { id: string; code: string; name: string } | null;
  roles: string[];
  permissions: string[];
  allowedCompanies: { id: string; code: string; name: string }[];
  confined: boolean;
}

export type ProcurementSession =
  | { mode: "loading" }
  | { mode: "demo" }
  | { mode: "live"; user: { displayName: string; email: string; roles: string[] }; context: ProcurementContext }
  | { mode: "unavailable"; reason: string };

const Session = createContext<ProcurementSession>({ mode: "loading" });

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const validCompany = (value: unknown): value is { id: string; code: string; name: string } =>
  isObject(value) &&
  uuid.test(String(value.id)) &&
  typeof value.code === "string" &&
  typeof value.name === "string";

function validContext(value: unknown): value is ProcurementContext {
  if (
    !isObject(value) ||
    !Array.isArray(value.roles) ||
    !Array.isArray(value.permissions) ||
    !Array.isArray(value.allowedCompanies)
  )
    return false;
  return (
    typeof value.tenantId === "string" &&
    value.tenantId.trim().length > 0 &&
    uuid.test(String(value.principalId)) && value.principalId !== "00000000-0000-0000-0000-000000000000" &&
    uuid.test(String(value.legalEntityId)) &&
    (value.workerId === null || uuid.test(String(value.workerId))) &&
    validCompany(value.company) &&
    value.company.id === value.legalEntityId &&
    (value.branch === null || validCompany(value.branch)) &&
    (value.orgUnit === null || validCompany(value.orgUnit)) &&
    value.roles.every((role) => typeof role === "string") &&
    value.permissions.every((permission) => typeof permission === "string") &&
    value.permissions.includes("procurement-access") &&
    value.allowedCompanies.every(validCompany) &&
    value.allowedCompanies.some((company) => company.id === value.legalEntityId) &&
    typeof value.confined === "boolean"
  );
}

async function detectSession(signal: AbortSignal): Promise<ProcurementSession> {
  let auth: Response;
  try {
    auth = await fetch("/api/hrm/auth/me", { credentials: "include", cache: "no-store", signal });
  } catch {
    return { mode: "unavailable", reason: "ERP sign-in could not be checked." };
  }
  if (!auth.ok) return { mode: "unavailable", reason: "ERP sign-in could not be checked." };

  let body: unknown;
  try {
    body = await auth.json();
  } catch {
    return { mode: "unavailable", reason: "ERP sign-in response was invalid." };
  }
  if (!isObject(body) || typeof body.authenticated !== "boolean")
    return { mode: "unavailable", reason: "ERP sign-in response was invalid." };
  if (!body.authenticated)
    return { mode: "unavailable", reason: "Sign in to ERP to open Procurement." };
  if (
    !isObject(body.user) ||
    typeof body.user.displayName !== "string" ||
    typeof body.user.email !== "string"
  ) {
    return { mode: "unavailable", reason: "ERP user details were invalid." };
  }
  if (body.user.isActive !== true)
    return { mode: "unavailable", reason: "Your ERP account is inactive." };

  try {
    const response = await fetch("/api/procurement/v1/context", {
      credentials: "include",
      cache: "no-store",
      signal,
    });
    if (!response.ok)
      return { mode: "unavailable", reason: "Procurement access could not be verified." };
    const context: unknown = await response.json();
    if (!validContext(context))
      return { mode: "unavailable", reason: "Procurement company access was invalid." };
    const metaResponse = await fetch("/api/procurement/v1/meta", {
      credentials: "include",
      cache: "no-store",
      signal,
    });
    if (!metaResponse.ok)
      return { mode: "unavailable", reason: "Procurement data is not ready." };
    const meta: unknown = await metaResponse.json();
    if (!isObject(meta) || meta.tenantId !== context.tenantId ||
        meta.legalEntityId !== context.legalEntityId || meta.schemaReady !== true ||
        !isObject(meta.capabilities))
      return { mode: "unavailable", reason: "Procurement data is not ready." };
    return {
      mode: "live",
      user: { displayName: body.user.displayName, email: body.user.email, roles: Array.isArray(body.user.roles) ? body.user.roles.filter((role): role is string => typeof role === "string") : [] },
      context,
    };
  } catch {
    return { mode: "unavailable", reason: "Procurement access could not be verified." };
  }
}

export function ProcurementSessionProvider({ children }: { children: ReactNode }) {
  const liveMode = import.meta.env.VITE_PROCUREMENT_LIVE_MODE === "1";
  const [session, setSession] = useState<ProcurementSession>(
    liveMode ? { mode: "loading" } : { mode: "demo" },
  );
  useEffect(() => {
    if (!liveMode) return;
    const controller = new AbortController();
    void detectSession(controller.signal).then((result) => {
      if (!controller.signal.aborted) setSession(result);
    });
    return () => controller.abort();
  }, [liveMode]);
  return <Session.Provider value={session}>{children}</Session.Provider>;
}

export function useProcurementSession() {
  return useContext(Session);
}
