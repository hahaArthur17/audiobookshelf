#!/bin/bash
# usage: smoke2.sh <label> <repo-dir> <entry>
label=$1; dir=$2; entry=$3
E=~/Code/compx574/a4-context/phase3-evidence/smoke
mkdir -p $E
D=$(mktemp -d /tmp/abs-smoke-XXXX)
mkdir -p $D/lib; bash /home/danny/Code/compx574/a4-context/phase3-evidence/fixture.sh $D/lib
cd "$dir" || exit 1
CONFIG_PATH=$D/config METADATA_PATH=$D/metadata PORT=3333 node $entry > $E/$label-api-server.log 2>&1 &
PID=$!
for i in $(seq 1 60); do curl -sf localhost:3333/ping >/dev/null && break; sleep 1; done
H='Content-Type: application/json'
mask() { sed -E 's/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/UUID/g; s/eyJ[A-Za-z0-9_.-]+/JWT/g; s#/tmp/abs-smoke-[A-Za-z0-9]+#TMP#g; s/[0-9]{13}/TS/g'; }
{
curl -s -X POST localhost:3333/init -H "$H" -d '{"newRoot":{"username":"root","password":"test1234"}}' > /dev/null
TOKEN=$(curl -s -X POST localhost:3333/login -H "$H" -d '{"username":"root","password":"test1234"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['user']['accessToken'])")
A="Authorization: Bearer $TOKEN"
for p in /api/me /api/libraries /api/users /api/tags /api/genres; do
  echo "== GET $p"; curl -s -w ' [%{http_code}]\n' -H "$A" localhost:3333$p
done
echo "== create library"
LIB=$(curl -s -X POST localhost:3333/api/libraries -H "$H" -H "$A" -d "{\"name\":\"Test\",\"mediaType\":\"book\",\"folders\":[{\"fullPath\":\"$D/lib\"}]}")
echo "$LIB"
ID=$(echo "$LIB" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])" 2>/dev/null)
echo "== scan";  curl -s -w ' [%{http_code}]\n' -X POST -H "$A" localhost:3333/api/libraries/$ID/scan
sleep 4
echo "== items"; curl -s -w ' [%{http_code}]\n' -H "$A" localhost:3333/api/libraries/$ID/items
echo "== stats"; curl -s -w ' [%{http_code}]\n' -H "$A" localhost:3333/api/libraries/$ID/stats
echo "== server log ERROR and WARN lines"; grep -E 'ERROR|WARN' $E/$label-api-server.log | sed -E 's/^\[[^]]*\] //'
} 2>&1 | mask > $E/$label-api.txt
kill $PID
echo "done: $E/$label-api.txt"
