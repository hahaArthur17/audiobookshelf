const { expect } = require('chai')
const { Sequelize } = require('sequelize')

const Database = require('../../../server/Database')

describe('Feed.getFeedObjForSeries', () => {
  let userId
  let libraryId
  let seriesId
  let bookId

  beforeEach(async () => {
    global.ServerSettings = {}
    Database.sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    Database.sequelize.uppercaseFirst = (str) => (str ? `${str[0].toUpperCase()}${str.substr(1)}` : '')
    await Database.buildModels()

    const user = await Database.userModel.create({ username: 'user', type: 'user', isActive: true })
    userId = user.id

    const library = await Database.libraryModel.create({ name: 'Book Library', mediaType: 'book' })
    libraryId = library.id
    const libraryFolder = await Database.libraryFolderModel.create({ path: '/books', libraryId })
    const book = await Database.bookModel.create({
      title: 'Test Book',
      audioFiles: [{ index: 1, ino: '1', metadata: { filename: 'track.mp3', ext: '.mp3', path: '/track.mp3', relPath: 'track.mp3', size: 1000 }, duration: 100, mimeType: 'audio/mpeg' }],
      tags: [],
      narrators: [],
      genres: [],
      chapters: []
    })
    bookId = book.id
    await Database.libraryItemModel.create({
      libraryFiles: [],
      mediaId: book.id,
      mediaType: 'book',
      libraryId,
      libraryFolderId: libraryFolder.id
    })
    const series = await Database.seriesModel.create({ name: 'Test Series', libraryId })
    await Database.bookSeriesModel.create({ bookId: book.id, seriesId: series.id, sequence: '1' })
    seriesId = series.id
  })

  afterEach(async () => {
    await Database.sequelize.sync({ force: true })
  })

  /**
   * Remove the audio tracks of the only book of the series (an ebook-only book has none either)
   */
  async function removeAudioTracksFromBook() {
    await Database.bookModel.update({ audioFiles: [] }, { where: { id: bookId } })
  }

  it('builds the site url from the library of the first book with audio tracks', async () => {
    const seriesExpanded = await Database.seriesModel.getExpandedById(seriesId)

    const { feedObj, booksWithTracks } = Database.feedModel.getFeedObjForSeries(userId, seriesExpanded, 'series-feed', 'http://localhost:3333')

    expect(booksWithTracks).to.have.lengthOf(1)
    expect(feedObj.siteURL).to.equal(`/library/${libraryId}/series/${seriesId}`)
  })

  it('does not throw when no book of the series has audio tracks', async () => {
    await removeAudioTracksFromBook()
    const seriesExpanded = await Database.seriesModel.getExpandedById(seriesId)

    const { feedObj, booksWithTracks } = Database.feedModel.getFeedObjForSeries(userId, seriesExpanded, 'series-feed', 'http://localhost:3333')

    expect(booksWithTracks).to.have.lengthOf(0)
    expect(feedObj.siteURL).to.equal(`/library/${libraryId}/series/${seriesId}`)
  })

  it('lets updateFeedForEntity empty a series feed whose books lost their audio tracks', async () => {
    const seriesExpanded = await Database.seriesModel.getExpandedById(seriesId)
    const feed = await Database.feedModel.createFeedForSeries(userId, seriesExpanded, 'series-feed', 'http://localhost:3333', null)
    expect(feed.feedEpisodes).to.have.lengthOf(1)

    await removeAudioTracksFromBook()
    const updatedFeed = await feed.updateFeedForEntity()

    expect(updatedFeed.feedEpisodes).to.have.lengthOf(0)
    expect(updatedFeed.siteURL).to.equal(`/library/${libraryId}/series/${seriesId}`)
    expect(await Database.feedEpisodeModel.count({ where: { feedId: feed.id } })).to.equal(0)
  })
})
