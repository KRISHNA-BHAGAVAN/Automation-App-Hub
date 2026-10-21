import { ReplitConnectors } from "@replit/connectors-sdk";

type BrevoSender = { email?: string; name?: string; active?: boolean };
type BrevoSendersResponse = { senders?: BrevoSender[] };

let senderCache: {
  sender: { email: string; name: string } | null;
  expiresAt: number;
} | null = null;

export async function getVerifiedBrevoSender(): Promise<{ email: string; name: string } | null> {
  if (senderCache && senderCache.expiresAt > Date.now()) return senderCache.sender;
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

export function sendBrevoEmail(
  message: {
    sender: { email: string; name: string };
    to: Array<{ email: string; name?: string }>;
    subject: string;
    textContent: string;
    htmlContent: string;
  },
): Promise<Response> {
  return new ReplitConnectors().proxy("brevo", "/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
}
