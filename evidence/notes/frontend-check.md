# Frontend check: built Vue client run against the migrated server (2026-10-10)

Purpose: Cameron said manual checking is valid: point the existing frontend at the new backend and see if it works. This is that check, run on my own machine (Windows, Node v24.21.0, npm 11.19.0).
Code under test: branch Aung-Min-Myat/po-s01, 41 of 182 files converted to TypeScript. Commit 8668ce79 changes only CLAUDE.md on top of 7ba65a8b, so the server code is the same as at 7ba65a8b.
Client files changed against the public baseline 7d10b8fc (git diff --stat 7d10b8fc HEAD -- client): no differences (empty output)

## Method
- Client: npm ci and npm run generate inside client/ (Nuxt 2.18.1 static build), output in client/dist (git-ignored).
- Server: npm run build:server (run by npm test), then node dist-server/index.js in production mode on port 3333 with the default base path /audiobookshelf. New empty config and metadata folders outside the repo (D:\SEM-2\574\Project\frontend-check).
- The first start downloaded ffmpeg, ffprobe and nunicode into the repo folder (git-ignored, git status stayed clean).
- I did not use Nuxt dev mode (client on port 3000 with a proxy to 3333). The generated client served by the server calls the same API, and this way the compiled server that would ship is the one under test.
- Test data: one generated 20-second mp3 (title Test Book, artist Test Author).
- Advisor pre-check, not part of my evidence: Claude ran the same steps first in a Linux sandbox (Node 22, headless browser) to test the commands: 0 failed requests, 0 console errors, HLS segment of 53,016 bytes.

## Timeline (NZ time, 2026-10-10; exact from logs unless marked)
- 01:29:48 Start (Get-Date).
- 01:29:48 to 01:33:49 Mistake: the first npm ci and npm run generate ran in the repo root, not in client/. generate failed with Missing script: "generate" (npm log time 01:33:49). The root npm ci had reinstalled the server node_modules from the lock file. About 4 minutes lost. After it, npm test showed 356 passing (6s) and git status --short printed nothing, so nothing was damaged.
- About 01:50 (derived) Client rebuilt in client/: the log ends with Client-side fallback created: 200.html, and client/dist/index.html exists.
- 01:52:47 First session: server started. 01:53:20 binaries installed (about 31 s download). 01:53:23 Listening on port 3333 (about 36 s after start).
- 01:54:20 Root user created. 01:54:30 Login. Socket connected.
- 01:56:34 Library "Library" created, scan added 1 item. 01:56:41 to 01:56:48 there were 36 more scan requests (gaps about 165 to 210 ms). 01:56:53 Library deleted. 01:57:37 Library "Books" created, scan added 1 item, then 4 more scan requests (3 within 0.4 s, 1 at 01:57:45).
- 02:01:11 Backup created (13,029 bytes), Backup successful. Last line of the first log: 02:01:34 (socket reconnect).
- 12:41:10 Second session: server started again, listening 3.5 s later (binaries already present). No scan lines appeared in this session.
- 12:43:43 HLS check through the API (forced transcode): STREAM START, 4 segments, ffmpeg transcode started and ended. 12:44:16 Ctrl+C: clean shutdown, Server stopped. Exiting.

## Results
- Server on Windows with Node 24: started from the compiled output, created a new database, loaded the nunicode extension and initialised all 25 models.
- Setup, login, socket connection, library create and scan (1 item each time), library delete and backup creation all worked (confirmed by the server log).
- Console of both sessions: no WARN, ERROR or FATAL line. Search of the saved daily log after both sessions: 0 matching lines.
- HLS through the API (my own PowerShell output): playMethod 2; playlist status 200 with 4 segments (6, 6, 6 and 2.04 s) and #EXT-X-ENDLIST; segment output-0.ts status 200, 53,016 bytes. HlsRouter and hlsPlaylistGenerator (both converted) were on this path.
- Browser checklist, second pass: I reported "all good" for the home page, item page, playback, settings pages and the Console and Network tabs. I did not write a per-point list or count the Console and Network entries, so this is a summary statement, not an itemised record.
- Browser checklist, first pass: only points 1, 2 and 7 are confirmed (by the log). The rest was not recorded.

## Not verified
- Only one 20-second mp3, one library and one user. Not tested: podcasts, epub reader, uploads, email sending, notifications firing, OIDC, large libraries, the mobile apps.
- No side-by-side run of the baseline server on this machine, so I cannot say that every behaviour is identical, only that the basic paths worked.
- Playback by direct play was checked in the browser (reported); forced transcode was checked through the API only.

## Open item
- The repeated scan requests in the first session (36 on "Library", 4 on "Books"). In the client code, a scan is started only from button clicks (for example the Scan Library button on an empty bookshelf). It was not recorded whether I pressed the button many times or held a key. The second session had no scan lines while I only browsed and played, which fits the click explanation but does not prove it. To settle it: repeat with one new library and no clicking, and compare with the baseline if the burst appears.

## Lessons for the process
- A pasted block that lost its first line (cd client) ran npm in the wrong folder. Each block now starts with Set-Location and prints the path.
- Read-Host shows what is typed. Use a hidden prompt for passwords in later checks.