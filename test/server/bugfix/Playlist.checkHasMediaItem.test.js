const { expect } = require('chai')
const { Sequelize } = require('sequelize')

const Database = require('../../../server/Database')

describe('Playlist.checkHasMediaItem', () => {
  let bookLibraryItemId
  let podcastLibraryItemId
  let episodeId
  let bookPlaylistId
  let episodePlaylistId

  /**
   * Load a playlist the way PlaylistController.addItem does before it calls checkHasMediaItem
   *
   * @param {string} playlistId
   * @returns {Promise<import('../../../server/models/Playlist')>}
   */
  async function loadPlaylistWithItems(playlistId) {
    const playlist = await Database.playlistModel.findByPk(playlistId)
    playlist.playlistMediaItems = await playlist.getMediaItemsExpandedWithLibraryItem()
    return playlist
  }

  beforeEach(async () => {
    global.ServerSettings = {}
    Database.sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    Database.sequelize.uppercaseFirst = (str) => (str ? `${str[0].toUpperCase()}${str.substr(1)}` : '')
    await Database.buildModels()

    const user = await Database.userModel.create({ username: 'user', type: 'user', isActive: true })

    const bookLibrary = await Database.libraryModel.create({ name: 'Book Library', mediaType: 'book' })
    const bookLibraryFolder = await Database.libraryFolderModel.create({ path: '/books', libraryId: bookLibrary.id })
    const book = await Database.bookModel.create({ title: 'Test Book', audioFiles: [], tags: [], narrators: [], genres: [], chapters: [] })
    const bookLibraryItem = await Database.libraryItemModel.create({
      libraryFiles: [],
      mediaId: book.id,
      mediaType: 'book',
      libraryId: bookLibrary.id,
      libraryFolderId: bookLibraryFolder.id
    })
    bookLibraryItemId = bookLibraryItem.id

    const podcastLibrary = await Database.libraryModel.create({ name: 'Podcast Library', mediaType: 'podcast' })
    const podcastLibraryFolder = await Database.libraryFolderModel.create({ path: '/podcasts', libraryId: podcastLibrary.id })
    const podcast = await Database.podcastModel.create({ title: 'Test Podcast', tags: [], genres: [], autoDownloadEpisodes: false })
    const podcastLibraryItem = await Database.libraryItemModel.create({
      libraryFiles: [],
      mediaId: podcast.id,
      mediaType: 'podcast',
      libraryId: podcastLibrary.id,
      libraryFolderId: podcastLibraryFolder.id
    })
    podcastLibraryItemId = podcastLibraryItem.id
    const episode = await Database.podcastEpisodeModel.create({
      podcastId: podcast.id,
      title: 'Episode 1',
      index: 1,
      audioFile: { ino: '1', metadata: { filename: 'ep1.mp3', ext: '.mp3', path: '/ep1.mp3', relPath: 'ep1.mp3' } }
    })
    episodeId = episode.id

    const bookPlaylist = await Database.playlistModel.create({ name: 'Book Playlist', libraryId: bookLibrary.id, userId: user.id })
    await Database.playlistMediaItemModel.create({ playlistId: bookPlaylist.id, mediaItemId: book.id, mediaItemType: 'book', order: 1 })
    bookPlaylistId = bookPlaylist.id

    const episodePlaylist = await Database.playlistModel.create({ name: 'Episode Playlist', libraryId: podcastLibrary.id, userId: user.id })
    await Database.playlistMediaItemModel.create({ playlistId: episodePlaylist.id, mediaItemId: episode.id, mediaItemType: 'podcastEpisode', order: 1 })
    episodePlaylistId = episodePlaylist.id
  })

  afterEach(async () => {
    await Database.sequelize.sync({ force: true })
  })

  it('finds a book by its library item id', async () => {
    const playlist = await loadPlaylistWithItems(bookPlaylistId)

    expect(playlist.checkHasMediaItem(bookLibraryItemId)).to.be.true
    expect(playlist.checkHasMediaItem(podcastLibraryItemId)).to.be.false
  })

  it('finds a podcast episode by its episode id', async () => {
    const playlist = await loadPlaylistWithItems(episodePlaylistId)

    expect(playlist.checkHasMediaItem(podcastLibraryItemId, episodeId)).to.be.true
  })

  it('returns false for a book when the playlist holds a podcast episode', async () => {
    const playlist = await loadPlaylistWithItems(episodePlaylistId)

    expect(playlist.checkHasMediaItem(bookLibraryItemId)).to.be.false
  })
})
