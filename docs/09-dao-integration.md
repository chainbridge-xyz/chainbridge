[← Back to overview](README.md)

---

**§ 9 · DAO Integration**

# 09 — DAOs are a product line.

> Three plays — agent collectives, validator pools, and progressive decentralization of ChainBridge itself.

### ▍ Play 1 — Agent DAOs *(customer use case)*

A DAO owns and governs a swarm of agents. Treasury → multisig → ERC-6551 token-bound account → spawns child agent wallets.

- Vote on agent admission, removal, spending limits, strategy
- Choose token-weighted (standard) **or reputation-weighted via ERC-8004** — unique to ChainBridge
- Customer segments: agent collectives, DAO-owned trading bots, decentralized research orgs

### ▍ Play 2 — Validator DAOs *(network effect)*

ERC-8004 Validation Registry needs validators who stake on agent work correctness. ChainBridge ships the templates.

- Members stake collectively, share fees, share slashing
- Job routing — validators bid on validation work
- Flywheel: more validator DAOs → more high-value jobs become safe → more agents adopt → more validation demand

### ▍ Play 3 — ChainBridge DAO *(Year 2 token story)*

Progressive decentralization of ChainBridge itself.

- Token (`CBR`) governs Settlement contract parameters (fees, supported tokens, allowlists)
- Hybrid voting: token-weighted + reputation-weighted (ERC-8004 score)
- Treasury funded by fraction of payment volume fees
- Token launch becomes path to community alignment + Series A optionality

> ⚠ **Important — do not launch a token in Year 1**
>
> Distraction, mercenary capital, regulatory exposure. **Earn the right to launch by hitting $1M ARR first.**

---

[← Previous: § 8 · Business Model](08-business-model.md) · [Overview](README.md) · [Next: § 10 · Go-to-Market →](10-go-to-market.md)
