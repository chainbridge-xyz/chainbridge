# ADR-003: Bundler & paymaster — Pimlico primary, Alchemy AA fallback

- **Status:** Accepted
- **Date:** 2026-05-07
- **Decider:** @0xChintan (solo founder)

## Context

ERC-4337 needs two services running outside the chain: a **bundler** (collects UserOps, submits to entry point) and a **paymaster** (sponsors gas so end-users don't need ETH). The major providers as of 2026-05:

| Provider | Bundler | Paymaster | Free tier | Reliability | API stability |
|---|---|---|---|---|---|
| **Pimlico** | Yes | Verifying + sponsorship | Generous | Good on testnets | Some churn (see friction.md) |
| **Alchemy AA** | Yes | Gas Manager | Tied to RPC tier | Best mainnet uptime | Stable |
| **Stackup** | Yes | Yes | Limited | Good | Stable |
| **Biconomy** | Yes | Yes | Limited | Good | Some churn |

The customer's bundler choice matters for both DX (testnet onboarding speed) and SLA (mainnet reliability for production agents).

## Decision

**Pimlico is the SDK's default. Alchemy AA is the documented fallback. The bundler is a configurable option, not a hard-coded dependency.**

Justification:
- Pimlico has the cleanest free tier and the best testnet support — critical for Phase 1 developer onboarding.
- Alchemy has more mature mainnet infrastructure and better SLAs — the right fallback for production.
- ChainBridge calls bundler/paymaster RPCs over plain HTTPS (we vendor the calls — see ADR-006), so swapping providers is a config change, not a code change.

## Consequences

### Positive
- Day-1 onboarding works with a free Pimlico key in 5 minutes.
- Customers approaching production scale can switch to Alchemy AA without re-architecting.
- Self-hosted enterprise can point at their own bundler infrastructure.

### Negative
- We absorb Pimlico's API churn at the SDK layer (see ADR-006 — vendoring `permissionless` is part of how we shield customers from this).
- Two bundler integrations to test means ~2x test surface for the wallet module.

### Neutral
- The SDK ships with a `bundler` config that takes a URL + optional API key. Defaults point at Pimlico's testnet endpoint. Anything ERC-4337-compliant works.
- We do **not** build a custom bundler. That's a different (much harder) business.

## References

- Pimlico docs: https://docs.pimlico.io
- Alchemy AA docs: https://docs.alchemy.com/docs/account-kit-overview
- ERC-4337 spec: https://eips.ethereum.org/EIPS/eip-4337
- ADR-006: `permissionless` dependency
