#!/bin/bash
# usage: watch.sh <label> <repo-dir>
label=$1; dir=$2
E=~/Code/compx574/a4-context/phase3-evidence/smoke
mkdir -p $E
D=$(mktemp -d /tmp/abs-watch-XXXX)
mkdir -p $D/lib; bash /home/danny/Code/compx574/a4-context/phase3-evidence/fixture.sh $D/lib
cd "$dir" || exit 1
CONFIG_PATH=$D/config METADATA_PATH=$D/metadata PORT=3333 node dist-server/index.js > $E/$label-watch-server.log 2>&1 &
PID=$!
for i in $(seq 1 60); do curl -sf localhost:3333/ping >/dev/null && break; sleep 1; done
H='Content-Type: application/json'
mask() { sed -E 's/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/UUID/g; s/eyJ[A-Za-z0-9_.-]+/JWT/g; s#/tmp/abs-watch-[A-Za-z0-9]+#TMP#g; s/[0-9]{13}/TS/g'; }
count() { python3 -c "import sys,json; d=json.load(sys.stdin); print(d['total'], sorted(r['media']['metadata']['title'] for r in d['results']))"; }
{
curl -s -X POST localhost:3333/init -H "$H" -d '{"newRoot":{"username":"root","password":"test1234"}}' > /dev/null
TOKEN=$(curl -s -X POST localhost:3333/login -H "$H" -d '{"username":"root","password":"test1234"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['user']['accessToken'])")
A="Authorization: Bearer $TOKEN"
LIB=$(curl -s -X POST localhost:3333/api/libraries -H "$H" -H "$A" -d "{\"name\":\"Test\",\"mediaType\":\"book\",\"folders\":[{\"fullPath\":\"$D/lib\"}]}")
ID=$(echo "$LIB" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -o /dev/null -X POST -H "$A" localhost:3333/api/libraries/$ID/scan
sleep 5
echo "== items before"; curl -s -H "$A" "localhost:3333/api/libraries/$ID/items" | count
mkdir -p "$D/lib/Author Three/Book Three"
cp "$D/lib/Author Two/Audio Book/01 - Part 1.wav" "$D/lib/Author Three/Book Three/01 - Part 1.wav"
sleep 20
echo "== items after adding Author Three/Book Three"; curl -s -H "$A" "localhost:3333/api/libraries/$ID/items" | count
echo "== socket"
TOKEN="$TOKEN" node <<'JS'
const token = process.env.TOKEN
const ws = new WebSocket('ws://127.0.0.1:3333/socket.io/?EIO=4&transport=websocket')
ws.onmessage = (e) => {
  const m = String(e.data)
  if (m[0] === '0') ws.send('40')
  else if (m.startsWith('40')) ws.send('42["auth","' + token + '"]')
  else if (m.startsWith('42')) {
    try { const [ev, p] = JSON.parse(m.slice(2)); console.log('event', ev, p && typeof p === 'object' ? Object.keys(p).join(',') : '') }
    catch (err) { console.log('unparsed', m.slice(0, 40)) }
  }
}
ws.onerror = () => console.log('ws error')
setTimeout(() => { ws.close(); process.exit(0) }, 5000)
JS
echo "== log files"; (cd $D/metadata/logs && find . -type f | sed -E 's/[0-9]{4}-[0-9]{2}-[0-9]{2}/DATE/g' | sort)
echo "== ERROR and WARN lines"; grep -E 'ERROR|WARN' $E/$label-watch-server.log | sed -E 's/^\[[^]]*\] //'
} 2>&1 | mask > $E/$label-watch.txt
kill $PID
echo "done: $E/$label-watch.txt"
