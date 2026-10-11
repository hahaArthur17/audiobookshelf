import Audnexus = require('../providers/Audnexus');
type AuthorSearchObj = import('../providers/Audnexus').AuthorSearchObj;
interface AuthorSearchOptions {
    maxLevenshtein?: number;
}
interface SavedAuthorImage {
    path: string;
}
interface AuthorImageError {
    error: string;
}
declare class AuthorFinder {
    audnexus: Audnexus;
    constructor();
    findAuthorByASIN(asin: string | null | undefined, region: string): Promise<AuthorSearchObj | null> | null;
    /**
     *
     * @param {string} name
     * @param {string} region
     * @param {Object} [options={}]
     * @returns {Promise<import('../providers/Audnexus').AuthorSearchObj>}
     */
    findAuthorByName(name: string | null | undefined, region?: string, options?: AuthorSearchOptions): Promise<AuthorSearchObj | null>;
    /**
     * Download author image from url and save in authors folder
     *
     * @param {string} authorId
     * @param {string} url
     * @returns {Promise<{path:string, error:string}>}
     */
    saveAuthorImage(authorId: string, url: string): Promise<SavedAuthorImage | AuthorImageError>;
}
declare const _default: AuthorFinder;
export = _default;
