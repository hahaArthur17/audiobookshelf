#!/bin/bash
# usage: audit_commit.sh <hash>  (clean build, then mocha; one line of result)
H=$1; cd $HOME/work/audit || exit 1
git checkout -q -f $H || { echo "$H checkout failed"; exit 1; }
rm -rf dist-server
S=$(date +%s)
npm run build:server > $HOME/work/out/build-$H.txt 2>&1; BX=$?
M=$(date +%s)
mocha_out=$(npx mocha dist-server/test 2>&1); MX=$?
E=$(date +%s)
echo "$mocha_out" > $HOME/work/out/test-$H.txt
rm -rf $HOME/work/dist-$H; cp -r dist-server $HOME/work/dist-$H
echo "$H build_exit=$BX errTS=$(grep -c 'error TS' $HOME/work/out/build-$H.txt) DebugFailure=$(grep -c 'Debug Failure' $HOME/work/out/build-$H.txt) build_s=$((M-S)) mocha_exit=$MX $(echo "$mocha_out" | grep -E '^\s+[0-9]+ (passing|failing|pending)' | tr -s ' ' | tr '\n' ' ') test_s=$((E-M)) files=$(find dist-server -name '*.js' | wc -l)"
