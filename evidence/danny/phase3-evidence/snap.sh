#!/bin/bash
# usage: snap.sh <label>
cd ~/Code/compx574/audiobookshelf
E=~/Code/compx574/a4-context/phase3-evidence
ts=$(find server index.ts prod.ts -name '*.ts' -not -path 'server/libs/*' 2>/dev/null | wc -l)
js=$(find server index.js prod.js -name '*.js' -not -path 'server/libs/*' 2>/dev/null | wc -l)
err=$(npx tsc -p tsconfig.server.json --noEmit 2>&1 | grep -c 'error TS')
t=$(npm test 2>&1 | grep -E '^\s+[0-9]+ (passing|failing)' | tr -s ' ' | tr '\n' ' ')
echo "$(date -Iseconds) label=$1 head=$(git rev-parse --short HEAD) ts=$ts js=$js err=$err tests=$t" | tee -a $E/progress.log
