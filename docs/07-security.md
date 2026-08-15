[← Back to overview](README.md)

---

**§ 7 · Security Model**

# 07 — Five layers. Safe by default.

> Security is not a feature. It is the product. Agents fail differently from humans — losses happen in seconds, not hours.

### ▍ Layer 1 · Wallet hard limits — cannot be bypassed
Daily and per-tx caps at smart contract level. Default-deny allowlists. LLM cannot raise its own limits — only the controller (human or DAO) can.

### ▍ Layer 2 · Session key model
Every agent action signs with a session key, not the root key. Scoped to specific contracts, max amount, 24h TTL. Compromise = bounded loss.

### ▍ Layer 3 · Reputation gating
Agents transact only with counterparties above ERC-8004 score threshold (default 4.0/5.0). New agents (no history) require additional validation.

### ▍ Layer 4 · Validator network for high-value jobs
Jobs above $1,000 require third-party validation. Validators stake into ERC-8004 Validation Registry. Bad validation = slashed.

### ▍ Layer 5 · Anomaly detection + circuit breakers
Spending deviations >3σ trigger automatic pause. Multisig global pause function — sub-60s halt. Webhook + email + Telegram alerts.

> 🔴 **When something goes wrong — the playbook**
>
> - 24/7 incident response Slack for Pro tier
> - Public post-mortem within 72 hours
> - Root cause within 7 days, fix within 14 days
> - Bug bounty program from launch — $5k–$100k tiers via Immunefi
> - Insurance pool funded by 0.1% of x402 payment volume — covers up to $5,000 per SDK-fault incident

---

[← Previous: § 6 · Roadmap](06-roadmap.md) · [Overview](README.md) · [Next: § 8 · Business Model →](08-business-model.md)
