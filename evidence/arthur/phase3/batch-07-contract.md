# Batch 07 contract: HLS, profiling and auth rate limit

Targets: `server/utils/generators/hlsPlaylistGenerator.js`, `server/utils/profiler.js` and `server/utils/rateLimiterFactory.js`. Main Agent owns these files.

- HLS generator exports one callable function and returns the `fs.writeFile` result. The text keeps exact line order, hard-coded `#EXTINF:6` for full segments, a final partial segment, and `m4s` extension only for exact `fmp4`.
- Profiler exports named `profile`. It returns an async wrapper; in find-query mode it mutates the first options object with logging and benchmark, records durations in a module-scope histogram, logs, returns the original result or rethrows the original failure.
- Rate limiter exports one singleton instance. The first `getAuthRateLimiter` call caches its middleware; environment values and the disabled-by-zero path are read only when creating that first middleware. Preserve class static fields and instance field order, proxy IP selection, response status/body and logs.
- Fixed sample checks HLS text and exported function shape, profiler result/error/options mutation, and the disabled rate-limiter singleton path. Timing values and timestamped logs are inherently nondeterministic and excluded from equality only for the recorded reasons.
