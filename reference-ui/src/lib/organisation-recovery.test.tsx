import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const shell = vi.hoisted(() => ({
  organisationAccess: "anonymous",
  procurementScopeStatus: "selection-required",
  scopeMessage: "Choose your company and branch from Organisation context in the top bar.",
  retryOrganisationLookup: vi.fn(),
}));
vi.mock("./erpShell", () => ({ useErpShell: () => shell }));
import { ProcurementScopeSelectionState } from "./ProcurementLiveGate";
const render = () => renderToStaticMarkup(createElement(ProcurementScopeSelectionState));
describe("organisation recovery actions", () => {
  beforeEach(() => { shell.organisationAccess = "anonymous"; shell.procurementScopeStatus = "selection-required"; });
  it("renders an accessible real sign-in link and shared retry button for anonymous access", () => {
    const html = render();
    expect(html).toContain('href="/sign-in"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Sign in to Procurement");
    expect(html).toContain("Try again</button>");
    expect(html).not.toContain("Choose your branch");
  });
  it("offers retry without a sign-in link for a real permission denial", () => {
    shell.organisationAccess = "forbidden";
    const html = render();
    expect(html).toContain("Ask your administrator");
    expect(html).toContain("Try again</button>");
    expect(html).not.toContain('href="/sign-in"');
  });
  it("keeps the resolving status and branch-selector instructions without recovery buttons", () => {
    shell.organisationAccess = "checking"; shell.procurementScopeStatus = "resolving";
    const html = render();
    expect(html).toContain('role="status"');
    expect(html).toContain("Checking your branch");
    expect(html).not.toContain("Try again");
  });
  it("renders no blocking state for a valid authenticated branch", () => {
    shell.organisationAccess = "authenticated"; shell.procurementScopeStatus = "ready";
    expect(render()).toBe("");
  });
});
