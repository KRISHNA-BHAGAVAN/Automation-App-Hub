import type { Request } from "express";

export type AdminContext = {
  userId: string;
  supabaseUrl: string;
  serviceRoleKey: string;
};

export type AdminAuthResult =
  | { ok: true; context: AdminContext }
  | { ok: false; status: 401 | 403 | 503; error: string };

type SupabaseUser = { id?: string };
type AdminProfile = {
  role?: string;
  is_blocked?: boolean;
  access_approved?: boolean;
  email_verified?: boolean;
};

export async function requireAdmin(req: Request): Promise<AdminAuthResult> {
  const token = /^Bearer\s+(.+)$/i.exec(req.get("authorization") ?? "")?.[1]?.trim();
  if (!token || token.length > 8192) {
    return { ok: false, status: 401, error: "Sign in with an admin account to continue." };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    req.log.error("Admin API is missing Supabase configuration.");
    return { ok: false, status: 503, error: "The admin service is not configured." };
  }

  const baseUrl = supabaseUrl.replace(/\/+$/, "");
  try {
    const authResponse = await fetch(`${baseUrl}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
    });
    if (authResponse.status === 401 || authResponse.status === 403) {
      return { ok: false, status: 401, error: "Your session has expired. Sign in again." };
    }
    if (!authResponse.ok) {
      req.log.error({ statusCode: authResponse.status }, "Could not validate an admin request.");
      return { ok: false, status: 503, error: "The admin service is temporarily unavailable." };
    }

    const user = (await authResponse.json()) as SupabaseUser;
    if (!user.id) {
      return { ok: false, status: 401, error: "Your session could not be validated. Sign in again." };
    }

    const profileUrl = new URL(`${baseUrl}/rest/v1/profiles`);
    profileUrl.searchParams.set("id", `eq.${user.id}`);
    profileUrl.searchParams.set("select", "role,is_blocked,access_approved,email_verified");
    profileUrl.searchParams.set("limit", "1");
    const profileResponse = await fetch(profileUrl, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });
    if (!profileResponse.ok) {
      req.log.error({ statusCode: profileResponse.status }, "Could not check admin access.");
      return { ok: false, status: 503, error: "The admin service is temporarily unavailable." };
    }

    const profiles = (await profileResponse.json()) as AdminProfile[];
    const profile = profiles[0];
    if (
      profile?.role !== "admin" ||
      profile.is_blocked ||
      profile.access_approved === false ||
      profile.email_verified === false
    ) {
      return { ok: false, status: 403, error: "Only active workspace admins can continue." };
    }

    return {
      ok: true,
      context: {
        userId: user.id,
        supabaseUrl: baseUrl,
        serviceRoleKey,
      },
    };
  } catch (error) {
    req.log.error(
      { err: error instanceof Error ? error.message : "Unknown error" },
      "Admin session validation failed.",
    );
    return { ok: false, status: 503, error: "The admin service is temporarily unavailable." };
  }
}

export function supabaseAdminFetch(
  context: AdminContext,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("apikey", context.serviceRoleKey);
  headers.set("Authorization", `Bearer ${context.serviceRoleKey}`);
  return fetch(`${context.supabaseUrl}${path}`, { ...options, headers });
}
