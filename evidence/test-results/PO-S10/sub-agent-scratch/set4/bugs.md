# Set 4 bug log (PO-S10). Nothing here was fixed.

Line numbers are those of the JavaScript file at HEAD.

1. server/scanner/MediaProbeData.js, lines 54-60: setData() stores data.audio_stream in this.audioStream and then reads seven
   properties of it without a test. utils/prober.js parseProbeData() sets audio_stream to null when a file has a video stream
   but no audio stream (getDefaultAudioStream returns null; probe() only rejects when BOTH streams are missing). The TypeError
   is swallowed by the .catch in probe() and comes back as `{ error: <TypeError> }`. Consequence: the test
   `if (!probeData.audioStream)` in scanner/AudioFileScanner.js (line 164 at HEAD) can never see a MediaProbeData without an
   audio stream.
2. server/objects/files/LibraryFile.js, lines 64-71: setDataFromPath() never tests the result of
   fileUtils.getFileTimestampsWithIno(), which is `false` when fs.stat fails (file removed between the directory read and the
   stat). Then fileMetadata.setData(false) copies nothing and `this.ino = fileTsData.ino` stores undefined: a library file
   without ino, size and timestamps is created silently.
3. server/scanner/LibraryItemScanner.js, lines 146-154: getLibraryItemScanData() never tests the result of
   fileUtils.getFileTimestampsWithIno() either; on a failed stat the scan data gets ino undefined and timestamps 0.
4. server/objects/Backup.js, line 37: `if (this.key == 1)` compares a string (a line of the details file) with the number 1.
   It works only through loose equality ('1' == 1). Not a runtime bug; the compiler reports TS2367 once the field is typed
   (allowance 1 would apply).
5. server/objects/PlaybackSession.js, lines 239 and 247 (by reading, not compiled): addListeningTime() passes the same value to
   isNaN() (wants a number) and Number.parseFloat() (wants a string), and `this.timeListening += ...` runs while timeListening
   is null for a session that construct() built from stored data with timeListening 0 or missing
   (`session.timeListening || null`). It works only because null coerces to 0.
6. server/objects/PodcastEpisodeDownload.js, line 25: startedAt is set to null in the constructor and never assigned anywhere
   (no assignment in PodcastManager either), so toJSONForClient() always sends startedAt: null.
7. server/scanner/OpfFileScanner.js lines 19-27 and server/scanner/NfoFileScanner.js lines 19-27: the comments say
   "Add tags only if tags are empty" / "Add genres only if genres are empty", but the code overwrites bookMetadata.tags and
   .genres whenever the parsed file has any, without looking at what bookMetadata already holds.
9. Seen while checking the callers of PodcastEpisodeDownload (a file of set 1, not mine): server/managers/PodcastManager.js
   line 78 logs `this.currentDownload.episodeTitle` in the "Episode already in queue" warning, where the episode that is
   already queued is podcastEpisodeDownload (line 81 uses the right one).
8. Documentation only: LibraryItemScanner.js line 26 documents updateLibraryItemDetails as {relPath, path} but lines 37 and 61
   also read .libraryFolderId and .isFile; line 27 documents the return of an async method as number; lines 63, 65 and 219 pass
   a ScanLogger where the JSDoc of the callees says LibraryScan. AbsMetadataFileScanner.js lines 13 and 53 document libraryScan
   as LibraryScan although a ScanLogger arrives too (LibraryItemScanner.scanLibraryItem -> BookScanner/PodcastScanner).
