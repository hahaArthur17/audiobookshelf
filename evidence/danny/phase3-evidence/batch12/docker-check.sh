#!/bin/bash
# Docker build and run check after batch 12 (same checks as batch11d/12-13).
# usage: sudo bash docker-check.sh
# --network host: user danny is not in the docker group and the default bridge has no outbound access.
set -u
REPO=/home/danny/Code/compx574/audiobookshelf
OUT=$(cd "$(dirname "$0")" && pwd)
IMG=abs-image-check-b12
CT=abs-check-b12
PORT=13380
U=http://localhost:$PORT

cd "$REPO" || exit 1
{
  echo "HEAD: $(git -c safe.directory="$REPO" log -1 --format='%h %s')"
  echo "git status (empty = clean):"; git -c safe.directory="$REPO" status --short
  echo
  docker build --network host --progress plain -t $IMG . 2>&1
  echo "exit: $?"
} > "$OUT/11-docker-build.txt"
tail -3 "$OUT/11-docker-build.txt"
if ! tail -1 "$OUT/11-docker-build.txt" | grep -q 'exit: 0'; then echo "build failed, see 11-docker-build.txt"; chown -R "${SUDO_USER:-danny}": "$OUT"; exit 1; fi

docker rm -f $CT >/dev/null 2>&1
docker run -d --name $CT --network host -e PORT=$PORT $IMG >/dev/null
for i in $(seq 1 60); do curl -s -o /dev/null $U/status && break; sleep 0.5; done

{
  echo "== status";            curl -s -w ' [%{http_code}]\n' $U/status
  echo "== init";              curl -s -w ' [%{http_code}]\n' -H 'Content-Type: application/json' -d '{"newRoot":{"username":"root","password":"pw"}}' $U/init
  echo "== status after init"; curl -s -w ' [%{http_code}]\n' $U/status
  echo "== login"
  curl -s -H 'Content-Type: application/json' -d '{"username":"root","password":"pw"}' $U/login \
    | python3 -I -c 'import sys,json; d=json.load(sys.stdin); u=d["user"]; print("user:",u["username"],"type:",u["type"],"accessToken present:",bool(u.get("accessToken")))'
  echo "== login wrong password"; curl -s -o /dev/null -w '[%{http_code}]\n' -H 'Content-Type: application/json' -d '{"username":"root","password":"wrong"}' $U/login
  echo "== container log ERROR and WARN"; docker logs $CT 2>&1 | grep -E 'ERROR|WARN'
  echo "== container node"; docker exec $CT node -v
  echo "== container files"
  docker exec $CT ls -l /app/dist-server/index.js /app/dist-server/server/controllers/LibraryItemController.js /app/dist-server/server/scanner/dynamicKey.js /app/dist-server/server/utils/queryValue.js
  echo "== cleanup"
  docker rm -f $CT && docker rmi $IMG >/dev/null && echo "container and image removed"
} > "$OUT/12-docker-run.txt" 2>&1
cat "$OUT/12-docker-run.txt"
chown "${SUDO_USER:-danny}": "$OUT/11-docker-build.txt" "$OUT/12-docker-run.txt"
