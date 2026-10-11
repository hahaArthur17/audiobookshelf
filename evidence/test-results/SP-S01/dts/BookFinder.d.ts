import OpenLibrary = require('../providers/OpenLibrary');
import GoogleBooks = require('../providers/GoogleBooks');
import Audible = require('../providers/Audible');
import iTunes = require('../providers/iTunes');
import Audnexus = require('../providers/Audnexus');
import FantLab = require('../providers/FantLab');
import AudiobookCovers = require('../providers/AudiobookCovers');
import CustomProviderAdapter = require('../providers/CustomProviderAdapter');
/** Fields of a provider book result that BookFinder reads or writes; other provider fields pass through unmodelled */
interface BookSearchResult {
    title?: string;
    subtitle?: string | null;
    author?: string | null;
    description?: string | null;
    descriptionPlain?: string;
    cover?: string | null;
    covers?: string[];
    duration?: number;
    matchConfidence?: number;
}
/** OpenLibrary hit (OpenLibrary.cleanSearchDoc) plus the scoring fields filterSearchResults() attaches */
interface OpenLibraryBookResult extends BookSearchResult {
    title: string;
    author: string | null;
    errorCode?: 500;
    errorMsg?: string;
    cleanedTitle?: string;
    cleanedAuthor?: string;
    titleDistance?: number;
    authorDistance?: number;
    totalPossibleDistance?: number;
    totalDistance?: number;
    includesTitle?: string;
    includesAuthor?: string;
}
/** Returned instead of a result array when OpenLibrary's HTTP request fails (OpenLibrary.js:35, :114) */
interface ProviderErrorResult {
    errorCode: 404;
    length?: undefined;
}
/** Raw OpenLibrary ISBN JSON (external data, values unknown) or the 404 error object */
type OpenLibraryIsbnLookupResult = Record<string, unknown> | ProviderErrorResult;
interface BookSearchOptions {
    titleDistance?: number;
    authorDistance?: number;
    maxFuzzySearches?: number;
}
/** The part of a LibraryItem that search() reads; tests pass plain objects like {} and { media: {} } */
interface MatchLibraryItem {
    media?: {
        duration?: number | null;
    } | null;
}
type AuthorASINLookup = Pick<Audnexus, 'authorASINsRequest'>;
declare class BookFinder {
    #private;
    openLibrary: OpenLibrary;
    googleBooks: GoogleBooks;
    audible: Audible;
    iTunesApi: iTunes;
    audnexus: Audnexus;
    fantLab: FantLab;
    audiobookCovers: AudiobookCovers;
    customProviderAdapter: CustomProviderAdapter;
    providers: string[];
    verbose: boolean;
    constructor();
    findByISBN(isbn: string): Promise<OpenLibraryIsbnLookupResult>;
    filterSearchResults(books: OpenLibraryBookResult[], title: string, author: string | null | undefined, maxTitleDistance: number, maxAuthorDistance: number): OpenLibraryBookResult[];
    /**
     *
     * @param {string} title
     * @param {string} author
     * @param {number} maxTitleDistance
     * @param {number} maxAuthorDistance
     * @returns {Promise<Object[]>}
     */
    getOpenLibResults(title: string, author: string | null | undefined, maxTitleDistance: number, maxAuthorDistance: number): Promise<OpenLibraryBookResult[]>;
    /**
     *
     * @param {string} title
     * @param {string} author
     * @returns {Promise<Object[]>}
     */
    getGoogleBooksResults(title: string, author: string | null | undefined): Promise<BookSearchResult[]>;
    /**
     *
     * @param {string} title
     * @param {string} author
     * @returns {Promise<Object[]>}
     */
    getFantLabResults(title: string, author: string | null | undefined): Promise<BookSearchResult[]>;
    /**
     *
     * @param {string} search
     * @returns {Promise<Object[]>}
     */
    getAudiobookCoversResults(search: string): Promise<BookSearchResult[]>;
    /**
     *
     * @param {string} title
     * @returns {Promise<Object[]>}
     */
    getiTunesAudiobooksResults(title: string): Promise<BookSearchResult[]>;
    /**
     *
     * @param {string} title
     * @param {string} author
     * @param {string} asin
     * @param {string} provider
     * @returns {Promise<Object[]>}
     */
    getAudibleResults(title: string, author: string | null | undefined, asin: string | null | undefined, provider: string): Promise<BookSearchResult[]>;
    /**
     *
     * @param {string} title
     * @param {string} author
     * @param {string} isbn
     * @param {string} providerSlug
     * @returns {Promise<Object[]>}
     */
    getCustomProviderResults(title: string, author: string | null | undefined, isbn: string | BookSearchOptions | null | undefined, providerSlug: string): Promise<BookSearchResult[]>;
    static TitleCandidates: {
        new (cleanAuthor: string): {
            candidates: Set<string>;
            cleanAuthor: string;
            priorities: Record<string, number>;
            positions: Record<string, number>;
            currentPosition: number;
            add(title: string): void;
            get size(): number;
            getCandidates(): string[];
            delete(title: string): boolean;
            "__#private@#removeAuthorFromTitle"(title: string): string;
        };
    };
    static AuthorCandidates: {
        new (cleanAuthor: string | null, audnexus: AuthorASINLookup): {
            audnexus: AuthorASINLookup;
            candidates: Set<string>;
            cleanAuthor: string | null;
            validateAuthor(name: string, region?: string, maxLevenshtein?: number): Promise<string>;
            add(author: string): void;
            get size(): number;
            get agressivelyCleanAuthor(): string;
            getCandidates(): Promise<string[]>;
            delete(author: string): boolean;
        };
    };
    /**
     * Search for books including fuzzy searches
     *
     * @param {import('../models/LibraryItem')} libraryItem
     * @param {string} provider
     * @param {string} title
     * @param {string} author
     * @param {string} isbn
     * @param {string} asin
     * @param {{titleDistance:number, authorDistance:number, maxFuzzySearches:number}} options
     * @returns {Promise<Object[]>}
     */
    search(libraryItem: MatchLibraryItem | null, provider: string, title: string, author?: string | null, isbn?: string | BookSearchOptions | null, asin?: string | null, options?: BookSearchOptions): Promise<BookSearchResult[]>;
    /**
     * Calculate match confidence score for a book
     * @param {Object} book - The book object to calculate confidence for
     * @param {number|null} libraryItemDurationMinutes - Duration of library item in minutes
     * @param {string} actualTitleQuery - Actual title query
     * @param {string} actualAuthorQuery - Actual author query
     * @param {boolean} isTitleAsin - Whether the title is an ASIN
     * @returns {number|null} - Match confidence score or null if not applicable
     */
    calculateMatchConfidence(book: BookSearchResult, libraryItemDurationMinutes: number | null, actualTitleQuery: string, actualAuthorQuery: string | null | undefined, isTitleAsin: boolean): number;
    /**
     * Search for books
     *
     * @param {string} title
     * @param {string} author
     * @param {string} provider
     * @param {string} asin only used for audible providers
     * @param {number} maxTitleDistance only used for openlibrary provider
     * @param {number} maxAuthorDistance only used for openlibrary provider
     * @returns {Promise<Object[]>}
     */
    runSearch(title: string, author: string | null | undefined, provider: string, asin: string | null | undefined, maxTitleDistance: number, maxAuthorDistance: number): Promise<BookSearchResult[]>;
    findCovers(provider: string, title: string, author: string | null | undefined, options?: BookSearchOptions): Promise<string[]>;
    findChapters(asin: string, region: string): Promise<unknown>;
}
declare const _default: BookFinder;
export = _default;
