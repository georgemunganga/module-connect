# Governed purchasing UI reconciliation

Source candidate only; no capability, production migration or release is enabled. Reuses existing governed order/source/approval UI from held source3622b78, preserving the current verified fallback draft editors and their uncertain-write controls. The server `orders` capability chooses the governed source workflows; absence/false retains the existing accepted draft adapters. Scope keys include tenant/company/branch/worker; shared Core approval presentation is reused without merging its domain decisions.

The source supplies exact commercial values, persisted command receipt recovery, source selection, Finance confirmation references, approval assignments and issued/delivery evidence. Those features require real accepted backend capabilities and configuration. Imported unit/browser tests must be rerun on this combined candidate. No prior branch evidence is claimed for this candidate.

## Original file hashes before tenant-key additions

```json
[
  {
    "path": "reference-ui/src/features/LiveOrderExecution.tsx",
    "sha256": "02980afbc530aae1f19b3f9f0a7eaef62a24a461e63348deea5ec08f6cb72db0"
  },
  {
    "path": "reference-ui/src/features/LiveOrderSourceEditor.tsx",
    "sha256": "d7eb5408f27c3027a3797699267f5b83ded17324e3c76890694b2659440faf35"
  },
  {
    "path": "reference-ui/src/features/LiveOrderApprovalQueue.tsx",
    "sha256": "3f761bc9c53d96ab9dbc14ed8f21b6ff2cb784c3582cc66c0fa871d422ac34f2"
  },
  {
    "path": "reference-ui/src/components/approvals/ApprovalDecisionDialog.tsx",
    "sha256": "30091693d87160f391a66c62f0e8a3717369c669c603554cc90581c3df5bcf90"
  },
  {
    "path": "reference-ui/src/lib/order-command-memory.ts",
    "sha256": "d132bbb38f0a8ef1eaaef1b0053c56296e324a9529436ce6fe5e5aa76ea206e2"
  },
  {
    "path": "src/platform/procurement-order-execution-api.ts",
    "sha256": "e3a617b416ed14ebf990dc9268884df7053b94628b30f7edd6aae8fbf1ea4378"
  },
  {
    "path": "reference-ui/src/lib/order-execution-money.test.ts",
    "sha256": "38e1caf4e295d1f1ab388dd088a3527a3ea6e370fa63457a8666ab0211e09c2e"
  },
  {
    "path": "reference-ui/tests/e2e/live-order-execution.spec.ts",
    "sha256": "f951a34e98c3b617db52e96ce6cd0ecd15a4696ce6b073a4335529a6c02d4077"
  },
  {
    "path": "reference-ui/tests/e2e/live-order-sources.spec.ts",
    "sha256": "672c4311dec2e71b4c3e25ad418adfbf8df4f055994468384c97460c01de4cd1"
  },
  {
    "path": "reference-ui/tests/e2e/live-order-approvals.spec.ts",
    "sha256": "f71b13fd1f619753b88791cb2f16045875169b228bd09f3a2ced9ef07bf189fb"
  }
]
```
