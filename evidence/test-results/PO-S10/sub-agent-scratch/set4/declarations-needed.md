# Set 4: declarations needed

## For the converted files
None. The four converted files (objects/PodcastEpisodeDownload.ts, scanner/LibraryScan.ts, scanner/OpfFileScanner.ts,
scanner/AbsMetadataFileScanner.ts) compile without errors and wait for nothing.

## Not requests: what would unblock files that stayed JavaScript (each needs a ruling, not a declaration in models/ or types/)
1. scanner/NfoFileScanner.js (lines 45-46 read nfoMetadata[key] by a dynamic key):
   target server/utils/parsers/parseNfoMetadata.ts (converted, outside models/ and types/), inside `interface NfoMetadata`:
       [key: string]: unknown // NfoFileScanner.scanBookNfoFile() reads the parsed fields by a dynamic key
   With that line the file needs two more `!` of case L at lines 20 and 25 (nfoMetadata.tags / .genres inside
   `for (const key in nfoMetadata)` + `key === 'tags'`), and nothing else.
2. objects/Backup.js: the only blocker is server/controllers/BackupController.ts line 159, `res.sendFile(req.backup.fullPath)`,
   which needs a string while the class stores null until construct() or setData() runs. A declaration cannot fix it; it needs
   either an edit of BackupController.ts (for example `type RequestWithBackup = ... & { backup: Backup & { fullPath: string } }`)
   or a ruling that a field may be declared non-null with one case-F `!` at its null initialiser (`this.fullPath = null!`).
3. objects/files/AudioFile.js: the same conflict with server/objects/files/AudioTrack.ts lines 42 and 47
   (`audioFile.metadata.filename`, `audioFile.metadata.clone()`), which read metadata without a guard.
