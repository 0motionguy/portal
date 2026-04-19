# web/ — visitportal.dev

Public face of Portal. Static site: one HTML page, one install script (sh), one
install script (ps1), one directory JSON, one manifest, one Vercel config.

## Layout

```
web/
├── public/
│   ├── index.html       # the one-pager (mirror of docs/one-pager.html + meta)
│   ├── install          # POSIX sh installer, served at /install
│   ├── install.ps1      # PowerShell installer, served at /install.ps1
│   ├── directory.json   # public Portal registry (stub, Day 1)
│   └── manifest.json    # PWA-lite metadata
├── vercel.json          # clean URLs, content-type headers, cache policy
├── package.json         # preview + (no-op) build scripts
└── README.md            # this file
```

`docs/one-pager.html` and `web/public/index.html` are kept **byte-identical** in git.
Edit either one and copy to the other — CI can enforce this later with a
simple `diff -q` check. Meta / og: / manifest tags live in both files; the
`/manifest.json` path resolves on both local preview and the deployed site.

## Preview locally

```sh
# From the monorepo root:
pnpm --filter visitportal-web preview
# opens on http://localhost:5173/
```

or, without pnpm:

```sh
cd web/public && python -m http.server 5173
```

## Deploy to Vercel

```sh
# From the monorepo root:
vercel --cwd web --prod

# or from web/:
cd web && vercel --prod
```

Vercel reads `web/vercel.json`:
- `cleanUrls: true` — `/install` serves `public/install` (no extension).
- `/install` and `/install.ps1` get `content-type: text/plain` so `curl | sh` works.
- `/directory.json` gets `content-type: application/json`.
- All other routes get `cache-control: public, max-age=300, must-revalidate`.

**Domain plan:** `visitportal.vercel.app` goes up first (preview + prod), custom
domain `visitportal.dev` follows once DNS is ready. The install command on the
one-pager is written `curl -fsSL visitportal.dev/install | sh` — that keeps
working without edits once the custom domain is pointed at the Vercel project.

## Install script — safety summary

The installer is intentionally boring.

- No `sudo`, ever. Writes only to `$HOME/.visitportal/`.
- Prints the plan, then prompts y/N. Non-interactive (e.g. `curl | sh`) requires
  `VISITPORTAL_ASSUME_YES=1` — blind pipes without that env var are refused.
- No silent edits to `~/.bashrc` / `~/.zshrc`. The user copies the `export PATH`
  line manually.
- Every network URL is echoed before fetch.
- Idempotent. `--uninstall` removes the install dir with a confirm prompt.
- `--from-local <path>` installs from a local checkout (how we demo today,
  since the repo isn't pushed to GitHub yet).
- `--dry-run` prints the plan and exits.

See `web/public/install` (POSIX sh, macOS + Linux + Git Bash) and
`web/public/install.ps1` (PowerShell 5+, Windows). Same semantics, same flags.

## Where the numbers on the one-pager come from

All token-count claims on `index.html` are produced by
[`packages/bench`](../packages/bench/results/README.md) via Anthropic's
`count_tokens` API. The canonical run is `tokens-matrix-v1.json` (seed 42,
Sonnet 4.5 + Opus 4.5). Re-run with `pnpm --filter @visitportal/bench bench`.
