import type { NextFunction, Request, Response } from 'express'
import sequelize = require('sequelize')
import fs = require('../libs/fsExtra')
import fastSort = require('../libs/fastSort')
const { createNewSortInstance }: {
  // libs/fastSort is vendored and untyped (its sorter takes and returns any): only the call shape used in this file
  createNewSortInstance(opts: { comparer: (a: string, b: string) => number }): <T>(ctx: T[]) => { asc(sortBy: (item: T) => unknown): T[] }
} = fastSort

import Logger = require('../Logger')
import SocketAuthority = require('../SocketAuthority')
import Database = require('../Database')
import CacheManager = require('../managers/CacheManager')
import CoverManager = require('../managers/CoverManager')
import AuthorFinder = require('../finders/AuthorFinder')

import utils = require('../utils/index')
const { reqSupportsWebp, isValidASIN, clampPositiveInt } = utils

type User = import('../models/User')
type Author = import('../models/Author')
type LibraryItem = import('../models/LibraryItem')
type BookExpanded = import('../models/Book').BookExpanded

type AuthorQuery = { include?: string; width?: string; height?: string; format?: string; raw?: string } // query values are assumed to be strings: the code calls .split and parseInt on them
type AuthorBody = { url?: string; region?: string; asin?: string; q?: string; [key: string]: unknown } // index signature: update() reads req.body by a dynamic key

type RequestWithUser = Request<{ id: string }, unknown, AuthorBody, AuthorQuery> & { user: User }
type RequestEntityObject = { author: Author }
type AuthorControllerRequest = RequestWithUser & RequestEntityObject

/** A library item of an author, which is always a book: LibraryItem.js (JS) types media as Book | Podcast */
type BookLibraryItem = LibraryItem & { media: BookExpanded }
/** The same for update() and delete(): media.authors also takes the plain { id, name } object that update() pushes when it merges two authors */
type BookLibraryItemWithAuthorList = LibraryItem & { media: BookExpanded & { authors: { id: string; name: string }[] } }

/** toOldJSONMinified() of a library item plus the series entry that findOne() adds to its metadata */
type ItemWithSeries = ReturnType<LibraryItem['toOldJSONMinified']> & { media: { metadata: { series?: { id: string; name: string; nameIgnorePrefix: string; sequence: string | null } } } }
type SeriesWithItems = { id: string; name: string; items: ItemWithSeries[] }
/** toOldJSON() of an author plus the keys that findOne() adds to the same object */
type AuthorJsonWithIncludes = ReturnType<Author['toOldJSON']> & { series?: SeriesWithItems[]; libraryItems?: ReturnType<LibraryItem['toOldJSONMinified']>[] }
/** saveAuthorImage() resolves with { path } or { error }; the code reads both keys */
type AuthorImageResult = { path?: string; error?: string }

const naturalSort = createNewSortInstance({
  comparer: new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare
})

/**
 * @typedef RequestUserObject
 * @property {import('../models/User')} user
 *
 * @typedef {Request & RequestUserObject} RequestWithUser
 *
 * @typedef RequestEntityObject
 * @property {import('../models/Author')} author
 *
 * @typedef {RequestWithUser & RequestEntityObject} AuthorControllerRequest
 */

class AuthorController {
  constructor() {}

  /**
   * GET: /api/authors/:id
   *
   * @param {AuthorControllerRequest} req
   * @param {Response} res
   */
  async findOne(req: AuthorControllerRequest, res: Response) {
    const include = (req.query.include || '').split(',')

    const authorJson: AuthorJsonWithIncludes = req.author.toOldJSON()

    // Used on author landing page to include library items and items grouped in series
    if (include.includes('items')) {
      const libraryItems = await Database.libraryItemModel.getForAuthor(req.author, req.user) as BookLibraryItem[] // boundary: LibraryItem.js (JS) types media as Book | Podcast; getForAuthor() returns book items only

      if (include.includes('series')) {
        const seriesMap: { [key: string]: SeriesWithItems } = {} // index signature: filled by a dynamic key (series.id)
        // Group items into series
        libraryItems.forEach((li) => {
          if (li.media.series?.length) {
            li.media.series.forEach((series) => {
              const itemWithSeries: ItemWithSeries = li.toOldJSONMinified()
              itemWithSeries.media.metadata.series = {
                id: series.id,
                name: series.name,
                nameIgnorePrefix: series.nameIgnorePrefix,
                sequence: series.bookSeries.sequence
              }

              if (seriesMap[series.id]) {
                seriesMap[series.id].items.push(itemWithSeries)
              } else {
                seriesMap[series.id] = {
                  id: series.id,
                  name: series.name,
                  items: [itemWithSeries]
                }
              }
            })
          }
        })
        // Sort series items
        for (const key in seriesMap) {
          seriesMap[key].items = naturalSort(seriesMap[key].items).asc((li) => li.media.metadata.series!.sequence) // series is set above, before the item is put into seriesMap
        }

        authorJson.series = Object.values(seriesMap)
      }

      // Minify library items
      authorJson.libraryItems = libraryItems.map((li) => li.toOldJSONMinified())
    }

    return res.json(authorJson)
  }

