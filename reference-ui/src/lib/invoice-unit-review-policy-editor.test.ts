import { describe, expect, it } from "vitest";
import { emptyUnitReviewPolicy, parseUnitReviewPolicy, serializeUnitReviewPolicy, unitReviewDate } from "./invoice-unit-review-policy-editor";
const reviewer = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const form = () => ({ stages: [{ code: "CHECK_ORIGINAL", mode: "All" as const, principals: [reviewer] }] });
describe("original-unit review policy contract", () => {
  it("keeps unfinished drafts empty without choosing an approval strategy", () => {
    expect(JSON.parse(serializeUnitReviewPolicy(emptyUnitReviewPolicy()))).toEqual({ schemaVersion: 1, transactionType: "InvoiceUnitReview", stages: [] });
    expect(() => serializeUnitReviewPolicy(emptyUnitReviewPolicy(), true)).toThrow();
    expect(() => serializeUnitReviewPolicy({ stages: [{ code: "ORIGINAL", mode: "One", principals: [] }] }, true)).toThrow();
  });
  it("round trips named Core principals without adding employee fields or deriving reviewers from roles", () => {
    const json = serializeUnitReviewPolicy(form(), true);
    expect(parseUnitReviewPolicy(json)).toEqual(form()); expect(json).not.toContain("worker");
  });
  it("keeps schema 2 ManualAttestation explicit while schema 1 document output stays unchanged", () => {
    const manual = { ...form(), evidenceMode: "ManualAttestation" as const };
    const wire = serializeUnitReviewPolicy(manual, true);
    expect(JSON.parse(wire)).toEqual({ schemaVersion: 2, transactionType: "InvoiceUnitReview", evidenceMode: "ManualAttestation",
      stages: form().stages });
    expect(parseUnitReviewPolicy(wire)).toEqual(manual);
    expect(serializeUnitReviewPolicy(form(), true)).toBe(JSON.stringify({ schemaVersion: 1, transactionType: "InvoiceUnitReview", stages: form().stages }));
    for (const altered of [wire.replace('"ManualAttestation"', '"DocumentReview"'),
      wire.replace('"schemaVersion":2', '"schemaVersion":1'),
      wire.replace('"evidenceMode":"ManualAttestation"', '"evidenceMode":"ManualAttestation","evidenceMode":"ManualAttestation"')])
      expect(parseUnitReviewPolicy(altered)).toBeNull();
  });
  it.each([
    { ...form(), stages: [{ ...form().stages[0], principals: [reviewer, reviewer] }] },
    { stages: [{ ...form().stages[0], principals: [reviewer.toUpperCase()] }] },
    { stages: [{ ...form().stages[0], principals: ["00000000-0000-0000-0000-000000000000"] }] },
    { stages: [{ ...form().stages[0], mode: "" as const }] },
    { stages: [form().stages[0], form().stages[0]] },
  ])("rejects duplicate/invalid IDs, duplicate steps and implicit strategy %#", value => expect(() => serializeUnitReviewPolicy(value)).toThrow());
  it("keeps unsupported, duplicate-property and legacy employee formats read-only", () => {
    for (const json of [JSON.stringify({ ...JSON.parse(serializeUnitReviewPolicy(form())), extra: true }),
      '{"schemaVersion":1,"transactionType":"InvoiceUnitReview","stages":[],"stages":[]}',
      JSON.stringify({ schemaVersion: 1, transactionType: "InvoiceUnitReview", stages: [{ code: "ORIGINAL", mode: "All", workers: [reviewer] }] })])
      expect(parseUnitReviewPolicy(json)).toBeNull();
  });
  it("bounds total assignments and accepts only real UTC dates", () => {
    const principals = Array.from({ length: 32 }, (_, i) => `${String(i + 1).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`);
    expect(() => serializeUnitReviewPolicy({ stages: Array.from({ length: 5 }, (_, i) => ({ code: `STEP_${i}`, mode: "All", principals })) })).toThrow();
    expect(unitReviewDate("2028-02-29")).toBe(true);
    for (const value of ["2026-02-29", "2026-99-01", "2026-1-01", "0000-01-01", "2026-10-22T00:00:00Z"]) expect(unitReviewDate(value)).toBe(false);
  });
});
