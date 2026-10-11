#!/bin/bash
REPO=$HOME/mnt/Project/audiobookshelf-po
OUT=$HOME/mnt/Project/po-s10-hold/run-log.txt
SETS=$HOME/work/s10_sets.txt
BASE=$(git --no-optional-locks -C $REPO log --grep 'setup: run layout' -n 1 --format=%h)
{
  echo "== checkpoint $(TZ=Pacific/Auckland date '+%Y-%m-%d %H:%M:%S') NZDT"
  echo "HEAD: $(git --no-optional-locks -C $REPO log --oneline -1 | cut -c1-90)  commits since layout commit ($BASE): $(git --no-optional-locks -C $REPO rev-list --count $BASE..HEAD 2>/dev/null)"
  ST=$(git --no-optional-locks -C $REPO status --short | grep -v '^?? .claude')
  echo "working tree entries: $(echo -n "$ST" | grep -c .); staged renames: $(echo -n "$ST" | grep -c '^R')"
  while read -r n files; do
    ts=0; js=0
    for f in $files; do
      if [ -f "$REPO/server/$f.ts" ]; then ts=$((ts+1)); elif [ -f "$REPO/server/$f.js" ]; then js=$((js+1)); fi
    done
    echo "set $n: ts=$ts js=$js"
  done < $SETS
  # tracked names in the sets, for the outside-the-sets check
  ALL=$(sed 's/^[0-9]* //' $SETS | tr ' ' '\n' | sed 's#^#server/#' )
  OUTSIDE=$(echo -n "$ST" | awk '{print $NF}' | sed 's#\\#/#g' | grep -v -E '^server/(types|models)/' | while read -r p; do b=${p%.*}; echo "$ALL" | grep -qx "$b" || echo "$p"; done)
  echo "paths in git status outside the sets (and not models/types): $(echo -n "$OUTSIDE" | grep -c .)"
  [ -n "$OUTSIDE" ] && echo "$OUTSIDE" | head -5
  echo "models/types entries: $(echo -n "$ST" | grep -c -E 'server/(types|models)/')"
  echo "newest change in server/: $(TZ=Pacific/Auckland find $REPO/server -type f -printf '%TH:%TM:%TS %p\n' 2>/dev/null | sort | tail -1 | cut -c1-8)"
  echo "evidence files visible: $(find $REPO/evidence -type f 2>/dev/null | wc -l)"
} >> $OUT 2>&1
tail -14 $OUT
