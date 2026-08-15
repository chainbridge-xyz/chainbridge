# ADR-006: `permissionless` dependency — vendor, don't depend

- **Status:** Accepted
- **Date:** 2026-05-07
- **Decider:** @0xChintan (solo founder)

## Context

`permissionless` (Pimlico's TypeScript library) is the de-facto wrapper for ERC-4337 + viem. It bundles smart-account factories (Safe, Kernel, Light Account), bundler clients, paymaster clients, and UserOp construction helpers. Most ERC-4337 codebases in 2026 depend on it.

In the first 24 hours of working on ChainBridge we hit **two** version-drift failures from `permissionless`:

1. **`npm install` ERESOLVE** — `permissionless@0.2.57` peer-conflicts with the `ox` version that `viem@2.48` ships, even though it's `peerOptional`. Forced `legacy-peer-deps=true` in `.npmrc`.
2. **Breaking API rename within the 0.2.x range:**
   - `ENTRYPOINT_ADDRESS_V07` → `entryPoint07Address` (moved to `viem/account-abstraction`)
   - `signerToSafeSmartAccount` → `toSafeSmartAccount`
   - Two clients (`createPimlicoBundlerClient` + `createPimlicoPaymasterClient`) → one (`createPimlicoClient`)

This forecasts ongoing churn — `permissionless` and `viem` co-evolve, and Pimlico ships breaking changes inside minor versions. ChainBridge's value proposition is *"you don't have to wire this stuff yourself."* That promise breaks if our customers get a permissionless upgrade tax every quarter.

## Decision

**Vendor the slim slice of ERC-4337 helpers that `@chainbridge/wallet` actually needs. Drop `permissionless` as a runtime dependency.**

Specifically, vendor (~250–300 lines of focused code):
- `toSafeSmartAccount` factory — Safe v1.4.1 init code construction, deterministic counterfactual address, signature schema
- UserOp construction — pack, sign, format for entry point v0.7
- Bundler RPC calls — `eth_sendUserOperation`, `eth_getUserOperationReceipt`, `pimlico_getUserOperationGasPrice` (and Alchemy equivalents)
- Paymaster sponsorship requests — POST to verifying paymaster, attach paymaster signature to UserOp

Pin `viem` to a specific minor range. Own the upgrade timing. Customers of `@chainbridge/wallet` see one stable API regardless of upstream churn.

**`permissionless` may still be installed for the spike**, since the spike is throwaway. The vendoring work happens during Phase 1 (`@chainbridge/wallet@0.1`), before any customer ships against it.

## Consequences

### Positive
- Customers experience zero version-drift pain. The whole *raison d'être* of the SDK.
- We control upgrade timing of the underlying primitives.
- ~250 lines is auditable in one sitting. Reduces audit scope and cost.
- Strategic independence — Pimlico can change direction without breaking ChainBridge.

### Negative
- We own the maintenance of those 250 lines forever. ERC-4337 entry point version bumps (v0.7 → v0.8 → ...) are our problem now.
- We forfeit some `permissionless` features we *don't* use today but might want later (other account flavours, complex paymaster flows). Re-implementing has a cost.
- Higher initial bar to ship `@chainbridge/wallet@0.1`: vendoring + tests pushes Phase 1 timeline by ~3–5 days.

### Neutral
- Vendored code lives in `packages/wallet/src/internal/erc4337/` with clear "DO NOT MODIFY without ADR update" comments.
- Tests pin against Base Sepolia mainnet fork — same approach as the spike, scaled.
- We can selectively re-import `permissionless` modules in `apps/` and in the examples repo (where DX matters more than stability) without making it a runtime dep of the published SDK.

## Implementation plan

1. Phase 1 week 1: write `packages/wallet/src/internal/erc4337/` with the vendored helpers. Type-test against viem.
2. Phase 1 week 2: replace spike's `permissionless` imports with vendored helpers. Run side-by-side comparison test against original to verify equivalence.
3. Phase 1 week 3: `permissionless` removed from `dependencies` of `@chainbridge/wallet`'s `package.json`. Stays in `devDependencies` of the spike folder until that folder is deleted.
4. Phase 1 week 4: ship `@chainbridge/wallet@0.1` to npm with no `permissionless` runtime dependency.

## References

- friction.md: setup section, Step 2
- `permissionless` repo: https://github.com/pimlicolabs/permissionless.js
- ADR-002: Smart account flavour (Safe — the only flavour we vendor for v0.1)
- ADR-003: Bundler & paymaster (HTTPS calls we vendor are bundler-agnostic)