  /**
   * PATCH: /api/authors/:id
   *
   * @param {AuthorControllerRequest} req
   * @param {Response} res
   */
  async update(req: AuthorControllerRequest, res: Response) {
    const keysToUpdate = ['name', 'description', 'asin']
    const payload: { [key: string]: string | null } = {} // index signature: filled by a dynamic key
    for (const key in req.body) {
      if (keysToUpdate.includes(key) && (typeof req.body[key] === 'string' || req.body[key] === null)) {
        payload[key] = req.body[key]
      }
    }
    if (!Object.keys(payload).length) {
      Logger.error(`[AuthorController] Invalid request payload. No valid keys found`, req.body)
      return res.status(400).send('Invalid request payload. No valid keys found')
    }

    let hasUpdated = false

    const authorNameUpdate = payload.name !== undefined && payload.name !== req.author.name
    if (authorNameUpdate) {
      payload.lastFirst = Database.authorModel.getLastFirst(payload.name as Parameters<typeof Database.authorModel.getLastFirst>[0]) // boundary: Author.getLastFirst takes string, but the name in the payload can be null (TS2345); see the bug log
    }

    // Check if author name matches another author in the same library and merge the authors
    let existingAuthor = null
    if (authorNameUpdate) {
      existingAuthor = await Database.authorModel.findOne({
        where: {
          id: {
            [sequelize.Op.not]: req.author.id
          },
          name: payload.name,
          libraryId: req.author.libraryId
        }
      })
    }
    if (existingAuthor) {
      Logger.info(`[AuthorController] Merging author "${req.author.name}" with "${existingAuthor.name}"`)
      const bookAuthorsToCreate: { bookId: string; authorId: string }[] = []
      const allItemsWithAuthor = await Database.authorModel.getAllLibraryItemsForAuthor(req.author.id) as BookLibraryItemWithAuthorList[] // boundary: LibraryItem.js (JS) types media as Book | Podcast; these are book items

      const libraryItems: LibraryItem[] = []
      allItemsWithAuthor.forEach((libraryItem) => {
        // Replace old author with merging author for each book
        libraryItem.media.authors = libraryItem.media.authors.filter((au) => au.id !== req.author.id)
        libraryItem.media.authors.push({
          id: existingAuthor.id,
          name: existingAuthor.name
        })

        libraryItems.push(libraryItem)

        bookAuthorsToCreate.push({
          bookId: libraryItem.media.id,
          authorId: existingAuthor.id
        })
      })
      if (libraryItems.length) {
        await Database.bookAuthorModel.removeByIds(req.author.id) // Remove all old BookAuthor
        await Database.bookAuthorModel.bulkCreate(bookAuthorsToCreate, { ignoreDuplicates: true }) // Create all new unique BookAuthor
        for (const libraryItem of libraryItems) {
          await libraryItem.saveMetadataFile()
        }
        SocketAuthority.libraryItemsEmitter('items_updated', libraryItems)
      }

      // Remove old author
      const oldAuthorJSON = req.author.toOldJSON()
      await req.author.destroy()
      SocketAuthority.emitter('author_removed', oldAuthorJSON)
      // Update filter data
      Database.removeAuthorFromFilterData(oldAuthorJSON.libraryId, oldAuthorJSON.id)

      // Send updated num books for merged author
      const numBooks = await Database.bookAuthorModel.getCountForAuthor(existingAuthor.id)
      SocketAuthority.emitter('author_updated', existingAuthor.toOldJSONExpanded(numBooks))

      res.json({
        author: existingAuthor.toOldJSON(),
        merged: true
      })
      return
    }

    // If lastFirst is not set, get it from the name
    if (!authorNameUpdate && !req.author.lastFirst) {
      payload.lastFirst = Database.authorModel.getLastFirst(req.author.name)
    }

    // Regular author update
    req.author.set(payload)
    if (req.author.changed()) {
      await req.author.save()
      hasUpdated = true
    }

    if (hasUpdated) {
      let numBooksForAuthor = 0
      if (authorNameUpdate) {
        const allItemsWithAuthor = await Database.authorModel.getAllLibraryItemsForAuthor(req.author.id) as BookLibraryItemWithAuthorList[] // boundary: see the same call above

        numBooksForAuthor = allItemsWithAuthor.length
        const libraryItems = []
        // Update author name on all books
        for (const libraryItem of allItemsWithAuthor) {
          libraryItem.media.authors = libraryItem.media.authors.map((au) => {
            if (au.id === req.author.id) {
              au.name = req.author.name
            }
            return au
          })

          libraryItems.push(libraryItem)

          await libraryItem.saveMetadataFile()
        }

        if (libraryItems.length) {
          SocketAuthority.libraryItemsEmitter('items_updated', libraryItems)
        }
      } else {
        numBooksForAuthor = await Database.bookAuthorModel.getCountForAuthor(req.author.id)
      }

      SocketAuthority.emitter('author_updated', req.author.toOldJSONExpanded(numBooksForAuthor))
    }

    res.json({
      author: req.author.toOldJSON(),
      updated: hasUpdated
    })
  }

