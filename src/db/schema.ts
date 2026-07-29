import {
  pgTable,
  serial,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  real,
} from "drizzle-orm/pg-core";

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 50 }).notNull().default("user"), // 'admin' | 'user'
  approved: boolean("approved").notNull().default(false),
  approvalToken: text("approval_token"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Customers ────────────────────────────────────────────────────────────────
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  // name covers business names or full names from imports
  name: varchar("name", { length: 200 }),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  phone: varchar("phone", { length: 30 }),
  email: varchar("email", { length: 255 }),
  jobAddress: text("job_address").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Jobs ────────────────────────────────────────────────────────────────────
export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  employeeName: varchar("employee_name", { length: 150 }).notNull(),
  totalHoursWorked: real("total_hours_worked").notNull(),
  workCompleted: text("work_completed").notNull(),
  // Status checkboxes (only one active)
  jobCompleted: boolean("job_completed").notNull().default(false),
  jobPartiallyCompleted: boolean("job_partially_completed").notNull().default(false),
  additionalWorkRecommended: boolean("additional_work_recommended").notNull().default(false),
  // Billing (only relevant when jobCompleted = true)
  billSent: boolean("bill_sent").notNull().default(false),
  billPaid: boolean("bill_paid").notNull().default(false),
  // Additional notes
  additionalDetails: text("additional_details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
