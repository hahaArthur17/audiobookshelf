#!/bin/bash
# usage: commentonly.sh <repo> <base commit> [<head>]
# Every changed line (added or removed) of git diff base..head, outside MIGRATION.md,
# must be a whole // comment line. Prints the counts and every line that is not.
repo=$1; base=$2; head=${3:-HEAD}
cd "$repo" || exit 1
diff=$(git diff -U0 "$base" "$head" -- . ':(exclude)MIGRATION.md' | grep -E '^[+-]' | grep -vE '^(\+\+\+|---) ')
total=$(printf '%s\n' "$diff" | grep -c '^[+-]')
added=$(printf '%s\n' "$diff" | grep -c '^+')
removed=$(printf '%s\n' "$diff" | grep -c '^-')
notcomment=$(printf '%s\n' "$diff" | grep -vE '^[+-][[:space:]]*//' | grep -c '^[+-]')
echo "changed lines: $total (added $added, removed $removed)"
echo "changed lines that are not // comment lines: $notcomment"
printf '%s\n' "$diff" | grep -vE '^[+-][[:space:]]*//' | grep '^[+-]'
echo "files changed: $(git diff --name-only "$base" "$head" -- . ':(exclude)MIGRATION.md' | wc -l)"
