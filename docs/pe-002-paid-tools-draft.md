# PE-002 — Paid Tools (draft)

**Status:** Draft · v0.1 · Non-normative in base spec · Author: Portal contributors · Last updated: 2026-04-21

---

## Summary

PE-002 defines a minimal, opt-in extension to Portal v0.1 that lets a provider expose **paid tools** — tool calls that require a per-call payment before the provider will execute them. It reuses the HTTP `402 Payment Required` status, is deliberately compatible with [x402](https://x402.org) (the Coinbase payment-handshake convention), and adds exactly one new error code (`PAYMENT_REQUIRED`) plus one manifest declaration.

A visitor that does not understand PE-002 gracefully falls back to the base spec's error semantics: it sees `{ ok: false, code: "PAYMENT_REQUIRED" }` and treats it as a non-recoverable error, the same way it would handle `UNAUTHORIZED`. No other changes to the base spec are required.

## Motivation

Portal's base v0.1 spec intentionally says nothing about payment. The `pricing.model` field is informative, not enforcement. Paid tool use — where the provider will not serve a call until a micropayment has settled — is a real need (paid data APIs, metered compute, bonded-content retrieval) and is actively being standardised through x402 on the agent-web side.

Instead of inventing a competing payment protocol, PE-002:

1. Declares paid tools in the manifest so visitors know which calls require payment.
2. Returns HTTP `402` + a structured challenge on the first unpaid call.
3. Lets the visitor satisfy the challenge with an `X-PAYMENT` header (x402-style) on retry.
4. Stays entirely opt-in. A base-v0.1 visitor that encounters `402` treats it as `PAYMENT_REQUIRED` and bails gracefully.

## Design principles

- **Additive, not load-bearing.** A provider that never serves paid tools is unaffected. A visitor that never calls paid tools is unaffected.
- **Reuse, don't reinvent.** HTTP `402` exists. x402 already defines the header format and settlement protocol. PE-002 is the manifest-declaration + error-code surface that wires x402 into Portal.
- **No new dependencies in base visitor SDKs.** Base `@visitportal/visit` handles PE-002 solely by surfacing a typed `PaymentRequired` error. Settlement is the caller's concern (or lives in a separate package: `@visitportal/x402-adapter`).
- **Manifest is source of truth.** A tool is paid iff the manifest says so. Providers MUST NOT return `402` on a tool not declared paid.

## Manifest declaration

Providers declare PE-002 in the top-level `extensions` array and mark paid tools with `"pricing"` at the tool level:

```json
{
  "portal_version": "0.1",
  "name": "Paid Data Service",
  "brief": "Query premium market data. Each call settles in USDC.",
  "extensions": ["pe-002"],
  "tools": [
    {
      "name": "get_quote",
      "description": "Real-time quote for a ticker.",
      "params": {
        "ticker": { "type": "string", "required": true }
      },
      "pricing": {
        "model": "x402",
        "rate": "0.01 USDC / call",
        "accepts": ["usdc-base"]
      }
    }
  ],
  "call_endpoint": "https://paid.example.com/portal/call",
  "auth": "none",
  "pricing": { "model": "x402", "rate": "per-tool" }
}
```

- `extensions` — array of extension IDs the provider supports. `"pe-002"` means "I speak the paid-tools extension."
- `tools[].pricing.model` — `"x402"` for x402 settlement, `"free"` for free tools in a mixed-pricing manifest. A tool MAY omit `pricing` entirely, in which case it is free by default.
- `tools[].pricing.rate` — human-readable rate string. Informative, not machine-parsed.
- `tools[].pricing.accepts` — optional array of settlement tokens / rails the provider accepts (see x402 §4 for the canonical list).

## Runtime flow

1. Visitor reads the manifest, sees `"extensions": ["pe-002"]` and `tools[].pricing.model = "x402"` on `get_quote`.
2. Visitor POSTs `/portal/call` with `{ "tool": "get_quote", "params": { ... } }` and no payment header.
3. Provider returns **HTTP 402** with body:
   ```json
   {
     "ok": false,
     "error": "payment required",
     "code": "PAYMENT_REQUIRED",
     "payment": {
       "amount": "0.01",
       "currency": "USDC",
       "network": "base",
       "payTo": "0x…",
       "nonce": "…",
       "expiresAt": "2026-04-21T12:34:56Z"
     }
   }
   ```
   The `payment` object is the x402 challenge verbatim; PE-002 does not redefine it.
4. Visitor (or a wrapping adapter) settles the payment per x402 and retries the same POST with `X-PAYMENT: <base64-encoded-payload>`.
5. Provider verifies the payment, executes the tool, and returns `{ "ok": true, "result": … }` with HTTP `200`.

On any failure in the retry (bad payment, expired challenge, insufficient amount), the provider returns `402` again with a fresh challenge. Visitors MUST NOT retry more than once without user consent.

## New error code

PE-002 defines exactly one new value for the `code` field:

| Code | HTTP status | Meaning |
|---|---|---|
| `PAYMENT_REQUIRED` | `402` | This tool requires a per-call payment. The `payment` field in the response body carries the x402 challenge. |

Base-v0.1 visitors treat `PAYMENT_REQUIRED` the same way they treat any unknown code — as a non-recoverable `CallFailed`. PE-002-aware visitors surface a typed `PaymentRequired` error that carries the `payment` challenge.

No other error codes are redefined. `UNAUTHORIZED` still means "credentials missing/invalid"; `PAYMENT_REQUIRED` is specifically "payment missing," not "auth missing."

## Relationship to x402

PE-002 **is not** a new payment protocol. It is the Portal-side declaration and error-code surface that wires x402 into Portal's two-endpoint contract. The `payment` object in the 402 response, the `X-PAYMENT` header, the settlement flow — all defined by x402. PE-002 specifies only:

- How providers declare paid tools in the Portal manifest.
- Which Portal error code maps to the x402 challenge.
- That providers MUST NOT return `402` on tools not declared paid.

A provider that already speaks x402 can become Portal-discoverable by adding the manifest declaration and a 50-LOC adapter (planned: `@visitportal/x402-adapter`).

## What PE-002 is NOT

- **Not a payment processor.** Portal does not settle payments; it declares "this call is paid" and surfaces the x402 challenge.
- **Not normative in base v0.1.** Base-v0.1 conformance vectors do NOT include PE-002. A provider is v0.1-conformant whether or not it speaks PE-002.
- **Not a subscription or API-key model.** `auth: api_key` + off-band billing is the right tool for subscriptions. PE-002 is per-call settlement.
- **Not a wallet spec.** How the visitor holds keys, funds the wallet, and broadcasts payments is out of scope. PE-002 assumes the visitor can satisfy an x402 challenge; the mechanism is the visitor's concern.
- **Not a revenue-sharing or royalty protocol.** PE-002 handshakes payment between one visitor and one provider. Multi-party splits are an ecosystem concern, not a protocol one.

## Open questions

1. **Should `paymentProof` be surfaced in the success envelope?** If the provider executes a paid call, should the `{ ok: true, result }` envelope also carry a `payment: { settledAt, txHash }` for audit? Leaning yes, optional.
2. **Free-tier fallback.** Should a paid tool expose a free degraded mode (e.g. cached, rate-limited) via a separate tool name? Or should that be purely a provider convention? Leaning convention, not spec.
3. **Payment pre-auth / escrow.** For bursty calls, should visitors be able to pre-authorise a budget and have the provider debit it? Probably v0.3, not PE-002.
4. **Which Portal error code maps to "insufficient payment"?** Currently folded into `PAYMENT_REQUIRED` with a fresh challenge. Could split into `INSUFFICIENT_PAYMENT` if we need to distinguish. Leaning no — keep the surface small.
5. **Does `pricing.model: "x402"` at the top level still mean anything when per-tool pricing is declared?** It's informative — "most/all tools here are paid." If per-tool pricing disagrees, per-tool wins. Worth formalising.

## Changelog

- **2026-04-21** — Initial draft. Extracted from the v0.1.4 reframe; no reference implementation yet.
