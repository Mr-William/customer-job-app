import assert from "node:assert/strict";
import { test } from "node:test";
import { fmtTime, fmtTimeRange, hoursBetween } from "../src/lib/time.ts";

test("formats a single clock time as 12-hour time", () => {
  assert.equal(fmtTime("09:00"), "9:00 AM");
  assert.equal(fmtTime("00:30"), "12:30 AM");
  assert.equal(fmtTime("12:00"), "12:00 PM");
  assert.equal(fmtTime("13:45"), "1:45 PM");
  assert.equal(fmtTime("23:05:00"), "11:05 PM");
  assert.equal(fmtTime(""), "");
  assert.equal(fmtTime(null), "");
});

test("formats a start/end range", () => {
  assert.equal(fmtTimeRange("09:00", "11:30"), "9:00 AM – 11:30 AM");
  // Falls back to whichever side is present.
  assert.equal(fmtTimeRange("09:00", null), "9:00 AM");
  assert.equal(fmtTimeRange("", "11:30"), "11:30 AM");
  assert.equal(fmtTimeRange(null, null), "");
});

test("computes decimal hours between start and end times", () => {
  assert.equal(hoursBetween("08:00", "10:30"), 2.5);
  assert.equal(hoursBetween("09:15", "09:45"), 0.5);
  assert.equal(hoursBetween("13:00", "14:00"), 1);
  assert.equal(hoursBetween("23:00", "23:59"), 0.98);
});

test("rejects invalid or backwards ranges", () => {
  assert.equal(hoursBetween("10:00", "10:00"), null);
  assert.equal(hoursBetween("11:00", "09:00"), null);
  assert.equal(hoursBetween("", "09:00"), null);
  assert.equal(hoursBetween("24:00", "25:00"), null);
  assert.equal(hoursBetween("09:60", "11:00"), null);
});
