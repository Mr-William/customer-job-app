import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { searchCustomers } from "@/db/searchCustomers";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const id = params.has("id") ? Number(params.get("id")) : undefined;
  if (id !== undefined && (!Number.isInteger(id) || id < 1 || id > 2147483647)) {
    return NextResponse.json({ error: "Invalid customer ID." }, { status: 400 });
  }

  return NextResponse.json(await searchCustomers(db, {
    search: params.get("search") || "",
    id,
    status: params.get("status") || "",
    bill: params.get("bill") || "",
    suggest: params.get("suggest") === "1",
    compact: params.get("compact") === "1",
  }));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { firstName, lastName, phone, email, jobAddress } = body;

    if (!jobAddress) {
      return NextResponse.json({ error: "Job address is required." }, { status: 400 });
    }
    if (!firstName && !lastName) {
      return NextResponse.json({ error: "At least a first or last name is required." }, { status: 400 });
    }

    const [customer] = await db
      .insert(customers)
      .values({
        name: null,
        firstName: firstName || null,
        lastName: lastName || null,
        phone,
        email: email || null,
        jobAddress,
      })
      .returning();

    return NextResponse.json({ customer });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to create customer." }, { status: 500 });
  }
}
