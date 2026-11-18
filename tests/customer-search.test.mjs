import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { drizzle } from "drizzle-orm/pglite";
import { customers, jobs } from "../src/db/schema.ts";
import { searchCustomers } from "../src/db/searchCustomers.ts";

// Execute the same PostgreSQL queries against the app's schema without a live database.
const pg = new PGlite();
const db = drizzle(pg);
const search = (options) => searchCustomers(db, options);
const ids = (rows) => rows.map(({ id }) => id).sort((a, b) => a - b);

before(async () => {
  const ddl = await generateMigration(generateDrizzleJson({}), generateDrizzleJson({ customers, jobs }));
  await pg.exec(ddl.join("\n"));
  await db.insert(customers).values([
    { id: 1, firstName: "Robin", lastName: "Banks", phone: "312-555-0100", jobAddress: "1 Birch Lane" },
    { id: 2, name: "Robin Banks", email: "office@example.test", jobAddress: "2 Birch Lane" },
    { id: 3, name: "Studio_100%", firstName: "Casey", lastName: "Lee", jobAddress: "3 Birch Lane" },
    ...Array.from({ length: 10 }, (_, i) => ({ id: i + 4, name: `Sample Co ${i}`, jobAddress: "" })),
  ]);
  const job = { customerId: 2, employeeName: "Sam", workCompleted: "Repair", totalHoursWorked: 2 };
  await db.insert(jobs).values([
    { ...job, jobPartiallyCompleted: true },
    { ...job, jobCompleted: true, billSent: true, billPaid: true },
  ]);
});
after(() => pg.close());

test("manual searches and suggestions match names only (including split and business names)", async () => {
  for (const [query, expected] of [
    ["  Bin Ba  ", [1, 2]], ["BANks", [1, 2]], ["STUDIO", [3]], ["sey Lee", [3]], ["100%", [3]],
    ["312-555", []], ["office@", []], ["Birch", []], ["%%%", []], ["___", []],
  ]) {
    assert.deepEqual(ids((await search({ search: query })).customers), expected, query);
    assert.deepEqual(ids((await search({ search: query, suggest: true })).suggestions), expected, query);
  }
});

test("suggestions require three trimmed characters and are bounded; regular and compact searches are not", async () => {
  for (const query of ["", "  ", "  Ro  "]) {
    assert.deepEqual(await search({ search: query, suggest: true }), { suggestions: [] });
  }
  assert.equal((await search({ search: "  Ro  " })).customers.length, 2);
  assert.equal((await search({ search: "sam", suggest: true })).suggestions.length, 8);
  assert.equal((await search({ search: "sam" })).customers.length, 10);
  const all = (await search({ compact: true })).customers;
  assert.equal(all.length, 13);
  assert.equal(all.find((c) => c.id === 1).phone, "312-555-0100");
  assert.ok(all.every((c) => !("jobs" in c)));
});

test("same-name suggestions stay distinct and selection loads the exact record's fields and jobs", async () => {
  const { suggestions } = await search({ search: "rob", suggest: true });
  assert.deepEqual(suggestions, [
    { id: 1, name: "Robin Banks", jobAddress: "1 Birch Lane" },
    { id: 2, name: "Robin Banks", jobAddress: "2 Birch Lane" },
  ]);
  const selected = (await search({ id: suggestions[1].id })).customers;
  assert.deepEqual(ids(selected), [2]);
  const { name, firstName, lastName, phone, email, jobAddress } = selected[0];
  assert.deepEqual([name, firstName, lastName, phone, email, jobAddress],
    ["Robin Banks", null, null, null, "office@example.test", "2 Birch Lane"]);
  assert.equal(selected[0].jobs.length, 2);
});

test("suggestions and results honor the same independent job and billing filters", async () => {
  const filters = { status: "partial", bill: "paid" };
  assert.deepEqual(ids((await search(filters)).customers), [2]);
  assert.deepEqual(ids((await search({ ...filters, search: "rob", suggest: true })).suggestions), [2]);
  assert.deepEqual((await search({ ...filters, id: 1 })).customers, []);
  assert.deepEqual((await search({ bill: "outstanding" })).customers, []);
});
