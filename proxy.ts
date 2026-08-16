import { NextResponse, type NextRequest } from "next/server";

/**
 * Browser access to the Gateway.
 *
 * Until app-web there were no browser clients: macOS and iOS speak to this
 * host from native code, where the same-origin policy does not exist and no
 * preflight is ever sent. A page served from another origin cannot make even
 * the first request without these headers, so this is the difference between
 * the web client working and not existing.
 *
 * The allowlist is exact and closed. A wildcard would be a real mistake here
 * rather than a stylistic one: `Authorization` carries a Supabase session, and
 * `*` combined with credentials is precisely the shape that lets any page a
 * user visits spend their quota.
 */
const ALLOWED_ORIGINS = new Set([
  "https://app.universal-io.com",
  "https://universal-io.com",
  "https://www.universal-io.com",
  // Local development of app-web, on a port reserved for this product family.
  // The 3000-3010 range is the default for most of the JavaScript ecosystem,
  // so anything living there is one `npm run dev` in an unrelated project away
  // from being silently shadowed — which is exactly what happened the first
  // time app-web was started, and it served another project's page instead.
  "http://localhost:7380",
  "http://127.0.0.1:7380",
  // The production alias Vercel gives the app-web project. It is listed exactly
  // rather than folded into the pattern below, which requires a hyphen after
  // "app-web" and so would not match this host — and widening a security
  // boundary to fit one known name is the wrong trade.
  "https://app-web.vercel.app",
]);

/**
 * Preview deployments of app-web on Vercel. The subdomain is generated per
 * deployment, so it cannot be enumerated in advance; the suffix is anchored so
 * that only Vercel-issued hosts for this project can match, and an origin like
 * `https://app-web-evil.com` cannot.
 */
const PREVIEW_ORIGIN = /^https:\/\/app-web-[a-z0-9-]+\.vercel\.app$/;

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.has(origin) || PREVIEW_ORIGIN.test(origin);
}

function corsHeaders(origin: string): Headers {
  const headers = new Headers();
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-credentials", "true");
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set("access-control-allow-headers", "authorization, content-type");
  // Without this, a cache that saw one origin's response can hand it to
  // another origin, which turns a correct allowlist into an incorrect one.
  headers.set("vary", "origin");
  return headers;
}

export default function proxy(request: NextRequest): NextResponse {
  const origin = request.headers.get("origin");

  // Same-origin and native clients send no Origin header and need nothing
  // added. Leaving them untouched keeps the shipped macOS and iOS paths
  // byte-identical to what they get today.
  if (!origin) return NextResponse.next();

  if (!isAllowedOrigin(origin)) {
    // A rejected preflight must not look like a server fault: answering 403
    // with no CORS headers is what tells the browser the origin is refused,
    // and tells us apart from an outage when reading logs.
    if (request.method === "OPTIONS") {
      return new NextResponse(null, { status: 403 });
    }
    return NextResponse.next();
  }

  const headers = corsHeaders(origin);

  // The preflight is answered here and never reaches a route handler: those
  // handlers require a request_id and a Bearer token, and a preflight carries
  // neither by design.
  if (request.method === "OPTIONS") {
    headers.set("access-control-max-age", "86400");
    return new NextResponse(null, { status: 204, headers });
  }

  const response = NextResponse.next();
  headers.forEach((value, key) => response.headers.set(key, value));
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
