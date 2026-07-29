import nodemailer from "nodemailer";

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    // Return a test transporter that logs to console
    return nodemailer.createTransport({
      streamTransport: true,
      newline: "unix",
      buffer: true,
    });
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const adminEmail =
  process.env.ADMIN_EMAIL || "admin@digitalrevolutionstl.com";

export async function sendApprovalRequestEmail(params: {
  applicantName: string;
  applicantEmail: string;
  approvalToken: string;
}) {
  const { applicantName, applicantEmail, approvalToken } = params;
  const approveUrl = `${appUrl}/api/auth/approve?token=${approvalToken}&action=approve`;
  const denyUrl = `${appUrl}/api/auth/approve?token=${approvalToken}&action=deny`;

  const transporter = createTransporter();

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; background: #0d1117; color: #e6edf3; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: #161b22; border-radius: 8px; padding: 30px; border: 1px solid #30363d;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #f97316; margin: 0; font-size: 24px;">Digital Revolution</h1>
          <p style="color: #8b949e; margin: 4px 0 0 0;">Job Tracker — New Account Request</p>
        </div>
        <h2 style="color: #e6edf3; font-size: 20px;">New User Registration</h2>
        <p style="color: #8b949e; line-height: 1.6;">
          A new user has registered for the Digital Revolution Job Tracker application and is awaiting your approval.
        </p>
        <div style="background: #0d1117; border-radius: 6px; padding: 16px; margin: 20px 0; border: 1px solid #30363d;">
          <p style="margin: 0; color: #e6edf3;"><strong>Name:</strong> ${applicantName}</p>
          <p style="margin: 8px 0 0 0; color: #e6edf3;"><strong>Email:</strong> ${applicantEmail}</p>
        </div>
        <p style="color: #8b949e;">Click one of the buttons below to approve or deny this account:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${approveUrl}" style="display: inline-block; background: #22c55e; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-right: 16px;">
            ✓ Approve Account
          </a>
          <a href="${denyUrl}" style="display: inline-block; background: #ef4444; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            ✗ Deny Account
          </a>
        </div>
        <p style="color: #6e7681; font-size: 12px; text-align: center;">
          These links will expire. If you did not expect this email, please ignore it.
        </p>
      </div>
    </body>
    </html>
  `;

  const info = await transporter.sendMail({
    from: `"Digital Revolution Job Tracker" <${user || adminEmail}>`,
    to: adminEmail,
    subject: `New Account Request: ${applicantName} — Job Tracker`,
    html,
    text: `New registration request from ${applicantName} (${applicantEmail}).\n\nApprove: ${approveUrl}\nDeny: ${denyUrl}`,
  });

  // Log for dev/no-smtp environments
  if (!process.env.SMTP_USER) {
    console.log("[EMAIL - No SMTP configured, logging to console]");
    console.log(`To: ${adminEmail}`);
    console.log(`Subject: New Account Request: ${applicantName}`);
    console.log(`Approve URL: ${approveUrl}`);
    console.log(`Deny URL: ${denyUrl}`);
  }

  return info;
}

const user = process.env.SMTP_USER;

export async function sendAccountApprovedEmail(params: {
  email: string;
  name: string;
}) {
  const { email, name } = params;
  const transporter = createTransporter();

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; background: #0d1117; color: #e6edf3; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: #161b22; border-radius: 8px; padding: 30px; border: 1px solid #30363d;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #f97316; margin: 0; font-size: 24px;">Digital Revolution</h1>
          <p style="color: #8b949e; margin: 4px 0 0 0;">Job Tracker</p>
        </div>
        <h2 style="color: #22c55e; font-size: 20px;">✓ Account Approved!</h2>
        <p style="color: #8b949e; line-height: 1.6;">
          Hi ${name}, your Digital Revolution Job Tracker account has been approved. You can now log in at:
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${appUrl}/login" style="display: inline-block; background: #f97316; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Log In Now
          </a>
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"Digital Revolution Job Tracker" <${process.env.SMTP_USER || adminEmail}>`,
    to: email,
    subject: "Your Job Tracker Account Has Been Approved",
    html,
    text: `Hi ${name}, your account has been approved. Log in at ${appUrl}/login`,
  });
}

export async function sendAccountDeniedEmail(params: {
  email: string;
  name: string;
}) {
  const { email, name } = params;
  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"Digital Revolution Job Tracker" <${process.env.SMTP_USER || adminEmail}>`,
    to: email,
    subject: "Your Job Tracker Account Request",
    text: `Hi ${name}, unfortunately your account request has been denied. Please contact your administrator if you believe this is an error.`,
  });
}
