#!/bin/bash
# usage: smoke.sh <label> <repo-dir> <entry>
label=$1; dir=$2; entry=$3
E=~/Code/compx574/a4-context/phase3-evidence/smoke
mkdir -p $E
D=$(mktemp -d /tmp/abs-smoke-XXXX)
cd "$dir" || exit 1
CONFIG_PATH=$D/config METADATA_PATH=$D/metadata PORT=3333 node $entry > $E/$label-server.log 2>&1 &
PID=$!
for i in $(seq 1 60); do curl -sf localhost:3333/ping >/dev/null && break; sleep 1; done
{
  echo "== ping";   curl -s -w ' [%{http_code}]\n' localhost:3333/ping
  echo "== status"; curl -s -w ' [%{http_code}]\n' localhost:3333/status
  echo "== init";   curl -s -w ' [%{http_code}]\n' -X POST localhost:3333/init -H 'Content-Type: application/json' -d '{"newRoot":{"username":"root","password":"test1234"}}'
  echo "== status after init"; curl -s -w ' [%{http_code}]\n' localhost:3333/status
  echo "== login";  curl -s -w ' [%{http_code}]\n' -X POST localhost:3333/login -H 'Content-Type: application/json' -d '{"username":"root","password":"test1234"}'
  echo "== login wrong password"; curl -s -w ' [%{http_code}]\n' -X POST localhost:3333/login -H 'Content-Type: application/json' -d '{"username":"root","password":"wrong"}'
} > $E/$label-responses.txt 2>&1
kill $PID
echo "done: $E/$label-responses.txt"
