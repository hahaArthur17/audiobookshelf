/*
 * Test-data helpers for the podcast query-filter characterization tests (QueryFiltersPodcast, LibraryItemModel).
 * One deterministic podcast world: six podcasts in one library (plus one in another library) with episodes, genres/tags/languages,
 * explicit flags, a missing and an invalid item, an RSS feed, restricted users and per-user episode progress.
 * Everything goes through the real models. Ids are fixed so that tied sort keys resolve the same way on every machine.
 */
const Database = require('../../../server/Database')
const { createLibrary } = require('./seed-library')
const { audioFile, createProgress, setRow, createUser } = require('./seed-users-extra')

const DAY = 24 * 3600 * 1000

const pid = (n) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const iid = (n) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** base64 filter value like the client sends it: `genres.<b64>` */
const b64 = (value) => encodeURIComponent(Buffer.from(value).toString('base64'))

/**
 * Create one podcast with its library item and episodes.
 * @param {{ library: any, folder: any }} lf
 * @param {object} o
 */
async function addPodcast(lf, o) {
  const podcast = await Database.podcastModel.create({
    id: pid(o.n),
    title: o.title,
    titleIgnorePrefix: o.titleIgnorePrefix ?? o.title,
    author: o.author ?? null,
    description: o.description ?? `About ${o.title}`,
    language: o.language ?? null,
    explicit: o.explicit === undefined ? false : o.explicit,
    tags: o.tags || [],
    genres: o.genres || [],
    feedURL: o.feedURL ?? null,
    itunesId: o.itunesId ?? null,
    itunesArtistId: o.itunesArtistId ?? null,
    numEpisodes: o.numEpisodes ?? (o.episodes || []).length
  })
  const libraryItem = await Database.libraryItemModel.create({
    id: iid(o.n),
    libraryFiles: [],
    mediaId: podcast.id,
    mediaType: 'podcast',
    libraryId: lf.library.id,
    libraryFolderId: lf.folder.id,
    path: `${lf.folder.path}/${o.title}`,
    relPath: o.title,
    title: o.title,
    titleIgnorePrefix: o.titleIgnorePrefix ?? o.title,
    size: o.size ?? 0,
    isMissing: !!o.isMissing,
    isInvalid: !!o.isInvalid,
    mtime: new Date(o.mtime ?? 1000),
    ctime: new Date(1000),
    birthtime: new Date(o.birthtime ?? 1000)
  })
  const episodes = []
  for (const e of o.episodes || []) {
    const episode = await Database.podcastEpisodeModel.create({
      id: eid(e.n),
      podcastId: podcast.id,
      index: e.index,
      season: e.season ?? '',
      episode: e.episode ?? '',
      episodeType: 'full',
      title: e.title,
      pubDate: e.publishedAt ? new Date(e.publishedAt).toUTCString() : null,
      publishedAt: e.publishedAt ? new Date(e.publishedAt) : null,
      audioFile: { ...audioFile(`${e.title}.mp3`, e.duration), ino: String(e.n) },
      chapters: [],
      extraData: {}
    })
    episodes.push(episode)
  }
  return { podcast, libraryItem, episodes }
}

/** Force createdAt on rows without triggering updatedAt */
async function setCreatedAt(model, id, date) {
  await setRow(model, id, { createdAt: date })
}

/**
 * The shared world. `users` is the result of api.seed.users(); extra restricted users are created here:
 *   kidsOnly  (accessAllTags=false, itemTagsSelected=['kids'], explicit allowed)
 *   noKids    (selectedTagsNotAccessible=true, itemTagsSelected=['kids'], explicit allowed)
 * Library item ages (days before "now"): alpha 10, beta 20, gamma 5, delta 100, epsilon 30, zeta 40. Only delta is older than 60 days.
 * Episode createdAt (days before now): A1 9, A2 8, A3 100 (old), B1 19, B2 18, D1 4, E1 3, E2 2.
 */
