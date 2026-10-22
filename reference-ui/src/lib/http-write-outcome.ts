/** Known API rejection statuses; timeout, rate-limit and proxy outcomes stay uncertain. */
export function isDefiniteHttpRejection(status: number): boolean {
  return [400, 401, 403, 404, 409, 422].includes(status);
}
