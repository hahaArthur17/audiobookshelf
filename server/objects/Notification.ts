// uuid has no type declarations here (it is only a transitive dependency and @types/uuid is not installed), so `import uuid = require('uuid')` fails with TS7016. A plain require() is typed any by @types/node, hence the annotation.
const uuidv4: () => string = require("uuid").v4

/** A notification as loaded from the saved notification settings. The fields construct() falls back on may be missing from older records. */
interface StoredNotification {
  id: string
  libraryId?: string | null
  eventName: string
  urls?: string[] | null
  titleTemplate?: string | null
  bodyTemplate?: string | null
  type?: string | null
  enabled?: boolean
  lastFiredAt?: number | null
  lastAttemptFailed?: boolean
  numConsecutiveFailedAttempts?: number | null
  numTimesFired?: number | null
  createdAt: number
}

/** Body of POST /api/notifications. The server only checks that eventName and urls are present; the rest is stored as sent. */
interface NewNotificationPayload {
  libraryId?: string | null
  eventName: string
  urls: string[]
  titleTemplate: string
  bodyTemplate: string
  enabled?: boolean
  type?: string | null
}

/** Body of PATCH /api/notifications/:id. Only the keys that are present are applied. */
type NotificationUpdatePayload = Partial<NewNotificationPayload>

/** Values for the {{variables}} in the title and body templates. A falsy value leaves its variable unreplaced; any other value is written into the template as text. */
type NotificationEventData = Record<string, string | number | boolean | null | undefined>

class Notification {
  /** null until setData() or construct() runs */
  declare id: string | null
  declare libraryId: string | null
  declare eventName: string
  declare urls: string[]
  declare titleTemplate: string
  declare bodyTemplate: string
  /** Apprise notification type ('info', 'success', 'warning' or 'failure'). Stored as the client sent it, without validation. */
  declare type: string | null
  declare enabled: boolean

  declare lastFiredAt: number | null
  declare lastAttemptFailed: boolean
  declare numConsecutiveFailedAttempts: number
  declare numTimesFired: number
  /** null until setData() or construct() runs */
  declare createdAt: number | null

  constructor(notification: StoredNotification | null = null) {
    this.id = null
    this.libraryId = null
    this.eventName = ''
    this.urls = []
    this.titleTemplate = ''
    this.bodyTemplate = ''
    this.type = 'info'
    this.enabled = false

    this.lastFiredAt = null
    this.lastAttemptFailed = false
    this.numConsecutiveFailedAttempts = 0
    this.numTimesFired = 0
    this.createdAt = null

    if (notification) {
      this.construct(notification)
    }
  }

  construct(notification: StoredNotification): void {
    this.id = notification.id
    this.libraryId = notification.libraryId || null
    this.eventName = notification.eventName
    this.urls = notification.urls || []
    this.titleTemplate = notification.titleTemplate || ''
    this.bodyTemplate = notification.bodyTemplate || ''
    this.type = notification.type || 'info'
    this.enabled = !!notification.enabled
    this.lastFiredAt = notification.lastFiredAt || null
    this.lastAttemptFailed = !!notification.lastAttemptFailed
    this.numConsecutiveFailedAttempts = notification.numConsecutiveFailedAttempts || 0
    this.numTimesFired = notification.numTimesFired || 0
    this.createdAt = notification.createdAt
  }

  toJSON() {
    return {
      id: this.id,
      libraryId: this.libraryId,
      eventName: this.eventName,
      urls: this.urls,
      titleTemplate: this.titleTemplate,
      bodyTemplate: this.bodyTemplate,
      enabled: this.enabled,
      type: this.type,
      lastFiredAt: this.lastFiredAt,
      lastAttemptFailed: this.lastAttemptFailed,
      numConsecutiveFailedAttempts: this.numConsecutiveFailedAttempts,
      numTimesFired: this.numTimesFired,
      createdAt: this.createdAt
    }
  }

  setData(payload: NewNotificationPayload): void {
    this.id = uuidv4()
    this.libraryId = payload.libraryId || null
    this.eventName = payload.eventName
    this.urls = payload.urls
    this.titleTemplate = payload.titleTemplate
    this.bodyTemplate = payload.bodyTemplate
    this.enabled = !!payload.enabled
    this.type = payload.type || null
    this.createdAt = Date.now()
  }

  update(payload: NotificationUpdatePayload): boolean {
    if (!this.enabled && payload.enabled) {
      // Reset
      this.lastFiredAt = null
      this.lastAttemptFailed = false
      this.numConsecutiveFailedAttempts = 0
    }

    const keysToUpdate = ['libraryId', 'eventName', 'urls', 'titleTemplate', 'bodyTemplate', 'enabled', 'type'] as const
    var hasUpdated = false
    for (const key of keysToUpdate) {
      if (payload[key] !== undefined) {
        if (key === 'urls') {
          if (payload[key].join(',') !== this.urls.join(',')) {
            this.urls = [...payload[key]]
            hasUpdated = true
          }
        } else if (payload[key] !== this[key]) {
          // key and value belong together, but the compiler cannot follow that across a union of keys, so the target is asserted to the payload's type for the same key
          (this[key] as NotificationUpdatePayload[typeof key]) = payload[key]
          hasUpdated = true
        }
      }
    }
    return hasUpdated
  }

  updateNotificationFired(success: boolean): void {
    this.lastFiredAt = Date.now()
    this.lastAttemptFailed = !success
    this.numConsecutiveFailedAttempts = success ? 0 : this.numConsecutiveFailedAttempts + 1
    this.numTimesFired++
  }

  replaceVariablesInTemplate(templateText: string, data: NotificationEventData): string {
    const ptrn = /{{ ?([a-zA-Z]+) ?}}/mg

    var match: RegExpExecArray | null
    var updatedTemplate = templateText
    while ((match = ptrn.exec(templateText)) != null) {
      if (data[match[1]]) {
        // event data also holds numbers and booleans, which replace() writes out as text although its typings only admit a string
        updatedTemplate = updatedTemplate.replace(match[0], data[match[1]] as string)
      }
    }
    return updatedTemplate
  }

  parseTitleTemplate(data: NotificationEventData): string {
    return this.replaceVariablesInTemplate(this.titleTemplate, data)
  }

  parseBodyTemplate(data: NotificationEventData): string {
    return this.replaceVariablesInTemplate(this.bodyTemplate, data)
  }

  getApprisePayload(data: NotificationEventData) {
    return {
      urls: this.urls,
      title: this.parseTitleTemplate(data),
      body: this.parseBodyTemplate(data)
    }
  }
}
export = Notification