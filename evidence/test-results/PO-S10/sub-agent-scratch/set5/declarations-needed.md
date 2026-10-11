# Set 5: declarations needed

None for the two converted files (server/utils/profiler.ts, server/utils/comicBookExtractors.ts). Both are clean under the normal check.

set5/pending.d.ts is unchanged (empty). `xml2js` and `ssrf-req-filter` are only required by index.js, fileUtils.js, ffmpegHelpers.js and podcastUtils.js, and those four files stay JavaScript (see report.md, section 2), so I wrote no declaration for them.

Not a request I can phrase as one line, but it blocks zipHelpers.js (and will block managers/BackupManager.js, which also requires it): server/libs/archiver/index.js is tagged `@constructor` in its JSDoc, so TypeScript refuses to call `archiver('zip', {...})` (TS2348), and no single-step cast to a callable type compiles (TS2352). It needs either a declaration file that the compiler prefers over the JavaScript (an index.d.ts next to it, as server/libs/fluentFfmpeg/index.d.ts does; server/libs is closed to everyone in this run) or a ruling on the cast. Details and the exact compiler lines are in report.md, section 2c.
