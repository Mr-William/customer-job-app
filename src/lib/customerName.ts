export const MIN_CUSTOMER_SUGGESTION_LENGTH = 3;

export interface CustomerSuggestion {
  id: number;
  name: string;
  jobAddress: string;
}

export function getDisplayName(c: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  if (c.name) return c.name;
  const parts = [c.firstName, c.lastName].filter(Boolean);
  return parts.join(" ") || "Unnamed";
}

/**
 * Case-insensitive substring match for customer-name suggestions.
 * Mirrors the server-side search (strpos(lower(name), lower(query)) > 0),
 * so "john", "JOHN", and "John" all match "John Smith".
 */
export function matchesCustomerName(displayName: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;
  return displayName.toLowerCase().includes(needle);
}
