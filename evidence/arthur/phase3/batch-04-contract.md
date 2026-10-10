# Batch 04 contract: constants, notification definitions and HTML

Targets: `server/utils/constants.js`, `notifications.js`, `htmlEntities.js`, `htmlSanitizer.js`. Main Agent owns these files.

- `constants` exposes named objects whose numeric/string values are used throughout server startup, scanning, auth and API responses. Preserve key order and exact values.
- `notifications` exposes a live `notificationData.events` object; event names, variables, defaults and package-version-derived test value remain unchanged.
- `htmlEntities` exposes the full named `entities` map, including keys both with and without semicolons. Preserve key count, order and values.
- `htmlSanitizer` exports named `sanitize` and `stripAllTags` functions. `decodeHTMLEntities` is private to the module. Non-string input returns empty string for the two exported functions; the private decoder replaces known entities and passes unknown ones through. Preserve allowed tags/attributes/schemes and output.
- Verify compiled exports and fixed HTML inputs against the Phase 2 build; do not silently alter entity decoding or object identity.
