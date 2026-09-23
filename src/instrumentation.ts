export async function register() {
  // Only run on the Node.js server runtime (not edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureDefaultAdmin, ensureCalendarColumns } = await import("@/db");
    await ensureCalendarColumns();
    await ensureDefaultAdmin();
  }
}
