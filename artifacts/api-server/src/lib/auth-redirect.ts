export function getSameOriginAuthRedirectUrl(
  origin: string | undefined,
  host: string | undefined,
  referer: string | undefined,
  options: { path?: string; query?: Record<string, string> } = {},
): string | null {
  if (!origin || !host) return null;
  try {
    const parsedOrigin = new URL(origin);
    const isLocalHttp =
      parsedOrigin.protocol === "http:" &&
      (parsedOrigin.hostname === "localhost" || parsedOrigin.hostname === "127.0.0.1");
    if (
      parsedOrigin.host !== host ||
      (parsedOrigin.protocol !== "https:" && !isLocalHttp)
    ) {
      return null;
    }

    let basePath = "";
    if (referer) {
      const parsedReferer = new URL(referer);
      if (parsedReferer.origin !== parsedOrigin.origin) return null;
      const refererPath = parsedReferer.pathname.replace(/\/+$/, "") || "/";
      const pageRoutes = [
        "/forgot-password",
        "/request-access",
        "/reset-password",
        "/signup",
        "/login",
      ];
      const activeRoute = pageRoutes.find((route) => refererPath.endsWith(route));
      basePath = activeRoute
        ? refererPath.slice(0, -activeRoute.length)
        : refererPath.replace(/\/+$/, "");
    }

    const routePath = options.path ?? "/reset-password";
    const redirectUrl = new URL(`${basePath}${routePath}`, parsedOrigin.origin);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      redirectUrl.searchParams.set(key, value);
    }
    return redirectUrl.toString();
  } catch {
    return null;
  }
}
