// Address suggestion lookup.
//
// Two routes to the geocoders, in order:
//  1. this app's own /api/address-suggestions route (keeps the providers and
//     their rate limits behind one cacheable server-side endpoint), and
//  2. the same public geocoders straight from the browser, which is what saves
//     the feature when the app server has no outbound internet access or the
//     upstream throttles the server's IP.
import {
  MAX_SUGGESTIONS,
  isBareZipCode,
  photonLabels,
  zippopotamLabels,
  type AddressSuggestion,
  type SuggestionProvider,
} from "./geocoding.ts";

export interface LookupResult {
  suggestions: AddressSuggestion[];
  provider: SuggestionProvider | null;
}

const BROWSER_PHOTON_URL = "https://photon.komoot.io/api/";
// How long to skip the server route after it failed to reach any provider.
const SERVER_RETRY_AFTER_MS = 5 * 60 * 1000;
// Results are cached so that retyping the same text (backspace, then on again)
// doesn't re-hit the API — the deployment rate-limits requests per IP.
const CLIENT_CACHE_TTL_MS = 5 * 60 * 1000;
const CLIENT_CACHE_MAX_ENTRIES = 60;

let serverLookupDisabledUntil = 0;
const clientCache = new Map<string, { result: LookupResult; expiresAt: number }>();

/** Test seam: drop the learned state (cool-down and cached results). */
export function resetAddressLookupCooldown() {
  serverLookupDisabledUntil = 0;
  clientCache.clear();
}

function readClientCache(key: string): LookupResult | null {
  const entry = clientCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    clientCache.delete(key);
    return null;
  }
  return entry.result;
}

function writeClientCache(key: string, result: LookupResult) {
  clientCache.delete(key);
  clientCache.set(key, { result, expiresAt: Date.now() + CLIENT_CACHE_TTL_MS });
  while (clientCache.size > CLIENT_CACHE_MAX_ENTRIES) {
    const oldest = clientCache.keys().next();
    if (oldest.done) break;
    clientCache.delete(oldest.value);
  }
}

/** The request itself was rejected (expired session, bad query). Another host
 *  won't help, so the error is surfaced instead of retried. */
class LookupRejectedError extends Error {}

function toSuggestions(labels: string[]): AddressSuggestion[] {
  return labels.map((label) => ({ label }));
}

export async function lookupFromBrowser(query: string, signal: AbortSignal): Promise<LookupResult> {
  if (isBareZipCode(query)) {
    try {
      const response = await fetch(`https://api.zippopotam.us/us/${query.slice(0, 5)}`, {
        signal,
        headers: { Accept: "application/json" },
      });
      if (response.ok) {
        const suggestions = toSuggestions(zippopotamLabels(await response.json()));
        if (suggestions.length > 0) {
          return { suggestions, provider: "zippopotam" };
        }
      }
    } catch (error) {
      if (signal.aborted) throw error;
      // Fall through to Photon, which also understands ZIP codes.
    }
  }

  const url = new URL(BROWSER_PHOTON_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(MAX_SUGGESTIONS));
  url.searchParams.set("lang", "en");
  url.searchParams.set("countrycode", "US");

  const response = await fetch(url.toString(), {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Address lookup failed (${response.status})`);
  }
  return { suggestions: toSuggestions(photonLabels(await response.json())), provider: "photon" };
}

async function resolveSuggestions(query: string, signal: AbortSignal): Promise<LookupResult> {
  if (Date.now() < serverLookupDisabledUntil) {
    return lookupFromBrowser(query, signal);
  }

  try {
    const response = await fetch(`/api/address-suggestions?q=${encodeURIComponent(query)}`, {
      signal,
    });

    if (response.ok) {
      const data = (await response.json()) as {
        suggestions?: AddressSuggestion[];
        provider?: SuggestionProvider | null;
      };
      return {
        suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
        provider: data.provider ?? null,
      };
    }

    // 4xx: rejected request — see LookupRejectedError.
    if (response.status < 500) {
      throw new LookupRejectedError(`Address lookup failed (${response.status})`);
    }
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof LookupRejectedError) throw error;
  }

  serverLookupDisabledUntil = Date.now() + SERVER_RETRY_AFTER_MS;
  return lookupFromBrowser(query, signal);
}

/** Suggestions for a query, using the app's API route with a browser fallback. */
export async function lookupSuggestions(query: string, signal: AbortSignal): Promise<LookupResult> {
  const cacheKey = query.toLowerCase();
  const cached = readClientCache(cacheKey);
  if (cached) return cached;

  const result = await resolveSuggestions(query, signal);
  if (result.suggestions.length > 0) {
    writeClientCache(cacheKey, result);
  }
  return result;
}
