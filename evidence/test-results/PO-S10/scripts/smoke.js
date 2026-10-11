// Smoke test: drives one running Audiobookshelf server through the API and writes a normalised transcript.
// Usage: node smoke.js <base url> <books folder> <output file>
const BASE = process.argv[2], BOOKS = process.argv[3], OUT = process.argv[4]
const fs = require('fs')
const log = []
let token = null
const ids = {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function norm(s) {
  let n = 0; const map = {}
  return String(s)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (m) => (map[m] = map[m] || 'ID' + ++n))
    .replace(/\b(li|ser|aut|col|lib|fol|pl|play|se|ban|usr|dev|ak|ep|fe)_[A-Za-z0-9]{6,}/g, 'OLDID')
    .replace(/eyJ[A-Za-z0-9._-]+/g, 'JWT')
    .replace(/\b1\d{12}(\.\d+)?\b/g, 'TS')
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, 'ISO')
    .replace(/\w{3}, \d{2} \w{3} \d{4} [\d:]+ GMT/g, 'RFCDATE')
    .replace(/"ino":"\d+"/g, '"ino":"N"')
    .replace(/"(birthtimeMs|mtimeMs|ctimeMs|addedAt|updatedAt|createdAt|lastUpdate|startedAt|date|dayOfWeek|lastSeen|lastScan|lastScanVersion|finishedAt|lastBuildDate|pubDate)":(\d+(\.\d+)?|"[^"]*"|null)/g, '"$1":"X"')
    .split(BOOKS).join('BOOKS')
}
async function call(label, method, path, body, opts = {}) {
  const headers = {}
  if (token) headers.Authorization = 'Bearer ' + token
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let status = 0, text = ''
  try {
    const res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
    status = res.status; text = await res.text()
  } catch (e) { text = 'FETCH ERROR ' + e.message }
  let json = null
  try { json = JSON.parse(text) } catch (e) { /* not json */ }
  const shown = json ? JSON.stringify(json) : text
  log.push('### ' + label + ' | ' + method + ' ' + norm(path) + ' -> ' + status + '\n' + norm(shown).slice(0, opts.max || 1500))
  return { status, json, text }
}
;(async () => {
  await call('status before init', 'GET', '/status')
  await call('init', 'POST', '/init', { newRoot: { username: 'root', password: 'pw12345' } })
  const lg = await call('login', 'POST', '/login', { username: 'root', password: 'pw12345' })
  token = lg.json && lg.json.user && (lg.json.user.accessToken || lg.json.user.token)
  await call('me', 'GET', '/api/me', undefined, { max: 600 })
  const lib = await call('create library', 'POST', '/api/libraries', { name: 'Books', folders: [{ fullPath: BOOKS }], icon: 'database', mediaType: 'book', provider: 'google' }, { max: 800 })
  ids.lib = lib.json && lib.json.id
  await call('scan library', 'POST', '/api/libraries/' + ids.lib + '/scan', undefined, { max: 200 })
  let items = []
  for (let i = 0; i < 30; i++) { await sleep(1000); const r = await call('wait scan ' + i, 'GET', '/api/libraries/' + ids.lib + '/items?limit=50'); if (r.json && r.json.results && r.json.results.length >= 3) { items = r.json.results; break } log.pop() }
  items.sort((a, b) => (a.media.metadata.title > b.media.metadata.title ? 1 : -1))
  log.push('### items found: ' + items.map((i) => i.media.metadata.title + ' / ' + i.media.metadata.authorName + ' / ' + i.media.metadata.seriesName).join(' ; '))
  const book1 = items.find((i) => i.media.metadata.title === 'Test Book'), book2 = items.find((i) => i.media.metadata.title === 'Second Book')
  if (!book1) { fs.writeFileSync(OUT, log.join('\n') + '\nABORT: no scan result\n'); process.exit(0) }
  await call('item expanded', 'GET', '/api/items/' + book1.id + '?expanded=1', undefined, { max: 2500 })
  await call('library items minified', 'GET', '/api/libraries/' + ids.lib + '/items?limit=50&sort=media.metadata.title&minified=1', undefined, { max: 2500 })
  const au = await call('authors', 'GET', '/api/libraries/' + ids.lib + '/authors', undefined, { max: 1200 })
  ids.author = au.json && au.json.authors && (au.json.authors.find((a) => a.name === 'Jane Author') || {}).id
  await call('author detail', 'GET', '/api/authors/' + ids.author + '?include=items,series', undefined, { max: 2500 })
  await call('author unknown id (PO-S07 fix 1)', 'GET', '/api/authors/00000000-0000-4000-8000-000000000000?include=items')
  const se = await call('series list', 'GET', '/api/libraries/' + ids.lib + '/series?limit=50', undefined, { max: 1200 })
  ids.series = se.json && se.json.results && se.json.results[0] && se.json.results[0].id
  await call('series detail', 'GET', '/api/series/' + ids.series + '?include=progress', undefined, { max: 1500 })
  await call('filterdata', 'GET', '/api/libraries/' + ids.lib + '/filterdata', undefined, { max: 1500 })
  await call('stats', 'GET', '/api/libraries/' + ids.lib + '/stats', undefined, { max: 800 })
  // collections
  const col = await call('create collection', 'POST', '/api/collections', { libraryId: ids.lib, name: 'My Collection', books: [book1.id] }, { max: 1500 })
  ids.col = col.json && col.json.id
  await call('add book to collection', 'POST', '/api/collections/' + ids.col + '/book', { id: book2.id }, { max: 1200 })
  await call('collections list', 'GET', '/api/collections', undefined, { max: 2500 })
  await call('collection detail', 'GET', '/api/collections/' + ids.col, undefined, { max: 2500 })
  await call('remove book from collection', 'DELETE', '/api/collections/' + ids.col + '/book/' + book2.id, undefined, { max: 1200 })
  // playlists
  const pl = await call('create playlist', 'POST', '/api/playlists', { libraryId: ids.lib, name: 'My Playlist', items: [{ libraryItemId: book1.id }] }, { max: 1500 })
  ids.pl = pl.json && pl.json.id
  await call('add playlist item', 'POST', '/api/playlists/' + ids.pl + '/item', { libraryItemId: book2.id }, { max: 1500 })
  await call('playlists list', 'GET', '/api/playlists', undefined, { max: 2500 })
  await call('remove playlist item', 'DELETE', '/api/playlists/' + ids.pl + '/item/' + book1.id, undefined, { max: 1500 })
  await call('playlist detail', 'GET', '/api/playlists/' + ids.pl, undefined, { max: 2000 })
  // playback and progress
  const play = await call('play (direct)', 'POST', '/api/items/' + book1.id + '/play', { deviceInfo: { clientName: 'Smoke', deviceId: 'smoke-1' }, supportedMimeTypes: ['audio/mpeg'], mediaPlayer: 'html5', forceDirectPlay: true }, { max: 1800 })
  ids.sess = play.json && play.json.id
  await call('sync session', 'POST', '/api/session/' + ids.sess + '/sync', { timeListened: 2, currentTime: 2 })
  await call('session detail', 'GET', '/api/session/' + ids.sess, undefined, { max: 1500 })
  await call('close session', 'POST', '/api/session/' + ids.sess + '/close', { timeListened: 1, currentTime: 3 })
  const tr = await call('play (transcode)', 'POST', '/api/items/' + book2.id + '/play', { deviceInfo: { clientName: 'Smoke', deviceId: 'smoke-2' }, supportedMimeTypes: [], mediaPlayer: 'html5', forceTranscode: true }, { max: 1800 })
  ids.sess2 = tr.json && tr.json.id
  await sleep(4000)
  const m3u8 = await call('hls playlist', 'GET', '/hls/' + ids.sess2 + '/output.m3u8', undefined, { max: 800 })
  await call('close session 2', 'POST', '/api/session/' + ids.sess2 + '/close', { timeListened: 0, currentTime: 0 })
  await call('listening sessions', 'GET', '/api/me/listening-sessions', undefined, { max: 2500 })
  await call('progress finish', 'PATCH', '/api/me/progress/' + book1.id, { isFinished: true }, { max: 600 })
  await call('progress get', 'GET', '/api/me/progress/' + book1.id, undefined, { max: 800 })
  await call('items in progress', 'GET', '/api/me/items-in-progress', undefined, { max: 800 })
  await call('me after', 'GET', '/api/me', undefined, { max: 1800 })
  // feeds
  const f1 = await call('open feed item', 'POST', '/api/feeds/item/' + book1.id + '/open', { serverAddress: BASE, slug: 'f-item', metadataDetails: {} }, { max: 1200 })
  await call('rss item feed', 'GET', '/feed/f-item', undefined, { max: 2500 })
  await call('open feed collection', 'POST', '/api/feeds/collection/' + ids.col + '/open', { serverAddress: BASE, slug: 'f-col', metadataDetails: {} }, { max: 1200 })
  await call('rss collection feed', 'GET', '/feed/f-col', undefined, { max: 2500 })
  await call('open feed series', 'POST', '/api/feeds/series/' + ids.series + '/open', { serverAddress: BASE, slug: 'f-series', metadataDetails: {} }, { max: 1200 })
  await call('rss series feed', 'GET', '/feed/f-series', undefined, { max: 2500 })
  const fl = await call('feeds list', 'GET', '/api/feeds', undefined, { max: 2500 })
  await call('close feed item', 'POST', '/api/feeds/' + (f1.json && f1.json.feed && f1.json.feed.id) + '/close')
  // users, keys, shares, settings
  await call('create user', 'POST', '/api/users', { username: 'kid', password: 'kid12345', type: 'user', isActive: true, permissions: { download: true, update: false, delete: false, upload: false, accessAllLibraries: true, accessAllTags: true, accessExplicitContent: true } }, { max: 1500 })
  const ul = await call('users list', 'GET', '/api/users', undefined, { max: 2500 })
  const kid = ul.json && ul.json.users && ul.json.users.find((u) => u.username === 'kid')
  if (kid) { await call('update user', 'PATCH', '/api/users/' + kid.id, { isActive: false }, { max: 800 }); await call('user detail', 'GET', '/api/users/' + kid.id, undefined, { max: 1200 }) }
  const rootUser = ul.json && ul.json.users && ul.json.users.find((u) => u.username === 'root')
  await call('create api key', 'POST', '/api/api-keys', { name: 'smoke-key', isActive: true, userId: rootUser && rootUser.id }, { max: 700 })
  await call('api keys list', 'GET', '/api/api-keys', undefined, { max: 900 })
  await call('create share', 'POST', '/api/share/mediaitem', { slug: 'smoke-share', mediaItemType: 'book', mediaItemId: book1.media.id, expiresAt: 0, isDownloadable: false }, { max: 800 })
  await call('public share', 'GET', '/public/share/smoke-share', undefined, { max: 1200 })
  await call('server settings patch', 'PATCH', '/api/settings', { scannerFindCovers: false, bookshelfView: 1 }, { max: 900 })
  await call('notifications', 'GET', '/api/notifications', undefined, { max: 900 })
  await call('tags', 'GET', '/api/tags', undefined, { max: 300 })
  await call('delete library', 'DELETE', '/api/libraries/' + ids.lib)
  await call('libraries after delete', 'GET', '/api/libraries', undefined, { max: 300 })
  fs.writeFileSync(OUT, log.join('\n') + '\n')
  console.log('steps written:', log.length)
  process.exit(0)
})().catch((e) => { log.push('SCRIPT ERROR ' + e.stack); fs.writeFileSync(OUT, log.join('\n') + '\n'); process.exit(1) })
