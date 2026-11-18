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
