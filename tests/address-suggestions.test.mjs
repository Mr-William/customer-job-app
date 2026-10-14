import assert from "node:assert/strict";
import { test } from "node:test";
import {
  censusLabels,
  dedupeLabels,
  formatPhotonAddress,
  isBareZipCode,
  normalizeQuery,
  photonLabels,
  zippopotamLabels,
} from "../src/lib/geocoding.ts";

// Responses below were captured from the live providers.

const PHOTON_STREET_RESPONSE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        osm_type: "R",
        osm_key: "office",
        osm_value: "government",
        type: "house",
        housenumber: "1600",
        name: "White House",
        street: "Pennsylvania Avenue Northwest",
        district: "Ward 2",
        city: "Washington",
        state: "District of Columbia",
        postcode: "20500",
        countrycode: "US",
      },
    },
    {
      type: "Feature",
      properties: {
        osm_key: "building",
        osm_value: "apartments",
        type: "house",
        housenumber: "1600",
        name: "1600 Pennsylvania Ave SE Apartments",
        street: "Pennsylvania Avenue Southeast",
        locality: "Barney Circle",
        district: "Ward 6",
        city: "Washington",
        state: "District of Columbia",
        postcode: "20003",
        countrycode: "US",
      },
    },
  ],
};

const PHOTON_POSTCODE_RESPONSE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        osm_key: "place",
        osm_value: "postcode",
        type: "other",
        name: "63101",
        city: "Saint Louis",
        state: "Missouri",
        countrycode: "US",
      },
    },
  ],
};

const CENSUS_RESPONSE = {
  result: {
    addressMatches: [
      {
        matchedAddress: "1600 PENNSYLVANIA AVE NW, WASHINGTON, DC, 20500",
        addressComponents: { city: "WASHINGTON", state: "DC", zip: "20500" },
      },
    ],
  },
};

const ZIPPOPOTAM_RESPONSE = {
  country: "United States",
  "country abbreviation": "US",
  "post code": "63101",
  places: [
    {
      "place name": "Saint Louis",
      longitude: "-90.1913",
      latitude: "38.6346",
      state: "Missouri",
      "state abbreviation": "MO",
    },
  ],
};

test("formats Photon house results as a single-line US address", () => {
  assert.deepEqual(photonLabels(PHOTON_STREET_RESPONSE), [
    "1600 Pennsylvania Avenue Northwest, Washington, District of Columbia 20500",
    "1600 Pennsylvania Avenue Southeast, Washington, District of Columbia 20003",
  ]);
});

test("uses the postcode carried in `name` for Photon postcode features", () => {
  assert.equal(formatPhotonAddress(PHOTON_POSTCODE_RESPONSE.features[0].properties), "Saint Louis, Missouri 63101");
});

test("does not repeat a city name that is also the feature name", () => {
  assert.equal(
    formatPhotonAddress({ name: "Springfield", city: "Springfield", state: "Missouri", county: "Greene" }),
    "Springfield, Missouri"
  );
});

test("formats Census matches without shouting", () => {
  assert.deepEqual(censusLabels(CENSUS_RESPONSE), ["1600 Pennsylvania Ave NW, Washington, DC 20500"]);
});

test("formats ZIP lookups from Zippopotam.us", () => {
  assert.deepEqual(zippopotamLabels(ZIPPOPOTAM_RESPONSE), ["Saint Louis, MO 63101"]);
});

test("recognises bare ZIP codes", () => {
  assert.equal(isBareZipCode("63101"), true);
  assert.equal(isBareZipCode(" 63101-1234 "), true);
  assert.equal(isBareZipCode("63101 Main St"), false);
  assert.equal(isBareZipCode("6310"), false);
});

test("normalizes whitespace in queries and labels", () => {
  assert.equal(normalizeQuery("  123   Main St  "), "123 Main St");
  assert.deepEqual(dedupeLabels(["123 Main St", "123  main st", "  ", "456 Oak Ave"]), [
    "123 Main St",
    "456 Oak Ave",
  ]);
  assert.equal(dedupeLabels(["a", "b", "c"], 2).length, 2);
});

test("ignores malformed or empty provider payloads", () => {
  for (const payload of [null, undefined, {}, { features: "nope" }, { result: {} }, { places: [] }]) {
    assert.deepEqual(photonLabels(payload), []);
    assert.deepEqual(censusLabels(payload), []);
  }
  assert.deepEqual(zippopotamLabels({ places: "nope" }), []);
});
