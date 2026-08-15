# ChainBridge contracts

Foundry project for ChainBridge's on-chain components.

## ChainBridgeIdentityRegistry

A minimal ERC-8004-shaped Identity Registry for autonomous agents — implements
[ADR-005](../docs/adr/005-identity-registry.md) stage 2 ("deploy our own minimal
contract" rather than wait for a canonical ERC-8004 deployment).

Surface: `register` · `resolve` · `update` · `transferController` ·
`isRegistered` · `controllerOf` · `computeAgentId`. Intentionally tiny — no
reputation, no validation, no permissions beyond "the controller owns its
record" (those are separate concerns / Module D).

The `AgentInfo` shape matches the spike's in-memory mock (`spike/run.ts`) so the
SDK swaps its mock backing store for this contract behind a stable `identity.*`
interface, no shape change.

**Identifier format** (resolves the friction-log "Identifier format" open item):
`agentId = keccak256(abi.encode(controller, nonce))` with a per-controller nonce.
Chosen over the spike's timestamp-based id (collides within a block) and over a
global sequential uint256 (leaks supply, no multi-agent-per-controller).

## Setup

```bash
cd contracts
forge install foundry-rs/forge-std --no-git   # restores lib/ (gitignored)
forge build
forge test -vv
```

> Requires `via_ir = true` (set in `foundry.toml`) — `register`/`update` copy a
> nested `string[]` from calldata to storage, which the legacy codegen can't do.

## Deploy

Reads `PRIVATE_KEY`, `BASE_SEPOLIA_RPC`, `SEPOLIA_RPC` (and optionally
`ETHERSCAN_API_KEY`) from the environment. **Use a fresh test key.**

```bash
# Base Sepolia
forge script script/DeployIdentityRegistry.s.sol \
  --rpc-url base_sepolia --broadcast --verify -vvvv

# Sepolia (same bytecode, second network — ADR-005)
forge script script/DeployIdentityRegistry.s.sol \
  --rpc-url sepolia --broadcast --verify -vvvv
```

## Deployments

| Network | Address | Deploy tx | Source |
|---|---|---|---|
| Base Sepolia (84532) | [`0xD4aeb0a8846C9F80ecb396aFD6dd532f2a21B3f2`](https://sepolia.basescan.org/address/0xD4aeb0a8846C9F80ecb396aFD6dd532f2a21B3f2) | [`0x3b8c02c9…`](https://sepolia.basescan.org/tx/0x3b8c02c90f412a00b5c5c0afadff8b6a18f0eea523b9355b19638f2502b6f212) — block 45506000, 938,775 gas | ✓ [verified](https://sepolia.basescan.org/address/0xD4aeb0a8846C9F80ecb396aFD6dd532f2a21B3f2#code) |
| Sepolia (11155111) | _not yet — deployer underfunded_ | — | — |

Verified source is public on Basescan: solc `v0.8.24+commit.e11b9ed9`, optimizer
on at 200 runs, no constructor arguments, not a proxy. The
[read](https://sepolia.basescan.org/address/0xD4aeb0a8846C9F80ecb396aFD6dd532f2a21B3f2#readContract)
and
[write](https://sepolia.basescan.org/address/0xD4aeb0a8846C9F80ecb396aFD6dd532f2a21B3f2#writeContract)
tabs are live, so `register` / `resolve` are callable from the browser without
the SDK — useful for customer demos during the interview round.

To re-verify after a redeploy:

```bash
forge verify-contract <address> \
  src/ChainBridgeIdentityRegistry.sol:ChainBridgeIdentityRegistry \
  --chain base-sepolia --etherscan-api-key "$ETHERSCAN_API_KEY" --watch
```

**Live smoke test** on the Base Sepolia deployment — `computeAgentId(deployer, 0)`
predicted `0x5b97cdf9…f683`, `register("chainbridge-smoke-agent", ["inference",
"settlement"], …)` produced exactly that id (253,385 gas,
[tx `0xbb412564…`](https://sepolia.basescan.org/tx/0xbb412564d78f1c7436c5d933f920a65a673f2f294704e39a1eb9d634cfaee00b)),
and `resolve` returned the record intact. The counterfactual-id property holds
on-chain, not just in the fuzz test.

## Status

- ✓ Contract written, 9 tests passing (incl. fuzz)
- ✓ Deployed to Base Sepolia + proven by a live register/resolve round trip
- ✓ Source verified on Basescan — ABI and read/write tabs public
- ☐ Deployed to Sepolia — blocked on funding: deploy needs ~0.00097 ETH at
  ~1 gwei, deployer holds 0.0001 ETH (9.6× short). Top up from a Sepolia faucet
  and re-run the script with `--rpc-url sepolia`.
- ☐ Spike `identity` mock swapped for this contract
- ☐ Audit before meaningful adoption (ADR-005, "Negative")
