# Batch 01 contract: core small utilities

Targets: `server/utils/globals.js`, `longTimeout.js`, `requestUtils.js`, `stringifySequelizeQuery.js`. Main Agent owns the files.

- `globals` exports one live object with five ordered extension arrays. No copying or freezing.
- `longTimeout` exports a constructor. `set(fn, timeout)` synchronously calls its internal scheduling path; later callback timing and `clear()` behavior are preserved. `timer` starts `null`.
- `requestUtils` exports a named-property object with `isRequestSecure`, `getRequestProtocol` and `getRequestOrigin`. It obtains headers through Express-style `req.get`, accepts comma-separated forwarded protocols, and returns protocol/host/origin without adding validation.
- `stringifySequelizeQuery` exports a callable function. `JSON.stringify` replacer maps symbol properties to string keys and class constructors to names. Preserve output order and errors from unsupported/circular inputs.
- Verify direct `require` shape, representative values and edge inputs against Phase 2 build before accepting.
