const { expect } = require('chai')
const sinon = require('sinon')
const { Sequelize } = require('sequelize')

const Database = require('../../../server/Database')
const SocketAuthority = require('../../../server/SocketAuthority')

describe('Playlist.removeMediaItemsFromPlaylists', () => {
  let playlistId
  let bookIds

  beforeEach(async () => {
    global.ServerSettings = {}
    Database.sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    Database.sequelize.uppercaseFirst = (str) => (str ? `${str[0].toUpperCase()}${str.substr(1)}` : '')
    await Database.buildModels()

    const user = await Database.userModel.create({ username: 'user', type: 'user', isActive: true })
    const library = await Database.libraryModel.create({ name: 'Book Library', mediaType: 'book' })
    const libraryFolder = await Database.libraryFolderModel.create({ path: '/books', libraryId: library.id })
    const playlist = await Database.playlistModel.create({ name: 'Test Playlist', libraryId: library.id, userId: user.id })
    playlistId = playlist.id

    // A playlist with three books in the order 1, 2, 3
    bookIds = []
    for (let i = 1; i <= 3; i++) {
      const book = await Database.bookModel.create({ title: `Book ${i}`, audioFiles: [], tags: [], narrators: [], genres: [], chapters: [] })
      await Database.libraryItemModel.create({
        libraryFiles: [],
        mediaId: book.id,
        mediaType: 'book',
        libraryId: library.id,
        libraryFolderId: libraryFolder.id
      })
      await Database.playlistMediaItemModel.create({ playlistId: playlist.id, mediaItemId: book.id, mediaItemType: 'book', order: i })
      bookIds.push(book.id)
    }
  })

  afterEach(async () => {
    sinon.restore()
    await Database.sequelize.sync({ force: true })
  })

  it('removes the media item and renumbers the remaining items', async () => {
    sinon.stub(SocketAuthority, 'clientEmitter')

    await Database.playlistModel.removeMediaItemsFromPlaylists([bookIds[0]])

    const playlistMediaItems = await Database.playlistMediaItemModel.findAll({ where: { playlistId }, order: [['order', 'ASC']] })
    expect(playlistMediaItems.map((pmi) => pmi.mediaItemId)).to.deep.equal([bookIds[1], bookIds[2]])
    expect(playlistMediaItems.map((pmi) => pmi.order)).to.deep.equal([1, 2])
  })

  it('waits until the new order of each remaining item is saved before it reports the playlist', async () => {
    const events = []
    const pendingSaves = []

    // Slow down the save of the new order, so that a caller that does not wait for it gets ahead of it
    const originalUpdate = Database.playlistMediaItemModel.prototype.update
    sinon.stub(Database.playlistMediaItemModel.prototype, 'update').callsFake(function (...args) {
      const save = new Promise((resolve) => setTimeout(resolve, 50))
        .then(() => originalUpdate.apply(this, args))
        .then((result) => {
          events.push('order saved')
          return result
        })
      pendingSaves.push(save)
      return save
    })
    sinon.stub(SocketAuthority, 'clientEmitter').callsFake((userId, evt) => {
      events.push(evt)
    })

    try {
      await Database.playlistModel.removeMediaItemsFromPlaylists([bookIds[0]])

      expect(events).to.deep.equal(['order saved', 'order saved', 'playlist_updated'])
    } finally {
      // Let the slowed saves finish before the database is reset
      await Promise.all(pendingSaves)
    }
  })
})
