interface OpfXmlNode {
  [key: string]: unknown
  _?: unknown
  $?: Record<string, unknown>
}

interface OpfMetadataRecord {
  [key: string]: unknown
  meta?: unknown
}

interface OpfMetadataRefinement {
  value: unknown
  refines: unknown
  property: unknown
}

interface OpfMetadataParsedMeta {
  [key: string]: unknown
  refines?: OpfMetadataRefinement[]
}

interface OpfMetadataCreator {
  value: string
  role: unknown
  fileAs: unknown
}

interface OpfMetadataSeries {
  name: string
  sequence: string | null
}

interface OpfMetadataResult {
  title: string | null
  subtitle: string | null
  authors: string[]
  narrators: string[]
  publishedYear: string | null
  publisher: string | null
  isbn: string | null
  asin: string | null
  description: string | null
  genres: string[]
  language: string | null
  series: OpfMetadataSeries[]
  tags: string[]
}

interface OpfParserLoggerSanitizer {
  stripAllTags(value: string): string
}

interface OpfParserModuleReceiver {
  parseOpfMetadataJson(json: unknown): OpfMetadataResult | null
}

type OpfParserXmlToJson = (xml: string) => Promise<unknown | null>

const { xmlToJSON: OpfParserXmlToJSON }: { xmlToJSON: OpfParserXmlToJson } = require('../index')
const OpfParserHtmlSanitizer: OpfParserLoggerSanitizer = require('../htmlSanitizer')
const OpfParserExportReceiver = module.exports as OpfParserModuleReceiver

function OpfParseCreators(metadata: OpfMetadataRecord): Array<OpfMetadataCreator | false> | null {
  if (!(metadata['dc:creator'] as OpfXmlNode[] | null | undefined)?.length) return null
  return (metadata['dc:creator'] as OpfXmlNode[]).map((creatorNode) => {
    if (typeof creatorNode !== 'object' || !creatorNode['$'] || !creatorNode['_']) return false
    const namespace =
      Object.keys(creatorNode['$'] as Record<string, unknown>)
        .find((key) => key.startsWith('xmlns:'))
        ?.split(':')[1] || 'opf'
    const creator: OpfMetadataCreator = {
      value: creatorNode['_'] as string,
      role: (creatorNode['$'] as Record<string, unknown>)[`${namespace}:role`] || null,
      fileAs: (creatorNode['$'] as Record<string, unknown>)[`${namespace}:file-as`] || null
    }

    const id = (creatorNode['$'] as Record<string, unknown>)['id']
    if (id && (metadata.meta as OpfMetadataParsedMeta).refines?.some((refinement) => refinement.refines === `#${id}`)) {
      const creatorMeta = (metadata.meta as OpfMetadataParsedMeta).refines!.filter((refinement) => refinement.refines === `#${id}`)
      if (creatorMeta) {
        creator.role = creatorMeta.find((refinement) => refinement.property === 'role')?.value || creator.role || null
        creator.fileAs = creatorMeta.find((refinement) => refinement.property === 'file-as')?.value || creator.fileAs || null
      }
    }

    return creator
  })
}

function OpfFetchCreators(creators: Array<OpfMetadataCreator | false> | null | undefined, role: string): string[] | null {
  if (!creators?.length) return null
  return [...new Set(creators.filter((creator) => (creator as OpfMetadataCreator).role === role && (creator as OpfMetadataCreator).value).map((creator) => (creator as OpfMetadataCreator).value))]
}

function OpfFetchTagString(metadata: OpfMetadataRecord, tag: string): string | null {
  if (!metadata[tag] || !(metadata[tag] as Array<string | OpfXmlNode>).length) return null
  let value: unknown = (metadata[tag] as Array<string | OpfXmlNode>)[0]

  /*
    EXAMPLES:

    "dc:title": [
      {
        "_": "The Quest for Character",
        "$": {
          "opf:file-as": "Quest for Character What the Story of Socrates and Alcibiades"
        }
      }
    ]

    OR

    "dc:title": [
      "The Quest for Character"
    ]
  */
  if (typeof value === 'object') value = (value as OpfXmlNode)._
  if (typeof value !== 'string') return null
  return value
}

