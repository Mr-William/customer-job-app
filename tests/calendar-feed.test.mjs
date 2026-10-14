import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCalendarIcs } from "../src/lib/ical.ts";

function job(overrides = {}) {
  return {
    id: 17,
    customerName: "Acme Co",
    employeeName: "Jordan",
    workCompleted: "Repair the front gate",
    additionalDetails: null,
    jobAddress: "12 Main St, St. Louis, MO",
    scheduledDate: "2026-10-14",
    scheduledTime: null,
    jobCompleted: false,
    jobPartiallyCompleted: false,
    additionalWorkRecommended: false,
    updatedAt: "2026-10-13T18:22:11.000Z",
    ...overrides,
  };
}

test("builds an RFC 5545 calendar with all-day and timed jobs", () => {
  const calendar = buildCalendarIcs([
    job({ id: 22, scheduledDate: "2026-10-14", scheduledTime: "23:30:00" }),
    job({ id: 17, scheduledDate: "2026-10-15" }),
  ]);

  assert.ok(calendar.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(calendar.endsWith("END:VCALENDAR\r\n"));
  assert.match(calendar, /UID:job-22@digitalrevolution-job-tracker/);
  assert.match(calendar, /DTSTART:20261014T233000\r\nDTEND:20261015T003000/);
  assert.match(calendar, /UID:job-17@digitalrevolution-job-tracker/);
  assert.match(calendar, /DTSTART;VALUE=DATE:20261015\r\nDTEND;VALUE=DATE:20261016/);
  assert.match(calendar, /DTSTAMP:20261013T182211Z/);
  assert.match(calendar, /LOCATION:12 Main St\\, St\. Louis\\, MO/);
});

test("escapes text values so customer data cannot inject calendar properties", () => {
  const calendar = buildCalendarIcs([
    job({
      customerName: "Acme; East, LLC\\Ops",
      workCompleted: "Fix the gate\r\nATTENDEE:attacker@example.com",
      additionalDetails: "Use care; test, then finish",
    }),
  ]);

  const unfolded = calendar.replace(/\r\n[ \t]/g, "");
  assert.match(unfolded, /SUMMARY:Acme\\; East\\, LLC\\\\Ops — Fix the gate\\nATTENDEE:attacker@example\.com/);
  assert.match(unfolded, /Notes: Use care\\; test\\, then finish/);
  assert.doesNotMatch(calendar, /\r\nATTENDEE:/);
});

test("folds long UTF-8 content lines at 75 octets", () => {
  const calendar = buildCalendarIcs([
    job({ customerName: "客户😀".repeat(30), workCompleted: "訪問 " + "門".repeat(50) }),
  ]);
  const physicalLines = calendar.split("\r\n").filter(Boolean);
  const encoder = new TextEncoder();

  assert.ok(physicalLines.some((line) => line.startsWith(" ")));
  for (const line of physicalLines) {
    assert.ok(encoder.encode(line).length <= 75, `line is ${encoder.encode(line).length} octets`);
  }
});

test("omits invalid dates and emits a valid empty calendar", () => {
  const calendar = buildCalendarIcs([
    job({ id: 1, scheduledDate: "2026-02-31" }),
    job({ id: 2, scheduledDate: null }),
  ]);

  assert.match(calendar, /BEGIN:VCALENDAR/);
  assert.match(calendar, /END:VCALENDAR/);
  assert.doesNotMatch(calendar, /BEGIN:VEVENT/);
});
