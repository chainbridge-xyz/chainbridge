[← Back to overview](README.md)

---

**§ 5 · Technical Architecture**

# 05 — Four-layer stack.

### Diagram — ChainBridge Architecture

```
   +---------------------------------------------+
   |  Layer 1 — Unified SDK (TypeScript API)     |
   +---------------------------------------------+
                          |
                          v
   +---------------------------------------------+
   |  Layer 2 — Standards Adapters               |
   |  identity · wallet · TBA · pay · MCP · A2A  |
   +---------------------------------------------+
                          |
                          v
   +---------------------------------------------+
   |  Layer 3 — ChainBridge Settlement           |
   |  Batched payments · 0.3% fee · Base L2      |
   +---------------------------------------------+
                          |
                          v
   +---------------------------------------------+
   |  Layer 4 — Safety                           |
   |  Limits · Session Keys · Circuit Breakers   |
   +---------------------------------------------+
                          |
                          v
                Base L2 / Ethereum
```

### Tech stack

| Component | Choice | Why |
|---|---|---|
| Language | TypeScript | Type safety + dominant in Web3 + AI tooling |
| Ethereum client | viem (primary), ethers adapter | Faster, tree-shakeable; ethers for legacy |
| L2 | Base (primary), Arbitrum, Optimism | Base aligns with x402 (Coinbase) |
| Account abstraction | ERC-4337 via Pimlico/Alchemy bundlers | Battle-tested infrastructure |
| Test framework | Hardhat fork tests + Foundry | Real mainnet contracts, not mocks |
| Test coverage target | 100% on adapters | Security-critical |
| Distribution | npm `@chainbridge/*` + jsDelivr CDN | Standard for Web3 SDKs |
| Dashboard | Next.js 14 + Tailwind + shadcn/ui | Modern, fast to ship |
| Backend | Supabase | Managed, scalable, free tier |
| Audit firms | Trail of Bits or OpenZeppelin (planned) | Trust signal for enterprise |

### Repository structure

```
chainbridge/
├── packages/
│   ├── identity/              # @chainbridge/identity
│   ├── wallet/                # @chainbridge/wallet
│   ├── pay/                   # @chainbridge/pay
│   ├── reputation/            # @chainbridge/reputation
│   ├── bridge/                # @chainbridge/bridge (MCP + A2A)
│   ├── core/                  # Shared types, errors, utils
│   └── settlement/            # Settlement contracts + indexer
├── apps/
│   ├── dashboard/             # Pro tier dashboard (Next.js)
│   └── playground/            # Live agent playground demo
├── contracts/                 # Solidity (Foundry)
├── docs/                      # This blueprint, the ADRs, the diagram source
└── tools/
    └── cli/                   # @chainbridge/cli

chainbridge-examples/          # separate repo — working agent examples
├── paid-api-seller/           # charges for a request, settles on-chain
└── paid-api-consumer/         # provisions an account, pays with one fetch

chainbridge-docs/              # separate repo — the documentation site
├── content/                   # MDX; blueprint + ADRs mirrored from here
└── app/                       # Next.js App Router
```

Two things that could have been folders here are repositories instead.

**Examples** ([chainbridge-examples](https://github.com/chainbridge-xyz/chainbridge-examples))
consume the SDK the way a customer does — as a dependency, not as a sibling
workspace that can reach into internals. An example that resolves through the
monorepo can import an unexported symbol and still pass, which stops it proving
the public API is sufficient.

**Docs** ([chainbridge-docs](https://github.com/chainbridge-xyz/chainbridge-docs))
stay out so a library release doesn't drag a Next.js toolchain with it. The
prose stays here, next to the code it describes, and the site mirrors it in —
so an ADR and the code it governs can still change in one commit.

### Diagram — Agent Lifecycle (Spawn to First Earning)

```
   Owner          ChainBridge SDK          ERC-8004 Registry
     |                  |                          |
     |--register(agent)->|                          |
     |                  |---register on-chain----->|
     |                  |<------agentId------------|
     |                  |                          |
     |--provision()---->|                          |
     |                  |--deploy ERC-4337 wallet->|
     |                  |<-------address-----------|
     |                  |                          |
     |          [Counterparty calls pay.fetch()]   |
     |                  |                          |
     |                  |--check rep + limits      |
     |                  |--batch payment to        |
     |                  |  Settlement (Base)       |
     |                  |--reputation.attest()---->|
```

---

[← Previous: § 4 · Product](04-product.md) · [Overview](README.md) · [Next: § 6 · Roadmap →](06-roadmap.md)
