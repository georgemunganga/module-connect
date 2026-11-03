/** Never serialize an arbitrary Error message/stack or transport call log. */
export class NativePlanFailure extends Error {
  readonly code: string;
  constructor(code: string) { super("Native Plan runner failed; inspect protected safe-code evidence."); this.name = "NativePlanFailure"; this.code = /^[A-Za-z][A-Za-z0-9]{0,79}$/.test(code) ? code : "NativeAssertion"; }
}
export const safeNativeError = (error: unknown) => error instanceof NativePlanFailure ? { name: "NativePlanFailure", code: error.code }
  : { name: error instanceof Error && ["TimeoutError", "TypeError", "Error"].includes(error.name) ? error.name : "Error", code: "BrowserOrHarnessFailure" };
export const safeNativeStep = (step: unknown) => typeof step === "string" && /^[A-Za-z0-9-]{1,100}$/.test(step) ? step : "unknown-step";
