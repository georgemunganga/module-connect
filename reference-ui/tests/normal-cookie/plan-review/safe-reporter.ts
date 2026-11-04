import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
/** Never format TestError/message/stack or forward worker transport stdout/stderr. */
export default class SafePlanReporter implements Reporter {
  printsToStdio() { return true; }
  onTestEnd(_test: TestCase, result: TestResult) {
    const status = ["passed", "failed", "timedOut", "skipped", "interrupted"].includes(result.status) ? result.status : "failed";
    process.stdout.write(`Native Plan browser status: ${status}. Inspect protected progress and outer cleanup receipts.\n`);
  }
  onError() { process.stderr.write("Native Plan runner error. Inspect protected progress and outer cleanup receipts.\n"); }
  onStdOut() { /* No transport or credential-bearing worker output forwarding. */ }
  onStdErr() { /* No transport or credential-bearing worker output forwarding. */ }
}
