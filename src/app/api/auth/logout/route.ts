import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ message: "Logged out" });
  const cookieOptions = clearSessionCookie();
  response.cookies.set(cookieOptions);
  return response;
}
