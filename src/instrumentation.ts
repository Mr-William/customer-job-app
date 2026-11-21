export async function register() {
  // Only run on the Node.js server runtime (not edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const {
      ensureDefaultAdmin,
      ensureCalendarColumns,
      ensureCalendarFeedTokenColumn,
      ensureLastActiveColumn,
    } = await import("@/db");
    await ensureCalendarColumns();
    await ensureCalendarFeedTokenColumn();
    await ensureLastActiveColumn();
    await ensureDefaultAdmin();
  }
}
