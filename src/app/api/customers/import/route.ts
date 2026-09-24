import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

function pick(row: Record<string, string>, ...keys: string[]): string {
  const norm: Record<string, string> = {};
  for (const k of Object.keys(row)) {
    norm[k.toLowerCase().replace(/\s+/g, "")] = (row[k] || "").toString().trim();
  }
  for (const key of keys) {
    const val = norm[key.toLowerCase().replace(/\s+/g, "")];
    if (val) return val;
  }
  return "";
}

function buildAddress(row: Record<string, string>): string {
  const street = pick(row, "street address", "streetaddress", "street", "address1", "address");
  const city = pick(row, "city");
  const state = pick(row, "state", "province");
  const zip = pick(row, "zip", "zipcode", "zip code", "postal code", "postalcode", "postal");
  const country = pick(row, "country");

  const cityStateZip = [city, state ? `${state}${zip ? " " + zip : ""}` : zip].filter(Boolean).join(", ");
  const parts = [street, cityStateZip, country].filter(Boolean);
  return parts.join(", ");
}

function normalizeName(str: string): string {
  return (str || "").toLowerCase().replace(/\s+/g, " ").trim();
}
function normalizePhone(str: string): string {
  return (str || "").replace(/\D/g, "");
}
function normalizeEmail(str: string): string {
  return (str || "").toLowerCase().trim();
}
function normalizeAddress(str: string): string {
  return (str || "").toLowerCase().replace(/\s+/g, " ").trim();
}
function getDisplayName(c: { name?: string | null; firstName?: string | null; lastName?: string | null }): string {
  if (c.name) return c.name;
  const parts = [c.firstName, c.lastName].filter(Boolean);
  return parts.join(" ") || "";
}

function areIdentical(
  existing: { phone: string | null; email: string | null; jobAddress: string; displayName: string },
  imported: { phone: string; email: string; jobAddress: string; name: string }
): boolean {
  return (
    normalizeName(existing.displayName) === normalizeName(imported.name) &&
    normalizePhone(existing.phone || "") === normalizePhone(imported.phone || "") &&
    normalizeEmail(existing.email || "") === normalizeEmail(imported.email || "") &&
    normalizeAddress(existing.jobAddress || "") === normalizeAddress(imported.jobAddress || "")
  );
}

