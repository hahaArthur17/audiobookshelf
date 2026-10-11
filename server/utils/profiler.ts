import perfHooks = require('perf_hooks')
const { performance, createHistogram } = perfHooks
import type { RecordableHistogram } from 'perf_hooks'
import util = require('util')
import Logger = require('../Logger')

// A histogram of perf_hooks that gets a values array added in profile()
type ProfileHistogram = RecordableHistogram & { values?: number[] }
// The arguments of a profiled function: the first one is the find options object of the query when isFindQuery is true, and profile() sets logging and benchmark on it
type ProfiledArgs = [findOptions: { logging?: (query: string, time?: number) => void; benchmark?: boolean }, ...rest: unknown[]]

const histograms = new Map<string, ProfileHistogram>()

function profile<R>(asyncFunc: (...args: ProfiledArgs) => Promise<R>, isFindQuery = true, funcName = asyncFunc.name) {
  if (!histograms.has(funcName)) {
    const histogram: ProfileHistogram = createHistogram()
    histogram.values = []
    histograms.set(funcName, histogram)
  }
  const histogram = histograms.get(funcName)! // non-null (lookup): the block above sets the entry when it is missing

  return async (...args: ProfiledArgs) => {
    if (isFindQuery) {
      const findOptions = args[0]
      Logger.info(`[${funcName}] findOptions:`, util.inspect(findOptions, { depth: null }))
      findOptions.logging = (query, time) => Logger.info(`[${funcName}] ${query} Elapsed time: ${time}ms`)
      findOptions.benchmark = true
    }
    const start = performance.now()
    try {
      const result = await asyncFunc(...args)
      return result
    } catch (error) {
      Logger.error(`[${funcName}] failed`)
      throw error
    } finally {
      const end = performance.now()
      const duration = Math.round(end - start)
      histogram.record(duration)
      histogram.values!.push(duration) // non-null (field): values is set when the histogram is created, before it is stored in the map
      Logger.info(`[${funcName}] duration: ${duration}ms`)
      Logger.info(`[${funcName}] histogram values:`, histogram.values)
      Logger.info(`[${funcName}] histogram:`, histogram)
    }
  }
}

export = { profile }
