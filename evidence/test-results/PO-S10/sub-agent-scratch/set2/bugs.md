# Set 2 bug log (not fixed)

Line numbers are those of the original JavaScript files at HEAD.

1. server/managers/CoverSearchManager.js:67 - `onError(error.message)` passes one argument, but the callback that SocketAuthority.js:415 supplies is `(provider, errorMessage)`: the message is emitted as `provider` and `error` is undefined in the `cover_search_provider_error` event.
2. server/managers/CoverSearchManager.js:227-235 - after `if (typeof result === 'string') covers.push(result)` there is no `else`, so `.covers` and `.cover` are also read on a string result (harmless: both are undefined).
3. server/managers/MigrationManager.js:17 - the default `configPath = global.configPath` reads a global that is never set (the server sets `global.ConfigPath`, capital C), so the default is always undefined and the constructor throws "Config path is required" unless the caller passes configPath (Database.js does).
4. server/managers/CoverManager.js:25-32 - `getFilesInDirectory` returns `fs.readdir(dir)` without await inside try/catch, so the catch never sees a rejected readdir; the rejection reaches the caller (`removeOldCovers`) instead of the `[]` fallback.
5. server/managers/CoverManager.js:34-44 - `removeFile` has the same pattern: the promise chain is returned inside try/catch without await, so a failing `fs.unlink` rejects to the caller and the `return false` fallback is dead code.
6. server/managers/CoverManager.js:50 - `imageExtensions` contains '.jiff', which is not an image extension (probably meant '.jfif'), so an old `cover.jfif` is never removed.
7. server/managers/CacheManager.js:65-70 and 171-176 - the `stream.pipeline` callback calls `res.sendStatus(500)` on a response that `ps.pipe(res)` may already have started to send (possible ERR_HTTP_HEADERS_SENT on a read error).
8. server/managers/BinaryManager.js:157 - `assets?.bin?.[this.platformSuffix]?.[assetName]` indexes with `this.platformSuffix`, which is null on an unsupported platform (getPlatformSuffix() returns null at line 149): the lookup key becomes the string 'null' and the error says "platform null". This is the line the file was restored for (TS2538).
9. server/managers/BackupManager.js:486 (file not converted, noticed while reading) - `output.destroy('Backup too large')` passes a string where Node expects an Error, so the write stream's 'error' handler rejects with a string.
10. server/managers/BackupManager.js:104 (file not converted, noticed while reading) - `req.files.file` is read without a guard in `uploadBackup`; BackupController.upload() tests `req.files.file` but nothing tests `req.files` itself.