async function seedPodcastWorld(users) {
  const now = Date.now()
  const lf = await createLibrary({ name: 'Podcasts', mediaType: 'podcast', path: '/test/pods' })
  const other = await createLibrary({ name: 'Other Pods', mediaType: 'podcast', path: '/test/otherpods' })
  await lf.library.update({ settings: Database.libraryModel.getDefaultLibrarySettingsForMediaType('podcast') })

  const alpha = await addPodcast(lf, {
    n: 1,
    title: 'The Alpha Show',
    titleIgnorePrefix: 'Alpha Show',
    author: 'Zed Zimmer',
    language: 'en',
    explicit: false,
    tags: ['daily', 'kids'],
    genres: ['Tech', 'News'],
    itunesId: '1001',
    itunesArtistId: '2001',
    size: 5000,
    birthtime: 3000,
    mtime: 9000,
    episodes: [
      { n: 1, index: 1, season: '1', episode: '1', title: 'Alpha One', publishedAt: '2024-01-10T00:00:00Z', duration: 600 },
      { n: 2, index: 2, season: '1', episode: '2', title: 'Alpha Two', publishedAt: '2024-03-05T00:00:00Z', duration: 1200 },
      { n: 3, index: 3, season: '2', episode: '1', title: 'Alpha Three', publishedAt: '2024-02-01T00:00:00Z', duration: 1800 }
    ]
  })
  const beta = await addPodcast(lf, {
    n: 2,
    title: 'beta cast',
    author: 'Amy able',
    language: 'de',
    explicit: true,
    tags: ['adult'],
    genres: ['Comedy'],
    size: 100,
    birthtime: 1000,
    mtime: 2000,
    episodes: [
      { n: 4, index: 1, title: 'Beta One', publishedAt: '2024-05-01T00:00:00Z', duration: 300 },
      { n: 5, index: 2, title: 'Beta Two', publishedAt: '2023-12-25T00:00:00Z', duration: 450 }
    ]
  })
  const gamma = await addPodcast(lf, { n: 3, title: 'A Gamma Hour', titleIgnorePrefix: 'Gamma Hour', author: null, language: 'en', explicit: false, tags: [], genres: ['Tech'], size: 9000, birthtime: 2000, mtime: 1000, feedURL: 'https://example.test/gamma.xml' })
  const delta = await addPodcast(lf, {
    n: 4,
    title: 'Delta',
    author: 'Cy Cleaner',
    language: 'fr',
    explicit: false,
    tags: ['kids'],
    genres: [],
    size: 50,
    isMissing: true,
    birthtime: 500,
    mtime: 500,
    episodes: [{ n: 6, index: 1, title: 'Delta One', publishedAt: '2024-04-01T00:00:00Z', duration: 900 }]
  })
  const epsilon = await addPodcast(lf, {
    n: 5,
    title: 'Epsilon',
    author: 'Eve Else',
    language: 'en',
    explicit: false,
    tags: [],
    genres: ['News'],
    size: 700,
    isInvalid: true,
    birthtime: 4000,
    mtime: 4000,
    episodes: [
      { n: 7, index: 1, title: 'Epsilon One', publishedAt: '2022-01-01T00:00:00Z', duration: 100 },
      { n: 8, index: 2, title: 'Epsilon Two', publishedAt: '2025-01-01T00:00:00Z', duration: 200 }
    ]
  })
  // explicit is NULL (never set): invisible to users that cannot access explicit content
  const zeta = await addPodcast(lf, { n: 6, title: 'Zeta', author: 'Yan Young', language: null, explicit: null, tags: ['misc'], genres: ['Tech'], size: 3000, birthtime: 6000, mtime: 6000 })
  const elsewhere = await addPodcast(other, {
    n: 7,
    title: 'Elsewhere Pod',
    author: 'Far Away',
    language: 'en',
    explicit: false,
    tags: ['kids'],
    genres: ['Tech'],
    size: 123,
    episodes: [{ n: 9, index: 1, title: 'Elsewhere One', publishedAt: '2024-06-01T00:00:00Z', duration: 111 }]
  })

  const ageDays = { 1: 10, 2: 20, 3: 5, 4: 100, 5: 30, 6: 40 }
  for (const [n, p] of [
    [1, alpha],
    [2, beta],
    [3, gamma],
    [4, delta],
    [5, epsilon],
    [6, zeta]
  ])
    await setCreatedAt(Database.libraryItemModel, p.libraryItem.id, new Date(now - ageDays[n] * DAY))
  const epAge = { 1: 9, 2: 8, 3: 100, 4: 19, 5: 18, 6: 4, 7: 3, 8: 2 }
  for (const p of [alpha, beta, delta, epsilon]) for (const ep of p.episodes) await setCreatedAt(Database.podcastEpisodeModel, ep.id, new Date(now - epAge[Number(ep.id.slice(-12))] * DAY))

  const feed = await Database.feedModel.create({
    slug: 'gamma-feed',
    entityType: 'libraryItem',
    entityId: gamma.libraryItem.id,
    entityUpdatedAt: new Date(1000),
    serverAddress: 'http://localhost',
    feedURL: '/feed/gamma-feed',
    title: 'Gamma feed',
    description: 'd',
    author: 'a',
    ownerName: 'o',
    ownerEmail: 'o@x',
    explicit: false,
    preventIndexing: true
  })

  const kidsOnly = await createUser({ username: 'kidsOnly', type: 'user', permissions: { accessAllTags: false, itemTagsSelected: ['kids'], accessExplicitContent: true } })
  const noKids = await createUser({ username: 'noKids', type: 'user', permissions: { accessAllTags: false, selectedTagsNotAccessible: true, itemTagsSelected: ['kids'], accessExplicitContent: true } })

  return { lf, other, alpha, beta, gamma, delta, epsilon, zeta, elsewhere, feed, kidsOnly, noKids, users, now }
}

