/** Locator metadata only: never a decision reason, request payload or authentication credential. */
export type ApprovalOperation = "Open" | "Decide";
export type ApprovalJournalScope = { tenantId: string; principalId: string; companyId: string;
  branchId: string | null; browserTabNonce: string };
export type ApprovalLocator = { locatorSchemaVersion: 1; operation: ApprovalOperation; key: string;
  requestId: string; caseId: string | null; assignmentId: string | null; expectedRequestVersion: number;
  expectedCaseVersion: number | null; expectedAssignmentVersion: number | null; fingerprint: string };
