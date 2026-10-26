export type OrganisationAccess = "checking" | "authenticated" | "anonymous" | "forbidden" | "unavailable";
export type ProcurementScopeStatus = "ready" | "resolving" | "selection-required";

export class ShellLookupError extends Error {
  constructor(readonly status: number) { super("Organisation choices unavailable."); }
}

/** A missing session is different from an authenticated account lacking permission. */
export async function fetchShellIdentity(signal: AbortSignal, fetcher: typeof fetch = fetch) {
  const response = await fetcher("/api/hrm/auth/me", {
    credentials: "include", cache: "no-store", signal,
  });
  if (!response.ok) throw new ShellLookupError(response.status);
  const body: unknown = await response.json();
  if (body && typeof body === "object" && (body as { authenticated?: unknown }).authenticated === false)
    throw new ShellLookupError(401);
  if (!body || typeof body !== "object" || (body as { authenticated?: unknown }).authenticated !== true)
    throw new ShellLookupError(503);
  const user = (body as { user?: { id?: unknown; isActive?: unknown; roles?: unknown } }).user;
  if (user?.isActive === false) throw new ShellLookupError(403);
  if (user?.isActive !== true) throw new ShellLookupError(503);
  return user;
}

export function organisationAccessFailure(error: unknown): OrganisationAccess {
  return error instanceof ShellLookupError && error.status === 401 ? "anonymous"
    : error instanceof ShellLookupError && error.status === 403 ? "forbidden" : "unavailable";
}

export function organisationRecovery(access: OrganisationAccess, scope: ProcurementScopeStatus, scopeMessage: string) {
  if (access === "anonymous") return {
    heading: "Sign in to Procurement", message: "Sign in to your ERP account to choose a company and branch.",
    signInHref: "/sign-in", retry: true, resolving: false,
  };
  if (access === "forbidden") return {
    heading: "Organisation access unavailable", message: "Your account cannot open company and branch choices. Ask your administrator to check your access.",
    signInHref: null, retry: true, resolving: false,
  };
  if (access === "unavailable") return {
    heading: "Unable to load your organisation", message: "Your company and branch choices could not be loaded. Try again.",
    signInHref: null, retry: true, resolving: false,
  };
  if (scope === "ready") return null;
  return {
    heading: scope === "resolving" ? "Checking your branch" : "Choose your branch", message: scopeMessage,
    signInHref: null, retry: false, resolving: scope === "resolving",
  };
}
