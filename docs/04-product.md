[← Back to overview](README.md)

---

**§ 4 · Product — Five Modules**

# 04 — Five composable modules.

> One SDK, five packages. Each maps to a real standard. Use what you need, ignore the rest.

### ▍ Module A — Agent Identity

**Package:** `@chainbridge/identity`

ERC-8004 Identity Registry registration, resolution, A2A agent card emission, capability advertising.

```ts
const agent = await ChainBridge.identity.register({
  name: "ResearchBot-7",
  capabilities: ["web-search", "summarize"],
  endpoint: "https://agent.example.com/a2a",
  controller: ownerAddress,
});
// → registers on ERC-8004, returns persistent agentId
```

### ▍ Module B — Agent Wallet

**Package:** `@chainbridge/wallet`

ERC-4337 smart account deployment, ERC-6551 token-bound accounts for NFT-controlled agents, paymaster integration so agents do not hold ETH, session key management with narrow scope.

```ts
const wallet = await ChainBridge.wallet.provision({
  agent: agent.id,
  spendingLimit: { daily: parseUSDC("100"), perTx: parseUSDC("10") },
  allowlist: ["0xCoinbasePaymaster...", "0xUSDC..."],
  sessionKeyTTL: 86400,
});
```

### ▍ Module C — Agent Payments

**Package:** `@chainbridge/pay`

x402 client and server, batched settlement on Base for gas efficiency, multi-token support, reputation-gated counterparty filtering.

```ts
// Outgoing — agent buys an API call
const result = await ChainBridge.pay.fetch("https://api.somesite.com/data", {
  agent: agent.id,
  maxPayment: parseUSDC("0.05"),
});

// Incoming — agent sells a service
app.post("/inference", ChainBridge.pay.require({ price: "0.10 USDC" }), handler);
```

### ▍ Module D — Reputation & Validation

**Package:** `@chainbridge/reputation`

ERC-8004 Reputation Registry attestations, Validation Registry stake-based work validation, score computation, sybil resistance via stake.

```ts
await ChainBridge.reputation.attest({
  about: counterparty.id,
  rating: 5,
  context: jobReceipt,
});

const score = await ChainBridge.reputation.score(agent.id);
// → { score: 4.7, samples: 142, validatedJobs: 38 }
```

### ▍ Module E — MCP + A2A Bridge

**Package:** `@chainbridge/bridge`

Spin up an MCP server that exposes an agent's on-chain capabilities to any LLM (Claude, GPT, Gemini), emit A2A agent cards with on-chain identity proof.

```ts
ChainBridge.bridge.mcp(agent, {
  tools: ["search", "summarize"],
  payments: "auto", // LLM can spend up to wallet limits
});
```

---

[← Previous: § 3 · The Wedge](03-wedge.md) · [Overview](README.md) · [Next: § 5 · Architecture →](05-architecture.md)
