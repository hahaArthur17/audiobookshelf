#!/bin/bash
# usage: smoke4.sh <label> <repo-dir> <port>
# Scans a fixture library (tagged mp3s, ebooks with opf, nfo and metadata.json, a podcast library),
# dumps the library items, rescans after editing metadata files, then checks the watcher.
# Output (ids and timestamps masked): phase3-evidence/smoke/s4-<label>/
label=$1; dir=$2; port=$3
PE=/home/danny/Code/compx574/a4-context/phase3-evidence
W=$(mktemp -d /tmp/abs-s4-XXXX)
mkdir -p "$W/config" "$W/metadata" "$W/lib"
bash "$PE/batch11b/smoke/mkfixture.sh" "$W/lib" || { echo "fixture failed"; exit 1; }
OUT=$PE/smoke/s4-$label; mkdir -p "$OUT"
FF=$(command -v ffmpeg); FP=$(command -v ffprobe)
cd "$dir" || exit 1
SKIP_BINARIES_CHECK=1 FFMPEG_PATH=$FF FFPROBE_PATH=$FP node dist-server/index.js --config "$W/config" --metadata "$W/metadata" --port $port > "$OUT/server.log" 2>&1 &
PID=$!
U=http://localhost:$port
for i in $(seq 1 60); do curl -sf $U/ping >/dev/null && break; sleep 1; done
H='Content-Type: application/json'
M="python3 $PE/batch11b/smoke/mask.py $W/lib"
curl -s -X POST $U/init -H "$H" -d '{"newRoot":{"username":"root","password":"test1234"}}' > /dev/null
TOKEN=$(curl -s -X POST $U/login -H "$H" -d '{"username":"root","password":"test1234"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['user']['accessToken'])")
A="Authorization: Bearer $TOKEN"
BID=$(curl -s -X POST $U/api/libraries -H "$H" -H "$A" -d "{\"name\":\"Books\",\"mediaType\":\"book\",\"folders\":[{\"fullPath\":\"$W/lib/books\"}]}" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
PID2=$(curl -s -X POST $U/api/libraries -H "$H" -H "$A" -d "{\"name\":\"Pods\",\"mediaType\":\"podcast\",\"folders\":[{\"fullPath\":\"$W/lib/podcasts\"}]}" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -o /dev/null -X POST -H "$A" $U/api/libraries/$BID/scan
curl -s -o /dev/null -X POST -H "$A" $U/api/libraries/$PID2/scan
sleep 6
dump() { # $1 = name
  for L in $BID $PID2; do
    curl -s -H "$A" "$U/api/libraries/$L/items" | $M > "$OUT/$1-items-$L.json"
    for I in $(curl -s -H "$A" "$U/api/libraries/$L/items" | python3 -c "import sys,json;[print(r['id']) for r in json.load(sys.stdin)['results']]"); do
      curl -s -H "$A" "$U/api/items/$I?expanded=1"
    done | python3 -c "
import sys,json
dec=json.JSONDecoder(); s=sys.stdin.read(); out=[]; i=0
while i < len(s):
    o,i=dec.raw_decode(s,i); out.append(o)
    while i < len(s) and s[i].isspace(): i+=1
out.sort(key=lambda r: r['relPath']); print(json.dumps({'results': out}))" | $M > "$OUT/$1-expanded-$L.json"
  done
}
dump scan1
# rescan after changing metadata sources
sed -i 's#<dc:title>OPF Title</dc:title>#<dc:title>OPF Title Changed</dc:title>#' "$W/lib/books/Author One/Book One/metadata.opf"
sed -i 's/Title: NFO Title/Title: NFO Title Changed/' "$W/lib/books/Author One/Book Two/metadata.nfo"
echo "new file" > "$W/lib/books/Author One/Book Three/notes.txt"
curl -s -o /dev/null -X POST -H "$A" "$U/api/libraries/$BID/scan?force=1"
curl -s -o /dev/null -X POST -H "$A" "$U/api/libraries/$PID2/scan?force=1"
sleep 6
dump scan2
# watcher with audiobooksOnly
curl -s -o /dev/null -X PATCH -H "$H" -H "$A" $U/api/libraries/$BID -d '{"settings":{"audiobooksOnly":true}}'
sleep 2
mkdir -p "$W/lib/books/Author Four/Book Four" "$W/lib/books/Author Five/Ebook Five"
cp "$W/lib/books/Author Six/Series Book/Series Book.mp3" "$W/lib/books/Author Four/Book Four/part1.mp3"
echo "pdf five" > "$W/lib/books/Author Five/Ebook Five/Ebook Five.pdf"
sleep 20
curl -s -H "$A" "$U/api/libraries/$BID/items" | python3 -c "import sys,json; d=json.load(sys.stdin); print('book items after watcher (20 s):', d['total'], sorted(r['relPath'] for r in d['results']))" > "$OUT/watch.txt"
curl -s -H "$A" "$U/api/libraries/$BID/items" | $M > "$OUT/watch-items.json"
grep -E 'ERROR|WARN' "$OUT/server.log" | sed -E 's/^\[[^]]*\] //' | sed "s#$W#WORK#g" > "$OUT/errors.txt"
kill $PID; wait $PID 2>/dev/null
for f in "$OUT"/*.json; do sed -i "s/$BID/BOOKLIB/g; s/$PID2/PODLIB/g" "$f"; done
for f in "$OUT"/*-$BID.json; do mv "$f" "${f/$BID/BOOKLIB}"; done
for f in "$OUT"/*-$PID2.json; do mv "$f" "${f/$PID2/PODLIB}"; done
echo "done $label (work dir $W)"
