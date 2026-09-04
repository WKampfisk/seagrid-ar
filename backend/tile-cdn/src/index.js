const DATASET = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const TILE_PATH = /^\/v1\/tiles\/([a-z0-9][a-z0-9._-]{0,63})\/(\d+)\/(\d+)\/(\d+)\.sgb1$/;
const MANIFEST_PATH = /^\/v1\/manifests\/([a-z0-9][a-z0-9._-]{0,63})\.json$/;

function corsHeaders(request, env) {
  const configured = env.ALLOWED_ORIGIN || "*";
  const requestOrigin = request.headers.get("Origin");
  const allowed = configured === "*" || requestOrigin === configured;
  return {
    ...(allowed ? { "Access-Control-Allow-Origin": configured === "*" ? "*" : requestOrigin } : {}),
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "If-None-Match, Range",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, ETag",
    "X-Content-Type-Options": "nosniff",
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function objectHeaders(object, contentType, cacheControl, headers) {
  const result = new Headers(headers);
  object.writeHttpMetadata?.(result);
  result.set("Content-Type", contentType);
  result.set("Cache-Control", cacheControl);
  if (object.httpEtag) result.set("ETag", object.httpEtag);
  if (Number.isFinite(object.size)) result.set("Content-Length", String(object.size));
  return result;
}

async function serveObject(request, bucket, key, contentType, cacheControl, headers) {
  const object = request.method === "HEAD" ? await bucket.head(key) : await bucket.get(key);
  if (!object) return json({ error: "not_found" }, 404, headers);

  const responseHeaders = objectHeaders(object, contentType, cacheControl, headers);
  if (request.headers.get("If-None-Match") === object.httpEtag) {
    return new Response(null, { status: 304, headers: responseHeaders });
  }
  return new Response(request.method === "HEAD" ? null : object.body, {
    status: 200,
    headers: responseHeaders,
  });
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "method_not_allowed" }, 405, { ...headers, Allow: "GET, HEAD, OPTIONS" });
    }

    const { pathname } = new URL(request.url);
    if (pathname === "/health") {
      return json({ ok: true, service: "seagrid-tile-cdn", version: "v1" }, 200, {
        ...headers,
        "Cache-Control": "no-store",
      });
    }

    const manifest = pathname.match(MANIFEST_PATH);
    if (manifest && DATASET.test(manifest[1])) {
      return serveObject(
        request,
        env.TILE_BUCKET,
        `manifests/${manifest[1]}.json`,
        "application/json; charset=utf-8",
        "public, max-age=300, must-revalidate",
        headers,
      );
    }

    const tile = pathname.match(TILE_PATH);
    if (tile && DATASET.test(tile[1])) {
      const [, dataset, zText, xText, yText] = tile;
      const z = Number(zText);
      const x = Number(xText);
      const y = Number(yText);
      const span = 2 ** z;
      if (z > 8 || x >= 360 * span || y >= 180 * span) {
        return json({ error: "invalid_tile" }, 400, headers);
      }
      return serveObject(
        request,
        env.TILE_BUCKET,
        `tiles/${dataset}/${z}/${x}/${y}.sgb1`,
        "application/octet-stream",
        "public, max-age=31536000, immutable",
        headers,
      );
    }

    return json({ error: "not_found" }, 404, headers);
  },
};
