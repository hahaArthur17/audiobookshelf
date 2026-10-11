import iTunes = require('../providers/iTunes');
type iTunesPodcastSearchResult = import('../providers/iTunes').iTunesPodcastSearchResult;
interface PodcastSearchOptions {
    country?: string;
}
declare class PodcastFinder {
    iTunesApi: iTunes;
    constructor();
    /**
     *
     * @param {string} term
     * @param {{country:string}} options
     * @returns {Promise<import('../providers/iTunes').iTunesPodcastSearchResult[]>}
     */
    search(term: string, options?: PodcastSearchOptions): Promise<iTunesPodcastSearchResult[] | null>;
    /**
     * @param {string} term
     * @returns {Promise<string[]>}
     */
    findCovers(term: string): Promise<string[] | null>;
}
declare const _default: PodcastFinder;
export = _default;
