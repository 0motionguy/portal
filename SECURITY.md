# Security policy

## Reporting a vulnerability

If you find a security issue in Portal, **do not file a public issue or
pull request.** Email `security@visitportal.dev` with:

- A short description of the problem.
- The affected component (spec, SDK, CLI, provider helper, bench, reference).
- A reproduction if you have one.
- Your name or handle, if you want credit.

> **Note:** `security@visitportal.dev` is a placeholder until the domain's
> mail routing is configured post-hackathon. Until then, reach the
> maintainers through the GitHub project owner's contact on their profile.

We aim to:

- **Acknowledge** receipt within 48 hours.
- **Triage** and classify severity within 7 days.
- **Patch** high-severity issues within 14 days of triage, coordinating
  disclosure with the reporter.

## In scope

- `@visitportal/spec` — manifest schema, conformance vectors, runner.
- `@visitportal/visit` — TypeScript visitor SDK.
- `@visitportal/cli` — `visit-portal` CLI.
- `@visitportal/provider` — provider helper library.
- `@visitportal/bench` — reproducible benchmark harness.
- The install script served at `visitportal.dev/install` (curl-to-sh).
- `reference/trending-demo` when run locally.

## Out of scope

- The hackathon live demo deployment (Fly.io / Vercel) — this is a
  moving target during the Apr 21–28 2026 hackathon window. Report
  deployment-only issues via a normal GitHub issue.
- Downstream services wrapped by `@visitportal/mcp-adapter`; those
  ship their own security surface. Report upstream.
- Third-party Portals listed in any public directory.

## Disclosure

We prefer **coordinated disclosure**: we ship a patch, you publish
details after we release. Credit is given by default unless you ask
to stay anonymous.
