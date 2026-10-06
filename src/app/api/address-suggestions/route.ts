import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  MAX_QUERY_LENGTH,
  MAX_SUGGESTIONS,
  MIN_QUERY_LENGTH,
  censusLabels,
  dedupeLabels,
  isBareZipCode,
  normalizeQuery,
  photonLabels,
  zippopotamLabels,
  type AddressSuggestion,
  type SuggestionProvider,
} from "@/lib/geocoding";

// ─── Tunables ────────────────────────────────────────────────────────────────

const PROVIDER_TIMEOUT_MS = 2500;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 250;
// After a hard failure (no connection, 429, 5xx) stop calling a provider for a
// while so a throttled or unreachable upstream can't slow down every keystroke.
const BREAKER_COOLDOWN_MS = 60 * 1000;

// Self-hosted Photon instances work too (see DEPLOY.md); the public demo server
// is fine for a single small business but has no availability guarantee.
const PHOTON_URL = (process.env.ADDRESS_GEOCODER_URL || "https://photon.komoot.io/api/").replace(
  /\/?$/,
  "/"
);

interface Provider {
  id: SuggestionProvider;
  /** Only call when the query can possibly match (e.g. ZIP lookups need a ZIP). */
  supports: (query: string) => boolean;
  buildUrl: (query: string) => string;
  parse: (payload: unknown) => string[];
}

const PROVIDERS: Provider[] = [
  {
    id: "photon",
    supports: () => true,
    buildUrl: (query) => {
      const url = new URL(PHOTON_URL);
      url.searchParams.set("q", query);
      url.searchParams.set("limit", String(MAX_SUGGESTIONS));
      url.searchParams.set("lang", "en");
      // The app's address fields are US-only.
      url.searchParams.set("countrycode", "US");
      return url.toString();
    },
    parse: (payload) => photonLabels(payload),
  },
  {
    // Free keyless ZIP → city/state lookup, used when the query is just a ZIP.
    id: "zippopotam",
    supports: (query) => isBareZipCode(query),
    buildUrl: (query) => `https://api.zippopotam.us/us/${query.slice(0, 5)}`,
    parse: (payload) => zippopotamLabels(payload),
  },
  {
    // Free keyless US government geocoder. Great for complete addresses but
    // returns nothing while an address is still half-typed, so it is the last
    // resort — it mostly helps when the autocomplete providers are throttled.
    // Only numbered addresses can match.
    id: "census",
    supports: (query) => /\d/.test(query),
    buildUrl: (query) => {
      const url = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
      url.searchParams.set("address", query);
      url.searchParams.set("benchmark", "Public_AR_Current");
      url.searchParams.set("format", "json");
      return url.toString();
    },
    parse: (payload) => censusLabels(payload),
  },
];

// ─── In-memory caches (single Node process per deployment) ───────────────────

interface CacheEntry {
  suggestions: AddressSuggestion[];
  provider: SuggestionProvider | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const breakerUntil = new Map<SuggestionProvider, number>();

function readCache(key: string): CacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  // Refresh LRU position.
  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

function writeCache(key: string, suggestions: AddressSuggestion[], provider: SuggestionProvider | null) {
  cache.set(key, { suggestions, provider, expiresAt: Date.now() + CACHE_TTL_MS });
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

// ─── Upstream lookup ─────────────────────────────────────────────────────────

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause as NodeJS.ErrnoException | undefined;
  if (cause && typeof cause === "object") {
    return cause.code || cause.message || error.message;
  }
  return error.message;
}

async function fetchLabels(provider: Provider, query: string): Promise<string[]> {
  const response = await fetch(provider.buildUrl(query), {
    headers: {
      Accept: "application/json",
      "User-Agent": "CustomerJobApp/1.0 address autocomplete",
    },
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return provider.parse(await response.json());
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = normalizeQuery(request.nextUrl.searchParams.get("q") || "");
  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ suggestions: [], provider: null });
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: "Search query is too long." }, { status: 400 });
  }

  const cacheKey = query.toLowerCase();
  const cached = readCache(cacheKey);
  if (cached) {
    return NextResponse.json(
      { suggestions: cached.suggestions, provider: cached.provider, cached: true },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const failures: string[] = [];

  for (const provider of PROVIDERS) {
    if (!provider.supports(query)) continue;

    const retryAt = breakerUntil.get(provider.id) ?? 0;
    if (retryAt > Date.now()) {
      failures.push(`${provider.id}: skipped (backing off after earlier failure)`);
      continue;
    }

    try {
      const labels = await fetchLabels(provider, query);
      const suggestions = dedupeLabels(labels).map((label) => ({ label }));
      if (suggestions.length === 0) {
        failures.push(`${provider.id}: no matches`);
        continue;
      }

      breakerUntil.delete(provider.id);
      writeCache(cacheKey, suggestions, provider.id);
      return NextResponse.json(
        { suggestions, provider: provider.id },
        { headers: { "Cache-Control": "private, no-store" } }
      );
    } catch (error) {
      const reason = describeError(error);
      failures.push(`${provider.id}: ${reason}`);
      // Only log when a provider goes from "working" to "backing off" so a dead
      // upstream doesn't flood the logs on every keystroke.
      if ((breakerUntil.get(provider.id) ?? 0) <= Date.now()) {
        console.error(`[address-suggestions] ${provider.id} unavailable (${reason}); pausing it for ${BREAKER_COOLDOWN_MS / 1000}s`);
      }
      breakerUntil.set(provider.id, Date.now() + BREAKER_COOLDOWN_MS);
    }
  }

  // Nothing answered with matches. Distinguish "no matches" from "could not ask".
  const unable = failures.every((failure) => !failure.endsWith("no matches"));
  if (unable) {
    console.error(`[address-suggestions] no provider could answer "${query}" — ${failures.join(" | ")}`);
    return NextResponse.json(
      { error: "Address suggestions are temporarily unavailable.", reason: failures.join(" | ") },
      { status: 502 }
    );
  }

  const empty: AddressSuggestion[] = [];
  writeCache(cacheKey, empty, null);
  return NextResponse.json(
    { suggestions: empty, provider: null },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
