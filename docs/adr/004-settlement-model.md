# ADR-004: x402 settlement model — facilitator default, self-host opt-out

- **Status:** Accepted
- **Date:** 2026-05-07
- **Decider:** @0xChintan (solo founder)

> **This is the load-bearing decision for the entire business model.** The 0.3% take rate (see [docs/08-business-model.md](../08-business-model.md)) lives here.

## Context

x402 is a two-step protocol:

1. **Authorization** — client signs an EIP-3009 `transferWithAuthorization` and sends it to the server in an `X-PAYMENT` header. Server verifies the signature and returns the resource.
2. **Settlement** — someone calls `USDC.transferWithAuthorization` on-chain to actually move the funds.

Step 1 is fully decentralised — every party can do it themselves with viem in ~30 lines. Step 2 is where the design space opens up. Three options:

### Option A — Server settles synchronously
Server submits `transferWithAuthorization` to USDC and waits for confirmation before responding. Simple. Reliable.
- ⏱ Slow (10–30 seconds per request including bundler latency).
- 💸 Server pays gas — couples revenue model to gas cost.
- 🔧 Every customer runs their own settlement infrastructure (key management, RPC, retry logic, monitoring).

### Option B — Server settles asynchronously
Server verifies signature, responds 200 immediately, settles in a background worker.
- ⚡ Fast.
- ⚠ Race condition: same nonce can be re-used between verify and settle (USDC's on-chain nonce check eventually catches it, but server is exposed in the gap).
- 🔧 Every customer builds a job queue. High DX cost.

### Option C — Facilitator service (ChainBridge Settlement)
Server POSTs verified authorizations to ChainBridge Settlement. Settlement batches many authorizations and submits in one transaction periodically (or sub-second for premium tier).
- ⚡ Fast response from server (no on-chain wait).
- 💸 Customer pays no gas; ChainBridge takes 0.3% of payment volume to cover gas + margin.
- 🔧 Customer integration is one HTTP POST. No infra.
- 🤝 Trust trade-off: customer trusts ChainBridge to settle accurately. Mitigated by audited Settlement contract + signed receipts.

## Decision

**Default: Option C (ChainBridge Settlement facilitator). Opt-out: Option A (synchronous self-host) for enterprise.**

The SDK's `pay.require()` middleware ships preconfigured to POST to ChainBridge Settlement. A config flag (`settlement: "self-host"`) switches to Option A — the customer's own server submits `transferWithAuthorization` directly. **Option B is explicitly rejected** as the default — the race-condition surface area is not worth the latency win.

This is **the** SDK design decision that defines the business. Without C, ChainBridge is "another wrapper SDK" with a $99/mo seat-license ceiling. With C, ChainBridge sits in the payment flow and earns volume fees — Stripe-shaped economics.

## Consequences

### Positive
- 0.3% take rate on all settled volume. Path to $1.62M ARR by month 18 depends on this.
- Customer DX: integrate in 5 minutes, no infra, no gas, no key management for settlement.
- Insurance pool (see [docs/07-security.md](../07-security.md)) is funded directly from settled volume.
- Settlement contract deployment becomes the Series-A-defining asset.

### Negative
- We become a critical dependency for every ChainBridge-using agent. Outage = customer outage. SLA pressure starts day 1 of production.
- The Settlement contract requires a security audit before any meaningful volume. Phase 3 milestone, $30–80k cost.
- Regulatory exposure: facilitating M2M payments at scale may trigger money-transmitter scrutiny depending on jurisdiction. **Action item: legal review before mainnet launch.**
- Customers in regulated industries (banks, healthcare) may require Option A (self-host) to meet compliance — supported, but at the cost of 0.3% revenue from those customers.

### Neutral
- Self-hosted Option A is a feature, not a fallback. Some Enterprise contracts explicitly want it. Document it as first-class.
- Settlement contract is upgradeable behind a multisig until the DAO layer ships in Phase 4.
- We pause settlement on any anomaly (see ADR-TBD: circuit breakers) — better to halt than to settle a fraud.

## References

- x402 spec: https://github.com/coinbase/x402
- USDC EIP-3009 (`transferWithAuthorization`): https://eips.ethereum.org/EIPS/eip-3009
- Business model: [docs/08-business-model.md](../08-business-model.md)
- Security model: [docs/07-security.md](../07-security.md)
- friction.md: spike Step 3 — settlement timing
