import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { entities, workspaces } from "@/mock/data";
import type { Role } from "@/mock/types";

export type ModuleId = "hrm" | "procurement";

interface AppState {
  moduleId: ModuleId;
  setModuleId: (m: ModuleId) => void;
  role: Role;
  setRole: (r: Role) => void;
  entityId: string;
  setEntityId: (id: string) => void;
  branch: string;
  setBranch: (b: string) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  setupComplete: boolean;
  completeSetup: () => void;
  resetSetup: () => void;
  hydrated: boolean;
}

const Ctx = createContext<AppState | null>(null);
// Keep the Procurement demo's role and entity selection separate from the live HRM shell.
const KEY = "erp.procurement.ui.shell.v1";

export function AppProvider({ children }: { children: ReactNode }) {
  const [moduleId, setModuleId] = useState<ModuleId>("hrm");
  const [role, setRole] = useState<Role>("hr_admin");
  const [entityId, setEntityId] = useState(entities[0].id);
  const [branch, setBranch] = useState(entities[0].branches[0]);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [setupComplete, setSetupComplete] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.moduleId) setModuleId(s.moduleId);
        if (s.role) setRole(s.role);
        if (s.entityId) setEntityId(s.entityId);
        if (s.branch) setBranch(s.branch);
        if (s.theme) setTheme(s.theme);
        setSetupComplete(Boolean(s.setupComplete));
      } else if (window.location.pathname.startsWith("/procurement")) {
        setModuleId("procurement");
        setRole("proc_admin");
        setSetupComplete(true);
      }
    } catch {
      /* ignore corrupt local state */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(KEY, JSON.stringify({ moduleId, role, entityId, branch, theme, setupComplete }));
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [moduleId, role, entityId, branch, theme, setupComplete, hydrated]);

  const value = useMemo<AppState>(
    () => ({
      moduleId,
      setModuleId,
      role,
      setRole,
      entityId,
      setEntityId: (id: string) => {
        setEntityId(id);
        const e = entities.find((x) => x.id === id);
        if (e) setBranch(e.branches[0]);
      },
      branch,
      setBranch,
      theme,
      toggleTheme: () => setTheme((t) => (t === "light" ? "dark" : "light")),
      setupComplete,
      completeSetup: () => setSetupComplete(true),
      resetSetup: () => setSetupComplete(false),
      hydrated,
    }),
    [moduleId, role, entityId, branch, theme, setupComplete, hydrated],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

export function useWorkspace() {
  const { role } = useApp();
  return workspaces.find((w) => w.id === role)!;
}

export function useEntity() {
  const { entityId } = useApp();
  return entities.find((e) => e.id === entityId)!;
}

export function useRoleGate() {
  const { role } = useApp();
  return useCallback((allowed?: Role[]) => !allowed || allowed.includes(role), [role]);
}
