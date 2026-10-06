/**
 * Server-side proxy for the FastAPI backend.
 *
 * The browser only ever talks to this origin, so the session cookie stays
 * first-party, there is no CORS preflight on the hot path, and the API can live
 * on a private network with no public ingress.
 *
 * This is a route handler rather than a `rewrites()` entry on purpose: Next bakes
 * rewrite destinations into the build manifest, so `API_URL` would become a
 * build-time variable and one image could not be promoted between environments.
 * Read here, it is a runtime variable like every other setting.
 */

const API_URL = (process.env.API_URL ?? "http://localhost:8000").replace(/\/+$/, "");

// Headers that belong to one hop and must not be forwarded.
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "host",
]);

function requestHeaders(req: Request): Headers {
  const out = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) out.set(key, value);
  });
  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = req.headers.get("x-real-ip");
  if (!forwardedFor && ip) out.set("x-forwarded-for", ip);
  return out;
}

function responseHeaders(res: Response): Headers {
  const out = new Headers();
  res.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase()) && key.toLowerCase() !== "set-cookie") out.set(key, value);
  });
  // getSetCookie keeps multiple Set-Cookie headers separate; a plain get() would
  // join them into one broken header.
  for (const cookie of res.headers.getSetCookie?.() ?? []) out.append("set-cookie", cookie);
  return out;
}

async function proxy(req: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  const search = new URL(req.url).search;
  const target = `${API_URL}/${path.map(encodeURIComponent).join("/")}${search}`;

  const hasBody = !["GET", "HEAD"].includes(req.method);
  let body: ArrayBuffer | undefined;
  if (hasBody) {
    // These payloads are small JSON documents, so buffering avoids the duplex
    // streaming requirements and keeps the handler portable across runtimes.
    body = await req.arrayBuffer();
  }

  try {
    const res = await fetch(target, {
      method: req.method,
      headers: requestHeaders(req),
      body: body && body.byteLength > 0 ? body : undefined,
      redirect: "manual",
      cache: "no-store",
    });
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: responseHeaders(res) });
  } catch (err) {
    console.error(`Proxy to ${target} failed:`, err);
    return Response.json(
      { detail: "The analytics service is not reachable right now. Please try again." },
      { status: 502 },
    );
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE, proxy as HEAD, proxy as OPTIONS };
