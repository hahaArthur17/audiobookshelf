interface ParsedSeries {
  name: string
  sequence: string | null
}

/** Parse a series string into a name and sequence. */
module.exports.parse = (seriesString: unknown): ParsedSeries | null => {
  if (!seriesString || typeof seriesString !== 'string') return null

  let sequence: string | null = null
  let name = seriesString
  // Series sequence match any characters after " #" other than whitespace and another #
  //  e.g. "Name #1a" is valid. "Name #1#a" or "Name #1 a" is not valid.
  const matchResults = seriesString.match(/ #([^#\s]+)$/) // Pull out sequence #
  if (matchResults && matchResults.length && matchResults.length > 1) {
    sequence = matchResults[1] // Group 1
    name = seriesString.replace(matchResults[0], '')
  }
  return {
    name,
    sequence
  }
}
