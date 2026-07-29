import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customers, jobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const customerId = parseInt(id);

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  const customerJobs = await db
    .select()
    .from(jobs)
    .where(eq(jobs.customerId, customerId));

  return NextResponse.json({ customer: { ...customer, jobs: customerJobs } });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const customerId = parseInt(id);
  const body = await req.json();
  const { name, firstName, lastName, phone, email, jobAddress } = body;

  if (!jobAddress) {
    return NextResponse.json({ error: "Job address is required." }, { status: 400 });
  }

  const [updated] = await db
    .update(customers)
    .set({
      name: name || null,
      firstName: firstName || null,
      lastName: lastName || null,
      phone,
      email: email || null,
      jobAddress,
      updatedAt: new Date(),
    })
    .where(eq(customers.id, customerId))
    .returning();

  return NextResponse.json({ customer: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const customerId = parseInt(id);

  await db.delete(customers).where(eq(customers.id, customerId));

  return NextResponse.json({ message: "Customer deleted." });
}
