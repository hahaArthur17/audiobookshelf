// Offline, fixed-input comparison across the baseline and experiment builds.
// Usage: node check-behavior.cjs /absolute/path/to/checkout
const path = require('path')
const root = process.argv[2]
if (!root) throw new Error('Provide a checkout path')

const load = (name) => require(path.join(root, 'dist-server', 'server', name))
const book = load('finders/BookFinder')
const author = load('finders/AuthorFinder')
const podcast = load('finders/PodcastFinder')
const controller = load('controllers/SearchController')
const providerNames = ['OpenLibrary', 'GoogleBooks', 'Audible', 'iTunes', 'Audnexus', 'FantLab', 'AudiobookCovers', 'CustomProviderAdapter', 'MusicBrainz']
const providers = Object.fromEntries(providerNames.map((name) => [name, load(`providers/${name}`)]))

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this }
  }
}

async function main() {
  const result = {
    exports: {
      book: typeof book.search,
      bookNested: typeof book.constructor.TitleCandidates,
      author: typeof author.findAuthorByName,
      podcast: typeof podcast.search,
      controller: typeof controller.findBooks
    },
    providerExports: Object.fromEntries(providerNames.map((name) => [name, typeof providers[name]])),
    emptyBookSearch: await book.search(null, 'google', '', ''),
    emptyAuthorAsin: author.findAuthorByASIN('', 'us'),
    emptyPodcastSearch: await podcast.search(''),
    emptyPodcastCovers: await podcast.findCovers(''),
    scoredBooks: book.filterSearchResults([{ title: 'The Great Book', author: 'Jane Smith', cover: 'cover.jpg' }], 'The Great Book', 'Jane Smith', 4, 4),
    confidence: book.calculateMatchConfidence({ title: 'The Great Book', author: 'Jane Smith', duration: 60 }, 60, 'The Great Book', 'Jane Smith', false)
  }

  const google = new providers.GoogleBooks()
  result.googleClean = google.cleanResult({ id: 'g', volumeInfo: { title: 'Sample', authors: ['A'], publisherDate: '2020-01-01' } })
  result.googleAbsentVolume = google.cleanResult({ id: 'g2' })
  result.itunesEmpty = new providers.iTunes().search({})
  result.musicBrainzEmpty = new providers.MusicBrainz().searchTrack({})
  result.invalidAuthorRequest = new providers.Audnexus().authorRequest('bad', 'us')

  const originalOpenLibrary = book.openLibrary.searchTitle
  book.openLibrary.searchTitle = async () => ({ errorCode: 404 })
  try {
    result.openLibraryError = await book.getOpenLibResults('x', '', 4, 4)
  } finally {
    book.openLibrary.searchTitle = originalOpenLibrary
  }

  const originalSearch = book.search
  book.search = async () => [{ title: 'Mock Book', cover: 'mock-cover' }]
  try {
    const res = response()
    await controller.findBooks({ query: { title: 'Mock Book' } }, res)
    result.booksApi = { statusCode: res.statusCode, body: res.body }
  } finally {
    book.search = originalSearch
  }

  const invalidAsinResponse = response()
  await controller.findChapters({ query: { asin: 'bad' } }, invalidAsinResponse)
  result.invalidAsinApi = { statusCode: invalidAsinResponse.statusCode, body: invalidAsinResponse.body }

  const originalGoogleSearch = book.googleBooks.search
  book.googleBooks.search = async () => [{ title: 'Good' }, null]
  try {
    result.googleMissingVolume = await book.getGoogleBooksResults('Good', '')
  } finally {
    book.googleBooks.search = originalGoogleSearch
  }

  console.log('BEHAVIOR_JSON=' + JSON.stringify(result))
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
