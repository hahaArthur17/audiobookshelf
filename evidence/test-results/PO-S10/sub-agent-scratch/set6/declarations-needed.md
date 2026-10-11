# Set 6: declarations needed

None. The six converted files (MusicBrainz, opmlGenerator, GoogleBooks, CustomProviderAdapter, FantLab, parseEbookMetadata) are clean under the normal check (tsconfig.check.json) without any new declaration.

set6/pending.d.ts is unchanged: no `declare module 'xml2js'` block is proposed, because parseOverdriveMediaMarkers.js was not converted (see report.md, section 2) and I could not test a declaration against a converted file.

Note for a later stage (not a request): parseNameString needs overloads in server/utils/parsers/parseFullName.ts (a one-argument call returns the whole ParsedName object); that is a change of a signature, not a declaration.
