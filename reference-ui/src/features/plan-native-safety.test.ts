import { afterEach, describe, expect, it, vi } from "vitest";
import { NativePlanFailure, safeNativeError, safeNativeStep } from "../../tests/normal-cookie/plan-review/safety";
import SafePlanReporter from "../../tests/normal-cookie/plan-review/safe-reporter";
afterEach(() => { vi.restoreAllMocks(); });
describe("native Plan safe failure evidence", () => {
  it("never reads an arbitrary message/stack and retains only fixed name/code", () => {
    const error = new Error();
    Object.defineProperty(error, "message", { get() { throw new Error("Raw message read forbidden"); } });
    Object.defineProperty(error, "stack", { get() { throw new Error("Raw stack read forbidden"); } });
    expect(safeNativeError(error)).toEqual({ name: "Error", code: "BrowserOrHarnessFailure" });
  });
  it("keeps controlled assertions and sanitizes arbitrary step/code strings", () => {
    expect(safeNativeError(new NativePlanFailure("ActualReadStatusMismatch"))).toEqual({ name: "NativePlanFailure", code: "ActualReadStatusMismatch" });
    expect(safeNativeError(new NativePlanFailure("Cookie: not-a-real-secret"))).toEqual({ name: "NativePlanFailure", code: "NativeAssertion" });
    expect(safeNativeStep("owner-current-Core-cookie-admission")).toBe("owner-current-Core-cookie-admission");
    expect(safeNativeStep("Cookie: not-a-real-secret")).toBe("unknown-step");
  });
  it("does not format reporter errors or forward worker transport output", () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true), stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const reporter = new SafePlanReporter(), untrusted = { message: "Cookie: not-a-real-secret", stack: "transport call log" };
    (reporter.onError as (...args: unknown[]) => void)(untrusted);
    (reporter.onStdOut as (...args: unknown[]) => void)(untrusted.message); (reporter.onStdErr as (...args: unknown[]) => void)(untrusted.stack);
    reporter.onTestEnd({} as any, { status: "failed", errors: [untrusted] } as any);
    const emitted = JSON.stringify([...stdout.mock.calls, ...stderr.mock.calls]);
    expect(emitted).not.toContain("not-a-real-secret"); expect(emitted).not.toContain("transport call log"); expect(emitted).toContain("status: failed");
  });
});
