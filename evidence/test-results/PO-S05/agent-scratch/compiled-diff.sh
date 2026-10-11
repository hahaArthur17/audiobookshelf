#!/bin/bash
# Compare compiled models with the baseline snapshot.
# Per changed file: (1) the diff lines that are NOT require lines, (2) whether the list of required modules (in order) is unchanged.
REPO="D:/SEM-2/574/Project/audiobookshelf-po"
BASE="$1"
reqs() { grep -oE "require\(['\"][^'\"]+['\"]\)" "$1" | sed -E "s/require\(['\"]([^'\"]+)['\"]\)/\1/"; }
for f in "$REPO"/dist-server/server/models/*.js; do
  n=$(basename "$f")
  if [ ! -f "$BASE/$n" ]; then echo "NEW FILE (not in baseline): $n"; continue; fi
  if cmp -s "$BASE/$n" "$f"; then continue; fi
  d=$(diff "$BASE/$n" "$f" | grep -E '^[<>]')
  total=$(echo "$d" | wc -l)
  other=$(echo "$d" | grep -vE 'require\(|^> const \{[^}]*\} = [A-Za-z_]+;$|^> const [A-Za-z_0-9]+ = [A-Za-z_0-9]+\.[A-Za-z_0-9]+;$')
  if [ "$(reqs "$BASE/$n")" == "$(reqs "$f")" ]; then r="requires same modules, same order"; else r="REQUIRE LIST CHANGED: was [$(reqs "$BASE/$n" | tr '\n' ' ')] now [$(reqs "$f" | tr '\n' ' ')]"; fi
  if [ -z "$other" ]; then echo "OK   $n: $total changed lines, all require lines; $r"; else echo "DIFF $n: $total changed lines; $r; non-require lines:"; echo "$other" | sed 's/^/       /'; fi
done
for f in "$BASE"/*.js; do n=$(basename "$f"); [ -f "$REPO/dist-server/server/models/$n" ] || echo "MISSING from current: $n"; done
