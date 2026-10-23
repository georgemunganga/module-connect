# P25 exact budget UI verification

At UI source `558629a`, 453 Vitest cases across 49 files and the native Node actor tests passed. TypeScript and the live staged build passed. Both staged Playwright budget cases passed with one worker and no retries: explicit exact funding capture/history, and denied Finance access. These two browser cases use mocked API responses; they do not prove PostgreSQL persistence or the full approval workflow.

Private evidence: `erp-backups/procurement-budget-ui-20261023_run01`, including unchanged tracked-source fingerprints, staged asset hashes and results. The previous accepted manual-payment assets were preserved before rebuilding. No production deployment occurred.

The API and UI retain up to eight fractional digits in the estimate. The server supplies the smallest four-place funding amount covering it; the reviewer explicitly enters an amount at least that minimum. No JavaScript number supplies the command amount. Missing exact data blocks capture, and the response must confirm the same exact value. The actual Npgsql wire check and full normal-cookie approval journey remain separate pending acceptance gates in ERP PR45.
