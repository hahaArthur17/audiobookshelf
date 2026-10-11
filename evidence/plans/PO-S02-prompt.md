# PO-S02 prompt (stage 1, the spike)

This is a spike of about 30 minutes. Follow CLAUDE.md. Try these five targets, in this order. For each one, either convert it so the build and all 356 tests pass, or leave it unconverted and report why.
1. server/scanner/ScanLogger.js and server/objects/files/EBookFile.js (fields that start as null: try the non-null assertion rule).
2. server/objects/Notification.js and server/objects/metadata/FileMetadata.js (assignment by dynamic key: try the index signature rule).
3. server/managers/ApiCacheManager.js (it has tests; it uses express types).
4. server/controllers/CacheController.js (the smallest controller; it uses express types).
5. The smallest file in server/models/ (for example Setting.js). Do not commit anything for it. Try for at most 20 minutes to find a type-only way past the clash between its static init and Model.init, and report every approach you tried with its compiler errors.
Commit each passing step with the prefix [PO-S02]. Do not ask me questions unless you are blocked. When you stop, report for each target: converted or not, the technique you used, how many ! assertions, index signatures and casts you added, and the compiler errors for anything you could not convert.
