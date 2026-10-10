// PO-S07: prints the SQL that Sequelize runs for the queries touched by an edit of point 1(b)
// (where: null left out, a nested include given as an array, silent removed from upsert).
// Run on the compiled server before and after a conversion; the two outputs must be identical.
// Usage: node sqlcapture.js <repo root>
//
// In this folder:
//   sql-capture-before.txt  taken at commit 265b6757, when Collection, PlaybackSession, Playlist, User and LibraryItem were all still JavaScript
//   sql-capture-after.txt   taken at the end of the run (Collection, PlaybackSession, Playlist and User converted; LibraryItem skipped and restored)
// The capture was also repeated after each of the four conversions; every time it was identical to the "before" file.
// The LibraryItem calls are in the script because its edits were tried in the skipped pass; in both files they run the unchanged LibraryItem.js.
const path = require('path')
const root = process.argv[2]
const { Sequelize } = require(path.join(root, 'node_modules/sequelize'))
const Database = require(path.join(root, 'dist-server/server/Database'))
const Logger = require(path.join(root, 'dist-server/server/Logger'))

async function main() {
  const lines = []
  Logger.error = () => {}
  Logger.debug = () => {}
  global.ServerSettings = {}
  Database.sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: (sql) => lines.push(sql) })
  Database.sequelize.uppercaseFirst = (str) => (str ? `${str[0].toUpperCase()}${str.substr(1)}` : '')
  await Database.buildModels()

  const fixedDate = new Date('2026-01-02T03:04:05.000Z')
  const user = await Database.userModel.create({ id: '11111111-1111-4111-8111-111111111111', username: 'u', type: 'user', isActive: true, permissions: {}, createdAt: fixedDate, updatedAt: fixedDate })
  const library = await Database.libraryModel.create({ id: '22222222-2222-4222-8222-222222222222', name: 'L', mediaType: 'book', createdAt: fixedDate, updatedAt: fixedDate })
  const playlist = await Database.playlistModel.create({ id: '33333333-3333-4333-8333-333333333333', name: 'P', libraryId: library.id, userId: user.id, createdAt: fixedDate, updatedAt: fixedDate })
  user.mediaProgresses = []

  lines.length = 0
  const run = async (label, fn) => {
    lines.push(`## ${label}`)
    try {
      await fn()
    } catch (error) {
      lines.push(`THREW ${error.name}: ${error.message}`)
    }
  }

  await run('Collection.getOldCollectionsJsonExpanded(null) [where is null]', () => Database.collectionModel.getOldCollectionsJsonExpanded(null))
  await run('Collection.getOldCollectionsJsonExpanded(null, libraryId, [rssfeed])', () => Database.collectionModel.getOldCollectionsJsonExpanded(null, library.id, ['rssfeed']))

  await run('PlaybackSession.getOldPlaybackSessions() [where is null]', () => Database.playbackSessionModel.getOldPlaybackSessions())
  await run('PlaybackSession.getOldPlaybackSessions({ userId })', () => Database.playbackSessionModel.getOldPlaybackSessions({ userId: user.id }))
  const oldSession = {
    id: '44444444-4444-4444-8444-444444444444',
    userId: user.id,
    libraryId: library.id,
    libraryItemId: 'li-1',
    bookId: '55555555-5555-4555-8555-555555555555',
    episodeId: null,
    displayTitle: 'T',
    displayAuthor: 'A',
    duration: 10,
    playMethod: 0,
    mediaPlayer: 'html5',
    startTime: 0,
    currentTime: 5,
    serverVersion: '2.37.0',
    startedAt: fixedDate.valueOf(),
    updatedAt: fixedDate.valueOf(),
    deviceInfo: null,
    timeListening: 5,
    coverPath: null,
    mediaMetadata: { title: 'T' },
    date: '2026-01-02',
    dayOfWeek: 'Friday'
  }
  await run('PlaybackSession.createFromOld(session) [upsert, first time]', () => Database.playbackSessionModel.createFromOld(oldSession))
  await run('PlaybackSession.createFromOld(session) [upsert, second time]', () => Database.playbackSessionModel.createFromOld({ ...oldSession, currentTime: 6 }))
  await run('PlaybackSession row after the two upserts', async () => {
    const [rows] = await Database.sequelize.query('SELECT * FROM playbackSessions', { logging: false })
    lines.push(`ROWS ${JSON.stringify(rows)}`)
  })

  await run('Playlist.getOldPlaylistsForUserAndLibrary(userId, libraryId)', () => Database.playlistModel.getOldPlaylistsForUserAndLibrary(user.id, library.id))
  await run('Playlist.getPlaylistsForMediaItemIds([id])', () => Database.playlistModel.getPlaylistsForMediaItemIds(['66666666-6666-4666-8666-666666666666']))
  await run('playlist.getMediaItemsExpandedWithLibraryItem()', () => playlist.getMediaItemsExpandedWithLibraryItem())

  await run('user.createUpdateMediaProgressFromPayload({ episodeId })', () => user.createUpdateMediaProgressFromPayload({ episodeId: '77777777-7777-4777-8777-777777777777', libraryItemId: 'li-1' }))
  await run('user.createUpdateMediaProgressFromPayload({ libraryItemId })', () => user.createUpdateMediaProgressFromPayload({ libraryItemId: '88888888-8888-4888-8888-888888888888' }))

  await run('LibraryItem.getLibraryItemsIncrement(0, 10) [where is null]', () => Database.libraryItemModel.getLibraryItemsIncrement(0, 10))
  await run('LibraryItem.getLibraryItemsIncrement(0, 10, { libraryId })', () => Database.libraryItemModel.getLibraryItemsIncrement(0, 10, { libraryId: library.id }))
  await run('LibraryItem.findAllExpandedWhere() [where is null]', () => Database.libraryItemModel.findAllExpandedWhere())
  await run('LibraryItem.findAllExpandedWhere({ libraryId })', () => Database.libraryItemModel.findAllExpandedWhere({ libraryId: library.id }))
  await run('LibraryItem.findOneExpanded({ id }) [replacements and include are null]', () => Database.libraryItemModel.findOneExpanded({ id: '99999999-9999-4999-8999-999999999999' }))
  await run('LibraryItem.findOneExpanded({ mediaId }, null, { model: library })', () => Database.libraryItemModel.findOneExpanded({ mediaId: '99999999-9999-4999-8999-999999999999' }, null, { model: Database.libraryModel, attributes: ['settings'] }))
  await run('LibraryItem.getExpandedById(id)', () => Database.libraryItemModel.getExpandedById('99999999-9999-4999-8999-999999999999'))

  console.log(lines.join('\n'))
}

main().catch((error) => {
  console.error('sqlcapture failed', error)
  process.exit(1)
})
