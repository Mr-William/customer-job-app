import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customers } from "@/db/schema";
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
  const street  = pick(row, "street address", "streetaddress", "street", "address1", "address");
  const city    = pick(row, "city");
  const state   = pick(row, "state", "province");
  const zip     = pick(row, "zip", "zipcode", "zip code", "postal code", "postalcode", "postal");
  const country = pick(row, "country");

  const cityStateZip = [city, state ? `${state}${zip ? " " + zip : ""}` : zip].filter(Boolean).join(", ");
  const parts = [street, cityStateZip, country].filter(Boolean);
  return parts.join(", ");
}

function normalize(str: string): string {
  return str.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { rows } = body as { rows: Record<string, string>[] };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No data provided." }, { status: 400 });
    }

    // Load existing customers from DB for duplicate checking
    const existingCustomers = await db.select().from(customers);
    const existingNames = new Set(
      existingCustomers
        .map((c) => normalize(c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim()))
        .filter(Boolean)
    );

    // Track names inserted during this import to catch duplicates within the file itself
    const importedNames = new Set<string>();

    const inserted: number[] = [];
    const skipped: { row: number; reason: string }[] = [];
    const duplicates: { row: number; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      const name = pick(row, "name", "customer", "customer name", "customername", "company", "business");
      const jobAddress = buildAddress(row) || pick(row, "address", "job address", "jobaddress", "job_address", "location", "job site", "jobsite");
      const phone = pick(row, "phone", "phone number", "phonenumber", "phone_number", "mobile", "cell", "telephone");
      const email = pick(row, "email", "email address", "emailaddress", "email_address");

      // Name is the only required field — phone and address are optional so
      // that partial records still import.
      const missing: string[] = [];
      if (!name) missing.push("Name");

      if (missing.length > 0) {
        skipped.push({
          row: i + 2,
          reason: `Missing required field(s): ${missing.join(", ")}`,
        });
        continue;
      }

      // Check for duplicates — against DB and within this import batch
      const normalizedName = normalize(name);
      if (existingNames.has(normalizedName) || importedNames.has(normalizedName)) {
        duplicates.push({
          row: i + 2,
          reason: `Duplicate customer: "${name}" already exists`,
        });
        continue;
      }

      const [customer] = await db
        .insert(customers)
        .values({
          name,
          firstName: null,
          lastName: null,
          phone: phone || null,
          email: email || null,
          // jobAddress is NOT NULL in the schema; store "" when absent
          jobAddress: jobAddress || "",
        })
        .returning();

      inserted.push(customer.id);
      importedNames.add(normalizedName);
    }

    return NextResponse.json({
      inserted: inserted.length,
      duplicates,
      skipped,
      total: rows.length,
    });
  } catch (err) {
    console.error("Import error:", err);
    return NextResponse.json({ error: "Failed to import customers." }, { status: 500 });
  }
}
