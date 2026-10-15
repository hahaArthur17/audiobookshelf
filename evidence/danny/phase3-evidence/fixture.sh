#!/bin/bash
# usage: fixture.sh <library-dir>
L=$1
mkdir -p "$L/Author One/Book One" "$L/Author One/Book Two" "$L/Author One/Book Three" "$L/Author Two/Audio Book"
echo "pdf one" > "$L/Author One/Book One/Book One.pdf"
echo "Description from desc.txt" > "$L/Author One/Book One/desc.txt"
echo "Reader One" > "$L/Author One/Book One/reader.txt"
cat > "$L/Author One/Book One/metadata.opf" <<'OPF'
<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>OPF Title</dc:title>
    <dc:creator opf:role="aut">OPF Author</dc:creator>
    <dc:publisher>OPF Publisher</dc:publisher>
    <dc:date>2001-05-06</dc:date>
    <dc:description>OPF description</dc:description>
    <dc:language>en</dc:language>
    <dc:subject>Fantasy</dc:subject>
    <dc:identifier opf:scheme="ISBN">9781234567897</dc:identifier>
    <meta name="calibre:series" content="OPF Series"/>
    <meta name="calibre:series_index" content="2"/>
  </metadata>
</package>
OPF
echo "pdf two" > "$L/Author One/Book Two/Book Two.pdf"
cat > "$L/Author One/Book Two/metadata.nfo" <<'NFO'
Title: NFO Title
Author: NFO Author
Narrator: NFO Narrator
Series: NFO Series
Genre: Mystery
Published: 1999
NFO
echo "pdf three" > "$L/Author One/Book Three/Book Three.pdf"
cat > "$L/Author One/Book Three/metadata.json" <<'JSON'
{"title":"JSON Title","authors":["JSON Author"],"narrators":["JSON Narrator"],"series":["JSON Series #1"],"genres":["Science Fiction"],"tags":["tag one"],"publishedYear":"1998","publisher":"JSON Publisher","description":"JSON description","language":"English","explicit":false}
JSON
echo "loose" > "$L/Loose Book.pdf"
python3 - "$L/Author Two/Audio Book" <<'PY'
import sys, wave
for i in (1, 2):
    w = wave.open("%s/0%d - Part %d.wav" % (sys.argv[1], i, i), "wb")
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000)
    w.writeframes(b"\x00\x00" * 8000)
    w.close()
PY
