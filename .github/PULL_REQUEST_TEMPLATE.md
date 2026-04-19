## What
<!-- One sentence on the change -->

## Why
<!-- One sentence on the motivation. Link an issue if applicable. -->

## Verified
- [ ] `pnpm -r test` passes
- [ ] `pnpm -r build` passes (strict tsc)
- [ ] If touching a spec-visible surface: `pnpm --filter @visitportal/spec test` passes
- [ ] If touching SDK: `pnpm --filter @visitportal/visit size` is under 15 kB gzipped
- [ ] Diff under 400 lines
