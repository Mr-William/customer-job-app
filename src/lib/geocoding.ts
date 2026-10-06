// Address suggestion parsing and formatting.
//
// Pure helpers shared by the /api/address-suggestions route and the
// AddressAutocomplete component (which can query Photon directly from the
// browser when the app server has no outbound internet access).

export const MIN_QUERY_LENGTH = 3;
export const MAX_QUERY_LENGTH = 200;
export const MAX_SUGGESTIONS = 6;

export type SuggestionProvider = "photon" | "census" | "zippopotam";

export interface AddressSuggestion {
  label: string;
}

export interface SuggestionResult {
  suggestions: AddressSuggestion[];
  provider: SuggestionProvider | null;
}

const ZIP_PATTERN = /^\d{5}(?:-\d{4})?$/;
const ZIP_IN_TEXT_PATTERN = /^\d{5}(?:-\d{4})?$/;

function field(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function firstField(properties: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = field(properties[key]);
    if (value) return value;
  }
  return "";
}

export function normalizeQuery(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** True when the whole query is a US ZIP code, e.g. "63101" or "63101-1234". */
export function isBareZipCode(query: string): boolean {
  return ZIP_PATTERN.test(normalizeQuery(query));
}

export function dedupeLabels(labels: string[], limit: number = MAX_SUGGESTIONS): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of labels) {
    const label = raw.replace(/\s+/g, " ").replace(/^[,\s]+|[,\s]+$/g, "").trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(label);
    if (result.length >= limit) break;
  }
  return result;
}

/**
 * Builds a single-line address from a Photon feature's `properties`.
 * Handles house, street, city and postcode features (the last one carries the
 * ZIP in `name` and has no `street`).
 */
export function formatPhotonAddress(properties: Record<string, unknown>): string {
  const houseNumber = field(properties.housenumber);
  const name = field(properties.name);
  const street = field(properties.street);
  const osmValue = field(properties.osm_value).toLowerCase();
  const postcodeField = field(properties.postcode);

  const isPostcodeFeature =
    osmValue === "postcode" ||
    (!street && !houseNumber && !postcodeField && ZIP_IN_TEXT_PATTERN.test(name));

  const postcode = postcodeField || (isPostcodeFeature ? name : "");
  const streetName = isPostcodeFeature ? "" : street || name;
  const streetLine = [houseNumber, streetName].filter(Boolean).join(" ");

  const locality = firstField(properties, [
    "city",
    "town",
    "village",
    "municipality",
    "locality",
    "suburb",
    "district",
    "county",
  ]);
  const state = field(properties.state);

  // Avoid repeating the street/POI name in the locality part (Photon sets
  // `city` on postcode and city features too).
  const used = new Set(streetLine.toLowerCase().split(/[,\s]+/).filter(Boolean));
  const placeParts: string[] = [];
  for (const part of [locality, state]) {
    if (!part) continue;
    if (used.has(part.toLowerCase())) continue;
    placeParts.push(part);
  }

  const placeLine = [placeParts.join(", "), postcode].filter(Boolean).join(" ");

  return [streetLine, placeLine].filter(Boolean).join(", ");
}

/** Photon /api response → formatted suggestion labels. */
export function photonLabels(payload: unknown, limit: number = MAX_SUGGESTIONS): string[] {
  const features = (payload as { features?: unknown })?.features;
  if (!Array.isArray(features)) return [];
  const labels = features.map((feature) => {
    const properties = (feature as { properties?: unknown })?.properties;
    return properties && typeof properties === "object"
      ? formatPhotonAddress(properties as Record<string, unknown>)
      : "";
  });
  return dedupeLabels(labels, limit);
}

const DIRECTIONALS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);

/**
 * Census matches come back shouting ("1600 PENNSYLVANIA AVE NW, WASHINGTON, DC,
 * 20500"); make them look like the other suggestions.
 */
export function titleCaseAddress(value: string): string {
  const parts = normalizeQuery(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) =>
      part
        .split(" ")
        .map((word) => {
          if (/\d/.test(word)) return word;
          const upper = word.toUpperCase();
          if (DIRECTIONALS.has(upper)) return upper;
          // Keep two-letter state codes ("DC", "MO") uppercase.
          if (/^[A-Z]{2}$/.test(upper)) return upper;
          return upper.charAt(0) + upper.slice(1).toLowerCase();
        })
        .join(" ")
    );

  // Attach a trailing ZIP to the state part: "Washington, DC, 20500" → "…DC 20500".
  if (parts.length >= 2 && ZIP_PATTERN.test(parts[parts.length - 1])) {
    const zip = parts.pop() as string;
    parts[parts.length - 1] = `${parts[parts.length - 1]} ${zip}`;
  }

  return parts.join(", ");
}

/** US Census Geocoder /locations/onelineaddress response → suggestion labels. */
export function censusLabels(payload: unknown, limit: number = MAX_SUGGESTIONS): string[] {
  const matches = (payload as { result?: { addressMatches?: unknown } })?.result?.addressMatches;
  if (!Array.isArray(matches)) return [];
  const labels = matches.map((match) => {
    const matchedAddress = (match as { matchedAddress?: unknown })?.matchedAddress;
    return typeof matchedAddress === "string" ? titleCaseAddress(matchedAddress) : "";
  });
  return dedupeLabels(labels, limit);
}

/** Zippopotam.us /us/{zip} response → suggestion labels. */
export function zippopotamLabels(payload: unknown, limit: number = MAX_SUGGESTIONS): string[] {
  const data = payload as { postCode?: unknown; "post code"?: unknown; places?: unknown };
  const postcode = field(data?.postCode) || field(data?.["post code"]);
  if (!Array.isArray(data?.places)) return [];
  const labels = data.places.map((place) => {
    const placeName = field((place as Record<string, unknown>)?.["place name"]);
    const state = field((place as Record<string, unknown>)?.["state abbreviation"]) ||
      field((place as Record<string, unknown>)?.state);
    const placeLine = [placeName, state].filter(Boolean).join(", ");
    return [placeLine, postcode].filter(Boolean).join(" ");
  });
  return dedupeLabels(labels, limit);
}