  /**
   * DELETE: /api/authors/:id
   * Remove author from all books and delete
   *
   * @param {AuthorControllerRequest} req
   * @param {Response} res
   */
  async delete(req: AuthorControllerRequest, res: Response) {
    Logger.info(`[AuthorController] Removing author "${req.author.name}"`)

    if (req.author.imagePath) {
      await CacheManager.purgeImageCache(req.author.id) // Purge cache
    }

    // Load library items so that metadata file can be updated
    const allItemsWithAuthor = await Database.authorModel.getAllLibraryItemsForAuthor(req.author.id) as BookLibraryItemWithAuthorList[] // boundary: see the same call in update()
    allItemsWithAuthor.forEach((libraryItem) => {
      libraryItem.media.authors = libraryItem.media.authors.filter((au) => au.id !== req.author.id)
    })

    await req.author.destroy()

    for (const libraryItem of allItemsWithAuthor) {
      await libraryItem.saveMetadataFile()
    }

    SocketAuthority.emitter('author_removed', req.author.toOldJSON())

    // Update filter data
    Database.removeAuthorFromFilterData(req.author.libraryId, req.author.id)

    res.sendStatus(200)
  }

  /**
   * POST: /api/authors/:id/image
   * Upload author image from web URL
   *
   * @param {AuthorControllerRequest} req
   * @param {Response} res
   */
  async uploadImage(req: AuthorControllerRequest, res: Response) {
    if (!req.user.canUpload) {
      Logger.warn(`User "${req.user.username}" attempted to upload an image without permission`)
      return res.sendStatus(403)
    }
    if (!req.body.url) {
      Logger.error(`[AuthorController] Invalid request payload. 'url' not in request body`)
      return res.status(400).send(`Invalid request payload. 'url' not in request body`)
    }
    if (!req.body.url.startsWith?.('http:') && !req.body.url.startsWith?.('https:')) {
      Logger.error(`[AuthorController] Invalid request payload. Invalid url "${req.body.url}"`)
      return res.status(400).send(`Invalid request payload. Invalid url "${req.body.url}"`)
    }

    Logger.debug(`[AuthorController] Requesting download author image from url "${req.body.url}"`)
    const result: AuthorImageResult = await AuthorFinder.saveAuthorImage(req.author.id, req.body.url)

    if (result?.error) {
      return res.status(400).send(result.error)
    } else if (!result?.path) {
      return res.status(500).send('Unknown error occurred')
    }

    if (req.author.imagePath) {
      await CacheManager.purgeImageCache(req.author.id) // Purge cache
    }

    req.author.imagePath = result.path
    // imagePath may not have changed, but we still want to update the updatedAt field to bust image cache
    req.author.changed('imagePath', true)
    await req.author.save()

    const numBooks = await Database.bookAuthorModel.getCountForAuthor(req.author.id)
    SocketAuthority.emitter('author_updated', req.author.toOldJSONExpanded(numBooks))
    res.json({
      author: req.author.toOldJSON()
    })
  }

