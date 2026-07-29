import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  sendAccountApprovedEmail,
  sendAccountDeniedEmail,
} from "@/lib/email";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const action = searchParams.get("action");

  if (!token || !action) {
    return new NextResponse(renderPage("Invalid Request", "Missing token or action.", false), {
      headers: { "Content-Type": "text/html" },
      status: 400,
    });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.approvalToken, token))
    .limit(1);

  if (!user) {
    return new NextResponse(
      renderPage("Invalid Token", "This approval link is invalid or has already been used.", false),
      { headers: { "Content-Type": "text/html" }, status: 404 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (action === "approve") {
    await db
      .update(users)
      .set({ approved: true, approvalToken: null })
      .where(eq(users.id, user.id));

    try {
      await sendAccountApprovedEmail({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
      });
    } catch (e) {
      console.error("Failed to send approval notification:", e);
    }

    return new NextResponse(
      renderPage(
        "Account Approved ✓",
        `${user.firstName} ${user.lastName}'s account has been approved. They will receive a notification email and can now log in.`,
        true,
        appUrl
      ),
      { headers: { "Content-Type": "text/html" } }
    );
  } else if (action === "deny") {
    await db.delete(users).where(eq(users.id, user.id));

    try {
      await sendAccountDeniedEmail({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
      });
    } catch (e) {
      console.error("Failed to send denial notification:", e);
    }

    return new NextResponse(
      renderPage(
        "Account Denied",
        `${user.firstName} ${user.lastName}'s account request has been denied and removed.`,
        false,
        appUrl
      ),
      { headers: { "Content-Type": "text/html" } }
    );
  }

  return new NextResponse(renderPage("Error", "Unknown action.", false), {
    headers: { "Content-Type": "text/html" },
    status: 400,
  });
}

function renderPage(title: string, message: string, success: boolean, appUrl?: string) {
  const color = success ? "#22c55e" : "#ef4444";
  const icon = success ? "✓" : "✗";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title} — Digital Revolution Job Tracker</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; background: #0d1117; color: #e6edf3; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: #161b22; border-radius: 12px; padding: 40px; max-width: 500px; width: 100%; text-align: center; border: 1px solid #30363d; }
    .icon { font-size: 64px; color: ${color}; margin-bottom: 16px; }
    h1 { color: ${color}; font-size: 28px; margin-bottom: 16px; }
    p { color: #8b949e; line-height: 1.6; margin-bottom: 24px; }
    .brand { color: #f97316; font-weight: bold; font-size: 18px; margin-bottom: 8px; }
    a.btn { display: inline-block; background: #f97316; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">Digital Revolution</div>
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${appUrl ? `<a class="btn" href="${appUrl}/login">Go to App</a>` : ""}
  </div>
</body>
</html>`;
}
