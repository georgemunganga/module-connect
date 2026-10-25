import { type Page } from "@playwright/test";

export const companyId = "11111111-1111-4111-8111-111111111111";
export const branchId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
export const workerId = "22222222-2222-4222-8222-222222222222";
export const requestId = "77777777-7777-4777-8777-777777777777";
export const lineId = "88888888-8888-4888-8888-888888888888";
export const catalogEntryId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const catalogItemId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const catalogSupplierId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const capabilities = Object.fromEntries([
  "vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft",
  "configurationDraft", "contractDraft", "sourcingDraft",
].map((key) => [key, key === "requestDraft"]));
type RecordValue = Record<string, unknown> & { id: string; version: number; purpose: string; status: string; lines: Record<string, unknown>[] };

export async function mockErp(page: Page, options: { denyList?: boolean; staleUpdate?: boolean; confirmedBudget?: boolean; matchedPolicy?: boolean; policyReviewer?: boolean; blockedPolicy?: boolean; changedRouteLines?: boolean; oldEditContract?: boolean; missingCatalogExact?: boolean; permissions?: string[]; seedDraft?: boolean; seedPurpose?: string } = {}) {
  let record: RecordValue | null = options.seedDraft ? { id: requestId, number: "PR-001", version: 1, purpose: options.seedPurpose || "Office chairs", status: "Draft", currencyCode: "ZMW", createdAt: "2026-10-18T00:00:00Z", lines: [{ id: lineId, lineNumber: 1, approvalStatus: "Pending", description: "Office chair", unitCode: "each", requestedQuantity: 1, estimatedUnitPrice: 250 }] } : null;
  let policyChecked = false;
  let policyBlocked = Boolean(options.blockedPolicy);
  await page.addInitScript((entityId) => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId })), companyId);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: "Requester", email: "requester@example.test", roles: [options.policyReviewer ? "procurement_manager" : "employee"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/core/v1/workspace-context") return json({ schemaVersion: 1,
      tenantId: "amizo", principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", organisationWide: false,
      companies: [{ id: companyId, code: "AMIZO", registeredName: "Amizo Power", currency: "ZMW", isDefault: true }],
      branches: [{ id: branchId, code: "HQ", name: "Lusaka", legalEntityId: companyId, type: "Headquarters" }] });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: companyId, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [{ id: branchId, name: "Lusaka", legalEntityId: companyId }] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenantId: "amizo", legalEntityId: companyId, workerId: null,
      permissions: options.permissions ?? ["procurement-access", "procurement-request-read", "procurement-request-create", "procurement-request-edit", "procurement-request-submit",
        ...(options.policyReviewer ? ["procurement-policy-evaluate", "procurement-request-return"] : [])],
      company: { id: companyId, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" }, branch: { id: branchId } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: companyId, schemaReady: true, capabilities });
    if (path === "/api/procurement/v1/catalog") return json({ items: [{
      entryId: catalogEntryId, itemId: catalogItemId, supplierId: catalogSupplierId,
      code: "CHAIR-1", name: "Office chair", kind: "Goods", categoryCode: "OFFICE",
      unitCode: "each", estimatedUnitPrice: 250, exactEstimatedUnitPrice: options.missingCatalogExact ? undefined : "250", currencyCode: "ZMW",
      supplierName: "Office Supply", publishedVersion: 1,
    }], total: 1, page: 1, pageSize: 25 });
    if (path === "/api/procurement/v1/requests/policy-queue")
      return json({ records: record?.status === "Submitted" && !policyChecked ? [{
        id: requestId, number: record.number, purpose: record.purpose,
        currencyCode: record.currencyCode, submittedAt: record.submittedAt,
        version: record.version, lineCount: record.lines.length,
        estimatedBaseAmount: record.lines.reduce((sum, line) => sum + Number(line.requestedQuantity) * Number(line.estimatedUnitPrice), 0),
        policyOutcome: policyBlocked ? "Blocked" : null,
        policyResultCode: policyBlocked ? "InactiveReference" : null,
      }] : [], count: record?.status === "Submitted" && !policyChecked ? 1 : 0, limit: 50, offset: 0 });
    if (path === "/api/procurement/v1/requests") {
      if (request.method() === "GET") return options.denyList ? json({ message: "Forbidden" }, 403) : json({ records: record ? [{ ...record, lineCount: record.lines.length }] : [], count: record ? 1 : 0, limit: 50, offset: 0 });
      if (request.method() === "POST") {
        const input = request.postDataJSON();
        record = { ...input, id: requestId, number: "PR-001", status: "Draft", version: 1, requestEditVersion: 1, currencyCode: input.currencyCode || "ZMW", createdAt: "2026-10-18T00:00:00Z",
          lines: input.lines.map((line: Record<string, unknown>, index: number) => ({ ...line, requestedQuantity: Number(line.requestedQuantity), estimatedUnitPrice: Number(line.estimatedUnitPrice),
            discountPercent: line.discountPercent == null ? null : Number(line.discountPercent), exactAmounts: { requestedQuantity: String(line.requestedQuantity), estimatedUnitPrice: String(line.estimatedUnitPrice), discountPercent: line.discountPercent == null ? null : String(line.discountPercent) }, id: index ? "99999999-9999-4999-8999-999999999999" : lineId, lineNumber: index + 1, approvalStatus: "Pending" })) };
        return json(record, 201);
      }
    }
    if (path === `/api/procurement/v1/requests/${requestId}` && record) {
      if (request.method() === "GET") return json(options.oldEditContract ? { ...record, requestEditVersion: undefined } : record);
      if (request.method() === "PUT") {
        if (options.staleUpdate) return json({ message: "Refresh this request before saving changes." }, 409);
        const input = request.postDataJSON();
        if (input.version !== record.version) return json({ message: "Stale version" }, 409);
        record = { ...record, ...input, version: input.version + 1,
          lines: input.lines.map((line: Record<string, unknown>, index: number) => ({ ...line, requestedQuantity: Number(line.requestedQuantity), estimatedUnitPrice: Number(line.estimatedUnitPrice),
            discountPercent: line.discountPercent == null ? null : Number(line.discountPercent), exactAmounts: { requestedQuantity: String(line.requestedQuantity), estimatedUnitPrice: String(line.estimatedUnitPrice), discountPercent: line.discountPercent == null ? null : String(line.discountPercent) }, id: line.id || (index ? "99999999-9999-4999-8999-999999999999" : lineId), lineNumber: index + 1, approvalStatus: "Pending" })) };
        if (record.lines.every((line) => line.categoryCode !== "UNKNOWN")) policyBlocked = false;
        return json(record);
      }
    }
    if (path === `/api/procurement/v1/requests/${requestId}/review` && record)
      return record.status === "Submitted" ? json(record) : json({ message: "Request not available for review." }, 404);
    if (path === `/api/procurement/v1/requests/${requestId}/approval-readiness` && record) {
      const blockers = [
        ...(!options.matchedPolicy && !policyChecked || policyBlocked ? ["BuyingRulesNotMatched"] : []),
        ...(!options.confirmedBudget ? ["FinanceReservationNotConfirmed"] : []),
        ...(options.changedRouteLines ? ["PinnedDecisionLinesChanged"] : []),
      ];
      return json({ requestId, requestVersion: record.version, estimatedAmount: 250,
        currencyCode: record.currencyCode, prerequisitesMet: blockers.length === 0,
        blockers, isAuthority: false, canOpenCase: false,
        approvalRoute: { hasSingleRoute: !options.changedRouteLines,
          blockers: options.changedRouteLines ? ["PinnedDecisionLinesChanged"] : [],
          lines: options.changedRouteLines ? [] : [{ lineId: record.lines[0]?.id,
          stages: [{ code: "NEED", assignee: "LineManager", mode: "One" }] }] },
        assignmentPlan: { resolved: !options.changedRouteLines, blockers: [],
          stages: options.changedRouteLines ? [] : [{ code: "NEED", assigneeKind: "LineManager",
            mode: "One", blocker: null,
            candidates: [{ subjectId: "manager-1", displayName: "Jane Manager" }] }] },
        nextStep: "An independent approver is still required." });
    }
    if (path === `/api/procurement/v1/requests/${requestId}/withdraw` && record) {
      const { version, reason } = request.postDataJSON();
      if (version !== record.version) return json({ message: "Refresh this request." }, 409);
      if (record.status === "Submitted" && !reason) return json({ message: "Give a withdrawal reason." }, 422);
      record = { ...record, status: "Withdrawn", version: record.version + 1 };
      return json(record);
    }
    if (path === `/api/procurement/v1/requests/${requestId}/return-for-changes` && record) {
      const { version, reason } = request.postDataJSON();
      if (record.status !== "Submitted" || version !== record.version) return json({ message: "Refresh this request." }, 409);
      if (!reason?.trim()) return json({ message: "Explain what should change." }, 422);
      if (options.confirmedBudget) return json({ code: "budget-reservation-active", message: "Finance must release the confirmed reservation." }, 409);
      record = { ...record, status: "ReturnedForChanges", approvalState: "ReturnedForChanges",
        returnReason: reason, returnedAt: "2026-10-19T15:00:00Z", version: record.version + 1 };
      return json(record);
    }
    if (path === `/api/procurement/v1/requests/${requestId}/submit` && record) {
      const { version } = request.postDataJSON();
      if (version !== record.version || !["Draft", "ReturnedForChanges"].includes(record.status)) return json({ message: "Refresh this request." }, 409);
      if (!record.neededBy && record.lines.some((line) => !line.neededBy))
        return json({ message: "Choose a needed-by date." }, 422);
      record = { ...record, status: "Submitted", approvalState: "PendingPolicyAndBudget",
        returnReason: null, returnedAt: null, submittedAt: "2026-10-19T00:00:00Z", version: record.version + 1 };
      return json(record);
    }
    if (path === `/api/procurement/v1/requests/${requestId}/budget-status` && record)
      return json({ requestId, requestVersion: record.version, status: options.confirmedBudget ? "Available" : "Pending",
        checkedAt: options.confirmedBudget ? "2026-10-19T14:00:00Z" : null, reservationConfirmed: Boolean(options.confirmedBudget) });
    if (path === `/api/procurement/v1/requests/${requestId}/policy-evaluations` && record) {
      if (request.postDataJSON().requestVersion !== record.version) return json({ message: "Refresh request." }, 409);
      policyChecked = true;
      return json({ requestId, requestVersion: record.version, status: "Matched", isAuthority: false,
        message: "Buying rules matched. Funding and independent approvals are still required.",
        evaluation: { id: "99999999-9999-4999-8999-999999999999", outcome: "Matched", resultCode: "RulesMatched" } });
    }
    if (path === `/api/procurement/v1/requests/${requestId}/policy-status` && record)
      return json({ requestId, requestVersion: record.version,
        status: record.status !== "Submitted" ? "NotSubmitted" : policyBlocked ? "Blocked" : options.matchedPolicy || policyChecked ? "Matched" : "Pending", isAuthority: false,
        evaluation: policyBlocked ? { summary: "Buying rules need correction before this request can proceed.",
          resultCode: "InactiveReference", policyVersionNumber: 1, evaluatedAt: "2026-10-19T14:00:00Z" }
          : options.matchedPolicy || policyChecked ? { summary: "Buying rules matched. Funding and independent approvals are still required.",
          resultCode: "RulesMatched", policyVersionNumber: 1, evaluatedAt: "2026-10-19T14:00:00Z" } : null });
    return json({ message: `Unexpected route: ${path}` }, 404);
  });
}
