import assert from "node:assert/strict";
import { test } from "node:test";
import { getPhoneHref } from "../src/lib/phone.ts";

test("formats local and international numbers for tap-to-call", () => {
  assert.equal(getPhoneHref(" (314) 555-0100 "), "tel:3145550100");
  assert.equal(getPhoneHref(" +1 (314) 555-0100 "), "tel:+13145550100");
});

test("preserves extensions in a dialable tel URI", () => {
  assert.equal(getPhoneHref("555-0100 ext. 42"), "tel:5550100;ext=42");
  assert.equal(getPhoneHref("555-0100 x42"), "tel:5550100;ext=42");
});

test("does not create links for missing or non-numeric phone values", () => {
  assert.equal(getPhoneHref("   "), null);
  assert.equal(getPhoneHref("N/A"), null);
  assert.equal(getPhoneHref("javascript:alert(1)"), null);
});
