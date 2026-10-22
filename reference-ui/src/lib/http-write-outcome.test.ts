import { describe, expect, it } from "vitest";
import { isDefiniteHttpRejection } from "./http-write-outcome";
describe("write response classification", () => {
  it.each([0, 408, 429, 499, 500, 502, 503, 599])("keeps status %s uncertain", status => {
    expect(isDefiniteHttpRejection(status)).toBe(false);
  });
  it.each([400, 401, 403, 404, 409, 422])("recognizes known API rejection %s", status => {
    expect(isDefiniteHttpRejection(status)).toBe(true);
  });
});
