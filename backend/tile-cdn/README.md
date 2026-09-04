# SeaGrid AR tile CDN

Optional PR17 infrastructure for distributing versioned bathymetry manifests and
immutable SGB1 tiles. The Flutter applications remain offline-first; this Worker
is not required for the MVP.

## Cloudflare products

- **Workers** provides the small, read-only HTTP API and response policy.
- **R2** stores manifests and SGB1 tile objects without embedding credentials in
  the mobile apps.
- A **custom domain** can be added after staging validation. Cloudflare Pages is
  not used because the existing product UI remains hosted by Base44.

## Object layout

```text
manifests/{dataset}.json
tiles/{dataset}/{z}/{x}/{y}.sgb1
```

Dataset identifiers are limited to lowercase letters, digits, dots, underscores,
and hyphens. Tile zoom is limited to 0–8, matching the geographic SGB1 plan.

## Local validation

```bash
npm install
npm test
npm run check
npm run dev
```

Local Wrangler development uses a simulated R2 bucket unless `--remote` is
explicitly requested.

## First authenticated setup

Run these commands only after confirming the intended Cloudflare account:

```bash
npx wrangler login
npx wrangler whoami
npx wrangler r2 bucket create seagrid-ar-tiles-dev
npx wrangler r2 bucket create seagrid-ar-tiles
```

Then deploy and verify development before production:

```bash
npm run deploy:dev
curl https://seagrid-tile-cdn-dev.<account-subdomain>.workers.dev/health
npm run deploy:production
```

Do not upload real data until every manifest contains version, source,
attribution, vertical datum, native resolution, creation date, and a SHA-256
digest for every tile. Keep the mobile bathymetry feature flag disabled until
PR12 integrity verification and PR13 honest uncertainty UX are complete.
