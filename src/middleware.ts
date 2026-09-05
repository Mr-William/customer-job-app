import { NextRequest, NextResponse } from "next/server";

/** Must match `COOKIE_NAME` in src/lib/auth.ts */
const COOKIE_NAME = "dr_session";

const PUBLIC_API = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/approve",
  "/api/auth/logout",
]);

function unauthorized(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const login = req.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  return NextResponse.redirect(login);
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad =
    padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function sessionIsValid(token: string): Promise<{ role?: string } | null> {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const signature = base64UrlToBytes(parts[2]);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      signature as BufferSource,
      data
    );
    if (!ok) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(parts[1]))
    ) as { exp?: number; role?: string };
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return { role: payload.role };
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_API.has(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await sessionIsValid(token) : null;
  if (!session) {
    return unauthorized(req);
  }

  if (pathname.startsWith("/dashboard/users") && session.role !== "admin") {
    const dashboard = req.nextUrl.clone();
    dashboard.pathname = "/dashboard";
    dashboard.search = "";
    return NextResponse.redirect(dashboard);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
