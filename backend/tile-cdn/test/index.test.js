import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const encoder = new TextEncoder();

function object(body, contentType) {
  const bytes = encoder.encode(body);
  return {
    body: bytes,
    size: bytes.byteLength,
    httpEtag: '"fixture-etag"',
    writeHttpMetadata(headers) {
      if (contentType) headers.set("Content-Type", contentType);
    },
  };
}

function environment(entries = {}) {
  return {
    ALLOWED_ORIGIN: "https://app.example.test",
    TILE_BUCKET: {
      async get(key) { return entries[key] || null; },
      async head(key) { return entries[key] || null; },
    },
  };
}

const request = (path, init = {}) => new Request(`https://tiles.example.test${path}`, init);

test("health endpoint is uncached and reports service version", async () => {
  const response = await worker.fetch(request("/health"), environment());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true, service: "seagrid-tile-cdn", version: "v1" });
});

test("manifest is read from the pinned manifest prefix", async () => {
  const env = environment({ "manifests/gebco-2025.json": object('{"version":1}', "application/json") });
  const response = await worker.fetch(request("/v1/manifests/gebco-2025.json"), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("ETag"), '"fixture-etag"');
  assert.match(response.headers.get("Cache-Control"), /must-revalidate/);
  assert.equal(await response.text(), '{"version":1}');
});

test("tile is immutable and uses the SGB1 object key", async () => {
  const env = environment({ "tiles/gebco-2025/2/100/40.sgb1": object("SGB1") });
  const response = await worker.fetch(request("/v1/tiles/gebco-2025/2/100/40.sgb1"), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/octet-stream");
  assert.match(response.headers.get("Cache-Control"), /immutable/);
  assert.equal(await response.text(), "SGB1");
});

test("HEAD returns metadata without a response body", async () => {
  const env = environment({ "tiles/demo/0/1/1.sgb1": object("SGB1") });
  const response = await worker.fetch(request("/v1/tiles/demo/0/1/1.sgb1", { method: "HEAD" }), env);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});

test("conditional request returns 304", async () => {
  const env = environment({ "manifests/demo.json": object("{}") });
  const response = await worker.fetch(request("/v1/manifests/demo.json", {
    headers: { "If-None-Match": '"fixture-etag"' },
  }), env);
  assert.equal(response.status, 304);
});

test("rejects excessive zoom, out-of-range tile indices, and traversal", async () => {
  const env = environment();
  assert.equal((await worker.fetch(request("/v1/tiles/demo/9/0/0.sgb1"), env)).status, 400);
  assert.equal((await worker.fetch(request("/v1/tiles/demo/0/360/0.sgb1"), env)).status, 400);
  assert.equal((await worker.fetch(request("/v1/manifests/..%2Fsecret.json"), env)).status, 404);
});

test("permits only read methods and restricts configured CORS origin", async () => {
  const env = environment();
  const denied = await worker.fetch(request("/health", {
    headers: { Origin: "https://evil.example" },
  }), env);
  assert.equal(denied.headers.get("Access-Control-Allow-Origin"), null);

  const allowed = await worker.fetch(request("/health", {
    headers: { Origin: "https://app.example.test" },
  }), env);
  assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), "https://app.example.test");

  const write = await worker.fetch(request("/v1/manifests/demo.json", { method: "POST" }), env);
  assert.equal(write.status, 405);
  assert.equal(write.headers.get("Allow"), "GET, HEAD, OPTIONS");
});
