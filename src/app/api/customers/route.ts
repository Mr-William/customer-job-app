import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customers, jobs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export function getDisplayName(c: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  if (c.name) return c.name;
  const parts = [c.firstName, c.lastName].filter(Boolean);
  return parts.join(" ") || "Unnamed";
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const statusFilter = searchParams.get("status") || "";
  const billFilter = searchParams.get("bill") || "";

  let customerList = await db.select().from(customers).orderBy(desc(customers.createdAt));

  // Apply name/phone search filter
  if (search) {
    const lower = search.toLowerCase();
    customerList = customerList.filter((c) => {
      const displayName = getDisplayName(c).toLowerCase();
      return displayName.includes(lower) || (c.phone || "").includes(lower);
    });
  }

  // Fetch jobs for each customer
  const result = await Promise.all(
    customerList.map(async (customer) => {
      const customerJobs = await db
        .select()
        .from(jobs)
        .where(eq(jobs.customerId, customer.id))
        .orderBy(desc(jobs.createdAt));
      return { ...customer, jobs: customerJobs };
    })
  );

  // Apply status filter
  let filtered = result;
  if (statusFilter === "completed") {
    filtered = filtered.filter((c) => c.jobs.some((j) => j.jobCompleted));
  } else if (statusFilter === "partial") {
    filtered = filtered.filter((c) => c.jobs.some((j) => j.jobPartiallyCompleted));
  } else if (statusFilter === "additional") {
    filtered = filtered.filter((c) => c.jobs.some((j) => j.additionalWorkRecommended));
  }

  // Apply bill filter
  if (billFilter === "sent") {
    filtered = filtered.filter((c) => c.jobs.some((j) => j.billSent && !j.billPaid));
  } else if (billFilter === "paid") {
    filtered = filtered.filter((c) => c.jobs.some((j) => j.billPaid));
  } else if (billFilter === "outstanding") {
    filtered = filtered.filter((c) => c.jobs.some((j) => j.billSent && !j.billPaid));
  }

  return NextResponse.json({ customers: filtered });
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
