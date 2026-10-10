# Audit of the main branch, 2026-10-11

Checked commit: 50d46876 (branch Aung-Min-Myat/po-s01), in a fresh clone on a Linux machine, Node 22, fresh `npm ci`.
Nothing in the repository was changed by the audit. The folder was copied into the repository evidence afterwards. It covers the branch before PO-S08; the PO-S08 checks are in evidence/test-results/PO-S08/post-run-checks.txt.

Results (files in results/):
- npm-test-HEAD.txt: build 0 "error TS", 375 passing (356 original + 19 regression tests added in PO-S07), 0 failing.
- lint-HEAD.txt: eslint exit 0 (ESLint ignores .ts files, so this does not check the converted files).
- npm-test-<commit>.txt: build and test at the last code commit of PO-S01 (8d48f5b7), S02 (3dc3e55b), S03 (b792a729), S04 (96f5fc41), S05 (053a778b), S07 (034b2135). All 0 errors, 0 failing. 356 passing, except S07 (373).
- compiled-diff-*.txt: compiled output of HEAD against the original baseline (ignoring line endings): 54 files differ, 514 changed lines. Each was read by hand.
- smoke-*.n.txt: about 60 API calls sent to the original and the converted server. Pair 2 and base3 against head2: 0 differences. Pair 1 differed in one line (series feed episode order), which also differs between two runs of the original server (base vs base4).
- boot-*.log: no ERROR or WARN lines on boot.

Scripts (scripts/): smoke.js, run-server.sh (API comparison), escape.js (type-safety counts), cycles.js (require cycles), compare.js (comments and TODO counts).
