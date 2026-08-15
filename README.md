# ChainBridge

> The standard library for autonomous agents on Ethereum.
> Identity · Payments · Reputation · Orchestration.

`ERC-8004` · `ERC-4337` · `ERC-6551` · `x402` · `MCP` · `A2A`

## Layout

| Folder | What's there |
|---|---|
| [`packages/`](packages/) | [`@chainbridge/pay`](packages/pay/) and [`@chainbridge/wallet`](packages/wallet/), both v0.1 |
| [`contracts/`](contracts/) | [`ChainBridgeIdentityRegistry`](contracts/src/ChainBridgeIdentityRegistry.sol) — live on Base Sepolia |
| [`docs/`](docs/) | Blueprint (15 sections), [ADRs](docs/adr/), [diagrams](docs/diagrams/) |
| [`spike/`](spike/) | Week 1 validation spike — the [friction log](spike/friction.md) is the deliverable |

Siblings: [chainbridge-examples](https://github.com/chainbridge-xyz/chainbridge-examples)
· [chainbridge-docs](https://github.com/chainbridge-xyz/chainbridge-docs)

## Status

**Phase 0 · Validation Sprint** — week 1 of 12

- ✓ Blueprint locked, 6 ADRs ratified
- ✓ Spike run end-to-end — Safe deploy + USDC settlement on Base Sepolia
- ✓ Registry live and source-verified — [`0xD4aeb…B3f2`](https://sepolia.basescan.org/address/0xD4aeb0a8846C9F80ecb396aFD6dd532f2a21B3f2#code)
- ✓ Both wedge modules at v0.1 (ERC-4337 vendored per ADR-006, verified live)
- ✓ Two runnable examples — paid request in 1.3s
- ✓ Docs site — mirrors this repo's prose and diagrams
- ◐ [Friction log](spike/friction.md) — setup timings and open items remain
- ☐ Sepolia deploy (faucet-blocked) · 15 customer interviews · npm publish

## Testing

Offline — no RPC, no API key, no funds:

```bash
npm install && npm test && npm run typecheck   # 16 tests

cd contracts
forge install foundry-rs/forge-std --no-git    # first time only
forge test -vv                                 # 9 tests, incl. fuzz
```

On-chain, needs `spike/.env` and funds. Run this after any change to the
vendored ERC-4337 slice — offline tests can't catch a malformed paymaster
field, because that only fails at on-chain validation:

```bash
set -a && . spike/.env && set +a
node packages/wallet/scripts/live-e2e.mjs
```

The registry needs no code at all — the
[read](https://sepolia.basescan.org/address/0xD4aeb0a8846C9F80ecb396aFD6dd532f2a21B3f2#readContract)
and
[write](https://sepolia.basescan.org/address/0xD4aeb0a8846C9F80ecb396aFD6dd532f2a21B3f2#writeContract)
tabs on Basescan work in a browser.

## The three repos

Clone all three as siblings: the examples resolve packages through `file:`
paths, and the docs site syncs prose from here.

After a change lands here and its tests pass, update both downstream — the
**examples** first, since they consume the packages as a customer does and are
the first thing to notice a broken public API, then the **docs**
(`npm run sync`, commit the regenerated `content/`), so they describe what the
examples actually proved.

## Reading order

[Executive summary](docs/01-executive-summary.md) ·
[Problem](docs/02-problem.md) ·
[Next 30 days](docs/15-next-30-days.md) ·
[Spike](spike/README.md)

## License

[MIT](LICENSE) © 2026 ChainBridge Inc.

---

*Confidential — ChainBridge Inc. 2026*
