export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

export type BrevoRecipient = {
  email: string;
  name?: string;
};

export type BrevoSender = {
  email: string;
  name: string;
};

export interface BrevoEmailPayload {
  sender?: BrevoSender;
  to: BrevoRecipient[];
  subject: string;
  textContent: string;
  htmlContent: string;
}

export async function sendBrevoEmail(payload: BrevoEmailPayload): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const defaultSenderEmail = process.env.BREVO_SENDER_EMAIL?.trim() || "notifications@automation-hub.app";
  const defaultSenderName = process.env.BREVO_SENDER_NAME?.trim() || "Automation Hub";

  const sender: BrevoSender = payload.sender || {
    email: defaultSenderEmail,
    name: defaultSenderName,
  };

  const recipientEmails = payload.to.map((r) => r.email).join(", ");

  if (!apiKey) {
    console.info(`\n======================================================`);
    console.info(`[Brevo Email Service (No BREVO_API_KEY)]`);
    console.info(`To: ${recipientEmails}`);
    console.info(`Subject: ${payload.subject}`);
    console.info(`Content:\n${payload.textContent}`);
    console.info(`======================================================\n`);
    return { ok: true, messageId: `local-dev-${Date.now()}` };
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender,
        to: payload.to,
        subject: payload.subject,
        htmlContent: payload.htmlContent,
        textContent: payload.textContent,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[Brevo] API returned error status ${response.status}: ${errorText}`);
      // Still log content locally so flows do not break during key setup
      console.info(`[Brevo Fallback Output] Link/Content for ${recipientEmails}:\n${payload.textContent}`);
      return { ok: false, error: `Brevo error: ${response.statusText}` };
    }

    const result = (await response.json().catch(() => ({}))) as { messageId?: string };
    console.info(`[Brevo] Email successfully dispatched to ${recipientEmails}. MessageId: ${result.messageId}`);
    return { ok: true, messageId: result.messageId };
  } catch (err) {
    console.error("[Brevo] Network error sending email:", err);
    console.info(`[Brevo Fallback Output] Link/Content for ${recipientEmails}:\n${payload.textContent}`);
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

export async function sendPasswordResetEmail({
  email,
  resetUrl,
  isChangePassword = false,
}: {
  email: string;
  resetUrl: string;
  isChangePassword?: boolean;
}): Promise<{ ok: boolean; messageId?: string }> {
  const actionText = isChangePassword ? "change" : "reset";
  const subject = isChangePassword
    ? "Change your Automation Hub password"
    : "Reset your Automation Hub password";

  const textContent = `Hello,

A request was received to ${actionText} the password for your Automation Hub account (${email}).

Use this secure link to set your new password:
${resetUrl}

This link is valid for 1 hour. If you did not request this, you can safely ignore this email.

— Automation Hub Team`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 32px 16px; color: #1e293b; }
    .card { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 36px 32px; box-shadow: 0 4px 20px -2px rgba(0,0,0,0.05); }
    .brand { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 24px; display: flex; align-items: center; gap: 8px; }
    h1 { font-size: 20px; font-weight: 700; margin: 0 0 12px; color: #0f172a; }
    p { font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 20px; }
    .btn { display: inline-block; background-color: #0f172a; color: #ffffff !important; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 8px; margin: 8px 0 24px; }
    .url { font-size: 12px; color: #64748b; word-break: break-all; margin-top: 16px; padding: 12px; background: #f1f5f9; border-radius: 8px; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #f1f5f9; font-size: 13px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">⚡ Automation Hub</div>
    <h1>${isChangePassword ? "Change your password" : "Reset your password"}</h1>
    <p>A request was received to ${actionText} the password for your Automation Hub account (<strong>${escapeHtml(email)}</strong>).</p>
    <p>Click the button below to choose your new password. This link is valid for 1 hour.</p>
    <a href="${escapeHtml(resetUrl)}" class="btn" target="_blank">${isChangePassword ? "Change Password" : "Reset Password"}</a>
    <p class="url">If the button doesn't work, copy and paste this link into your browser:<br>${escapeHtml(resetUrl)}</p>
    <div class="footer">If you did not request this, you can safely ignore this email.</div>
  </div>
</body>
</html>
`;

  return sendBrevoEmail({
    to: [{ email }],
    subject,
    textContent,
    htmlContent,
  });
}

export async function sendEmailVerificationCode({
  email,
  code,
}: {
  email: string;
  code: string;
}): Promise<{ ok: boolean; messageId?: string }> {
  const subject = "Verify your new email address - Automation Hub";
  const textContent = `Your verification code to update your Automation Hub email is:\n\n${code}\n\nThis code will expire in 15 minutes. If you did not request this change, please ignore this email.`;
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 32px 16px; color: #1e293b; }
    .card { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 36px 32px; box-shadow: 0 4px 20px -2px rgba(0,0,0,0.05); }
    .brand { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 24px; display: flex; align-items: center; gap: 8px; }
    h1 { font-size: 20px; font-weight: 700; margin: 0 0 12px; color: #0f172a; }
    p { font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 20px; }
    .code-box { margin: 24px 0; padding: 18px 24px; background: #fdf2f8; border: 1px solid #fbcfe8; border-radius: 12px; text-align: center; }
    .code-val { font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #9d174d; font-family: monospace; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #f1f5f9; font-size: 13px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">⚡ Automation Hub</div>
    <h1>Verify your new email</h1>
    <p>You requested to update your email address on Automation Hub to <strong>${escapeHtml(email)}</strong>.</p>
    <p>Use the 6-digit verification code below to confirm this change:</p>
    <div class="code-box">
      <span class="code-val">${escapeHtml(code)}</span>
    </div>
    <p style="font-size: 13px; color: #64748b;">This code will expire in 15 minutes. If you did not request this update, no action is needed.</p>
    <div class="footer">Automation Hub Account Security</div>
  </div>
</body>
</html>
`;

  return sendBrevoEmail({
    to: [{ email }],
    subject,
    textContent,
    htmlContent,
  });
}
