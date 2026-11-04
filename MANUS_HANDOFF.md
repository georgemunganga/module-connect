# Manus handoff moved to the ERP repository

The authoritative instructions are now in [georgemunganga/erp — MANUS_HANDOFF.md](https://github.com/georgemunganga/erp/blob/main/MANUS_HANDOFF.md).

Track milestones and open the coordination draft PR in the **ERP repository**. Read its task file for the implementation branch and owned files. Do not follow the earlier independent coordination instructions preserved in this file's Git history.

This repository remains the source of the existing Procurement frontend where the ERP handoff explicitly references it. The live ERP already has that UI; no rebuild, duplicate import or repository consolidation is assigned. Link any necessary UI PR to the ERP task PR.

ERP progress log: [docs/collaboration/manus/STATUS.md](https://github.com/georgemunganga/erp/blob/main/docs/collaboration/manus/STATUS.md).

## Frontend delivery: retained payment review, 2026-11-03

[Payment retained-read handoff](reference-ui/docs/PAYMENT_RETAINED_READ_20261103.md) records the frontend integration against merged ERP PR 156 / issue 155, scoped gates, recovery behavior and verification. The authoritative ERP handoff and Root-owned native acceptance/release still apply.

## Frontend delivery: purchase plan review, 2026-11-04

[Plan review action map](reference-ui/docs/PLAN_REVIEW_ACTION_MAP_20261103.md) and [private native acceptance record](reference-ui/docs/PLAN_REVIEW_NATIVE_ACCEPTANCE_20261104.md) record the existing Plans/Approvals integration for [ERP issue172](https://github.com/georgemunganga/erp/issues/172), backend PR171 and UI PR103. Product `3e2783b1` passed26 affected tests, strict harness TypeScript and the LIVE build. Harness `830f2813` then passed the actual normal-Core-cookie four-command journey, reviewer owner-endpoint403, retained snapshot/history and independent owner/session/process cleanup; the earlier zero-command failure is preserved. The browser used backend `6e85bdc8`; the later `c93e8df4` code separately passed551 Host tests and compiled/current-provider compatibility checks. ERP PR171 is merged at published main `c02f90a33fbce0983a8520d643098c1662a0ded5` with the exact tested backend tree; unchanged genuine-SQL retention/privilege-negative proof is separate from those runtime checks. Image `8fa2f598` is built, but fresh-backup/schema/paired cutover and production verification remain Root-owned and pending. No production policy activation, policy-settings browser acceptance, whole-module UAT or issue145 closure is claimed. Keep the UI draft unmerged/undeployed until Root reviews the paired release. The authoritative ERP handoff remains controlling.

## Frontend source task: RFQ evaluation planning, 2026-11-03

[RFQ round-plan action map](reference-ui/docs/RFQ_ROUND_PLAN_ACTION_MAP_20261103.md) tracks [ERP issue173](https://github.com/georgemunganga/erp/issues/173) and backend draft PR165. The draft now mounts the original-card form/evidence components, round-only RFQ discovery and scoped actions/people lookup against Root’s approved successor DTO shapes. Field-by-field comparison with backend `fcb1ef6b` is complete; backend SDK/native acceptance remains pending. Initial 115 checks and three separate date checks are retained; binding 122 and affected precision 25 checks passed in separate cohorts. Final build/browser/native acceptance remains pending. Keep the UI draft unmerged and undeployed until Root completes the paired acceptance stages.

The next [B1 build/native UI milestone](reference-ui/docs/RFQ_ROUND_PLAN_NATIVE_ACCEPTANCE_20261103.md) is prepared as inert files for Root review. It requires a separate pristine UI clone, actual normal Core cookies and exactly three UI commands; current product pin remains `8dca4943bbe5b5ea4993a7eecb0e7a40fecb53c1`. No build/browser/DB/runtime work is authorized while Root's recovery/SDK slot is active.


B1 private browser continuation has now passed on corrected product `26d4ef19`, preserving the original `8dca4943` All failure and successful version1 Create. Root verified B All/original GET201 and C Revise/Cancel200, privacy404 and retained All/history; final independent owner reconciliation and release remain pending. The [acceptance record](reference-ui/docs/RFQ_ROUND_PLAN_NATIVE_ACCEPTANCE_20261103.md) separates both attempts and their exact hashes. No whole-module or production UAT claim is made.


B1 private owner reconciliation and Core fixture cleanup are now complete. Root accepted cumulative owner proof `1785d682717ce40a885810bda03bcf20606136dceba486f5fcade84a44321b6f` and exact role-only restore `fd9c452dfc6f5dc0085258446582bf780136fcf257c753075f73f953ab7561db`; retained graph and original failure remain preserved, API/proxy stopped. Runtime product remains `26d4ef19`. Technical paired release is still pending; this is not whole Procurement module or production UAT.
