# @visitportal/visit

TypeScript visitor SDK for Portal.

**Status:** stub — Phase 3 (Apr 22–23) lands `visit(url)`, typed `.call(tool, params)`, and full Vitest coverage against the shared conformance vectors.

```ts
import { visit } from '@visitportal/visit'

const p = await visit('https://starscreener.xyz/portal')
const { result } = await p.call('top_gainers', { limit: 3 })
```
