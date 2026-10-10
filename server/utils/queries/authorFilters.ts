const Sequelize = require('sequelize') as typeof import('sequelize')

interface AuthorCountRow {
  authorId: string
  author: { name: string }
  get(key: string): number
}

interface AuthorSearchRow {
  dataValues: { numBooks: number }
  toOldJSONExpanded(numBooks: number): Record<string, unknown>
}

interface TextQuery {
  matchExpression(column: string): string
}

const Database = require('../../Database') as {
  authorModel: {
    count(options: object): Promise<number>
    findAll(options: object): Promise<AuthorSearchRow[]>
  }
  bookAuthorModel: {
    findAll(options: object): Promise<AuthorCountRow[]>
  }
}

const authorFilters = {
  /**
   * Get authors total count
   *
   * @param {string} libraryId
   * @returns {Promise<number>} count
   */
  async getAuthorsTotalCount(libraryId: string) {
    const authorsCount = await Database.authorModel.count({
      where: {
        libraryId: libraryId
      }
    })
    return authorsCount
  },

  /**
   * Get authors with count of num books
   *
   * @param {string} libraryId
   * @param {number} limit
   * @returns {Promise<{id:string, name:string, count:number}>}
   */
  async getAuthorsWithCount(libraryId: string, limit: number) {
    const authors = await Database.bookAuthorModel.findAll({
      include: [
        {
          model: Database.authorModel,
          as: 'author', // Use the correct alias as defined in your associations
          attributes: ['name'],
          where: {
            libraryId: libraryId
          }
        }
      ],
      attributes: ['authorId', [Sequelize.fn('COUNT', Sequelize.col('authorId')), 'count']],
      group: ['authorId', 'author.id'], // Include 'author.id' to satisfy GROUP BY with JOIN
      order: [[Sequelize.literal('count'), 'DESC']],
      limit: limit
    })
    return authors.map((au) => {
      return {
        id: au.authorId,
        name: au.author.name,
        count: au.get('count') // Use get method to access aliased attributes
      }
    })
  },

  /**
   * Search authors
   *
   * @param {string} libraryId
   * @param {Database.TextQuery} query
   * @param {number} limit
   * @param {number} offset
   * @returns {Promise<Object[]>} oldAuthor with numBooks
   */
  async search(libraryId: string, query: TextQuery, limit: number, offset: number) {
    const matchAuthor = query.matchExpression('name')
    const authors = await Database.authorModel.findAll({
      where: {
        [Sequelize.Op.and]: [Sequelize.literal(matchAuthor), { libraryId }]
      },
      attributes: {
        include: [[Sequelize.literal('(SELECT count(*) FROM bookAuthors ba WHERE ba.authorId = author.id)'), 'numBooks']]
      },
      limit,
      offset
    })
    const authorMatches = []
    for (const author of authors) {
      const oldAuthor = author.toOldJSONExpanded(author.dataValues.numBooks)
      authorMatches.push(oldAuthor)
    }
    return authorMatches
  }
}

export = authorFilters