type InsertPayload = { name: string; phone: string; email: string; jobAddress: string };
type UpdatePayload = { id: number; name: string; phone: string; email: string; jobAddress: string; mode: "merge" | "overwrite" };

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();

    // New structured payload: { inserts, updates }
    const inserts = body.inserts as InsertPayload[] | undefined;
    const updates = body.updates as UpdatePayload[] | undefined;
    const legacyRows = body.rows as Record<string, string>[] | undefined;

    const existingCustomers = await db.select().from(customers);
    const existingById = new Map(existingCustomers.map((c) => [c.id, c]));
    const existingByName = new Map<string, typeof existingCustomers[0]>();
    for (const c of existingCustomers) {
      const dn = getDisplayName(c);
      if (!dn) continue;
      const key = normalizeName(dn);
      if (!existingByName.has(key)) existingByName.set(key, c);
    }

    const inserted: number[] = [];
    const updated: number[] = [];
    const skipped: { row: number; reason: string }[] = [];
    const duplicates: { row: number; reason: string }[] = [];
    let identicalCount = 0;

    if (inserts || updates) {
      // ── New flow ──
      const seenInsertNames = new Set<string>();

      if (inserts && Array.isArray(inserts)) {
        for (let i = 0; i < inserts.length; i++) {
          const imp = inserts[i];
          const name = (imp.name || "").trim();
          if (!name) {
            skipped.push({ row: i + 1, reason: "Missing Name" });
            continue;
          }
          const norm = normalizeName(name);
          if (seenInsertNames.has(norm) || existingByName.has(norm)) {
            // Should not happen if client filtered, but guard
            duplicates.push({ row: i + 1, reason: `Duplicate name \"${name}\" already exists or duplicated in file` });
            continue;
          }
          seenInsertNames.add(norm);

          const [customer] = await db
            .insert(customers)
            .values({
              name,
              firstName: null,
              lastName: null,
              phone: imp.phone || null,
              email: imp.email || null,
              jobAddress: imp.jobAddress || "",
            })
            .returning();
          inserted.push(customer.id);
          // Add to map to prevent further dupes in same batch
          existingByName.set(norm, customer as any);
        }
      }

      if (updates && Array.isArray(updates)) {
        for (const u of updates) {
          const existing = existingById.get(u.id);
          if (!existing) {
            skipped.push({ row: u.id, reason: `Customer id ${u.id} not found` });
            continue;
          }
          const impName = (u.name || "").trim() || getDisplayName(existing);
          const impPhone = (u.phone || "").trim();
          const impEmail = (u.email || "").trim();
          const impAddress = (u.jobAddress || "").trim();

          let newValues: { name: string; phone: string | null; email: string | null; jobAddress: string };

          if (u.mode === "merge") {
            newValues = {
              name: impName,
              phone: impPhone || existing.phone || null,
              email: impEmail || existing.email || null,
              jobAddress: impAddress || existing.jobAddress || "",
            };
          } else {
            // overwrite: take imported values, allow clearing if empty
            newValues = {
              name: impName,
              phone: impPhone || null,
              email: impEmail || null,
              jobAddress: impAddress || "",
            };
          }

          await db
            .update(customers)
            .set({
              name: newValues.name,
              firstName: null,
              lastName: null,
              phone: newValues.phone,
              email: newValues.email,
              jobAddress: newValues.jobAddress,
              updatedAt: new Date(),
            })
            .where(eq(customers.id, existing.id));

          updated.push(existing.id);
        }
      }

      return NextResponse.json({
        inserted: inserted.length,
        updated: updated.length,
        skipped,
        duplicates,
        identical: identicalCount,
        total: (inserts?.length || 0) + (updates?.length || 0),
      });
    }

    // ── Legacy fallback: rows[] ──
    if (!legacyRows || !Array.isArray(legacyRows) || legacyRows.length === 0) {
      return NextResponse.json({ error: "No data provided." }, { status: 400 });
    }

    const importedNameSet = new Set<string>();

    for (let i = 0; i < legacyRows.length; i++) {
      const row = legacyRows[i];
      const name = pick(row, "name", "customer", "customer name", "customername", "company", "business");
      const jobAddress = buildAddress(row) || pick(row, "address", "job address", "jobaddress", "job_address", "location", "job site", "jobsite");
      const phone = pick(row, "phone", "phone number", "phonenumber", "phone_number", "mobile", "cell", "telephone");
      const email = pick(row, "email", "email address", "emailaddress", "email_address");

      if (!name) {
        skipped.push({ row: i + 2, reason: "Missing required field(s): Name" });
        continue;
      }

      const norm = normalizeName(name);
      if (importedNameSet.has(norm)) {
        duplicates.push({ row: i + 2, reason: `Duplicate name \"${name}\" within file` });
        continue;
      }
      importedNameSet.add(norm);

      const existing = existingByName.get(norm);
      if (existing) {
        const existingInfo = {
          displayName: getDisplayName(existing),
          phone: existing.phone,
          email: existing.email,
          jobAddress: existing.jobAddress,
        };
        const importedInfo = { name, phone, email, jobAddress };
        if (areIdentical(existingInfo, importedInfo)) {
          identicalCount++;
          duplicates.push({ row: i + 2, reason: `Identical customer \"${name}\" already exists — hidden from import` });
          continue;
        } else {
          duplicates.push({ row: i + 2, reason: `Customer \"${name}\" already exists with different data — use merge/overwrite flow` });
          continue;
        }
      }

      const [customer] = await db
        .insert(customers)
        .values({
          name,
          firstName: null,
          lastName: null,
          phone: phone || null,
          email: email || null,
          jobAddress: jobAddress || "",
        })
        .returning();
      inserted.push(customer.id);
    }

    return NextResponse.json({
      inserted: inserted.length,
      updated: 0,
      duplicates,
      skipped,
      identical: identicalCount,
      total: legacyRows.length,
    });
  } catch (err) {
    console.error("Import error:", err);
    return NextResponse.json({ error: "Failed to import customers." }, { status: 500 });
  }
}
