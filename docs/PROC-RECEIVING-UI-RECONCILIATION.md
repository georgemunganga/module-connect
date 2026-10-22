# Receiving UI reconciliation

Source only, verification pending. This candidate reuses the already implemented receiving screens/client from held UI source `cc18432`, onto current CRUD controls source `233d3d9`. It preserves the verified vendor/editor/settings/shell changes. It does not enable a backend capability, migrate, or deploy.

The four specific receiving capabilities default false when absent; the generic receiving flag does not open these routes. Current server permissions, issued order evidence, source versions, inspection/service assignments and exact quantities remain authoritative. ERP administrator read-only behavior stays intact. Tenant identity is included in remount/recovery-memory scope alongside company/branch/worker.

Imported files were byte-identical before the scoped tenant-key and synchronous in-flight guard additions. Source hashes follow. Original author/history remains retained in the source branch; no published history is rewritten. Existing mocked/real-browser contracts are imported for re-verification, not claimed as passing on this candidate.

```json
[
  {
    "path": "reference-ui/src/features/LiveReceiving.tsx",
    "sha256": "8216a46af2bc5773765ddbae36aa602a3ede0a4da6b1575b942c82325faea4c4"
  },
  {
    "path": "reference-ui/src/features/LiveReceivingEditor.tsx",
    "sha256": "53214ee84a600887c558f85b0490b53f26b0f3e14c009c8a51f1dd190d0ded88"
  },
  {
    "path": "reference-ui/src/features/ReceivingPresentation.tsx",
    "sha256": "514118d1892724399ef5867b0d2c235629a92a8c8c366de33c80c93bad7daf5f"
  },
  {
    "path": "reference-ui/src/lib/receiving-command-memory.ts",
    "sha256": "d12f32729f583296fa8ae579cfdfaafa73fa714e8f27f4f92e78364e9a5784be"
  },
  {
    "path": "src/platform/procurement-receiving-api.ts",
    "sha256": "fde27bba27c108cf6e2980d8ed56d0281642b8262737e4884ac7ca11a6dc89de"
  },
  {
    "path": "reference-ui/tests/e2e/live-receiving.spec.ts",
    "sha256": "eef3148bb207b5ab5e8648567be604382f6e9ddf32c9edafa0acc150d8fbfe20"
  },
  {
    "path": "reference-ui/tests/receiving-contract.test.ts",
    "sha256": "0b34bc7be8a5cf9c0bc142b58459a03b4492f357770c7877613c639c3938c54b"
  },
  {
    "path": "reference-ui/tests/backend-browser/RECEIVING-CONTRACT.md",
    "sha256": "b4759c3af51223688b5a13ab089445f51b8109898fc42288e5f7768eb14e053b"
  },
  {
    "path": "reference-ui/tests/backend-browser/receiving.spec.ts",
    "sha256": "420799dde680bc03eb08144a9d1a67e9321225f8c8d4668b40452d7ba35ce799"
  }
]
```

New guards synchronously prevent a second command or recovery request before React has rendered its busy state, and refuse commands after unmount. Existing backend idempotency/recovery remains authoritative. These additions require new focused browser verification before release.
