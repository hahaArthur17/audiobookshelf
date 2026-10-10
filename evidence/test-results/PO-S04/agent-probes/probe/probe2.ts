// Scratch probe, outside the repo. Checks what a TypeScript caller sees for LibraryFolder and Session.
// Lines marked EXPECT-ERROR must be reported by tsc; every other line must compile.
import sequelizeModule = require('D:/SEM-2/574/Project/audiobookshelf-po/node_modules/sequelize')
import LibraryFolder = require('D:/SEM-2/574/Project/audiobookshelf-po/server/models/LibraryFolder')
import Session = require('D:/SEM-2/574/Project/audiobookshelf-po/server/models/Session')
type Sequelize = sequelizeModule.Sequelize

declare const db: Sequelize

const lfInit: void = LibraryFolder.init(db)
const lfStatic: sequelizeModule.ModelStatic<LibraryFolder> = LibraryFolder
const sInit: void = Session.init(db)
const sStatic: sequelizeModule.ModelStatic<Session> = Session
Session.init({}, { sequelize: db }) // EXPECT-ERROR F1 (Model.init's own shape stays uncallable)

async function useOthers() {
  const folder = await LibraryFolder.findByPk('x')
  if (folder) {
    const old = folder.toOldJSON()
    const addedAt: number = old.addedAt
    const fullPath: string = old.fullPath
    const wrong: number = old.libraryId // EXPECT-ERROR F2 (string)
  }

  const session = await Session.createSession('u', 'ip', 'ua', 'rt', new Date())
  const exp: Date = session.expiresAt
  const rt: string = session.refreshToken
  const lastOk: string | null = session.lastRefreshToken
  const last: string = session.lastRefreshToken // EXPECT-ERROR F3 (string | null)
  const uname: string = session.user.username
  const bogus = session.user.nonexistentProp // EXPECT-ERROR F4 (user is the User model, not any)
  const n: number = await Session.cleanupExpiredSessions()
  await Session.createSession('u', 'ip', 'ua', 'rt', 'not-a-date') // EXPECT-ERROR F5 (Date)
}
