# Set 3 bug log (PO-S10). Nothing here was fixed.

Line numbers: `.js` = the file at HEAD, `.ts` = the converted file.

## server/scanner/AudioFileScanner (converted)

1. AudioFileScanner.js:112 (.ts:173) - getTrackAndDiscNumberFromFilename() destructures `author` and `series` from the scan metadata, but LibraryItemFilenameMetadata (utils/scandir) has `authors` (an array) and `seriesName`. Both are always undefined, so the author and the series are never removed from the file name before the track number is searched.
2. AudioFileScanner.js:120 (.ts:181) - `partbasename.replace(publishedYear)` has one argument (TS2554). The year is replaced by the text "undefined" instead of being removed.
3. AudioFileScanner.js:468 (.ts:529) - `podcastEpisode.publishedAt = pubJsDate.valueOf()` stores a number in a field that models/PodcastEpisode.ts declares as Date (TS2322 against the model type).
4. AudioFileScanner.js:138 (.ts:199) - `discFromFolder !== null` can never be false (Number() never returns null). Harmless.
5. AudioFileScanner.js:539 (.ts:600) - `afChaptersCleaned.length ?? 0`: the `?? 0` can never apply. Harmless.
6. AudioFileScanner.js:585 (.ts:646) - parseGenresString(): the separator '//' can never be chosen, because '/' is tested first and every string with '//' contains '/'. Harmless (empty parts are filtered out).

JSDoc that does not match the code (not runtime bugs, JSDoc left unchanged):
7. AudioFileScanner.js:154 - scan() is documented as Promise<AudioFile>, but it returns null when the probe fails or the file has no audio stream.
8. AudioFileScanner.js:107 and :153 - the type of mediaMetadataFromScan lists series, sequence and narrators (as a string); the real object is LibraryItemFilenameMetadata.
9. AudioFileScanner.js:217 - `@param audioFile` (one AudioFileObject); the parameter is `audioFiles`, an array.
10. AudioFileScanner.js:417 - scanLogger is documented as ScanLogger; PodcastScanner passes a LibraryScan.

## server/scanner/LibraryScanner (restored; found while trying)

11. LibraryScanner.js:342-357 - fileUtils.getFileTimestampsWithIno() returns false when stat fails, and scanFolder() reads `.ino`, `.mtimeMs`, `.ctimeMs` and `.birthtimeMs` of the result without testing it (TS2339 x5). It only works because `false.ino` is undefined and the next line skips the item.
12. LibraryScanner.js:95 - `library.lastScan = Date.now()` assigns a number to a column that models/Library.ts declares as Date | null (TS2322).
13. LibraryScanner.js:326 and :654 - `libraryItemPath === libraryItemGrouping[libraryItemPath]` and `itemDir === fileUpdateGroup[itemDir]` compare a string with a value that the JSDoc of scandir.groupFileItemsIntoLibraryItemDirs types as string[] (TS2367 x2). At runtime the value is the path string for a media file in the library root, so the documented type Record<string,string[]> is too narrow.
14. LibraryScanner.js:57 - `library.libraryFolders.length` is read without a test, and models/Library.ts declares libraryFolders as optional. scan() relies on every caller having loaded the folders.
15. LibraryScanner.js:284 - passes a LibraryScan to LibraryItemScanner.finalizeAuthorsAndSeriesFromScan(), whose JSDoc says ScanLogger (TS2345: LibraryScan has no `name`).
16. LibraryScanner.js:478 - reads `file.libraryId`; the PendingFileUpdate typedef in Watcher.js has no libraryId (TS2339). Watcher.addFileUpdate() does push it (Watcher.js:314), so the typedef is incomplete.
17. LibraryScanner.js:335 and :339 - the JSDoc of scandir.buildLibraryFile says it returns one LibraryFile; scanFolder() stores the result as the array of library files (TS2740 x2).
18. LibraryScanner.js:314 - passes `library.settings.audiobooksOnly` (boolean | undefined) where the JSDoc of scandir.groupFileItemsIntoLibraryItemDirs says boolean (TS2345).
