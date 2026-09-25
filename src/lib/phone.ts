// Keep only dialable characters in tel: links; preserve a leading country-code +
// and common extension notation without changing how the number is displayed.
export function getPhoneHref(phone: string): string | null {
  const value = phone.trim();
  const extension = value.match(/\s*(?:ext(?:ension)?\.?|x|#)\s*(\d+)\s*$/i);
  const mainNumber = extension ? value.slice(0, extension.index).trim() : value;
  // Don't turn arbitrary text containing a digit into an unintended phone call.
  if (!/^\+?[\d\s()./\-]+$/.test(mainNumber)) return null;
  const digits = mainNumber.replace(/\D/g, "");
  if (!digits) return null;

  return `tel:${mainNumber.startsWith("+") ? "+" : ""}${digits}${extension ? `;ext=${extension[1]}` : ""}`;
}
