#!/bin/bash
# Usage: after.sh <test base name> <evidence slug> "<header line 1>" "<header line 2>"
# Runs npm test (build + all tests), then the one test file, and writes <slug>-after.txt.
SP="$TEMP/claude/D--SEM-2-574-Project-audiobookshelf-po/d7c0ac72-ec65-49da-949f-03c48648b316/scratchpad"
T="$1"
SLUG="$2"
npm test > "$SP/npmtest.txt" 2>&1
echo "npm test exit: $?"
grep -E "passing|failing|error TS" "$SP/npmtest.txt"
OUT="evidence/test-results/PO-S07/$SLUG-after.txt"
{
  echo "$3"
  echo "$4 $(date '+%Y-%m-%d %H:%M:%S')"
  echo "# Command: npm test (build, then all tests), then npx mocha dist-server/test/server/bugfix/$T.test.js"
  echo '# Log lines "DEBUG: [LibraryItems...Filters] ..." are filtered out of this file.'
  echo "# npm test summary: $(grep -E 'passing|failing' "$SP/npmtest.txt" | tr -s ' ' | tr '\n' ';')"
  echo
} > "$OUT"
npx mocha "dist-server/test/server/bugfix/$T.test.js" 2>&1 | grep -v "DEBUG: \[LibraryItems" >> "$OUT"
echo "exit code: ${PIPESTATUS[0]}" | tee -a "$OUT"
tail -12 "$OUT"
