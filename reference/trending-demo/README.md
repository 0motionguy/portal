# Star Screener (reference demo)

Reference Portal — trending GitHub repo screener. Three tools: `top_gainers`, `search_repos`, `maintainer_profile`. Manifest displays as "Star Screener (reference demo)"; the package and folder are `trending-demo` to make its role as a demo adopter obvious.

Deploy target: **Fly.io** (`iad` region, auto-start/stop, 256 MB shared-CPU VM). Data: frozen JSON snapshot (no live GitHub fetch — determinism matters for the benchmark).

## Deploy

### Local dev

```sh
pnpm --filter trending-demo dev
# → http://localhost:3075/portal (manifest)
# → http://localhost:3075/healthz
```

The server reads its seed from `src/data/{repos,maintainers}.json` (frozen snapshot, 30 repos + 12 maintainers). Verify integrity any time:

```sh
pnpm --filter trending-demo exec tsx src/data/self-check.ts
```

### Fly.io — first-time setup

Run from the **monorepo root** (Dockerfile needs the workspace context):

```sh
flyctl launch --no-deploy --copy-config --config reference/trending-demo/fly.toml
flyctl deploy --config reference/trending-demo/fly.toml --dockerfile reference/trending-demo/Dockerfile
```

`flyctl launch --no-deploy` reuses the `fly.toml` in this repo; confirm the app name is `trending-demo` and the primary region is `iad`.

### Fly.io — env vars

`PORT=3000` and `NODE_ENV=production` are baked into `fly.toml`. No public URL env var is required because the manifest uses a root-relative `call_endpoint`.

### Health check & manifest smoke test

```sh
curl https://trending-demo.fly.dev/healthz
curl https://trending-demo.fly.dev/portal | jq .
```

`/healthz` is what Fly polls every 30 s. `/portal` is the manifest — it MUST return a v0.1-shaped JSON object.

### Custom demo domain

When DNS for `demo.visitportal.dev` is ready:

```sh
flyctl certs add demo.visitportal.dev --config reference/trending-demo/fly.toml
flyctl certs show demo.visitportal.dev --config reference/trending-demo/fly.toml
```

No manifest change is needed when the custom domain goes live; `call_endpoint` is root-relative.

### Rebuilding the Docker image locally

```sh
# From monorepo root:
docker build -f reference/trending-demo/Dockerfile -t trending-demo:local .
docker run --rm -p 3000:3000 trending-demo:local
curl http://localhost:3000/portal
```
