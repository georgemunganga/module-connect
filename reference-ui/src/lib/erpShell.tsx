import { flushSync } from "react-dom";
import { fetchVerifiedOrganisationContext, type VerifiedOrganisationContext } from "./verified-organisation-context";
import { observeAuthContext } from "./auth-context-invalidation";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, useRef, type ReactNode } from "react";
import { applyBranding, readBrandingCache, saveBrandingCache } from "../../../shared/branding";
import { ERP_SHELL_STORAGE_KEY } from "../../../shared/shell-scope";
import { canonicalScopeId, resolveLegacyBranchSelection } from "./legacy-branch-selection";
import { parseCoreWorkspaceChoices } from "./core-workspace-choices";

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
  authEpoch: number;
  branding: Branding | null;
  entities: Entity[];
  branches: Branch[];
  selection: ShellSelection;
  contextAvailable: boolean;
  procurementScopeStatus: "ready" | "resolving" | "selection-required";
  scopeMessage: string;
  verifiedContext: VerifiedOrganisationContext | null;
  assignedRoles: string[];
  selectEntity: (id: string) => void;
  selectBranch: (id: string, entityId: string) => void;
};

const SHELL_KEY = ERP_SHELL_STORAGE_KEY;
const SESSION_KEY = "erp.oidc.session";
class ShellLookupError extends Error { constructor(readonly status: number) { super("Organisation choices unavailable."); } }
const ShellContext = createContext<ErpShellContext | null>(null);
function readSelection(): ShellSelection {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SHELL_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value as ShellSelection : {};
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
  const authGeneration=useRef(0);
  const [authEpoch,setAuthEpoch]=useState(0);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selection, setSelection] = useState<ShellSelection>(readSelection);
  const [contextAvailable, setContextAvailable] = useState(false);
  const [assignedRoles, setAssignedRoles] = useState<string[]>([]);
  const [lookupFinished, setLookupFinished] = useState(false);
  const [storageFailure, setStorageFailure] = useState<string | null>(null);
  const [lookupDenied, setLookupDenied] = useState(false);
  const [selectorDenied, setSelectorDenied] = useState(false);
  const [verifiedSelection, setVerifiedSelection] = useState<{ key: string; value: VerifiedOrganisationContext } | null>(null);
  const verifiedKey = JSON.stringify([authEpoch, selection.entityId ?? "", selection.branch ?? ""]);
  const currentVerifiedKey = useRef(verifiedKey); currentVerifiedKey.current = verifiedKey;
  const verifiedContext = verifiedSelection?.key === verifiedKey ? verifiedSelection.value : null;

  useEffect(()=>observeAuthContext(window,()=>{
    authGeneration.current+=1;
    flushSync(()=>{setAuthEpoch(authGeneration.current);setAssignedRoles([]);setEntities([]);setBranches([]);setContextAvailable(false);setLookupFinished(false);setLookupDenied(false);setSelectorDenied(false);setVerifiedSelection(null);});
  }),[]);

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
    const epoch=authEpoch;
    const token = accessToken();
    const controller = new AbortController();
    const current = () => !controller.signal.aborted && epoch === authGeneration.current;
    const request = async (path: string) => {
      const response = await fetch(path, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new ShellLookupError(response.status);
      return response.json() as Promise<unknown>;
    };
    const load = async () => {
      try {
        const auth = await fetch("/api/hrm/auth/me", { credentials: "include", cache: "no-store",
          signal: controller.signal });
        if (!auth.ok) throw new ShellLookupError(auth.status);
        const body: unknown = await auth.json();
        if (!body || typeof body !== "object" || (body as { authenticated?: unknown }).authenticated !== true
          || (body as { user?: { isActive?: unknown } }).user?.isActive !== true)
          throw new ShellLookupError(403);
        const user = (body as { user: { id?: unknown; roles?: unknown } }).user;
        if (!current()) return;
        setAssignedRoles(Array.isArray(user.roles)
          ? user.roles.filter((role): role is string => typeof role === "string") : []);

        let core: Response;
        try { core = await fetch("/api/core/v1/workspace-context", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: "include", cache: "no-store", signal: controller.signal,
        }); } catch { throw new ShellLookupError(503); }
        if (!current()) return;
        if (core.ok) {
          const choices = parseCoreWorkspaceChoices(await core.json(), String(user.id ?? ""));
          if (!current()) return;
          setEntities(choices.companies.map(company => ({ id: company.id,
            name: company.registeredName, code: company.code })));
          setBranches(choices.branches.map(branch => ({ id: branch.id,
            name: branch.name, legalEntityId: branch.legalEntityId })));
          setLookupDenied(false); setSelectorDenied(false); setContextAvailable(true);
          const saved = readSelection();
          if (!saved.entityId) {
            const preferred = choices.companies.find(company => company.isDefault);
            if (preferred) {
              const next = { ...saved, entityId: preferred.id, branch: "" };
              try { localStorage.setItem(SHELL_KEY, JSON.stringify(next)); setStorageFailure(null); setSelection(next); }
              catch { setStorageFailure(JSON.stringify([epoch, saved.entityId ?? "", saved.branch ?? ""])); }
            }
          }
          return;
        }
        if (core.status !== 404) throw new ShellLookupError(core.status);
        // Older Core hosts retain the existing administrator/context selector.
        const results = await Promise.allSettled([
          request("/api/hrm/admin/legal-entities"),
          request("/api/hrm/admin/locations"),
          request("/api/hrm/shell/"),
        ]);
        if (!current()) return;
        if (!results.every(result => result.status === "fulfilled")) {
          const coreDenied = results.slice(0, 2).some(result => result.status === "rejected"
            && result.reason instanceof ShellLookupError && result.reason.status === 403);
          const onlyForbiddenFailures = results.every(result => result.status === "fulfilled"
            || result.reason instanceof ShellLookupError && result.reason.status === 403);
          setLookupDenied(coreDenied && onlyForbiddenFailures);
          return;
        }
        const [entityData, branchData, shellData] = results.map(result => result.status === "fulfilled" ? result.value : undefined);
        setLookupDenied(false); setSelectorDenied(false);
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
      } catch {
        if (current()) { setSelectorDenied(true); setLookupDenied(false); setContextAvailable(false);
          setEntities([]); setBranches([]); }
      } finally { if (current()) setLookupFinished(true); }
    };
    void load();
    return () => controller.abort();
  }, [authEpoch]);

  useEffect(() => {
    if (!lookupDenied) { setVerifiedSelection(null); return; }
    const controller = new AbortController();
    const capturedKey = verifiedKey;
    // A legacy label is never sent as an ID or automatically replaced with the
    // server's default branch. This request supplies display/explicit choices only.
    const capturedSelection = { entityId: selection.entityId,
      branch: canonicalScopeId(selection.branch) ? selection.branch : undefined };
    setVerifiedSelection(null);
    fetchVerifiedOrganisationContext(capturedSelection, controller.signal, fetch, accessToken())
      .then(value => {
        if (!controller.signal.aborted && currentVerifiedKey.current === capturedKey)
          setVerifiedSelection({ key: capturedKey, value });
      })
      .catch(() => { /* A denied or invalid context never becomes a selectable organisation. */ });
    return () => controller.abort();
  }, [lookupDenied, verifiedKey, selection.entityId, selection.branch, authEpoch]);

  const selectionKey = JSON.stringify([authEpoch, selection.entityId ?? "", selection.branch ?? ""]);
  const resolution = resolveLegacyBranchSelection(selection, branches,
    contextAvailable ? "ready" : lookupFinished ? "unavailable" : "loading");
  const failedStorage = storageFailure === selectionKey;
  const validSelection = !contextAvailable || (!selection.entityId || entities.some(entity => entity.id === selection.entityId))
    && (!selection.branch || branches.some(branch => branch.id === selection.branch
      && branch.legalEntityId === selection.entityId));
  const procurementScopeStatus = !lookupFinished ? "resolving"
    : failedStorage || selectorDenied || !validSelection ? "selection-required"
    : resolution.kind === "ready" ? "ready" : resolution.kind === "waiting" || resolution.kind === "canonicalize" ? "resolving" : "selection-required";
  const scopeMessage = selectorDenied ? "Your ERP account could not open verified organisation choices. Sign in again or contact your administrator."
    : failedStorage ? "Your branch could not be saved in this browser. Allow local storage, then choose your branch again."
    : !validSelection ? "Your saved company or branch is no longer available to this ERP account. Choose an authorised organisation context."
    : procurementScopeStatus === "resolving" ? "Checking the branch saved by your ERP workspace…"
      : "Choose your company and branch from Organisation context in the top bar. Your saved branch could not be matched safely, so no purchase records have been opened or changed.";
  useEffect(() => {
    if (resolution.kind !== "canonicalize" || failedStorage) return;
    const epoch = authEpoch;
    const current = readSelection();
    if (epoch !== authGeneration.current) return;
    if (current.entityId !== selection.entityId || current.branch !== selection.branch) { setSelection(current); return; }
    const next = { ...current, branch: resolution.branchId };
    try { localStorage.setItem(SHELL_KEY, JSON.stringify(next)); setStorageFailure(null); setSelection(next); }
    catch { setStorageFailure(selectionKey); }
  }, [authEpoch, selectionKey, resolution.kind, resolution.kind === "canonicalize" ? resolution.branchId : "", failedStorage]);
  const updateSelection = (next: ShellSelection) => {
    try { localStorage.setItem(SHELL_KEY, JSON.stringify(next)); setStorageFailure(null); setSelection(next); }
    catch { setStorageFailure(selectionKey); }
  };
  const value = useMemo<ErpShellContext>(() => ({
    authEpoch,branding, entities, branches, selection, contextAvailable, procurementScopeStatus, scopeMessage, verifiedContext, assignedRoles,
    selectEntity: (id) => updateSelection({ ...selection, entityId: id, branch: "" }),
    selectBranch: (id, entityId) => updateSelection({ ...selection, entityId, branch: id }),
  }), [authEpoch,branding, entities, branches, selection, contextAvailable, procurementScopeStatus, scopeMessage, verifiedContext, assignedRoles]);
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
