#!/bin/bash
# usage: mkfixture.sh <new-empty-dir>   (creates books/ and podcasts/ in it)
set -e
L="$1/books"; P="$1/podcasts"
bash /home/danny/Code/compx574/a4-context/phase3-evidence/fixture.sh "$L"
tone() { ffmpeg -loglevel error -f lavfi -i "sine=frequency=$1:duration=$2" -ac 1 -ar 22050 -b:a 32k "${@:3}"; }
mkdir -p "$L/Tag Author/Tagged Book" "$L/Author Six/Series Book"
tone 440 2 -metadata title="Chapter One" -metadata artist="Tag Author" -metadata album_artist="Tag Author" -metadata album="Tagged Book Album" -metadata genre="Thriller" -metadata date="2010" -metadata track="1/2" -metadata composer="Tag Narrator" -metadata publisher="Tag Pub" -metadata comment="Tagged description" "$L/Tag Author/Tagged Book/01.mp3"
tone 550 2 -metadata title="Chapter Two" -metadata artist="Tag Author" -metadata album="Tagged Book Album" -metadata track="2/2" "$L/Tag Author/Tagged Book/02.mp3"
tone 660 1 -metadata title="Only" "$L/Author Six/Series Book/Series Book.mp3"
echo "epub-ish" > "$L/Author Six/Series Book/Series Book.epub"
mkdir -p "$P/My Show" "$P/Other Show"
tone 300 2 -metadata title="Episode 1: Start" -metadata artist="Show Host" -metadata album="My Show" -metadata genre="Podcast" -metadata date="2021" -metadata track="1" -metadata comment="First ep" "$P/My Show/ep1.mp3"
tone 350 2 -metadata title="Episode 2: Next" -metadata artist="Show Host" -metadata album="My Show" -metadata track="2" "$P/My Show/ep2.mp3"
tone 400 1 "$P/Other Show/untagged.mp3"