  /**
   * DELETE: /api/authors/:id/image
   * Remove author image & delete image file
   *
   * @param {AuthorControllerRequest} req
   * @param {Response} res
   */
  async deleteImage(req: AuthorControllerRequest, res: Response) {
    if (!req.author.imagePath) {
      Logger.error(`[AuthorController] Author "${req.author.imagePath}" has no imagePath set`)
      return res.status(400).send('Author has no image path set')
    }
    Logger.info(`[AuthorController] Removing image for author "${req.author.name}" at "${req.author.imagePath}"`)
    await CacheManager.purgeImageCache(req.author.id) // Purge cache
    await CoverManager.removeFile(req.author.imagePath)
    req.author.imagePath = null
    await req.author.save()

    const numBooks = await Database.bookAuthorModel.getCountForAuthor(req.author.id)
    SocketAuthority.emitter('author_updated', req.author.toOldJSONExpanded(numBooks))
    res.json({
      author: req.author.toOldJSON()
    })
  }

  /**
   * POST: /api/authors/:id/match
   *
   * @param {AuthorControllerRequest} req
   * @param {Response} res
   */
  async match(req: AuthorControllerRequest, res: Response) {
    let authorData = null
    const region = req.body.region || 'us'
    if (req.body.asin && isValidASIN(req.body.asin.toUpperCase?.())) {
      authorData = await AuthorFinder.findAuthorByASIN(req.body.asin, region)
    } else {
      authorData = await AuthorFinder.findAuthorByName(req.body.q, region)
    }
    if (!authorData) {
      return res.status(404).send('Author not found')
    }
    Logger.debug(`[AuthorController] match author with "${req.body.q || req.body.asin}"`, authorData)

    let hasUpdates = false
    if (authorData.asin && req.author.asin !== authorData.asin) {
      req.author.asin = authorData.asin
      hasUpdates = true
    }

    // Only updates image if there was no image before or the author ASIN was updated
    if (authorData.image && (!req.author.imagePath || hasUpdates)) {
      await CacheManager.purgeImageCache(req.author.id)

      const imageData: AuthorImageResult = await AuthorFinder.saveAuthorImage(req.author.id, authorData.image)
      if (imageData?.path) {
        req.author.imagePath = imageData.path
        hasUpdates = true
      }
    }

    if (authorData.description && req.author.description !== authorData.description) {
      req.author.description = authorData.description
      hasUpdates = true
    }

    if (hasUpdates) {
      await req.author.save()

      const numBooks = await Database.bookAuthorModel.getCountForAuthor(req.author.id)
      SocketAuthority.emitter('author_updated', req.author.toOldJSONExpanded(numBooks))
    }

    res.json({
      updated: hasUpdates,
      author: req.author.toOldJSON()
    })
  }

  /**
   * GET: /api/authors/:id/image
   *
   * @param {AuthorControllerRequest} req
   * @param {Response} res
   */
  async getImage(req: RequestWithUser, res: Response) {
    const {
      query: { width, height, format, raw }
    } = req

    const authorId = req.params.id

    if (raw) {
      const author = await Database.authorModel.findByPk(authorId)
      if (!author) {
        Logger.warn(`[AuthorController] Author "${authorId}" not found`)
        return res.sendStatus(404)
      }

      if (!author.imagePath || !(await fs.pathExists(author.imagePath))) {
        Logger.warn(`[AuthorController] Author "${author.name}" has invalid imagePath: ${author.imagePath}`)
        return res.sendStatus(404)
      }

      return res.sendFile(author.imagePath)
    }

    const options = {
      format: format || (reqSupportsWebp(req) ? 'webp' : 'jpeg'),
      height: clampPositiveInt(height ? parseInt(height) : null, 4096),
      width: clampPositiveInt(width ? parseInt(width) : null, 4096)
    }
    return CacheManager.handleAuthorCache(res, authorId, options as Parameters<typeof CacheManager.handleAuthorCache>[2]) // boundary: the JSDoc of CacheManager.js (JS) types width and height as number, but clampPositiveInt() can return null, which the method handles (TS2345)
  }

  /**
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   * @param {NextFunction} next
   */
  async middleware(req: RequestWithUser & Partial<RequestEntityObject>, res: Response, next: NextFunction) {
    const author = await Database.authorModel.findByPk(req.params.id)
    if (!author) return res.sendStatus(404)
    if (!req.user.checkCanAccessLibrary(author.libraryId)) return res.sendStatus(404)

    if (req.method == 'DELETE' && !req.user.canDelete) {
      Logger.warn(`[AuthorController] User "${req.user.username}" attempted to delete without permission`)
      return res.sendStatus(403)
    } else if ((req.method == 'PATCH' || req.method == 'POST') && !req.user.canUpdate) {
      Logger.warn(`[AuthorController] User "${req.user.username}" attempted to update without permission`)
      return res.sendStatus(403)
    }

    req.author = author
    next()
  }
}
export = new AuthorController()
