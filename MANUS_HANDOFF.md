# Manus handoff moved to the ERP repository

The authoritative instructions are now in [georgemunganga/erp — MANUS_HANDOFF.md](https://github.com/georgemunganga/erp/blob/main/MANUS_HANDOFF.md).

Track milestones and open the coordination draft PR in the **ERP repository**. Read its task file for the implementation branch and owned files. Do not follow the earlier independent coordination instructions preserved in this file's Git history.

This repository remains the source of the existing Procurement frontend where the ERP handoff explicitly references it. The live ERP already has that UI; no rebuild, duplicate import or repository consolidation is assigned. Link any necessary UI PR to the ERP task PR.

ERP progress log: [docs/collaboration/manus/STATUS.md](https://github.com/georgemunganga/erp/blob/main/docs/collaboration/manus/STATUS.md).

## Frontend delivery: retained payment review, 2026-11-03

[Payment retained-read handoff](reference-ui/docs/PAYMENT_RETAINED_READ_20261103.md) records the frontend integration against merged ERP PR 156 / issue 155, scoped gates, recovery behavior and verification. The authoritative ERP handoff and Root-owned native acceptance/release still apply.

## Frontend source task: RFQ evaluation planning, 2026-11-03

[RFQ round-plan action map](reference-ui/docs/RFQ_ROUND_PLAN_ACTION_MAP_20261103.md) tracks [ERP issue173](https://github.com/georgemunganga/erp/issues/173) and backend draft PR165. The draft now mounts the original-card form/evidence components, round-only RFQ discovery and scoped actions/people lookup against Root’s approved successor DTO shapes. Final comparison with the pushed backend source remains pending. Initial 115 checks and three separate date checks are retained; binding 122 and affected precision 25 checks passed in separate cohorts. Final build/browser/native acceptance remains pending. Keep the UI draft unmerged and undeployed until Root completes the paired acceptance stages.
