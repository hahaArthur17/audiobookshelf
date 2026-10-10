# Batch 14 contract: zip response helpers

Target: `server/utils/zipHelpers.js` only. Main Agent owns the code and acceptance. This contract is frozen before implementation.

- Preserve the three named direct CommonJS arrow exports and their callable shape. `zipDirectoryPipe` and `zipDirectoriesPipe` synchronously call `res.attachment`, construct a zero-compression zip archive, register `close`/`end` on the response and `warning`/`error` on the archive, pipe it, add paths in input order, then finalize. Their Promises resolve only on response `close` and reject on non-ENOENT archive warning or error; ENOENT warning logs and continues. Keep logging and event ordering.
- Preserve `Path.basename` naming for multi-directory roots and files, `handleDownloadError` status/body/return behavior, and its no-op when headers have already been sent. Preserve actual runtime require order, including the existing `express` import used for JSDoc.
- No original tests, callers, archive library, config or lockfile changes. Compare a fixed offline archive/response event fixture against Phase 2 for successful single/multiple paths, warning/error, close/end and error responses. Review emitted JS and run fresh strict build plus all 356 original tests. Do not accept unexplained new behavior differences.
