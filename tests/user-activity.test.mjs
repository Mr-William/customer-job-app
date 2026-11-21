import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { users } from "../src/db/schema.ts";
import {
  ACTIVITY_UPDATE_INTERVAL_MS,
  clearUserActivityCache,
  listUserAccounts,
  recordUserActivity,
} from "../src/db/userActivity.ts";
import {
  formatLastLoginDate,
  formatLastLoginTitle,
} from "../src/lib/userActivity.ts";

const pg = new PGlite();
const db = drizzle(pg);

before(async () => {
  const ddl = await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson({ users })
  );
  await pg.exec(ddl.join("\n"));
});

beforeEach(async () => {
  clearUserActivityCache();
  await db.delete(users);
  await db.insert(users).values([
    {
      id: 1,
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@example.com",
      passwordHash: "secret-hash-1",
      role: "admin",
      approved: true,
      approvalToken: "tok-1",
      calendarFeedToken: "feed-1",
      createdAt: new Date("2026-11-01T10:00:00.000Z"),
      lastActiveAt: null,
    },
    {
      id: 2,
      firstName: "Bob",
      lastName: "Pending",
      email: "bob@example.com",
      passwordHash: "secret-hash-2",
      role: "user",
      approved: false,
      approvalToken: "tok-2",
      createdAt: new Date("2026-11-02T10:00:00.000Z"),
      lastActiveAt: null,
    },
  ]);
});

after(() => pg.close());

test("forced activity (login) updates lastActiveAt immediately and overrides debounce", async () => {
  const firstLogin = new Date("2026-11-20T09:00:00.000Z");
  const secondLogin = new Date("2026-11-20T09:00:10.000Z");

  assert.equal(
    await recordUserActivity(db, 1, { force: true, now: firstLogin }),
    true
  );
  assert.equal(
    await recordUserActivity(db, 1, { force: true, now: secondLogin }),
    true
  );

  const [row] = await db.select().from(users).where(eq(users.id, 1));
  assert.equal(row.lastActiveAt?.toISOString(), secondLogin.toISOString());
});

test("passive session activity sets lastActiveAt for approved users, debounces, and resumes after interval", async () => {
  const t0 = new Date("2026-11-20T12:00:00.000Z");
  const tWithin = new Date(t0.getTime() + ACTIVITY_UPDATE_INTERVAL_MS - 1000);
  const tAfter = new Date(t0.getTime() + ACTIVITY_UPDATE_INTERVAL_MS + 1000);

  assert.equal(await recordUserActivity(db, 1, { now: t0 }), true);
  assert.equal(await recordUserActivity(db, 1, { now: tWithin }), false);

  let [row] = await db.select().from(users).where(eq(users.id, 1));
  assert.equal(row.lastActiveAt?.toISOString(), t0.toISOString());

  // Once the interval passes, passive activity updates lastActiveAt.
  assert.equal(await recordUserActivity(db, 1, { now: tAfter }), true);
  [row] = await db.select().from(users).where(eq(users.id, 1));
  assert.equal(row.lastActiveAt?.toISOString(), tAfter.toISOString());

  // Simulate another server instance with an empty cache within the interval:
  // SQL guard still prevents redundant writes.
  const tAfterWithin = new Date(tAfter.getTime() + 5000);
  clearUserActivityCache();
  await recordUserActivity(db, 1, { now: tAfterWithin });
  [row] = await db.select().from(users).where(eq(users.id, 1));
  assert.equal(row.lastActiveAt?.toISOString(), tAfter.toISOString());
});

test("passive session activity does not update unapproved users", async () => {
  await recordUserActivity(db, 2, {
    now: new Date("2026-11-20T12:00:00.000Z"),
  });
  const [row] = await db.select().from(users).where(eq(users.id, 2));
  assert.equal(row.lastActiveAt, null);
});

test("listUserAccounts includes lastActiveAt and omits sensitive credentials", async () => {
  const activeTime = new Date("2026-11-21T14:30:00.000Z");
  await recordUserActivity(db, 1, { force: true, now: activeTime });

  const list = await listUserAccounts(db);
  assert.equal(list.length, 2);

  // Ordered by createdAt desc (Bob first, Alice second)
  const [bob, alice] = list;
  assert.equal(bob.email, "bob@example.com");
  assert.equal(bob.lastActiveAt, null);
  assert.equal(alice.email, "alice@example.com");
  assert.equal(alice.lastActiveAt?.toISOString(), activeTime.toISOString());

  for (const account of list) {
    assert.equal("passwordHash" in account, false);
    assert.equal("approvalToken" in account, false);
    assert.equal("calendarFeedToken" in account, false);
  }
});

test("formatLastLoginDate and formatLastLoginTitle handle missing, invalid, and valid dates", () => {
  assert.equal(formatLastLoginDate(null), "Never");
  assert.equal(formatLastLoginDate(undefined), "Never");
  assert.equal(formatLastLoginDate(""), "Never");
  assert.equal(formatLastLoginDate("not-a-date"), "Never");

  assert.equal(formatLastLoginTitle(null), undefined);
  assert.equal(formatLastLoginTitle("not-a-date"), undefined);

  const sample = "2026-11-21T15:45:00.000Z";
  assert.equal(formatLastLoginDate(sample), new Date(sample).toLocaleDateString());
  assert.equal(formatLastLoginTitle(sample), new Date(sample).toLocaleString());
});
