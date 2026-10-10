/** File extensions (lower case, no leading dot) the server recognises, grouped by kind. Shared lookup tables, so read-only to TypeScript callers. */
interface Globals {
  readonly SupportedImageTypes: readonly string[]
  readonly SupportedAudioTypes: readonly string[]
  readonly SupportedEbookTypes: readonly string[]
  readonly TextFileTypes: readonly string[]
  readonly MetadataFileTypes: readonly string[]
}

const globals: Globals = {
  SupportedImageTypes: ['png', 'jpg', 'jpeg', 'webp'],
  SupportedAudioTypes: ['m4b', 'mp3', 'm4a', 'flac', 'opus', 'ogg', 'oga', 'mp4', 'aac', 'wma', 'aiff', 'aif', 'wav', 'webm', 'webma', 'mka', 'awb', 'caf', 'mpg', 'mpeg'],
  SupportedEbookTypes: ['epub', 'pdf', 'mobi', 'azw3', 'cbr', 'cbz'],
  TextFileTypes: ['txt', 'nfo'],
  MetadataFileTypes: ['opf', 'abs', 'xml', 'json']
}

export = globals