/**
 * Episode progress rows. Call BEFORE the first request as that user (User objects are cached with their progress).
 *  admin: Alpha One in progress (100/600, oldest), Alpha Two finished, Beta One in progress but hidden from continue listening, Delta One in progress
 *  user:  Alpha One finished, Beta Two in progress (50/450), Epsilon One finished
 *  kidsOnly: Delta One finished, Alpha Two in progress (600/1200)
 */
async function seedPodcastProgress(world) {
  const { users, alpha, beta, delta, epsilon } = world
  const ep = (p, i) => ({ libraryItem: p.libraryItem, mediaItemId: p.episodes[i].id, podcastId: p.podcast.id, episode: true })
  await createProgress(users.admin, { ...ep(alpha, 0), duration: 600, currentTime: 100, updatedAt: '2024-06-01T10:00:00Z' })
  await createProgress(users.admin, { ...ep(alpha, 1), duration: 1200, currentTime: 1200, isFinished: true, finishedAt: '2024-06-03T10:00:00Z', updatedAt: '2024-06-03T10:00:00Z' })
  await createProgress(users.admin, { ...ep(beta, 0), duration: 300, currentTime: 30, hidden: true, updatedAt: '2024-06-05T10:00:00Z' })
  await createProgress(users.admin, { ...ep(delta, 0), duration: 900, currentTime: 450, updatedAt: '2024-06-04T10:00:00Z' })
  await createProgress(users.user, { ...ep(alpha, 0), duration: 600, currentTime: 600, isFinished: true, finishedAt: '2024-06-02T10:00:00Z', updatedAt: '2024-06-02T10:00:00Z' })
  await createProgress(users.user, { ...ep(beta, 1), duration: 450, currentTime: 50, updatedAt: '2024-06-06T10:00:00Z' })
  await createProgress(users.user, { ...ep(epsilon, 0), duration: 100, currentTime: 100, isFinished: true, finishedAt: '2024-06-07T10:00:00Z', updatedAt: '2024-06-07T10:00:00Z' })
  // kidsOnly finished the only episode of Delta (numEpisodesIncomplete 0) and is halfway through Alpha Two
  await createProgress(world.kidsOnly, { ...ep(delta, 0), duration: 900, currentTime: 900, isFinished: true, finishedAt: '2024-06-08T10:00:00Z', updatedAt: '2024-06-08T10:00:00Z' })
  await createProgress(world.kidsOnly, { ...ep(alpha, 1), duration: 1200, currentTime: 600, updatedAt: '2024-06-09T10:00:00Z' })
}

/** Names for snapshot ids: library, items, podcasts, episodes */
function worldIds(world) {
  const m = new Map([
    [world.lf.library.id, '<podcast-library>'],
    [world.other.library.id, '<other-library>'],
    [world.feed.id, '<feed>'],
    [world.lf.folder.id, '<folder>'],
    [world.other.folder.id, '<other-folder>'],
    [world.users.admin.id, '<admin>'],
    [world.users.user.id, '<user>']
  ])
  for (const [name, p] of Object.entries({ alpha: world.alpha, beta: world.beta, gamma: world.gamma, delta: world.delta, epsilon: world.epsilon, zeta: world.zeta, elsewhere: world.elsewhere })) {
    m.set(p.libraryItem.id, `<item-${name}>`)
    m.set(p.podcast.id, `<podcast-${name}>`)
    p.episodes.forEach((e, i) => m.set(e.id, `<ep-${name}-${i + 1}>`))
  }
  return m
}

module.exports = { DAY, b64, pid, eid, iid, addPodcast, seedPodcastWorld, seedPodcastProgress, worldIds, setCreatedAt }
