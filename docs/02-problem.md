[← Back to overview](README.md)

---

**§ 2 · The Problem**

# 02 — Six standards, no glue.

> A serious autonomous agent on Ethereum today has to integrate six independent standards. Each has its own SDK, its own conventions, its own failure modes. None of them know about the others.

| Standard | Purpose | Owned by |
|---|---|---|
| **ERC-8004** | Agent identity, reputation, validation registries | Ethereum Foundation |
| **ERC-4337** | Smart contract wallets (account abstraction) | Ethereum Foundation |
| **ERC-6551** | Token-bound accounts (NFTs that own assets) | Ethereum Foundation |
| **x402** | HTTP-native machine-to-machine payments | Coinbase |
| **MCP** | LLM ↔ tools/data protocol | Anthropic |
| **A2A** | Agent-to-agent communication | Google |

### What developers do today

A team building, for example, an autonomous research agent that earns USDC for delivering reports does all of this by hand:

- Implements ERC-8004 identity registration manually
- Deploys an ERC-4337 smart wallet, integrates a paymaster, manages session keys
- Writes an x402 client and server, handles the 402 challenge, signs payments
- Wires MCP so an LLM can drive the agent's tools
- Implements an A2A agent card so other agents can discover this one
- Hand-rolls reputation read/write against ERC-8004 Reputation Registry
- Adds spending limits, allowlists, anomaly detection, audit logging from scratch

This is **4 to 8 weeks of senior engineering work**. Every team rebuilds it. Every implementation has different bugs. There is no shared security baseline.

> ⚠ **Why this gets worse, not better**
>
> Autonomous agents fail differently from humans. **Speed of loss** — a compromised human wallet drains over hours; a compromised agent drains in seconds. **Prompt injection** — a malicious API response can manipulate an LLM agent into approving a transfer. **Session key sprawl** — agents typically operate on hot session keys, one leak equals full wallet compromise. **No shared incident registry** — when one agent gets exploited, the next team rediscovers the same bug.
>
> Without standardized middleware with security primitives baked in, the first $50M agent exploit is a matter of when, not if.

### The market is forming now

| Signal | Implication |
|---|---|
| ERC-8004 reached Last Call (late 2025) | Identity layer is stabilizing |
| x402 payment volume tripled Q4'25 → Q1'26 | Payment rail is gaining traction |
| 200+ MCP servers shipped in first 6 months | LLM tool integration is mainstream |
| A2A adopted by 5 major frameworks | Discovery protocol is consolidating |
| Olas, Virtuals, Fetch.ai market caps growing | Agent capital is flowing in |

---

[← Previous: § 1 · Executive Summary](01-executive-summary.md) · [Overview](README.md) · [Next: § 3 · The Wedge →](03-wedge.md)
