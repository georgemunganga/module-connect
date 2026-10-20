import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { applyBranding, readBrandingCache, saveBrandingCache } from "../../../shared/branding";
import { ERP_SHELL_STORAGE_KEY } from "../../../shared/shell-scope";

type Branding = {
  displayName: string;
  fontFamily?: string;
  primaryColor?: string;
  primaryForegroundColor?: string;
  buttonColor?: string;
  buttonForegroundColor?: string;
  secondaryColor?: string;
  secondaryForegroundColor?: string;
  accentColor?: string;
  accentForegroundColor?: string;
  railColor?: string;
  railForegroundColor?: string;
  railMutedColor?: string;
  railActiveColor?: string;
  logoLightDataUri?: string | null;
  logoDarkDataUri?: string | null;
  faviconDataUri?: string | null;
};

type Entity = { id: string; name: string; code: string };
type Branch = { id: string; name: string; legalEntityId: string };
type ShellSelection = { entityId?: string; branch?: string; [key: string]: unknown };
type ErpShellContext = {
  branding: Branding | null;
  entities: Entity[];
  branches: Branch[];
  selection: ShellSelection;
  contextAvailable: boolean;
  assignedRoles: string[];
  selectEntity: (id: string) => void;
  selectBranch: (id: string, entityId: string) => void;
};

const SHELL_KEY = ERP_SHELL_STORAGE_KEY;
const SESSION_KEY = "erp.oidc.session";
const ShellContext = createContext<ErpShellContext | null>(null);
function readSelection(): ShellSelection {
  try {
    return JSON.parse(localStorage.getItem(SHELL_KEY) || "{}") as ShellSelection;
  } catch {
    return {};
  }
}

function accessToken(): string | null {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null") as { accessToken?: string; expiresAt?: number } | null;
    return session?.accessToken && (!session.expiresAt || session.expiresAt > Date.now()) ? session.accessToken : null;
  } catch {
    return null;
  }
}

function rows(value: unknown): Record<string, unknown>[] {
  const list = Array.isArray(value) ? value : (value as { items?: unknown[] } | null)?.items;
  return Array.isArray(list) ? list.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
}

export function ErpShellProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selection, setSelection] = useState<ShellSelection>(readSelection);
  const [contextAvailable, setContextAvailable] = useState(false);
  const [assignedRoles, setAssignedRoles] = useState<string[]>([]);

  useLayoutEffect(() => {
    const cached = readBrandingCache();
    if (cached && typeof cached.displayName === "string") {
      applyBranding(cached);
      setBranding(cached as Branding);
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === "erp.company-branding.v1") {
        const next = readBrandingCache();
        if (next && typeof next.displayName === "string") setBranding(next as Branding);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/hrm/auth/me", { credentials: "include", cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((body: { authenticated?: boolean; user?: { roles?: unknown } }) => {
        if (body.authenticated && Array.isArray(body.user?.roles)) setAssignedRoles(body.user.roles.filter((role): role is string => typeof role === "string"));
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === SHELL_KEY) setSelection(readSelection());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const startedAt = Date.now();
    const timeout = window.setTimeout(() => controller.abort(), 3000);
    const overlay = document.getElementById("erp-global-preloader");
    let revealTimer: number | undefined;
    const reveal = () => {
      if (!overlay || revealTimer !== undefined) return;
      const image = document.getElementById("erp-preloader-logo") as HTMLImageElement | null;
      const visibleAt = Number(image?.dataset.readyAt) || startedAt;
      revealTimer = window.setTimeout(() => {
        overlay.classList.add("is-leaving");
        window.setTimeout(() => overlay.remove(), 280);
      }, Math.max(0, 550 - (Date.now() - visibleAt)));
    };
    if (readBrandingCache()) reveal();
    fetch("/api/hrm/branding", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<Branding> : Promise.reject())
      .then((value) => {
        if (!active) return;
        applyBranding(value);
        saveBrandingCache(value);
        setBranding(value);
      })
      .catch(() => {})
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) reveal();
      });
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); if (revealTimer !== undefined) window.clearTimeout(revealTimer); };
  }, []);

  useEffect(() => {
    if (!branding) return;
    applyBranding(branding);
    document.title = `Procurement · ${branding.displayName}`;
  }, [branding]);

  useEffect(() => {
    const token = accessToken();
    const controller = new AbortController();
    const request = async (path: string) => {
      const response = await fetch(path, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Context unavailable: ${response.status}`);
      return response.json() as Promise<unknown>;
    };
    Promise.all([
      request("/api/hrm/admin/legal-entities"),
      request("/api/hrm/admin/locations"),
      request("/api/hrm/shell/"),
    ]).then(([entityData, branchData, shellData]) => {
      const scope = shellData as { assignedLocationIds?: string[]; confined?: boolean };
      const allowed = new Set(scope.assignedLocationIds ?? []);
      setEntities(rows(entityData).map((row) => ({
        id: String(row.id ?? ""),
        name: String(row.registeredName ?? row.tradingName ?? row.name ?? "Organisation"),
        code: String(row.code ?? ""),
      })).filter((row) => row.id));
      setBranches(rows(branchData).map((row) => ({
        id: String(row.id ?? ""),
        name: String(row.name ?? "Branch"),
        legalEntityId: String(row.legalEntityId ?? ""),
      })).filter((row) => row.id && (!scope.confined || allowed.has(row.id))));
      setContextAvailable(true);
    }).catch(() => {});
    return () => controller.abort();
  }, []);

  const updateSelection = (next: ShellSelection) => {
    localStorage.setItem(SHELL_KEY, JSON.stringify(next));
    setSelection(next);
  };
  const value = useMemo<ErpShellContext>(() => ({
    branding, entities, branches, selection, contextAvailable, assignedRoles,
    selectEntity: (id) => updateSelection({ ...selection, entityId: id, branch: "" }),
    selectBranch: (id, entityId) => updateSelection({ ...selection, entityId, branch: id }),
  }), [branding, entities, branches, selection, contextAvailable, assignedRoles]);
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useErpShell() {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useErpShell requires ErpShellProvider");
  return value;
}

export function BrandMark({ onDark = false, showName = true }: { onDark?: boolean; showName?: boolean }) {
  const { branding } = useErpShell();
  const logo = onDark
    ? branding?.logoLightDataUri || branding?.logoDarkDataUri
    : branding?.logoDarkDataUri || branding?.logoLightDataUri;
  return <>
    {logo?.startsWith("data:image/")
      ? <img src={logo} alt="" className="h-8 w-auto max-w-32 object-contain" />
      : <span className={`grid size-8 shrink-0 place-items-center rounded-md text-xs font-bold ${onDark ? "bg-white/15 text-white" : "bg-primary text-primary-foreground"}`}>ERP</span>}
    {showName && <span className="max-w-44 truncate whitespace-nowrap text-sm font-semibold">{branding?.displayName || "ERP workspace"}</span>}
  </>;
}
