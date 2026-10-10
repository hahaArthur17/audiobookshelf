# Batch 02 contract: small parsers and OPML generator

Targets: `server/utils/parsers/parseNfoMetadata.js`, `parseOPML.js`, `parseUserAgent.js`, `server/utils/generators/opmlGenerator.js`. Parser Sub-Agent owns these files only.

- `parseNfoMetadata` exports named `parseNfoMetadata`. Empty text returns `null`; keys parse case-insensitively; a Book Description consumes later lines; year uses the last four-digit match; preserve odd abridged/unabridged default behavior. Existing direct tests are primary gate.
- `parseOPML` exports named `parse`. Return outline rows in document order for RSS entries with `xmlurl`; missing URL is logged and skipped.
- `parseUserAgent` exports a callable function. Falsey/unrecognized input yields `null`; remove undefined fields from the recognized result.
- `opmlGenerator` exports named `generate`. Skip podcasts without `feedURL`, preserve escaping and conditional XML attributes. Preserve `feedUrl` (import result) versus `feedURL` (generator input) casing.
- Use fixed offline inputs for missing URL, escaping, unknown user agent and malformed/empty NFO; compare Phase 2 and candidate outputs. No source outside the four targets may change.
