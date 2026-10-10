# Batch 05 contract: ABS metadata and series string

Targets: `server/utils/parsers/parseSeriesString.js` and `server/utils/generators/abmetadataGenerator.js`. Parser Sub-Agent owns these files only.

- `parseSeriesString` exports named arrow `parse`. Non-string/empty input returns `null`; otherwise it returns name and nullable sequence. The regex accepts a terminal ` #<nonspace/non#>` token, preserving the untrimmed name otherwise.
- `abmetadataGenerator` exports named `parseJson`. It parses current and legacy nested metadata, maps legacy podcast aliases, validates media-specific keys, preserves nullable scalar values, deduplicates trimmed string arrays, converts numbers to strings, converts a null chapters field to `[]`, and returns `null` for invalid JSON or media type.
- Bad chapter arrays make the chapters field disappear. The existing `isNaN` checks accept numeric strings and preserve their original string values. Log warnings/errors and output order are observable.
- Preserve original `module.exports` shape and exact object/array behavior; do not modify the consuming scanner or shared types. Compare fixed valid, legacy, invalid and chapter samples to Phase 2 build.
