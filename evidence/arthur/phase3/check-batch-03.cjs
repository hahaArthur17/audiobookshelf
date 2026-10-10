// Fixed offline query-module sample; never connects to a real database.
const path = require('path')
const root = process.argv[2]
if (!root) throw new Error('Provide checkout path')
const load = (name) => require(path.join(root, 'dist-server', 'server', name))
const Database = load('Database')
const author = load('utils/queries/authorFilters')
const admin = load('utils/queries/adminStats')
const user = load('utils/queries/userStats')

const priorSequelize = Database.sequelize
Database.sequelize = {
  models: {
    author: {
      count: async () => 2,
      findAll: async () => [
        { dataValues: { numBooks: 3 }, toOldJSONExpanded(n) { return { id: 'a1', numBooks: n } } }
      ]
    },
    bookAuthor: {
      findAll: async () => [{ authorId: 'a1', author: { name: 'Author One' }, get() { return 3 } }]
    },
    playbackSession: { findAll: async () => [] },
    mediaProgress: { findAll: async () => [] },
    book: { findAll: async () => [] },
    libraryItem: {},
    podcastEpisode: { count: async () => 4 }
  },
  random() { return 'FIXED_RANDOM' },
  async query(sql) {
    if (sql.includes('group by li.mediaType')) {
      return [[{ mediaType: 'book', totalSize: 100, numItems: 2 }, { mediaType: 'podcast', totalSize: 30, numItems: 1 }], null]
    }
    if (sql.includes('json_array_length')) return [[{ numAudioFiles: 5 }], null]
    if (sql.includes('COUNT(*) AS totalItems')) return [[{ totalSize: 100, totalDuration: 80, totalItems: 2 }], null]
    throw new Error('Unexpected query')
  }
}

async function run() {
  const authorResults = {
    count: await author.getAuthorsTotalCount('lib1'),
    withCount: await author.getAuthorsWithCount('lib1', 5),
    search: await author.search('lib1', { matchExpression: (column) => 'MATCH(' + column + ')' }, 5, 0)
  }
  const results = {
    exports: {
      author: Object.keys(author),
      admin: Object.keys(admin),
      user: Object.keys(user),
      authorDefault: Object.hasOwn(author, 'default'),
      adminDefault: Object.hasOwn(admin, 'default'),
      userDefault: Object.hasOwn(user, 'default')
    },
    authorResults,
    adminSize: await admin.getTotalSize(),
    adminAudioFiles: await admin.getNumAudioFiles(),
    adminYear: await admin.getStatsForYear(2020),
    userYear: await user.getStatsForYear('u1', 2020)
  }
  console.log('BEHAVIOR_JSON=' + JSON.stringify(results))
}
run().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => {
  Database.sequelize = priorSequelize
})
