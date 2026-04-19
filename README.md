# Portal

> Two endpoints. One manifest. Any LLM client can visit cold.

**Status:** v0.1 draft · hackathon build in progress (Apr 21–28, 2026) · "Built with Opus 4.7"

Portal is an open HTTP standard that lets any LLM client with function-calling discover and invoke a service's tools without pre-configuration. It is a complement to MCP, not a replacement: MCP = installed tools, Portal = drive-by visits.

- **Pitch:** [visitportal.dev](https://visitportal.dev) *(deploys Day 6)*
- **Spec:** [docs/spec-draft.md](docs/spec-draft.md) *(frozen as `spec-v0.1.0.md` Day 1)*
- **Operating rules:** [docs/CLAUDE.md](docs/CLAUDE.md)

## Repo layout

```
packages/
  spec/           JSON Schema + conformance test vectors
  visit/ts/       TypeScript visitor SDK (@visitportal/visit)
  visit/py/       Python visitor SDK (visitportal on PyPI)
  provider/ts/    Optional provider helper lib
  mcp-adapter/    Wrap an MCP server as a Portal (stretch)
  bench/          Reproducible MCP-vs-Portal benchmark

reference/
  star-screener/  Live reference Portal at starscreener.xyz

web/              visitportal.dev site + install script
scripts/          Root CLIs — `pnpm bench`, `pnpm conformance`
docs/             Spec, one-pager, operating rules, extensions
```

## Getting started

```sh
pnpm install
pnpm -r build
pnpm bench        # runs reproducible benchmark suite
pnpm conformance  # runs spec conformance runner (pass a URL to test a live Portal)
```

Full quickstarts land Day 6:
- `docs/quickstart-provider.md` — ship a Portal in 10 min
- `docs/quickstart-visitor.md` — visit a Portal in 10 lines

## License

Spec: public domain. Code: MIT.

## Status — what's live right now

*This README updates as the hackathon progresses. Scaffolding committed Apr 19, 2026.*
