import { describe, expect, it, vi } from "vitest";
import { fetchShellIdentity, organisationAccessFailure, organisationRecovery, ShellLookupError } from "./organisation-access";
const signal = () => new AbortController().signal;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const scopeMessage = "Choose your company and branch from Organisation context in the top bar.";
async function failedAccess(value: Response) {
  try { await fetchShellIdentity(signal(), vi.fn().mockResolvedValue(value)); }
  catch (error) { return organisationAccessFailure(error); }
  throw new Error("Expected access failure");
}
describe("organisation access recovery", () => {
  it.each([response({}, 401), response({ authenticated: false })])("offers sign in for a missing cookie session without asking for a branch", async value => {
    const access = await failedAccess(value);
    expect(access).toBe("anonymous");
    expect(organisationRecovery(access, "selection-required", scopeMessage)).toMatchObject({
      heading: "Sign in to Procurement", signInHref: "/sign-in", retry: true, resolving: false,
    });
  });
  it("keeps an actual 403 as a permission problem with retry and no sign-in loop", async () => {
    const access = await failedAccess(response({}, 403));
    expect(access).toBe("forbidden");
    expect(organisationRecovery(access, "selection-required", scopeMessage)).toMatchObject({
      heading: "Organisation access unavailable", signInHref: null, retry: true,
    });
  });
  it("does not treat an inactive authenticated account as an anonymous session", async () => {
    expect(await failedAccess(response({ authenticated: true, user: { isActive: false } }))).toBe("forbidden");
  });
  it("offers retry for failed lookups without claiming the user needs to sign in", () => {
    expect(organisationAccessFailure(new TypeError("network"))).toBe("unavailable");
    expect(organisationAccessFailure(new ShellLookupError(503))).toBe("unavailable");
    expect(organisationRecovery("unavailable", "selection-required", scopeMessage)).toMatchObject({
      heading: "Unable to load your organisation", retry: true, signInHref: null,
    });
  });
  it("does not mislabel malformed auth responses as anonymous", async () => {
    expect(await failedAccess(response({ user: { isActive: true } }))).toBe("unavailable");
  });
  it("accepts an active Core account without an employee and preserves cookie/no-store authentication", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ authenticated: true, user: { id: "principal", isActive: true, roles: ["reader"] } }));
    const controller = new AbortController();
    expect(await fetchShellIdentity(controller.signal, fetcher)).toMatchObject({ id: "principal", roles: ["reader"] });
    expect(fetcher).toHaveBeenCalledWith("/api/hrm/auth/me", { credentials: "include", cache: "no-store", signal: controller.signal });
  });
  it("preserves the resolving branch status without premature recovery actions", () => {
    expect(organisationRecovery("checking", "resolving", "Checking the saved branch…")).toEqual({
      heading: "Checking your branch", message: "Checking the saved branch…", signInHref: null, retry: false, resolving: true,
    });
  });
  it("keeps authenticated branch selection in the existing organisation selector", () => {
    expect(organisationRecovery("authenticated", "selection-required", scopeMessage)).toEqual({
      heading: "Choose your branch", message: scopeMessage, signInHref: null, retry: false, resolving: false,
    });
  });
  it("shows no scope-recovery state for a valid authenticated branch", () => {
    expect(organisationRecovery("authenticated", "ready", scopeMessage)).toBeNull();
  });
  it("does not let a saved branch override an anonymous session", () => {
    expect(organisationRecovery("anonymous", "ready", scopeMessage)?.signInHref).toBe("/sign-in");
  });
});
