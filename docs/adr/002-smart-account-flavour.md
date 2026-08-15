# ADR-002: Smart account flavour — Safe v1.4.1

- **Status:** Accepted
- **Date:** 2026-05-07
- **Decider:** @0xChintan (solo founder)

## Context

ERC-4337 doesn't dictate a smart account implementation — it defines the entry point and the UserOp shape. The actual account is up to us. Three serious options:

| Flavour | Maturity | Audit history | Module ecosystem | Code size |
|---|---|---|---|---|
| **Safe v1.4.1** | Battle-tested since 2018 | Most-audited smart contract code in Ethereum history | Largest module library — session keys, social recovery, spending limits, allowlists already exist | Heavier |
| **Kernel (ZeroDev)** | Newer, growing | Audited | Plugin system is clean but smaller library | Lighter |
| **Light Account (Alchemy)** | Newest | Audited | Permissions only — minimal extras | Lightest |

ChainBridge's wallet module ships with security primitives baked in (spending limits, session keys, allowlists, anomaly detection). Two ways to do that: build them ourselves on top of a thin account, or compose pre-built modules from a richer ecosystem.

## Decision

**Safe v1.4.1 is the default smart account flavour.**

Justification:
- Pre-built Safe modules already exist for the security primitives we need: session keys, spending limits, social recovery, allowlists.
- Most-audited account code in the ecosystem — every prevented exploit story compounds.
- Enterprise customers already trust Safe; the brand carries weight in due diligence.
- `permissionless`'s `toSafeSmartAccount` (which we'll vendor — see ADR-006) handles the deployment plumbing.

## Consequences

### Positive
- Day-1 security primitives are mostly assembly, not invention.
- Enterprise sales conversations get easier ("ChainBridge wraps Safe, the standard").
- Heavy audit lineage = stronger insurance pool story for the Pro tier.

### Negative
- Safe is heavier than Kernel/LightAccount. Higher first-deploy gas, marginally larger UserOp calldata.
- Safe modules are a moving target — we inherit their upgrade cadence too.
- Single-flavour bet: if the Safe ecosystem stagnates, our Phase 1 customers are coupled to it.

### Neutral
- The SDK exposes the flavour as a config option in case advanced customers want Kernel or Light Account. We just don't build the SDK's batteries-included experience around them.
- Phase 2+ may add Kernel as a secondary supported flavour if customer demand surfaces.

## References

- Safe smart contracts: https://github.com/safe-global/safe-smart-account
- ERC-4337 entry point v0.7: `0x0000000071727De22E5E9d8BAf0edAc6f37da032`
- ADR-003: Bundler & paymaster
- ADR-006: `permissionless` dependency
