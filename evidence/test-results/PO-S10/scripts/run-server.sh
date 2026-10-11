#!/bin/bash
APP=$1; LABEL=$2; PORT=$3
rm -rf $HOME/abs-$LABEL; mkdir -p $HOME/abs-$LABEL/config $HOME/abs-$LABEL/metadata
export CONFIG_PATH=$HOME/abs-$LABEL/config METADATA_PATH=$HOME/abs-$LABEL/metadata PORT=$PORT SKIP_BINARIES_CHECK=1 NODE_ENV=production FFMPEG_PATH=/usr/bin/ffmpeg FFPROBE_PATH=/usr/bin/ffprobe
cd $APP
node dist-server/index.js > $HOME/audit/boot-$LABEL.log 2>&1 &
SP=$!
for i in $(seq 1 40); do sleep 1; if curl -s localhost:$PORT/ping | grep -q success; then echo "server up after ${i}s"; break; fi; done
timeout 120 node $HOME/audit/smoke.js http://localhost:$PORT "$HOME/abs-src/books" $HOME/audit/smoke-$LABEL.txt
kill $SP 2>/dev/null; sleep 1
echo "boot log lines: $(wc -l < $HOME/audit/boot-$LABEL.log); ERROR lines: $(grep -c ' ERROR' $HOME/audit/boot-$LABEL.log); FATAL: $(grep -c FATAL $HOME/audit/boot-$LABEL.log)"
