const h = require('htmlparser2')
const Logger = require('../../Logger')

interface OpmlFeed {
  title: string
  feedUrl: string
}

/**
 * @param opmlText OPML document text.
 */
function parse(opmlText: string): OpmlFeed[] {
  const feeds: OpmlFeed[] = []
  const parser = new h.Parser({
    onopentag: (name: string, attribs: Record<string, string>) => {
      if (name === 'outline' && attribs.type === 'rss') {
        if (!attribs.xmlurl) {
          Logger.error('[parseOPML] Invalid opml outline tag has no xmlurl attribute')
        } else {
          feeds.push({
            title: attribs.title || attribs.text || '',
            feedUrl: attribs.xmlurl
          })
        }
      }
    }
  })
  parser.write(opmlText)
  return feeds
}
module.exports.parse = parse
