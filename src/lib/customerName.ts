export function getDisplayName(c: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  if (c.name) return c.name;
  const parts = [c.firstName, c.lastName].filter(Boolean);
  return parts.join(" ") || "Unnamed";
}