function OpfFetchDate(metadata: OpfMetadataRecord): string | null {
  const date = OpfFetchTagString(metadata, 'dc:date')
  if (!date) return null
  const dateSplit = date.split('-')
  if (!dateSplit.length || dateSplit[0].length !== 4 || (isNaN as (value: unknown) => boolean)(dateSplit[0])) return null
  return dateSplit[0]
}

function OpfFetchPublisher(metadata: OpfMetadataRecord): string | null {
  return OpfFetchTagString(metadata, 'dc:publisher')
}

function OpfFetchIdentifier(metadata: OpfMetadataRecord, scheme: string): string | null {
  if (!(metadata['dc:identifier'] as OpfXmlNode[] | null | undefined)?.length) return null
  const identifierObj = (metadata['dc:identifier'] as OpfXmlNode[]).find((identifier) => {
    if (!identifier['$']) return false
    const namespace =
      Object.keys(identifier['$'] as Record<string, unknown>)
        .find((key) => key.startsWith('xmlns:'))
        ?.split(':')[1] || 'opf'
    return (identifier['$'] as Record<string, unknown>)[`${namespace}:scheme`] === scheme
  })
  return identifierObj?.['_'] as string || null
}

function OpfFetchISBN(metadata: OpfMetadataRecord): string | null {
  return OpfFetchIdentifier(metadata, 'ISBN')
}

function OpfFetchASIN(metadata: OpfMetadataRecord): string | null {
  return OpfFetchIdentifier(metadata, 'ASIN')
}

function OpfFetchTitle(metadata: OpfMetadataRecord): string | null {
  return OpfFetchTagString(metadata, 'dc:title')
}

function OpfFetchSubtitle(metadata: OpfMetadataRecord): string | null {
  return OpfFetchTagString(metadata, 'dc:subtitle')
}

function OpfFetchDescription(metadata: OpfMetadataRecord): string | null {
  let description = OpfFetchTagString(metadata, 'dc:description')
  if (!description) return null
  // check if description is HTML or plain text. only plain text allowed
  // calibre stores < and > as &lt; and &gt;
  description = description.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  return OpfParserHtmlSanitizer.stripAllTags(description)
}

function OpfFetchGenres(metadata: OpfMetadataRecord): string[] {
  if (!metadata['dc:subject'] || !(metadata['dc:subject'] as unknown[]).length) return []
  return [...new Set((metadata['dc:subject'] as unknown[]).filter((genre) => genre && typeof genre === 'string'))] as string[]
}

function OpfFetchLanguage(metadata: OpfMetadataRecord): string | null {
  return OpfFetchTagString(metadata, 'dc:language')
}

function OpfFetchSeries(metadataMeta: OpfXmlNode[] | null | undefined): OpfMetadataSeries[] {
  if (!metadataMeta) return []
  const result: OpfMetadataSeries[] = []
  for (let i = 0; i < metadataMeta.length; i++) {
    if ((metadataMeta[i].$ as Record<string, unknown> | undefined)?.name === 'calibre:series' && ((metadataMeta[i].$ as Record<string, unknown>).content as string | undefined)?.trim()) {
      const name = ((metadataMeta[i].$ as Record<string, unknown>).content as string).trim()
      let sequence: string | null = null
      if ((metadataMeta[i + 1]?.$ as Record<string, unknown> | undefined)?.name === 'calibre:series_index' && ((metadataMeta[i + 1].$ as Record<string, unknown> | undefined)?.content as string | undefined)?.trim()) {
        sequence = ((metadataMeta[i + 1].$ as Record<string, unknown>).content as string).trim()
      }
      result.push({ name, sequence })
    }
  }

  // If one series was found with no series_index then check if any series_index meta can be found
  //   this is to support when calibre:series_index is not directly underneath calibre:series
  if (result.length === 1 && !result[0].sequence) {
    const seriesIndexMeta = metadataMeta.find((metaNode) => (metaNode.$ as Record<string, unknown> | undefined)?.name === 'calibre:series_index' && ((metaNode.$ as Record<string, unknown>).content as string | undefined)?.trim())
    if (seriesIndexMeta) {
      result[0].sequence = ((seriesIndexMeta.$ as Record<string, unknown>).content as string).trim()
    }
  }

  // Remove duplicates
  const dedupedResult = result.filter((series, index) => result.findIndex((candidate) => candidate.name === series.name) === index)

  return dedupedResult
}

