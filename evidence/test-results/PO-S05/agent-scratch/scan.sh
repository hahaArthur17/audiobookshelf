#!/bin/bash
# Scan converted models: banned tokens and counts of !, index signatures, casts, sequelize declarations, overloads.
# Comment-only lines are dropped first; trailing comments are stripped before matching.
REPO="D:/SEM-2/574/Project/audiobookshelf-po"
cd "$REPO"
for f in "$@"; do
  [ -f "$f" ] || { echo "(no file) $f"; continue; }
  code=$(grep -nvE '^\s*(\*|/\*|//)' "$f" | sed -E 's@ // .*$@@')
  banned=$(echo "$code" | grep -E '(:|<|\(|,|\||&|=) *any\b|\bany\[\]|as any|@ts-ignore|@ts-nocheck|@ts-expect-error|as unknown as' | head -5)
  bangL=$(echo "$code" | grep -E '[])A-Za-z0-9_]!([.),; []|$)' | grep -vE '!==|!= ' | cut -d: -f1 | tr '\n' ' ')
  idxL=$(echo "$code" | grep -E '\[[A-Za-z_]+: string\]:' | cut -d: -f1 | tr '\n' ' ')
  castL=$(echo "$code" | grep -E "[])}A-Za-z0-9_'\"] as [A-Za-z{([]" | grep -vE '^[0-9]+:\s*import ' | cut -d: -f1 | tr '\n' ' ')
  regL=$(echo "$code" | grep -E 'declare (static )?readonly sequelize' | cut -d: -f1 | tr '\n' ' ')
  ovl=$(grep -c 'static init(this: never, ...args: never\[\]): never' "$f")
  exp=$(grep -c '^export = ' "$f")
  echo "$(basename $f): !=[${bangL% }] idx=[${idxL% }] cast=[${castL% }] sequelizeDecl=[${regL% }] uncallable=$ovl exportEq=$exp ${banned:+BANNED: $banned}"
done
