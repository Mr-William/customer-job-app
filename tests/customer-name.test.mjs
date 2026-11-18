import assert from "node:assert/strict";
import { test } from "node:test";
import { getDisplayName, matchesCustomerName } from "../src/lib/customerName.ts";

test("customer name suggestions match regardless of capitalization", () => {
  for (const query of ["john", "JOHN", "John", "jOhN", "  john  "]) {
    assert.equal(matchesCustomerName("John Smith", query), true, query);
  }
  for (const query of ["smith", "SMITH", "Smith", "mith", "MITH"]) {
    assert.equal(matchesCustomerName("John Smith", query), true, query);
  }
  assert.equal(matchesCustomerName("ACME Corp", "acme"), true);
  assert.equal(matchesCustomerName("acme corp", "ACME"), true);
});

test("customer name suggestions match substrings, not just prefixes", () => {
  assert.equal(matchesCustomerName("Robin Banks", "bin ba"), true);
  assert.equal(matchesCustomerName("Robin Banks", "BANKS"), true);
  assert.equal(matchesCustomerName("Studio_100%", "100%"), true);
});

test("customer name suggestions reject non-matches and empty queries", () => {
  assert.equal(matchesCustomerName("John Smith", "jane"), false);
  assert.equal(matchesCustomerName("John Smith", "smiths"), false);
  assert.equal(matchesCustomerName("John Smith", ""), false);
  assert.equal(matchesCustomerName("John Smith", "   "), false);
});

test("display name prefers the business name, then first + last", () => {
  assert.equal(getDisplayName({ name: "Acme Corp", firstName: "Jo", lastName: "Ray" }), "Acme Corp");
  assert.equal(getDisplayName({ name: null, firstName: "Jo", lastName: "Ray" }), "Jo Ray");
  assert.equal(getDisplayName({ name: "", firstName: "Jo", lastName: null }), "Jo");
  assert.equal(getDisplayName({}), "Unnamed");
});
