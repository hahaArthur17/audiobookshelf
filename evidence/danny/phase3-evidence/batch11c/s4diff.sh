#!/bin/bash
# usage: s4diff.sh <s4-dirA> <s4-dirB> : diff smoke4 outputs with inode numbers in file urls masked
n=0
for f in $(cd "$1" && ls); do
  [ "$f" == server.log ] && continue
  d=$(diff <(sed -E 's#/file/[0-9]+#/file/INO#g' "$1/$f") <(sed -E 's#/file/[0-9]+#/file/INO#g' "$2/$f"))
  if [ -n "$d" ]; then echo "=== $f"; echo "$d"; else n=$((n+1)); fi
done
echo "$n files identical"
