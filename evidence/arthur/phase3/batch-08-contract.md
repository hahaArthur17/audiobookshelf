# Batch 08 contract: comic and ebook parsing boundary

Targets: `server/utils/parsers/parseComicInfoMetadata.js`, `parseComicMetadata.js` and `parseEbookMetadata.js` (same directory). Parser Sub-Agent owns only these files in its isolated worktree.

- `parseComicInfoMetadata.parse` is a named CommonJS arrow export. A missing `ComicInfo` yields `null`; title, series name/number and description come from the first XML array values, with trim and the original null behavior.
- `parseComicMetadata` has two named function exports. Preserve archive factory/open/getFilePaths/extract/close call order, natural path sorting, top-level `ComicInfo.xml` lookup, UTF-8 decode, image extension selection, payload key presence/order and warning/error behavior. Preserve failure and finally-close paths, including the existing failure if `getFilePaths` returns undefined after a caught error.
- `parseEbookMetadata` dispatches only `epub` and `cbz`/`cbr` to the child parsers and cover extractors; missing or unsupported format returns `null` or `false` as before. Keep CommonJS call shapes and the `EBookFileScanData` type used by scanner/manager JS imports.
- No tests, scanner, manager, extractor, config, lockfile or shared types may be edited. Preserve runtime behavior and export/function identity. Run a fresh strict build and unchanged original tests; use offline fixed samples for comic info, dispatch and mocked archives including empty/failure paths. Report any untested archive formats or contract conflicts to the main Agent. Commit only the three requested JS→TS source renames.
