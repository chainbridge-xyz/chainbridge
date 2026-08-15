# ADR-001: L2 of choice — Base

- **Status:** Accepted
- **Date:** 2026-05-07
- **Decider:** @0xChintan (solo founder)

## Context

ChainBridge composes six standards. Three of them — **x402** (Coinbase's M2M payment protocol), **ERC-4337** (account abstraction), and **USDC EIP-3009** (`transferWithAuthorization`) — all need an L2 home. The L2 decision touches every other module:

- Bundler/paymaster availability (which providers support it?)
- USDC contract address and EIP-3009 support
- Faucet availability for testnet (developer onboarding)
- Gas economics (what does our 0.3% take rate look like at scale?)

Phase 1 ships single-chain. Multi-chain is Phase 3 work.

## Decision

**Base (mainnet) and Base Sepolia (testnet) are the default L2.**

Justification:
- x402 is shipped by Coinbase and runs natively on Base.
- USDC has first-class support and Circle ships an official Base Sepolia faucet.
- Pimlico, Alchemy, and Stackup all have mature ERC-4337 infrastructure on Base.
- Stable, low-fee, EVM-equivalent, no surprises at runtime.

## Consequences

### Positive
- All six standards work on the default L2 day one.
- Coinbase ecosystem alignment (Coinbase Wallet, Coinbase Developer Platform grants, x402 reference implementations).
- USDC liquidity is deep — no synthetic-stablecoin friction.
- Gas at scale is cheap enough that the 0.3% Settlement take rate has real margin.

### Negative
- Single-chain risk: a Base outage = a ChainBridge outage until multi-chain ships in Phase 3.
- Customers building on Polygon, Arbitrum, Optimism, or BSC have to wait or self-port adapters.
- Coinbase governance of x402 means our fate is partly tied to their roadmap.

### Neutral
- Other EVM L2s (Polygon, Arbitrum, Optimism, BSC) ship through the same adapter pattern in Phase 3 — same SDK API, different chain config object.
- Mainnet Ethereum is explicitly **not** a target — gas economics make x402 micropayments unviable there.

## References

- x402 spec: https://github.com/coinbase/x402
- Base Sepolia USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Pimlico Base support: https://docs.pimlico.io
- Strategic context: [docs/05-architecture.md](../05-architecture.md), [docs/06-roadmap.md](../06-roadmap.md)
