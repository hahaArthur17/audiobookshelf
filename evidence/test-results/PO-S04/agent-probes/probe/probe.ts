// Scratch probe, outside the repo. Checks what a TypeScript caller sees for each shape of the init pattern.
// Lines marked EXPECT-ERROR must be reported by tsc; every other line must compile.
import sequelizeModule = require('D:/SEM-2/574/Project/audiobookshelf-po/node_modules/sequelize')
import Setting = require('D:/SEM-2/574/Project/audiobookshelf-po/server/models/Setting')
const { DataTypes, Model } = sequelizeModule
type Sequelize = sequelizeModule.Sequelize

declare const db: Sequelize

// --- A: no overload at all (the straight conversion) ---
class Plain extends Model { // EXPECT-ERROR A1 (static side clash)
  static init(sequelize: Sequelize): void {
    super.init({ k: DataTypes.STRING }, { sequelize, modelName: 'plain' }) // EXPECT-ERROR A2 (this context)
  }
}

// --- B: CLAUDE.md read literally: ONE uncallable overload directly above the real method ---
class TwoDecl extends Model {
  static init(this: never, ...args: never[]): never
  static init(sequelize: Sequelize): void {
    super.init({ k: DataTypes.STRING }, { sequelize, modelName: 'two' })
  }
}
TwoDecl.init(db) // EXPECT-ERROR B1? (is the real signature visible to a TS caller?)
const twoStatic: sequelizeModule.ModelStatic<TwoDecl> = TwoDecl

// --- C: uncallable overload + the real signature repeated as a second overload ---
class ThreeDecl extends Model {
  static init(this: never, ...args: never[]): never
  static init(sequelize: Sequelize): void
  static init(sequelize: Sequelize): void {
    super.init({ k: DataTypes.STRING }, { sequelize, modelName: 'three' })
  }
}
const threeResult: void = ThreeDecl.init(db)
const threeStatic: sequelizeModule.ModelStatic<ThreeDecl> = ThreeDecl
ThreeDecl.init({ k: DataTypes.STRING }, { sequelize: db, modelName: 'x' }) // EXPECT-ERROR C1 (Model.init's own shape must stay uncallable)

// --- The real converted model ---
const settingResult: void = Setting.init(db)
const settingStatic: sequelizeModule.ModelStatic<Setting> = Setting
async function useSetting() {
  const old = await Setting.getOldSettings()
  const host: string | null = old.emailSettings.host
  const first = old.settings[0]
  if (first.id === 'email-settings') {
    const h: string | null = first.host
    const bad: number = first.id // EXPECT-ERROR D1 (id is the literal 'email-settings')
  }
  const row = (await Setting.findAll())[0]
  const key: string = row.key
  const created: Date = row.createdAt
  const [saved] = await Setting.updateSettingObj(old.emailSettings.toJSON())
  const savedKey: string = saved.key
  await Setting.updateSettingObj(old.serverSettings.toJSON())
  await Setting.updateSettingObj(old.notificationSettings.toJSON())
  await Setting.updateSettingObj({ nope: true }) // EXPECT-ERROR D2 (not a settings object)
}
