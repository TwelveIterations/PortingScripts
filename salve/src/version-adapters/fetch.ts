/**
 * Cache entry with timestamp and data
 */
interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

/**
 * In-memory cache with 1-minute expiration
 */
class FetchCache {
    private cache = new Map<string, CacheEntry<any>>();
    private readonly TTL_MS = 60 * 1000; // 1 minute

    private isExpired(entry: CacheEntry<any>): boolean {
        return Date.now() - entry.timestamp > this.TTL_MS;
    }

    private getKey(url: string | URL): string {
        return url.toString();
    }

    get<T>(url: string | URL): T | undefined {
        const key = this.getKey(url);
        const entry = this.cache.get(key);
        
        if (!entry || this.isExpired(entry)) {
            this.cache.delete(key);
            return undefined;
        }
        
        return entry.data;
    }

    set<T>(url: string | URL, data: T): void {
        const key = this.getKey(url);
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
        });
    }

    clear(): void {
        this.cache.clear();
    }

    size(): number {
        return this.cache.size;
    }
}

// Global cache instance
const fetchCache = new FetchCache();

/**
 * Clear the fetch cache. Useful for testing.
 */
export function clearFetchCache(): void {
    fetchCache.clear();
}

/**
 * Result of a fetch operation - either success with data or failure with undefined.
 */
export type FetchResult<T> = T | undefined;

/**
 * Options for fetchWithTimeout.
 */
export interface FetchOptions {
    /** Timeout in milliseconds (default: 30000) */
    timeout?: number;
}

/**
 * Fetch a URL with timeout and standardized error handling.
 * Returns the raw Response on success, or undefined on failure.
 *
 * @param url - URL to fetch
 * @param options - Fetch options including timeout
 * @returns The Response object on success, or undefined on failure
 */
export async function fetchWithTimeout(url: string | URL, options?: FetchOptions): Promise<Response | undefined> {
    const timeout = options?.timeout ?? 30000;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), timeout);
        const response = await fetch(url, {
            signal: controller.signal,
        });

        if (!response.ok) {
            const body = await response.text();
            clearTimeout(timeoutId);
            console.error(`Fetch error on ${url}: ${response.status} ${response.statusText}`, body);
            return undefined;
        }

        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        console.error(`Fetch error on ${url}:`, error);
        return undefined;
    }
}

/**
 * Fetch JSON from a URL with timeout and standardized error handling.
 *
 * @param url - URL to fetch
 * @param options - Fetch options including timeout
 * @returns The parsed JSON on success, or undefined on failure
 */
export async function fetchJson<T = unknown>(url: string | URL, options?: FetchOptions): Promise<FetchResult<T>> {
    // Check cache first
    const cached = fetchCache.get<T>(url);
    if (cached !== undefined) {
        return cached;
    }

    const response = await fetchWithTimeout(url, options);
    if (!response) {
        return undefined;
    }

    try {
        const data = (await response.json()) as T;
        // Cache the result
        fetchCache.set(url, data);
        return data;
    } catch (error) {
        console.error(`JSON parse error on ${url}:`, error);
        return undefined;
    }
}

/**
 * Fetch text from a URL with timeout and standardized error handling.
 *
 * @param url - URL to fetch
 * @param options - Fetch options including timeout
 * @returns The response text on success, or undefined on failure
 */
export async function fetchText(url: string | URL, options?: FetchOptions): Promise<FetchResult<string>> {
    // Check cache first
    const cached = fetchCache.get<string>(url);
    if (cached !== undefined) {
        return cached;
    }

    const response = await fetchWithTimeout(url, options);
    if (!response) {
        return undefined;
    }

    try {
        const data = await response.text();
        // Cache the result
        fetchCache.set(url, data);
        return data;
    } catch (error) {
        console.error(`Text read error on ${url}:`, error);
        return undefined;
    }
}
