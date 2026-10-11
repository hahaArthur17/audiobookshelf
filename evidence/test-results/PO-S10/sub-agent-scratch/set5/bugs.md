# Set 5 bug log (server/utils). Nothing here was fixed.

Line numbers are those of the JavaScript files at HEAD.

1. server/utils/areEquivalent.js:110 (with 91 and 152) - the array branch returns true without `stack.pop()`, so an array instance that occurs twice in value1 (not circular) throws "areEquivalent value1 is circular". Reproduced: `areEquivalent({ a: arr, b: arr }, { a: [1], b: [1] })` with `arr = [1]` throws.
2. server/utils/areEquivalent.js:64 - `type1 === 'function'` can never be true there; functions are already handled on lines 55-60 (compiler: TS2367).
3. server/utils/comicBookExtractors.js:36 - `return fs.readFile(...)` inside `try` without `await`: a failed read rejects outside the try, so the catch on lines 37-40 (log, return null) never runs.
4. server/utils/comicBookExtractors.js:146-147 - CbzComicBookExtractor.open() passes the result of getBuffer() to Archive.open() without a test; getBuffer() returns null when the file does not exist. (The class is never instantiated: createComicBookExtractor uses the StreamZip class for .cbz.)
5. server/utils/rateLimiterFactory.js:60 - keyGenerator returns `requestIp.getClientIp(req) || req.ip`, which is undefined when neither gives an address; express-rate-limit expects a string key (compiler: TS2322 on line 58).
6. server/utils/scandir.js:77 - a media file in the library root is stored in the group map as a string (`libraryItemGroup[item.name] = item.name`); every other group is an array, lines 87 and 115 call `.push` on group values, and the JSDoc promises Record<string,string[]>.
7. server/utils/scandir.js:128 - the JSDoc says buildLibraryFile returns a LibraryFile; it returns Promise<LibraryFile[]> (documentation only).
8. server/utils/prober.js:76-77 - when no tag key matches, `tagKey` is undefined and the code reads `stream.tags[undefined]` (compiler: TS2538); harmless unless a tag is literally named "undefined".
9. server/utils/libraryHelpers.js:31-32, 169-170, 224-229 - results of `.find()` are dereferenced without a test (`series.bookSeries.sequence`, `filteredSeries.id`); a book whose series list lacks the requested series id throws a TypeError.
10. server/utils/ffmpegHelpers.js:178 and 186-191 - the tag loop treats every value as a string (`.length`, `.slice`), but `year` is a number (PodcastEpisodeDownload.pubYear), so the 10000-character limit never applies to it (harmless today).
11. server/utils/ffmpegHelpers.js:108 - `new Promise(async (resolve) => ...)`: an exception thrown inside the async executor (for example on line 158 when libraryItem.media is missing) becomes an unhandled rejection and the returned promise never settles.
12. server/utils/profiler.js:17-20 - with isFindQuery true (the default), a profiled function called without arguments throws on line 19 because `findOptions` is undefined; only reachable with QUERY_PROFILING set, and I did not check whether any caller does this.
