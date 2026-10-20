#!/usr/bin/env bash
# PREPARED ONLY. Execute after the coordinator explicitly grants the single host slot.
set -euo pipefail
if [[ "${INVOICE_UI_GATE_AUTHORIZED:-}" != "1" ]]; then
  printf '%s\n' 'No tests started: wait for coordinator clearance, then set INVOICE_UI_GATE_AUTHORIZED=1.' >&2
  exit 2
fi
cd "$(dirname "${BASH_SOURCE[0]}")/.."
repo_root=$(git rev-parse --show-toplevel)
node_directory=/root/.nvm/versions/node/v22.23.3/bin
[[ -x "$node_directory/node" ]] || { printf '%s\n' 'Required cached Node22 is unavailable.' >&2; exit 2; }
export PATH="$node_directory:$PATH" NODE_OPTIONS=--max-old-space-size=512 CI=1
[[ $(node --version) == v22.* ]] || exit 2
# Reuse reviewed packages; do not install or alter the shared cached dependencies.
if [[ ! -e node_modules ]]; then
  [[ -d /home/amizo/procurement-ui/reference-ui/node_modules ]] || exit 2
  ln -s /home/amizo/procurement-ui/reference-ui/node_modules node_modules
fi
[[ -z $(git -C "$repo_root" status --porcelain --untracked-files=no) ]] || { printf '%s\n' 'Tracked source is dirty; freeze the candidate first.' >&2; exit 2; }
# Never replace a prior bundle or delete previous test evidence.
[[ ! -e .invoice-verification-dist && ! -e .invoice-test-results ]] || { printf '%s\n' 'Prior invoice artifacts exist; retain them and choose a fresh worktree/output path.' >&2; exit 2; }
evidence_directory=${INVOICE_UI_EVIDENCE_DIR:-/tmp/procurement-invoice-ui-$(date -u +%Y%m%dT%H%M%SZ)}
mkdir -m 700 "$evidence_directory"
git -C "$repo_root" rev-parse HEAD > "$evidence_directory/source-head.txt"
node --version > "$evidence_directory/node-version.txt"
printf '%s\n' 'heap512; vitest forks1; browser workers1; retries0; separate port3041/output' > "$evidence_directory/resource-contract.txt"
# Thirteen new adapter cases; each file is named explicitly.
node node_modules/vitest/vitest.mjs run tests/invoice-review-contract.test.ts tests/invoice-matching-contract.test.ts --pool=forks --maxWorkers=1 --minWorkers=1 --no-file-parallelism 2>&1 | tee "$evidence_directory/01-new-client-cases.log"
# Seventeen relevant existing capability/scope cases, including legacy invoice scope.
node node_modules/vitest/vitest.mjs run src/lib/procurement-live.test.ts src/lib/procurement-scope.test.ts --pool=forks --maxWorkers=1 --minWorkers=1 --no-file-parallelism 2>&1 | tee "$evidence_directory/02-capability-scope-regressions.log"
node node_modules/typescript/bin/tsc --noEmit 2>&1 | tee "$evidence_directory/03-typescript.log"
node scripts/generate-routes.mjs 2>&1 | tee "$evidence_directory/04-routes.log"
VITE_PROCUREMENT_LIVE_MODE=1 node node_modules/vite/bin/vite.js build --outDir .invoice-verification-dist 2>&1 | tee "$evidence_directory/05-staged-build.log"
find .invoice-verification-dist -type f -print0 | sort -z | xargs -0 sha256sum > "$evidence_directory/bundle-sha256.txt"
new_cases='Bills detail explains missing invoice approval and Finance without creating a transaction|Recorded comparison keeps exact values and remains separate from approval and payment|Invoice review clears history on (readinessDenied|staleReview)|Changing Core branch clears original invoice, documents and review before delayed replacement reads|Invoice links and explicit comparison use the current version without implying approval|Lost mapping response offers only original-key GET recovery, never another POST|Unknown acceptance history is unavailable and cannot be saved as zero capacity'
PLAYWRIGHT_JSON_OUTPUT_NAME="$evidence_directory/06-new-browser-cases.json" node node_modules/@playwright/test/cli.js test --config playwright.invoice.config.ts --workers=1 --max-failures=1 --reporter=line,json --grep "$new_cases" 2>&1 | tee "$evidence_directory/06-new-browser-cases.log"
# The seven existing intake/document/403/404 cases share the modified fixture/detail.
PLAYWRIGHT_JSON_OUTPUT_NAME="$evidence_directory/07-existing-invoice-regressions.json" node node_modules/@playwright/test/cli.js test --config playwright.invoice.config.ts --workers=1 --max-failures=1 --reporter=line,json --grep-invert "$new_cases" 2>&1 | tee "$evidence_directory/07-existing-invoice-regressions.log"
git -C "$repo_root" status --short > "$evidence_directory/final-source-status.txt"
printf 'Evidence retained at %s\n' "$evidence_directory"
