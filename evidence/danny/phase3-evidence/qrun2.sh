#!/bin/bash
# usage: qrun2.sh <label> <repo-dir> <port> <requests-file>
# Independent copy of batch11c/qrun.sh (agent's script). Changes: own temp dir /tmp/abs-q, output in
# phase3-evidence/smoke/q-<label>, mask2.py from batch11c, and it refuses to reuse an existing label.
# Starts the built server of <repo-dir> on a new fixture (mkfixture.sh) in a new temp dir under the
# scratchpad, sets up libraries, OIDC settings, a collection, a share and a playback session,
# then sends every request of <requests-file> ("NAME METHOD PATH [JSON-BODY]") and saves
# status, Location header and masked body to phase3-evidence/smoke/q-<label>/NAME.txt.
label=$1; dir=$2; port=$3; REQ=$(realpath "$4")
PE=/home/danny/Code/compx574/a4-context/phase3-evidence
S=/tmp/abs-q; mkdir -p "$S"
W=$(mktemp -d $S/qwork-XXXX)
mkdir -p "$W/config" "$W/metadata" "$W/lib"
bash "$PE/batch11b/smoke/mkfixture.sh" "$W/lib" || { echo "fixture failed"; exit 1; }
OUT=$PE/smoke/q-$label
[ -e "$OUT" ] && { echo "output exists: $OUT (use a new label)"; exit 1; }
mkdir -p "$OUT"
FF=$(command -v ffmpeg); FP=$(command -v ffprobe)
cd "$dir" || exit 1
U=http://localhost:$port
start_server() {
  SKIP_BINARIES_CHECK=1 FFMPEG_PATH=$FF FFPROBE_PATH=$FP node dist-server/index.js --config "$W/config" --metadata "$W/metadata" --port $port >> "$OUT/server.log" 2>&1 &
  SPID=$!
  for i in $(seq 1 60); do curl -sf $U/ping >/dev/null && break; sleep 1; done
}
start_server
H='Content-Type: application/json'
J() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }
curl -s -X POST $U/init -H "$H" -d '{"newRoot":{"username":"root","password":"test1234"}}' > /dev/null
LOGIN=$(curl -s -X POST $U/login -H "$H" -d '{"username":"root","password":"test1234"}')
TOKEN=$(echo "$LOGIN" | J "d['user']['accessToken']"); UID_=$(echo "$LOGIN" | J "d['user']['id']")
A="Authorization: Bearer $TOKEN"
BL=$(curl -s -X POST $U/api/libraries -H "$H" -H "$A" -d "{\"name\":\"Books\",\"mediaType\":\"book\",\"folders\":[{\"fullPath\":\"$W/lib/books\"}]}" | J "d['id']")
PL=$(curl -s -X POST $U/api/libraries -H "$H" -H "$A" -d "{\"name\":\"Pods\",\"mediaType\":\"podcast\",\"folders\":[{\"fullPath\":\"$W/lib/podcasts\"}]}" | J "d['id']")
curl -s -o /dev/null -X POST -H "$A" $U/api/libraries/$BL/scan
curl -s -o /dev/null -X POST -H "$A" $U/api/libraries/$PL/scan
sleep 6
item() { curl -s -H "$A" "$U/api/libraries/$1/items" | J "[r['id'] for r in d['results'] if r['relPath']=='$2'][0]"; }
BI_OPF=$(item $BL "Author One/Book One"); BI_NFO=$(item $BL "Author One/Book Two"); BI_JSON=$(item $BL "Author One/Book Three")
BI_AUDIO=$(item $BL "Tag Author/Tagged Book"); BI_LOOSE=$(item $BL "Loose Book.pdf"); BI_WAV=$(item $BL "Author Two/Audio Book")
PI=$(item $PL "My Show"); PI2=$(item $PL "Other Show")
EP=$(curl -s -H "$A" "$U/api/items/$PI?expanded=1" | J "sorted(d['media']['episodes'], key=lambda e: e['title'])[0]['id']")
AU=$(curl -s -H "$A" "$U/api/libraries/$BL/authors" | J "sorted(d['authors'], key=lambda a: a['name'])[0]['id']")
SE=$(curl -s -H "$A" "$U/api/libraries/$BL/filterdata" | J "sorted(d['series'], key=lambda a: a['name'])[0]['id']")
CO=$(curl -s -X POST $U/api/collections -H "$H" -H "$A" -d "{\"libraryId\":\"$BL\",\"name\":\"Coll\",\"books\":[\"$BI_OPF\",\"$BI_AUDIO\"]}" | J "d['id']")
BOOKID=$(curl -s -H "$A" "$U/api/items/$BI_AUDIO" | J "d['media']['id']")
curl -s -o "$OUT/_share.json" -X POST $U/api/share/mediaitem -H "$H" -H "$A" -d "{\"slug\":\"slug1\",\"mediaItemType\":\"book\",\"mediaItemId\":\"$BOOKID\",\"expiresAt\":0,\"isDownloadable\":false}"
curl -s -o "$OUT/_play.json" -X POST $U/api/items/$BI_AUDIO/play -H "$H" -H "$A" -d '{"deviceInfo":{"clientName":"qrun","deviceId":"qrun-dev"},"mediaPlayer":"html5","forceDirectPlay":true}'
SESS=$(python3 -c "import json;print(json.load(open('$OUT/_play.json'))['id'])")
curl -s -o /dev/null -X POST $U/api/session/$SESS/close -H "$H" -H "$A" -d '{"currentTime":1,"timeListened":1}'
curl -s -o /dev/null -X PATCH $U/api/me/progress/$BI_OPF -H "$H" -H "$A" -d '{"ebookProgress":0.5,"ebookLocation":"x","isFinished":false}'
curl -s -o /dev/null -X PATCH $U/api/items/$PI/media -H "$H" -H "$A" -d '{"metadata":{"feedUrl":"http://127.0.0.1:9/feed.xml"}}'
curl -s -o "$OUT/_auth.json" -X PATCH $U/api/auth-settings -H "$H" -H "$A" -d '{"authActiveAuthMethods":["local","openid"],"authOpenIDIssuerURL":"http://127.0.0.1:9/issuer","authOpenIDAuthorizationURL":"http://127.0.0.1:9/authorize","authOpenIDTokenURL":"http://127.0.0.1:9/token","authOpenIDUserInfoURL":"http://127.0.0.1:9/userinfo","authOpenIDJwksURL":"http://127.0.0.1:9/jwks","authOpenIDClientID":"cid","authOpenIDClientSecret":"secret","authOpenIDTokenSigningAlgorithm":"RS256","authOpenIDMobileRedirectURIs":["audiobookshelf://oauth"]}'
echo "BL=$BL PL=$PL BI_OPF=$BI_OPF BI_AUDIO=$BI_AUDIO PI=$PI EP=$EP AU=$AU SE=$SE CO=$CO SESS=$SESS" > "$OUT/_ids.txt"
while IFS= read -r line; do
  [ -z "$line" ] && continue; [[ "$line" == \#* ]] && continue
  name=$(echo "$line" | awk '{print $1}'); meth=$(echo "$line" | awk '{print $2}'); path=$(echo "$line" | awk '{print $3}'); body=$(echo "$line" | cut -d' ' -f4-)
  [ "$body" == "$line" ] && body=""
  sub() { echo "$1" | sed "s#{BL}#$BL#g; s#{PL}#$PL#g; s#{BI_OPF}#$BI_OPF#g; s#{BI_NFO}#$BI_NFO#g; s#{BI_JSON}#$BI_JSON#g; s#{BI_AUDIO}#$BI_AUDIO#g; s#{BI_LOOSE}#$BI_LOOSE#g; s#{BI_WAV}#$BI_WAV#g; s#{PI}#$PI#g; s#{PI2}#$PI2#g; s#{EP}#$EP#g; s#{AU}#$AU#g; s#{SE}#$SE#g; s#{CO}#$CO#g; s#{UID}#$UID_#g; s#{WORK}#$W#g; s#{PORT}#$port#g"; }
  path=$(sub "$path"); body=$(sub "$body")
  AH="$A"; [[ "$name" == noauth_* ]] && AH="X-None: 1"
  if [ -n "$body" ]; then
    code=$(curl -g -s -m 5 -o "$OUT/_body" -D "$OUT/_hdr" -w '%{http_code}' -X $meth "$U$path" -H "$H" -H "$AH" -d "$body")
  else
    code=$(curl -g -s -m 5 -o "$OUT/_body" -D "$OUT/_hdr" -w '%{http_code}' -X $meth "$U$path" -H "$AH")
  fi
  loc=$(grep -i '^location:' "$OUT/_hdr" | tr -d '\r' | sed "s#$W#ROOT#g")
  { echo "STATUS $code"; echo "LOCATION $(echo "$loc" | python3 -c "import sys,re;print(re.sub(r'[A-Za-z0-9_-]{40,}','RAND',sys.stdin.read().strip()))")"; python3 $PE/batch11c/mask2.py "$W" "$OUT/_body"; } > "$OUT/$name.txt"
  [ "$code" == "000" ] && sleep 1
  if ! kill -0 $SPID 2>/dev/null; then
    wait $SPID 2>/dev/null; ec=$?
    echo "SERVER EXITED (code $ec)" >> "$OUT/$name.txt"; code="$code+exit$ec"
    echo "=== restart after $name ===" >> "$OUT/server.log"
    start_server
  fi
  echo "$name $code" >> "$OUT/_codes.txt"
done < "$REQ"
grep -E 'ERROR|WARN' "$OUT/server.log" | sed -E 's/^\[[^]]*\] //' | sed "s#$W#WORK#g" > "$OUT/_errors.txt"
kill $SPID; wait $SPID 2>/dev/null
echo "done $label (work dir $W)"
