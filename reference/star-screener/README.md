# Star Screener

Reference Portal at `starscreener.xyz`. Three tools: `top_gainers`, `search_repos`, `maintainer_profile`.

**Status:** stub — Phase 2 (Apr 21–22) lands the Hono server, manifest, seed data, Dockerfile, and Fly deploy. Domain registered Day 0b per the plan's decisions list.

Deploy target: **Fly.io** (`iad` region, auto-start/stop, 256 MB shared-CPU VM). Data: frozen JSON snapshot (no live GitHub fetch during hackathon — determinism matters for bench).

## Deploy

### Local dev

```sh
pnpm --filter star-screener dev
# → http://localhost:3000/portal (manifest)
# → http://localhost:3000/healthz
```

The server reads its seed from `src/data/{repos,maintainers}.json` (frozen snapshot, 30 repos + 12 maintainers). Verify integrity any time:

```sh
pnpm --filter star-screener exec tsx src/data/self-check.ts
```

### Fly.io — first-time setup

Run from the **monorepo root** (Dockerfile needs the workspace context):

```sh
flyctl launch --no-deploy --copy-config --config reference/star-screener/fly.toml
flyctl deploy --config reference/star-screener/fly.toml --dockerfile reference/star-screener/Dockerfile
```

`flyctl launch --no-deploy` reuses the `fly.toml` in this repo; confirm the app name is `star-screener` and the primary region is `iad`.

### Fly.io — env vars

Set once per app:

```sh
flyctl secrets set PORTAL_PUBLIC_URL=https://starscreener.fly.dev --config reference/star-screener/fly.toml
# ...or the custom domain once DNS is live:
flyctl secrets set PORTAL_PUBLIC_URL=https://starscreener.xyz --config reference/star-screener/fly.toml
```

`PORT=3000` and `NODE_ENV=production` are baked into `fly.toml`.

### Health check & manifest smoke test

```sh
curl https://starscreener.fly.dev/healthz
curl https://starscreener.fly.dev/portal | jq .
```

`/healthz` is what Fly polls every 30 s. `/portal` is the manifest — it MUST return a v0.1-shaped JSON object.

### Custom domain

When DNS for `starscreener.xyz` is ready:

```sh
flyctl certs add starscreener.xyz --config reference/star-screener/fly.toml
flyctl certs show starscreener.xyz --config reference/star-screener/fly.toml
```

Then update `portal.json`'s `call_endpoint` and redeploy so the manifest advertises the custom domain.

### Rebuilding the Docker image locally

```sh
# From monorepo root:
docker build -f reference/star-screener/Dockerfile -t star-screener:local .
docker run --rm -p 3000:3000 star-screener:local
curl http://localhost:3000/portal
```
