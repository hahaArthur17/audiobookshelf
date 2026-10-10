const Sequelize = require('sequelize') as typeof import('sequelize')
const PlaybackSession = require('../../models/PlaybackSession')
const MediaProgress = require('../../models/MediaProgress')
const fsExtra = require('../../libs/fsExtra') as {
  pathExists(path: string): Promise<boolean>
}

interface ListeningSession {
  createdAt: Date
  displayTitle: string | null
  mediaItemType: string
  timeListening: number | null
  mediaMetadata?: {
    authors?: Array<{ name: string }> | null
    narrators?: string[] | null
    genres?: string[] | null
  } | null
  mediaItem?: {
    id: string
    title: string
    coverPath: string | null
    libraryItem: { id: string }
  } | null
}

interface FinishedBookProgress {
  duration: number | null
  finishedAt: Date | null
  mediaItem: {
    id: string
    title: string
    coverPath: string | null
    libraryItem: { id: string }
  }
}

interface UserStatsDatabase {
  playbackSessionModel: {
    findAll(options: object): Promise<ListeningSession[]>
  }
  mediaProgressModel: {
    findAll(options: object): Promise<FinishedBookProgress[]>
  }
  bookModel: object
  libraryItemModel: object
  sequelize: { random(): unknown }
}

interface UserStatsModule {
  getUserListeningSessionsForYear(userId: string, year: number): Promise<ListeningSession[]>
  getBookMediaProgressFinishedForYear(userId: string, year: number): Promise<FinishedBookProgress[]>
}

const Database = require('../../Database') as UserStatsDatabase

