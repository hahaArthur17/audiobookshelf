const { expect } = require('chai')
const { Sequelize } = require('sequelize')

const Database = require('../../../server/Database')

describe('Feed.updateFeedForEntity', () => {
  const missingEntityId = '00000000-0000-0000-0000-000000000000'
  let userId
  let seriesId

  /**
   * Create a feed row that points at an entity
   *
   * @param {string} entityType
   * @param {string} entityId
   * @returns {Promise<import('../../../server/models/Feed')>}
   */
  async function createFeedRow(entityType, entityId) {
    const feed = await Database.feedModel.create({
      slug: `${entityType}-feed`,
      entityType,
      entityId,
      serverAddress: 'http://localhost:3333',
      feedURL: `/feed/${entityType}-feed`,
      title: 'Test Feed',
      userId
    })
    feed.feedEpisodes = []
    return feed
  }

  beforeEach(async () => {
    global.ServerSettings = {}
    Database.sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    Database.sequelize.uppercaseFirst = (str) => (str ? `${str[0].toUpperCase()}${str.substr(1)}` : '')
    await Database.buildModels()

    const user = await Database.userModel.create({ username: 'user', type: 'user', isActive: true })
    userId = user.id

    const library = await Database.libraryModel.create({ name: 'Book Library', mediaType: 'book' })
    const libraryFolder = await Database.libraryFolderModel.create({ path: '/books', libraryId: library.id })
    const book = await Database.bookModel.create({
      title: 'Test Book',
      audioFiles: [{ index: 1, ino: '1', metadata: { filename: 'track.mp3', ext: '.mp3', path: '/track.mp3', relPath: 'track.mp3', size: 1000 }, duration: 100, mimeType: 'audio/mpeg' }],
      tags: [],
      narrators: [],
      genres: [],
      chapters: []
    })
    await Database.libraryItemModel.create({
      libraryFiles: [],
      mediaId: book.id,
      mediaType: 'book',
      libraryId: library.id,
      libraryFolderId: libraryFolder.id
    })
    const series = await Database.seriesModel.create({ name: 'Test Series', libraryId: library.id })
    await Database.bookSeriesModel.create({ bookId: book.id, seriesId: series.id, sequence: '1' })
    seriesId = series.id
  })

  afterEach(async () => {
    await Database.sequelize.sync({ force: true })
  })

  it('updates the feed of an existing series', async () => {
    const seriesExpanded = await Database.seriesModel.getExpandedById(seriesId)
    const feed = await Database.feedModel.createFeedForSeries(userId, seriesExpanded, 'series-feed', 'http://localhost:3333', null)

    const updatedFeed = await feed.updateFeedForEntity()

    expect(updatedFeed.entityId).to.equal(seriesId)
    expect(updatedFeed.feedEpisodes).to.have.lengthOf(1)
    expect(updatedFeed.feedEpisodes[0].filePath).to.equal('/track.mp3')
  })

  it('returns null when the library item of the feed no longer exists', async () => {
    const feed = await createFeedRow('libraryItem', missingEntityId)

    expect(await feed.updateFeedForEntity()).to.be.null
  })

  it('returns null when the collection of the feed no longer exists', async () => {
    const feed = await createFeedRow('collection', missingEntityId)

    expect(await feed.updateFeedForEntity()).to.be.null
  })

  it('returns null when the series of the feed no longer exists', async () => {
    const feed = await createFeedRow('series', missingEntityId)

    expect(await feed.updateFeedForEntity()).to.be.null
  })
})
