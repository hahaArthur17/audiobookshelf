/// <reference path="../types/untypedModules.d.ts" />
import Path = require('path')
import uuid = require('uuid')
const uuidv4 = uuid.v4
import fs = require('../libs/fsExtra')
import dateAndTime = require('../libs/dateAndTime')
const date = dateAndTime as typeof dateAndTime & { format(dateObj: Date, formatString: string): string } // boundary: the minified UMD libs/dateAndTime is inferred as an object with only a res property, without format()

import Logger = require('../Logger')
import utils = require('../utils/index')
const { secondsToTimestamp, elapsedPretty } = utils

declare const global: typeof globalThis & { MetadataPath: string }

type Library = import('../models/Library')

interface LibraryScanLog {
  timestamp: string
  message: string
  levelName: string
  level: number
}

class LibraryScan {
  declare id: string | null
  declare type: string | null
  declare library: Library | null
  declare verbose: boolean

  declare startedAt: number | null
  declare finishedAt: number | null
  declare elapsed: number | null

  declare resultsMissing: number
  declare resultsAdded: number
  declare resultsUpdated: number

  declare authorsRemovedFromBooks: string[]
  declare authorsNumBooksChangedIds: Set<string>
  declare seriesRemovedFromBooks: string[]

  declare logs: LibraryScanLog[]

  constructor() {
    this.id = null
    this.type = null
    /** @type {import('../models/Library')} */
    this.library = null
    this.verbose = false

    this.startedAt = null
    this.finishedAt = null
    this.elapsed = null

    this.resultsMissing = 0
    this.resultsAdded = 0
    this.resultsUpdated = 0

    /** @type {string[]} */
    this.authorsRemovedFromBooks = []
    /** @type {Set<string>} */
    this.authorsNumBooksChangedIds = new Set()
    /** @type {string[]} */
    this.seriesRemovedFromBooks = []

    this.logs = []
  }

  get libraryId() {
    return this.library!.id // library is set by setData() right after the constructor (LibraryScanner.scan, Scanner.matchLibraryItems)
  }
  get libraryName() {
    return this.library!.name // library is set by setData() right after the constructor
  }
  get libraryMediaType() {
    return this.library!.mediaType // library is set by setData() right after the constructor
  }
  get libraryFolders() {
    return this.library!.libraryFolders // library is set by setData() right after the constructor
  }

  get timestamp() {
    return new Date().toISOString()
  }

  get resultStats() {
    return `${this.resultsAdded} Added | ${this.resultsUpdated} Updated | ${this.resultsMissing} Missing`
  }
  get elapsedTimestamp() {
    return secondsToTimestamp(this.elapsed! / 1000) // elapsed is set by setComplete(), which the callers run before they read this
  }
  get logFilename() {
    return date.format(new Date(), 'YYYY-MM-DD') + '_' + this.id + '.txt'
  }
  get scanResultsString() {
    const strs = []
    if (this.resultsAdded) strs.push(`${this.resultsAdded} added`)
    if (this.resultsUpdated) strs.push(`${this.resultsUpdated} updated`)
    if (this.resultsMissing) strs.push(`${this.resultsMissing} missing`)
    const changesDetected = strs.length > 0 ? strs.join(', ') : 'No changes needed'
    const timeElapsed = `(${elapsedPretty(this.elapsed! / 1000)})` // elapsed is set by setComplete(), which the callers run before they read scanResults
    return `${changesDetected} ${timeElapsed}`
  }

  get scanResults() {
    return {
      added: this.resultsAdded,
      updated: this.resultsUpdated,
      missing: this.resultsMissing,
      elapsed: this.elapsed,
      text: this.scanResultsString
    }
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      library: this.library!.toJSON(), // library is set by setData() right after the constructor
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      elapsed: this.elapsed,
      resultsAdded: this.resultsAdded,
      resultsUpdated: this.resultsUpdated,
      resultsMissing: this.resultsMissing
    }
  }

  /**
   *
   * @param {import('../models/Library')} library
   * @param {string} type
   */
  setData(library: Library, type = 'scan'): void {
    this.id = uuidv4()
    this.type = type
    this.library = library

    this.startedAt = Date.now()
  }

  setComplete(): void {
    this.finishedAt = Date.now()
    this.elapsed = this.finishedAt - this.startedAt! // startedAt is set by setData() before setComplete() runs
  }

  addLog(level: number, ...args: unknown[]): void {
    const logObj: LibraryScanLog = {
      timestamp: this.timestamp,
      message: args.join(' '),
      levelName: Logger.getLogLevelString(level),
      level
    }

    if (this.verbose) {
      Logger.debug(`[LibraryScan] "${this.libraryName}":`, ...args)
    }
    this.logs.push(logObj)
  }

  async saveLog(): Promise<void> {
    const scanLogDir = Path.join(global.MetadataPath, 'logs', 'scans')

    if (!(await fs.pathExists(scanLogDir))) {
      await (fs as typeof fs & { mkdir(path: string): Promise<void> }).mkdir(scanLogDir) // libs/fsExtra adds mkdir in a loop, so its inferred type lacks it
    }

    const outputPath = Path.join(scanLogDir, this.logFilename)
    const logLines = [JSON.stringify(this.toJSON())]
    this.logs.forEach((l) => {
      logLines.push(JSON.stringify(l))
    })
    await (fs as typeof fs & { writeFile(path: string, data: string): Promise<void> }).writeFile(outputPath, logLines.join('\n') + '\n') // libs/fsExtra adds writeFile in a loop, so its inferred type lacks it

    Logger.info(`[LibraryScan] Scan log saved "${outputPath}"`)
  }
}
export = LibraryScan
