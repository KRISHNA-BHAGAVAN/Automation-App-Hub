export function getSameOriginAuthRedirectUrl(
  origin: string | undefined,
  host: string | undefined,
  referer: string | undefined,
  query: Record<string, string> = {},
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
      const pageRoutes = ["/forgot-password", "/login", "/reset-password"];
      const activeRoute = pageRoutes.find((route) => refererPath.endsWith(route));
      basePath = activeRoute
        ? refererPath.slice(0, -activeRoute.length)
        : refererPath.replace(/\/+$/, "");
    }

    const redirectUrl = new URL(`${basePath}/reset-password`, parsedOrigin.origin);
    for (const [key, value] of Object.entries(query)) {
      redirectUrl.searchParams.set(key, value);
    }
    return redirectUrl.toString();
  } catch {
    return null;
  }
}
