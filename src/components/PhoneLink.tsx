import type { ReactNode } from "react";
import { getPhoneHref } from "@/lib/phone";

export default function PhoneLink({
  phone,
  fallback = "No phone",
  label,
}: {
  phone: string | null | undefined;
  fallback?: ReactNode;
  label?: string;
}) {
  const number = phone?.trim();
  if (!number) {
    return fallback == null ? null : <span style={{ color: "var(--text-muted)" }}>{fallback}</span>;
  }

  const href = getPhoneHref(number);
  if (!href) return label ? null : <span>{number}</span>;

  return (
    <a href={href} className="dr-phone-link" aria-label={`Call ${number}`}>
      {label || number}
    </a>
  );
}
