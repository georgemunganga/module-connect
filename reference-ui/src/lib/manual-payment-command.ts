import { sendManualPaymentCommand, validateManualPaymentCommand,
  type ManualPaymentCommand, type ManualPaymentScope } from "../../../src/platform/procurement-manual-payments-api";
import { createManualPaymentRecoveryJournal, type ManualPaymentRecoveryLocator } from "./manual-payment-command-journal";

/** One user-initiated mutation. Unknown outcomes always retain their original key.
 * No error path retries, changes keys or silently clears the pending command. */
export async function sendManualPaymentOnce(scope: ManualPaymentScope,
  journal: ReturnType<typeof createManualPaymentRecoveryJournal>, command: ManualPaymentCommand) {
  scope.assertCurrent();
  validateManualPaymentCommand(command);
  const locator: ManualPaymentRecoveryLocator = { key: command.key, action: command.action,
    id: command.action === "Create" ? null : command.id };
  if (!journal.claim(locator)) throw new Error("Check the saved command before starting another payment action.");
  try {
    const receipt = await sendManualPaymentCommand(scope, command);
    if (!journal.confirm(locator, receipt)) throw new Error("The payment result needs recovery before another action.");
    return receipt;
  } catch (cause) {
    journal.reportValidation(locator, cause, command);
    throw cause;
  }
}
