#!/usr/bin/env bash
# usage: migrun.sh <label> <repo-dir>
L=$1
R=$2
OUT=/home/danny/Code/compx574/a4-context/phase3-evidence/smoke
D=$(mktemp -d /tmp/abs-mig-XXXX)
mkdir -p "$D/config" "$D/metadata"
PORT=3399
SP=0
start() {
  (
    cd "$R" || exit 1
    export PORT CONFIG_PATH="$D/config" METADATA_PATH="$D/metadata" SKIP_BINARIES_CHECK=1 FFMPEG_PATH="$(command -v ffmpeg)" FFPROBE_PATH="$(command -v ffprobe)"
    exec node dist-server/index.js > "$1" 2>&1
  ) &
  SP=$!
  for i in $(seq 1 90); do
    if curl -s -o /dev/null "http://127.0.0.1:$PORT/status"; then return 0; fi
    sleep 1
  done
  return 1
}
stop() {
  kill "$SP" 2>/dev/null
  for i in 1 2 3 4 5 6 7 8 9 10; do
    kill -0 "$SP" 2>/dev/null || break
    sleep 1
  done
  kill -9 "$SP" 2>/dev/null
  wait "$SP" 2>/dev/null
}
start "$D/run1.log" || echo "run1 did not start"
stop
python3 -I - "$D/config/absdatabase.sqlite" <<'PY'
import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
print('before:', list(c.execute("select * from migrationsMeta")))
c.execute("update migrationsMeta set value='2.14.0' where key='version'")
c.commit()
print('set:', list(c.execute("select * from migrationsMeta")))
PY
start "$D/run2.log" || echo "run2 did not start"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/status")
stop
{
  echo "== status after run2: $CODE =="
  echo "== run2 log =="
  sed -E "s/^\[[^]]*\] //; s#$D#TMP#g; s#$R#REPO#g" "$D/run2.log"
  echo "== db after run2 =="
  python3 -I - "$D/config/absdatabase.sqlite" <<'PY'
import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
print(list(c.execute("select * from migrationsMeta")))
print([r[0] for r in c.execute("select name from SequelizeMeta order by name")])
PY
  echo "== config/migrations =="
  ls "$D/config/migrations"
} > "$OUT/mig-$L.txt" 2>&1
echo "done: $OUT/mig-$L.txt"
