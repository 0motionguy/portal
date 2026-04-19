# Release handoff — v0.1.1

All code / doc / spec work for v0.1.1 is landed on `main`. The five remaining steps each require human auth (2FA, org access, or registrar access) and MUST be run by Mirko.

## 1. Push + tag

```sh
git push origin main
git tag v0.1.1
git push origin v0.1.1
```

## 2. Create the GitHub release

```sh
gh release create v0.1.1 --generate-notes --title "Portal v0.1.1 — audit + first-adopter fixes"
```

The release body can just be `--generate-notes` (auto from commits) or paste the `[0.1.1]` block from `CHANGELOG.md`.

## 3. Pin install-script tag + SHA

```sh
bash scripts/compute-install-sha.sh v0.1.1
```

Copy the two `REPO_REF=` / `REPO_TARBALL_SHA256=` lines into `web/public/install`, and the `$RepoRef` / `$RepoTarballSha256` lines into `web/public/install.ps1`. Commit:

```sh
git add web/public/install web/public/install.ps1
git commit -m "chore(install): pin to v0.1.1 tag + release tarball SHA256"
git push origin main
```

## 4. Publish `@visitportal/spec` to npm (2FA)

```sh
cd packages/spec
pnpm build                                    # emits dist/
npm pack --dry-run                            # sanity-check (expect 13.8 kB, 11 files)
npm publish --access public --otp=XXXXXX      # replace XXXXXX with your OTP
```

After publish:

```sh
curl -s https://registry.npmjs.org/@visitportal/spec | jq '.["dist-tags"]'
# expect: { "latest": "0.1.1" }
```

## 5. Deploy `visitportal.dev` (Vercel + DNS)

### 5a. Deploy

```sh
cd web
vercel --prod
```

Vercel will print the production URL (e.g. `visitportal-abc123.vercel.app`) and prompt for domain config.

### 5b. Domain in Vercel dashboard

In the Vercel dashboard for the project:
- Add domain `visitportal.dev` (apex)
- Add domain `www.visitportal.dev` (redirect → apex)

Vercel will display the required DNS records. As of April 2026 they are typically:

| Type  | Name | Value                    |
|-------|------|--------------------------|
| A     | @    | `76.76.21.21`            |
| CNAME | www  | `cname.vercel-dns.com.`  |

(Confirm the exact values against Vercel's dashboard — they may update their CDN IPs. Use whatever the dashboard shows, not this doc.)

### 5c. Add DNS records at the registrar

Where `visitportal.dev` is registered (Cloudflare / Namecheap / etc.), add the records from step 5b. TTL: 300 seconds is fine.

### 5d. Verify

Once DNS propagates (1–15 min typically):

```sh
curl -sI https://visitportal.dev/            | head -3  # expect 200
curl -sI https://visitportal.dev/docs        | head -3  # expect 200
curl -sI https://visitportal.dev/bench       | head -3  # expect 200
curl -sI https://visitportal.dev/directory   | head -3  # expect 200
curl -fsSL https://visitportal.dev/install | head -12   # expect REPO_REF="v0.1.1"
```

## 6. Reference demo deployment (optional, can defer)

`reference/trending-demo` is configured to deploy to Fly.io as app `trending-demo`. This gives `demo.visitportal.dev` a live endpoint to demo against. The ROADMAP lists this as nice-to-have, not blocking.

```sh
cd reference/trending-demo
flyctl launch --no-deploy --copy-config
flyctl deploy
# Then CNAME demo.visitportal.dev to trending-demo.fly.dev
```

---

## Rollback

If anything goes sideways:

- `npm unpublish` is blocked after 24h. Best recovery is `npm deprecate @visitportal/spec@0.1.1 "use 0.1.2"` and publish a fix.
- `gh release delete v0.1.1` then `git push --delete origin v0.1.1` removes the tag cleanly.
- `vercel rollback` reverts to the prior production deployment.
