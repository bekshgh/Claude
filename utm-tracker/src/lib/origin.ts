/**
 * Public origin (scheme + host) of this deployment, derived from the incoming
 * request. Behind Vercel's proxy the original host and scheme arrive in the
 * x-forwarded-* headers.
 */
export function originFromHeaders(get: (name: string) => string | null, fallback?: string): string {
  const host = get("x-forwarded-host") || get("host");
  if (!host) return (fallback || "").replace(/\/+$/, "");
  const fwdProto = get("x-forwarded-proto");
  const proto = fwdProto
    ? fwdProto.split(",")[0].trim()
    : fallback && fallback.startsWith("http://") ? "http" : "https";
  return `${proto}://${host.split(",")[0].trim()}`;
}

export function requestOrigin(req: { headers: Headers; nextUrl: { origin: string } }): string {
  return originFromHeaders((n) => req.headers.get(n), req.nextUrl.origin);
}
