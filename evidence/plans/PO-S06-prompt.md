This is the Audiobookshelf server, a self-hosted audiobook and podcast server written in JavaScript. The maintainers are moving it to TypeScript, so that mistakes are found when the code is built and so that people can change it with more confidence. The folder server/finders/ has already been moved and shows how this project does it.

Please move these files to TypeScript. Only these files are in scope:
- server/objects/Notification.js
- server/objects/Task.js
- server/objects/TrackProgressMonitor.js
- server/objects/files/AudioTrack.js
- server/objects/metadata/AudioMetaTags.js
- server/providers/OpenLibrary.js
- server/utils/areEquivalent.js
- server/utils/generators/hlsPlaylistGenerator.js
- server/utils/globals.js
- server/utils/longTimeout.js
- server/utils/parsers/parseFullName.js
- server/utils/parsers/parseNfoMetadata.js
- server/utils/parsers/parseUserAgent.js
- server/utils/stringifySequelizeQuery.js

When you are done, the project should build, all the tests should still pass, and the server should behave exactly as before. Look through the repository first and work out what you need. Commit your work as you go with the prefix [PO-S06]. Do not change the tests or the build configuration; if you think they need to change, tell me instead. Do not ask me questions unless you are blocked. When you stop, tell me what you converted, what you could not convert, and anything you could not verify.