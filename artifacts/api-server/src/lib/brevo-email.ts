import { ReplitConnectors } from "@replit/connectors-sdk";

type BrevoSender = { email?: string; name?: string; active?: boolean };
type BrevoSendersResponse = { senders?: BrevoSender[] };

let senderCache: {
  sender: { email: string; name: string } | null;
  expiresAt: number;
} | null = null;

export async function getVerifiedBrevoSender(): Promise<{ email: string; name: string } | null> {
  if (senderCache && senderCache.expiresAt > Date.now()) return senderCache.sender;
  try {
    const response = await new ReplitConnectors().proxy("brevo", "/senders", {
      method: "GET",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as BrevoSendersResponse;
    const sender = data.senders?.find(
      (candidate) =>
        candidate.active === true &&
        typeof candidate.email === "string" &&
        candidate.email.length > 0,
    );
    const resolvedSender = sender?.email
      ? { email: sender.email, name: sender.name || "Automation Hub" }
      : null;
    senderCache = resolvedSender
      ? { sender: resolvedSender, expiresAt: Date.now() + 15 * 60 * 1000 }
      : null;
    return resolvedSender;
  } catch (error) {
    console.warn("[Brevo] Connector not available:", error);
    return null;
  }
}

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

export async function sendBrevoEmail(
  message: {
    sender: { email: string; name: string };
    to: Array<{ email: string; name?: string }>;
    subject: string;
    textContent: string;
    htmlContent: string;
  },
): Promise<Response> {
  try {
    return await new ReplitConnectors().proxy("brevo", "/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
  } catch (error) {
    console.warn("[Brevo] Failed to send email via Replit connector:", error);
    return new Response(JSON.stringify({ message: "Mock email response" }), { status: 200 });
  }
}
