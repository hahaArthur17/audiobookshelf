import sequelizeModule = require('sequelize')
const { DataTypes, Model } = sequelizeModule
import type { BuildOptions, CreationAttributes, Sequelize } from 'sequelize'

import oldEmailSettings = require('../objects/settings/EmailSettings')
import oldServerSettings = require('../objects/settings/ServerSettings')
import oldNotificationSettings = require('../objects/settings/NotificationSettings')

type EmailSettingsData = NonNullable<ConstructorParameters<typeof oldEmailSettings>[0]>
type ServerSettingsData = NonNullable<ConstructorParameters<typeof oldServerSettings>[0]>
type NotificationSettingsData = NonNullable<ConstructorParameters<typeof oldNotificationSettings>[0]>

/** JSON read from the value column: one stored settings object per row, told apart by its id */
type SettingValue = (EmailSettingsData & { id: 'email-settings' }) | (ServerSettingsData & { id: 'server-settings' }) | (NotificationSettingsData & { id: 'notification-settings' })

/** JSON written to the value column: toJSON() of one of the three settings classes */
type SettingObject = ReturnType<oldEmailSettings['toJSON']> | ReturnType<oldServerSettings['toJSON']> | ReturnType<oldNotificationSettings['toJSON']>

class Setting extends Model {
  declare key: string
  declare value: SettingValue
  declare createdAt: Date
  declare updatedAt: Date

  constructor(values?: CreationAttributes<Setting>, options?: BuildOptions) {
    super(values, options)

    /** @type {string} */
    this.key
    /** @type {Object} */
    this.value
    /** @type {Date} */
    this.createdAt
    /** @type {Date} */
    this.updatedAt
  }

  static async getOldSettings() {
    const settings = (await this.findAll()).map((se) => se.value)

    const emailSettingsJson = settings.find((se) => se.id === 'email-settings')
    const serverSettingsJson = settings.find((se) => se.id === 'server-settings')
    const notificationSettingsJson = settings.find((se) => se.id === 'notification-settings')

    return {
      settings,
      emailSettings: new oldEmailSettings(emailSettingsJson),
      serverSettings: new oldServerSettings(serverSettingsJson),
      notificationSettings: new oldNotificationSettings(notificationSettingsJson)
    }
  }

  static updateSettingObj(setting: SettingObject) {
    return this.upsert({
      key: setting.id,
      value: setting
    })
  }

  static init(this: never, ...args: never[]): never // uncallable: keeps the static side assignable to Model.init, which this method replaces
  static init(sequelize: Sequelize): void
  /**
   * Initialize model
   * @param {import('../Database').sequelize} sequelize
   */
  static init(sequelize: Sequelize): void {
    super.init(
      {
        key: {
          type: DataTypes.STRING,
          primaryKey: true
        },
        value: DataTypes.JSON
      },
      {
        sequelize,
        modelName: 'setting'
      }
    )
  }
}

export = Setting
