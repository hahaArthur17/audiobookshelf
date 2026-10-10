interface ComicInfoMetadataXmlValue {
  Series?: string[]
  Number?: string[]
  Summary?: string[]
}

interface ComicInfoMetadataXmlDocument {
  ComicInfo?: ComicInfoMetadataXmlValue | null
}

interface ComicInfoMetadataResult {
  title: string | null
  series: Array<{ name: string; sequence: string | null }>
  description: string | null
}

/**
 * TODO: Add more fields
 * @see https://anansi-project.github.io/docs/comicinfo/intro
 */
module.exports.parse = (comicInfoJson: ComicInfoMetadataXmlDocument | null | undefined): ComicInfoMetadataResult | null => {
  if (!comicInfoJson?.ComicInfo) return null

  const ComicSeries = comicInfoJson.ComicInfo.Series?.[0]?.trim() || null
  const ComicNumber = comicInfoJson.ComicInfo.Number?.[0]?.trim() || null
  const ComicSummary = comicInfoJson.ComicInfo.Summary?.[0]?.trim() || null

  let title = null
  const series: Array<{ name: string; sequence: string | null }> = []
  if (ComicSeries) {
    series.push({
      name: ComicSeries,
      sequence: ComicNumber
    })

    title = ComicSeries
    if (ComicNumber) {
      title += ` ${ComicNumber}`
    }
  }

  return {
    title,
    series,
    description: ComicSummary
  }
}