function OpfFetchNarrators(creators: Array<OpfMetadataCreator | false> | null, metadata: OpfMetadataRecord): unknown {
  const narrators = OpfFetchCreators(creators, 'nrt')
  if (narrators?.length) return narrators
  try {
    const narratorsJSON = JSON.parse((OpfFetchTagString(metadata.meta as OpfMetadataRecord, 'calibre:user_metadata:#narrators') as string).replace(/&quot;/g, '"')) as Record<string, unknown>
    return narratorsJSON['#value#']
  } catch {
    return null
  }
}

function OpfFetchTags(metadata: OpfMetadataRecord): string[] {
  if (!metadata['dc:tag'] || !(metadata['dc:tag'] as unknown[]).length) return []
  return [...new Set((metadata['dc:tag'] as unknown[]).filter((tag) => tag && typeof tag === 'string'))] as string[]
}

function OpfStripPrefix(str: string): string {
  if (!str) return ''
  return str.split(':').pop() as string
}

module.exports.parseOpfMetadataJson = (json: unknown): OpfMetadataResult | null => {
  // Handle <package ...> or with prefix <ns0:package ...>
  const jsonRecord = json as Record<string, unknown>
  const packageKey = Object.keys(json as object).find((key) => OpfStripPrefix(key) === 'package')
  if (!packageKey) return null
  const prefix = packageKey.split(':').shift()
  let metadata = prefix ? (jsonRecord[packageKey] as Record<string, unknown>)[`${prefix}:metadata`] || (jsonRecord[packageKey] as Record<string, unknown>).metadata : (jsonRecord[packageKey] as Record<string, unknown>).metadata
  if (!metadata) return null
  if (Array.isArray(metadata)) {
    if (!metadata.length) return null
    metadata = metadata[0]
  }

  const metadataRecord = metadata as OpfMetadataRecord
  const metadataMeta = (prefix ? metadataRecord[`${prefix}:meta`] || metadataRecord.meta : metadataRecord.meta) as OpfXmlNode[] | null | undefined

  metadataRecord.meta = {}
  if (metadataMeta?.length) {
    metadataMeta.forEach((metaNode) => {
      if ((metaNode?.['$'] as Record<string, unknown> | undefined)?.name) {
        (metadataRecord.meta as OpfMetadataParsedMeta)[(metaNode['$'] as Record<string, unknown>).name as string] = [(metaNode['$'] as Record<string, unknown>).content || '']
      } else if ((metaNode?.['$'] as Record<string, unknown> | undefined)?.refines) {
        // https://www.w3.org/TR/epub-33/#sec-meta-elem

        const parsedMeta = metadataRecord.meta as OpfMetadataParsedMeta
        if (!parsedMeta.refines) {
          parsedMeta.refines = []
        }
        parsedMeta.refines.push({
          value: metaNode._,
          refines: (metaNode['$'] as Record<string, unknown>).refines,
          property: (metaNode['$'] as Record<string, unknown>).property
        })
      }
    })
  }
  const creators = OpfParseCreators(metadataRecord)
  const authors = (OpfFetchCreators(creators, 'aut') || []).map((author) => (author as string | null | undefined)?.trim()).filter((author) => author) as string[]
  const narrators = (OpfFetchNarrators(creators, metadataRecord) || []) as unknown[]
  const parsedNarrators = narrators.map((narrator) => (narrator as string | null | undefined)?.trim()).filter((narrator) => narrator) as string[]
  return {
    title: OpfFetchTitle(metadataRecord),
    subtitle: OpfFetchSubtitle(metadataRecord),
    authors,
    narrators: parsedNarrators,
    publishedYear: OpfFetchDate(metadataRecord),
    publisher: OpfFetchPublisher(metadataRecord),
    isbn: OpfFetchISBN(metadataRecord),
    asin: OpfFetchASIN(metadataRecord),
    description: OpfFetchDescription(metadataRecord),
    genres: OpfFetchGenres(metadataRecord),
    language: OpfFetchLanguage(metadataRecord),
    series: OpfFetchSeries(metadataMeta),
    tags: OpfFetchTags(metadataRecord)
  }
}

module.exports.parseOpfMetadataXML = async (xml: string): Promise<OpfMetadataResult | null> => {
  const json = await OpfParserXmlToJSON(xml)
  if (!json) return null

  return OpfParserExportReceiver.parseOpfMetadataJson(json)
}
