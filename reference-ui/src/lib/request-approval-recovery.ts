/** Only explicit application rejection statuses permit releasing a PR command.
 * Request timeouts, throttling and proxy-specific statuses do not prove rollback. */
export function definiteRequestApprovalRejection(status: number): boolean {
  return [400, 401, 403, 404, 409, 422].includes(status);
}
