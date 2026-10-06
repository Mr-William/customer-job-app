import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { lookupSuggestions, resetAddressLookupCooldown } from "../src/lib/addressLookup.ts";

const PHOTON_URL_MATCH = "https://photon.komoot.io/api/";
const ZIPPOPOTAM_URL_MATCH = "https://api.zippopotam.us/us/";

const PHOTON_PAYLOAD = {
  features: [
    {
      properties: {
        housenumber: "1600",
        street: "Pennsylvania Avenue Northwest",
        city: "Washington",
        state: "District of Columbia",
        postcode: "20500",
      },
    },
  ],
};

const ZIPPOPOTAM_PAYLOAD = {
  "post code": "63101",
  places: [{ "place name": "Saint Louis", state: "Missouri", "state abbreviation": "MO" }],
};

let calls;

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

beforeEach(() => {
  resetAddressLookupCooldown();
  calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, signal: init.signal });
    if (url.startsWith("/api/address-suggestions")) {
      return jsonResponse({ suggestions: [{ label: "1 Server Way, Springfield, MO 65801" }], provider: "photon" });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
});

afterEach(() => {
  delete globalThis.fetch;
});

test("uses the app's own API route when it answers", async () => {
  const result = await lookupSuggestions("1 Server Way", new AbortController().signal);
  assert.deepEqual(result, {
    suggestions: [{ label: "1 Server Way, Springfield, MO 65801" }],
    provider: "photon",
  });
  assert.equal(calls.length, 1);
});

test("queries Photon from the browser when the server route reports a failure", async () => {
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, signal: init.signal });
    if (url.startsWith("/api/address-suggestions")) {
      return jsonResponse({ error: "Address suggestions are temporarily unavailable." }, 502);
    }
    if (url.startsWith(PHOTON_URL_MATCH)) {
      return jsonResponse(PHOTON_PAYLOAD);
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const result = await lookupSuggestions("1600 Pennsylvania", new AbortController().signal);
  assert.deepEqual(result.suggestions, [
    { label: "1600 Pennsylvania Avenue Northwest, Washington, District of Columbia 20500" },
  ]);
  assert.equal(result.provider, "photon");
  assert.equal(calls[1].url.startsWith(PHOTON_URL_MATCH), true);
  assert.match(calls[1].url, /countrycode=US/);
});

test("queries Photon from the browser when the server route cannot be reached", async () => {
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push({ url });
    if (url.startsWith("/api/address-suggestions")) {
      throw new TypeError("fetch failed");
    }
    return jsonResponse(PHOTON_PAYLOAD);
  };

  const result = await lookupSuggestions("1600 Pennsylvania", new AbortController().signal);
  assert.equal(result.provider, "photon");
  assert.equal(calls.length, 2);
});

test("stops retrying the server route for a while after it fails", async () => {
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, signal: init.signal });
    if (url.startsWith("/api/address-suggestions")) {
      return jsonResponse({ error: "unavailable" }, 502);
    }
    return jsonResponse(PHOTON_PAYLOAD);
  };

  await lookupSuggestions("1600 Penn", new AbortController().signal);
  await lookupSuggestions("1600 Penns", new AbortController().signal);

  assert.equal(calls.filter((call) => call.url.startsWith("/api/address-suggestions")).length, 1);
  assert.equal(calls.filter((call) => call.url.startsWith(PHOTON_URL_MATCH)).length, 2);
});

test("does not fall back for a rejected request (e.g. expired session)", async () => {
  globalThis.fetch = async (input) => {
    calls.push({ url: String(input) });
    return jsonResponse({ error: "Unauthorized" }, 401);
  };

  await assert.rejects(
    () => lookupSuggestions("1600 Penn", new AbortController().signal),
    /Address lookup failed \(401\)/
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.startsWith("/api/address-suggestions"), true);
});

test("uses the ZIP lookup for a bare ZIP when the server route is down", async () => {
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, signal: init.signal });
    if (url.startsWith("/api/address-suggestions")) {
      return jsonResponse({ error: "unavailable" }, 502);
    }
    if (url.startsWith(ZIPPOPOTAM_URL_MATCH)) {
      return jsonResponse(ZIPPOPOTAM_PAYLOAD);
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const result = await lookupSuggestions("63101", new AbortController().signal);
  assert.deepEqual(result, { suggestions: [{ label: "Saint Louis, MO 63101" }], provider: "zippopotam" });
});

test("surfaces an abort without marking the server route as broken", async () => {
  const controller = new AbortController();
  globalThis.fetch = async (input) => {
    calls.push({ url: String(input) });
    controller.abort();
    throw Object.assign(new Error("aborted"), { name: "AbortError" });
  };

  await assert.rejects(() => lookupSuggestions("1600 Penn", controller.signal), /aborted/);

  // Typing again must still try the server route first — an aborted keystroke
  // says nothing about whether the server can reach the providers.
  globalThis.fetch = async (input) => {
    calls.push({ url: String(input) });
    return jsonResponse({ suggestions: [{ label: "1 Server Way" }], provider: "photon" });
  };

  const result = await lookupSuggestions("1600 Penn", new AbortController().signal);
  assert.equal(calls.at(-1).url.startsWith("/api/address-suggestions"), true);
  assert.deepEqual(result.suggestions, [{ label: "1 Server Way" }]);
});

test("reuses the result when the same text is typed again", async () => {
  globalThis.fetch = async (input) => {
    calls.push({ url: String(input) });
    return jsonResponse({ suggestions: [{ label: "1 Server Way" }], provider: "photon" });
  };

  const first = await lookupSuggestions("1 Server Way", new AbortController().signal);
  const second = await lookupSuggestions("1 Server Way", new AbortController().signal);

  assert.deepEqual(first, second);
  assert.equal(calls.length, 1);
});

test("caches only responses that carry suggestions", async () => {
  globalThis.fetch = async (input) => {
    calls.push({ url: String(input) });
    return jsonResponse({ suggestions: [], provider: null });
  };

  const result = await lookupSuggestions("1 Nowhere Ln", new AbortController().signal);
  await lookupSuggestions("1 Nowhere Ln", new AbortController().signal);

  assert.deepEqual(result.suggestions, []);
  assert.equal(calls.length, 2);
});
