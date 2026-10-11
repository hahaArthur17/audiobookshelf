import xml = require('../../libs/xml')
import escapeForXML = require('../../libs/xml/escapeForXML')

type Podcast = import('../../models/Podcast')

/** Attributes of one outline element; the optional ones are added only when the podcast has a value */
interface OpmlFeedAttributes {
  type: string
  text: string
  title: string
  xmlUrl: string
  description?: string
  htmlUrl?: string
  language?: string
}

/**
 * Generate OPML file string for podcasts in a library
 * @param {import('../../models/Podcast')[]} podcasts 
 * @param {boolean} [indent=true] 
 * @returns {string}
 */
const generate = (podcasts: Podcast[], indent: boolean = true): string => {
  const bodyItems: { outline: { _attr: OpmlFeedAttributes } }[] = []
  podcasts.forEach((podcast) => {
    if (!podcast.feedURL) return
    const feedAttributes: OpmlFeedAttributes = {
      type: 'rss',
      text: escapeForXML(podcast.title),
      title: escapeForXML(podcast.title),
      xmlUrl: escapeForXML(podcast.feedURL)
    }
    if (podcast.description) {
      feedAttributes.description = escapeForXML(podcast.description)
    }
    if (podcast.itunesPageUrl) {
      feedAttributes.htmlUrl = escapeForXML(podcast.itunesPageUrl)
    }
    if (podcast.language) {
      feedAttributes.language = escapeForXML(podcast.language)
    }
    bodyItems.push({
      outline: {
        _attr: feedAttributes
      }
    })
  })

  const data = [
    {
      opml: [
        {
          _attr: {
            version: '1.0'
          }
        },
        {
          head: [
            {
              title: 'Audiobookshelf Podcast Subscriptions'
            }
          ]
        },
        {
          body: bodyItems
        }
      ]
    }
  ]

  return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml(data, indent)
}

export = { generate }