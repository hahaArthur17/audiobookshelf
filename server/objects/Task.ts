// uuid has no type declarations here (it is only a transitive dependency and @types/uuid is not installed), so `import uuid = require('uuid')` fails with TS7016. A plain require() is typed any by @types/node, hence the annotation.
const uuidv4: () => string = require('uuid').v4

/** A message for the client: the English text, its translation key and the values substituted into the translation */
interface TaskString {
  text: string
  key: string
  subs?: string[]
}

class Task {
  // Nullable fields start as null in the constructor; setData(), setFailed() and setFinished() fill them in
  declare id: string | null
  declare action: string | null
  declare data: Record<string, unknown> | null

  declare title: string | null
  declare titleKey: string | null
  declare titleSubs: string[] | null

  declare description: string | null
  declare descriptionKey: string | null
  declare descriptionSubs: string[] | null

  declare error: string | null
  declare errorKey: string | null
  declare errorSubs: string[] | null

  declare showSuccess: boolean

  declare isFailed: boolean
  declare isFinished: boolean

  declare startedAt: number | null
  declare finishedAt: number | null
  /** Only assigned by setFailed(); not initialised by the constructor and not part of toJSON() */
  declare failedAt?: number

  constructor() {
    /** @type {string} */
    this.id = null
    /** @type {string} */
    this.action = null // e.g. embed-metadata, encode-m4b, etc
    /** @type {Object} custom data */
    this.data = null // additional info for the action like libraryItemId

    /** @type {string} */
    this.title = null
    /** @type {string} - Used for translation */
    this.titleKey = null
    /** @type {string[]} - Used for translation */
    this.titleSubs = null

    /** @type {string} */
    this.description = null
    /** @type {string} - Used for translation */
    this.descriptionKey = null
    /** @type {string[]} - Used for translation */
    this.descriptionSubs = null

    /** @type {string} */
    this.error = null
    /** @type {string} - Used for translation */
    this.errorKey = null
    /** @type {string[]} - Used for translation */
    this.errorSubs = null

    /** @type {boolean} client should keep the task visible after success */
    this.showSuccess = false

    /** @type {boolean} */
    this.isFailed = false
    /** @type {boolean} */
    this.isFinished = false

    /** @type {number} */
    this.startedAt = null
    /** @type {number} */
    this.finishedAt = null
  }

  toJSON() {
    return {
      id: this.id,
      action: this.action,
      data: this.data ? { ...this.data } : {},
      title: this.title,
      titleKey: this.titleKey,
      titleSubs: this.titleSubs,
      description: this.description,
      descriptionKey: this.descriptionKey,
      descriptionSubs: this.descriptionSubs,
      error: this.error,
      errorKey: this.errorKey,
      errorSubs: this.errorSubs,
      showSuccess: this.showSuccess,
      isFailed: this.isFailed,
      isFinished: this.isFinished,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt
    }
  }

  /**
   * Set initial task data
   *
   * @param {string} action
   * @param {TaskString} titleString
   * @param {TaskString|null} descriptionString
   * @param {boolean} showSuccess
   * @param {Object} [data] null is stored as an empty object (PodcastManager passes null for opml-import)
   */
  setData(action: string, titleString: TaskString, descriptionString: TaskString | null, showSuccess: boolean, data: Record<string, unknown> | null = {}): void {
    this.id = uuidv4()
    this.action = action
    this.data = { ...data }
    this.title = titleString.text
    this.titleKey = titleString.key || null
    this.titleSubs = titleString.subs || null
    this.description = descriptionString?.text || null
    this.descriptionKey = descriptionString?.key || null
    this.descriptionSubs = descriptionString?.subs || null
    this.showSuccess = showSuccess
    this.startedAt = Date.now()
  }

  /**
   * Set task as failed
   *
   * @param {TaskString} messageString
   */
  setFailed(messageString: TaskString): void {
    this.error = messageString.text
    this.errorKey = messageString.key || null
    this.errorSubs = messageString.subs || null
    this.isFailed = true
    this.failedAt = Date.now()
    this.setFinished()
  }

  /**
   * Set task as finished
   *
   * @param {TaskString} [newDescriptionString] update description
   * @param {boolean} [clearDescription] clear description
   */
  setFinished(newDescriptionString: TaskString | null = null, clearDescription = false): void {
    if (newDescriptionString) {
      this.description = newDescriptionString.text
      this.descriptionKey = newDescriptionString.key || null
      this.descriptionSubs = newDescriptionString.subs || null
    } else if (clearDescription) {
      this.description = null
      this.descriptionKey = null
      this.descriptionSubs = null
    }
    this.isFinished = true
    this.finishedAt = Date.now()
  }
}
export = Task
