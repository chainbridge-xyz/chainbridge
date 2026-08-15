[← Back to overview](README.md)

---

**§ 13 · Risk Analysis**

# 13 — What could kill us.

| Risk | Likelihood | Mitigation |
|---|---|---|
| Coinbase ships unifying SDK themselves | Medium | They're payment-focused. Composing 6 standards is outside their lane. Move fast on identity + reputation. |
| ERC-8004 standard pivots significantly | Medium | Adapter architecture isolates standard-specific code. Stay in EF working group. |
| Major exploit in ChainBridge SDK | Low-Medium | Audit before v1.0. Bug bounty from launch. Insurance pool. Public incident response. |
| Agent market doesn't materialize at projected pace | Medium | Volume-based pricing means slow growth = slow revenue, not negative revenue. Adapt timeline. |
| thirdweb / Olas ships overlapping product | Medium | Stay unopinionated — they're framework-focused, we're middleware. Different positioning. |
| Regulatory action on autonomous agent payments | Low-Medium | Settlement layer can be self-hosted. SDK has no runtime dependencies. |
| **LLM prompt injection causes high-profile loss before mitigations standardize** | **High** | **Ship hard limits + session keys + circuit breakers in v0.1 specifically. Be the safe default.** |

---

[← Previous: § 12 · Fundraising](12-fundraising.md) · [Overview](README.md) · [Next: § 14 · Financials →](14-financials.md)