const userStats = {
  /**
   *
   * @param {string} userId
   * @param {number} year YYYY
   * @returns {Promise<PlaybackSession[]>}
   */
  async getUserListeningSessionsForYear(userId: string, year: number): Promise<ListeningSession[]> {
    const sessions = await Database.playbackSessionModel.findAll({
      where: {
        userId,
        createdAt: {
          [Sequelize.Op.gte]: `${year}-01-01`,
          [Sequelize.Op.lt]: `${year + 1}-01-01`
        }
      },
      include: {
        model: Database.bookModel,
        attributes: ['id', 'coverPath'],
        include: {
          model: Database.libraryItemModel,
          attributes: ['id', 'mediaId', 'mediaType']
        },
        required: false
      },
      order: Database.sequelize.random()
    })
    return sessions
  },

  /**
   *
   * @param {string} userId
   * @param {number} year YYYY
   * @returns {Promise<MediaProgress[]>}
   */
  async getBookMediaProgressFinishedForYear(userId: string, year: number): Promise<FinishedBookProgress[]> {
    const progresses = await Database.mediaProgressModel.findAll({
      where: {
        userId,
        mediaItemType: 'book',
        finishedAt: {
          [Sequelize.Op.gte]: `${year}-01-01`,
          [Sequelize.Op.lt]: `${year + 1}-01-01`
        }
      },
      include: {
        model: Database.bookModel,
        attributes: ['id', 'title', 'coverPath'],
        include: {
          model: Database.libraryItemModel,
          attributes: ['id', 'mediaId', 'mediaType']
        },
        required: true
      },
      order: Database.sequelize.random()
    })
    return progresses
  },

  /**
   * @param {string} userId
   * @param {number} year YYYY
   */
  async getStatsForYear(this: UserStatsModule, userId: string, year: number) {
    const listeningSessions = await this.getUserListeningSessionsForYear(userId, year)
    const bookProgressesFinished = await this.getBookMediaProgressFinishedForYear(userId, year)

    let totalBookListeningTime = 0
    let totalPodcastListeningTime = 0
    let totalListeningTime = 0

    const authorListeningMap: Record<string, number> = {}
    const genreListeningMap: Record<string, number> = {}
    const narratorListeningMap: Record<string, number> = {}
    const monthListeningMap: Record<string, number> = {}
    const bookListeningMap: Record<string, number> = {}

    const booksWithCovers: string[] = []
    const finishedBooksWithCovers: string[] = []

    // Get finished book stats
    const numBooksFinished = bookProgressesFinished.length
    let longestAudiobookFinished: { id: string; title: string; duration: number; finishedAt: Date | null } | null = null
    for (const mediaProgress of bookProgressesFinished) {
      // Grab first 5 that have a cover
      if (mediaProgress.mediaItem?.coverPath && !finishedBooksWithCovers.includes(mediaProgress.mediaItem.libraryItem.id) && finishedBooksWithCovers.length < 5 && (await fsExtra.pathExists(mediaProgress.mediaItem.coverPath))) {
        finishedBooksWithCovers.push(mediaProgress.mediaItem.libraryItem.id)
      }

      if (mediaProgress.duration && (!longestAudiobookFinished?.duration || mediaProgress.duration > longestAudiobookFinished.duration)) {
        longestAudiobookFinished = {
          id: mediaProgress.mediaItem.id,
          title: mediaProgress.mediaItem.title,
          duration: Math.round(mediaProgress.duration),
          finishedAt: mediaProgress.finishedAt
        }
      }
    }

    // Get listening session stats
    for (const ls of listeningSessions) {
      // Grab first 25 that have a cover
      if (ls.mediaItem?.coverPath && !booksWithCovers.includes(ls.mediaItem.libraryItem.id) && !finishedBooksWithCovers.includes(ls.mediaItem.libraryItem.id) && booksWithCovers.length < 25 && (await fsExtra.pathExists(ls.mediaItem.coverPath))) {
        booksWithCovers.push(ls.mediaItem.libraryItem.id)
      }

      const listeningSessionListeningTime = ls.timeListening || 0

      const lsMonth = ls.createdAt.getMonth()
      if (!monthListeningMap[lsMonth]) monthListeningMap[lsMonth] = 0
      monthListeningMap[lsMonth] += listeningSessionListeningTime

      totalListeningTime += listeningSessionListeningTime
      if (ls.mediaItemType === 'book') {
        totalBookListeningTime += listeningSessionListeningTime

        if (ls.displayTitle && !bookListeningMap[ls.displayTitle]) {
          bookListeningMap[ls.displayTitle] = listeningSessionListeningTime
        } else if (ls.displayTitle) {
          bookListeningMap[ls.displayTitle] += listeningSessionListeningTime
        }

        const authors = ls.mediaMetadata?.authors || []
        authors.forEach((au) => {
          if (!authorListeningMap[au.name]) authorListeningMap[au.name] = 0
          authorListeningMap[au.name] += listeningSessionListeningTime
        })

        const narrators = ls.mediaMetadata?.narrators || []
        narrators.forEach((narrator) => {
          if (!narratorListeningMap[narrator]) narratorListeningMap[narrator] = 0
          narratorListeningMap[narrator] += listeningSessionListeningTime
        })

        // Filter out bad genres like "audiobook" and "audio book"
        const genres = (ls.mediaMetadata?.genres || []).filter((g) => g && !g.toLowerCase().includes('audiobook') && !g.toLowerCase().includes('audio book'))
        genres.forEach((genre) => {
          if (!genreListeningMap[genre]) genreListeningMap[genre] = 0
          genreListeningMap[genre] += listeningSessionListeningTime
        })
      } else {
        totalPodcastListeningTime += listeningSessionListeningTime
      }
    }

    totalListeningTime = Math.round(totalListeningTime)
    totalBookListeningTime = Math.round(totalBookListeningTime)
    totalPodcastListeningTime = Math.round(totalPodcastListeningTime)

    const topAuthors = Object.keys(authorListeningMap)
      .map((authorName) => ({
        name: authorName,
        time: Math.round(authorListeningMap[authorName])
      }))
      .sort((a, b) => b.time - a.time)
      .slice(0, 3)

    let mostListenedNarrator: { time: number; name: string } | null = null
    for (const narrator in narratorListeningMap) {
      if (!mostListenedNarrator?.time || narratorListeningMap[narrator] > mostListenedNarrator.time) {
        mostListenedNarrator = {
          time: Math.round(narratorListeningMap[narrator]),
          name: narrator
        }
      }
    }

    const topGenres = Object.keys(genreListeningMap)
      .map((genre) => ({
        genre,
        time: Math.round(genreListeningMap[genre])
      }))
      .sort((a, b) => b.time - a.time)
      .slice(0, 3)

    let mostListenedMonth: { month: number; time: number } | null = null
    for (const month in monthListeningMap) {
      if (!mostListenedMonth?.time || monthListeningMap[month] > mostListenedMonth.time) {
        mostListenedMonth = {
          month: Number(month),
          time: Math.round(monthListeningMap[month])
        }
      }
    }

    return {
      totalListeningSessions: listeningSessions.length,
      totalListeningTime,
      totalBookListeningTime,
      totalPodcastListeningTime,
      topAuthors,
      topGenres,
      mostListenedNarrator,
      mostListenedMonth,
      numBooksFinished,
      numBooksListened: Object.keys(bookListeningMap).length,
      longestAudiobookFinished,
      booksWithCovers,
      finishedBooksWithCovers
    }
  }
}

export = userStats
