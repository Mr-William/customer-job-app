import { and, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { customers, jobs } from "./schema.ts";
import { MIN_CUSTOMER_SUGGESTION_LENGTH } from "../lib/customerName.ts";

interface SearchOptions {
  search?: string;
  id?: number;
  status?: string;
  bill?: string;
  suggest?: boolean;
  compact?: boolean;
}

export async function searchCustomers(db: NodePgDatabase, options: SearchOptions) {
  const { id, status, bill, suggest, compact } = options;
  const search = options.search?.trim() || "";
  if (suggest && search.length < MIN_CUSTOMER_SUGGESTION_LENGTH) return { suggestions: [] };

  const personName = sql`concat_ws(' ', nullif(${customers.firstName}, ''), nullif(${customers.lastName}, ''))`;
  // Literal substrings, including % and _ in business names. Never match contact details.
  const nameMatch = search ? or(
    sql`strpos(lower(${customers.name}), lower(${search})) > 0`,
    sql`strpos(lower(${personName}), lower(${search})) > 0`,
  ) : undefined;

  let jobStatus: SQL | undefined;
  if (status === "completed") jobStatus = eq(jobs.jobCompleted, true);
  else if (status === "partial") jobStatus = eq(jobs.jobPartiallyCompleted, true);
  else if (status === "additional") jobStatus = eq(jobs.additionalWorkRecommended, true);

  let billStatus: SQL | undefined;
  if (bill === "paid") billStatus = eq(jobs.billPaid, true);
  else if (bill === "sent" || bill === "outstanding") billStatus = and(eq(jobs.billSent, true), eq(jobs.billPaid, false));

  // The status and billing matches can come from different jobs for the same customer.
  function hasJob(condition?: SQL) {
    if (!condition) return undefined;
    return inArray(customers.id, db.select({ id: jobs.customerId }).from(jobs).where(condition));
  }
  const where = and(
    nameMatch,
    id === undefined ? undefined : eq(customers.id, id),
    hasJob(jobStatus),
    hasJob(billStatus),
  );

  if (suggest) {
    const name = sql<string>`coalesce(nullif(${customers.name}, ''), ${personName})`;
    const suggestions = await db.select({ id: customers.id, name, jobAddress: customers.jobAddress })
      .from(customers).where(where).orderBy(sql`lower(${name})`, customers.id).limit(8);
    return { suggestions };
  }

  // Calendar and import callers still get the full compact list, without job histories.
  if (compact) {
    const rows = await db.select({
      id: customers.id, name: customers.name, firstName: customers.firstName, lastName: customers.lastName,
      phone: customers.phone, email: customers.email, jobAddress: customers.jobAddress,
    }).from(customers).where(where).orderBy(desc(customers.createdAt));
    return { customers: rows };
  }

  const rows = await db.select().from(customers).where(where).orderBy(desc(customers.createdAt));
  const results = await Promise.all(rows.map(async (customer) => ({
    ...customer,
    jobs: await db.select().from(jobs).where(eq(jobs.customerId, customer.id)).orderBy(desc(jobs.createdAt)),
  })));
  return { customers: results };
}
