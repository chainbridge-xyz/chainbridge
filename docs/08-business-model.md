[← Back to overview](README.md)

---

**§ 8 · Business Model & Profitability**

# 08 — Take rate, not seats.

> The freemium SDK has a ceiling. The volume fee on x402 settlement is the real Stripe analogy — economics that scale with customer success.

### Diagram — Revenue Flow

```
   Customer Agent                                Counterparty
        |                                             ^
        |  $1.00 (x402 payment)                       |
        |                                             |  $0.997
        v                                             |
   +-----------------------+                          |
   | ChainBridge Settlement|--------------------------+
   +-----------------------+
              |
              |  $0.003 (0.3% take rate)
              v
        ChainBridge Revenue
```

### Three revenue streams

| # | Stream | How it works |
|---|---|---|
| 1 | **Volume fees (0.3%)** | 0.3% of x402 payment volume routed through ChainBridge Settlement. Stripe-shaped. Scales with customer success. |
| 2 | **Pro SaaS ($199/mo)** | Per team. Dashboard, alerts, anomaly detection, insurance pool eligibility, priority support. |
| 3 | **Enterprise ($3k–25k/mo)** | Self-hosted Settlement, custom adapters, dedicated security review, SLA, white-label. |

### Pricing tiers

| Tier | Price | Includes |
|---|---|---|
| Open Source | $0 | All 5 modules. Self-managed. Community support. |
| Pro | $199/mo per team + 0.3% volume | Settlement, dashboard, anomaly detection, insurance, priority support |
| Enterprise | $3k–25k/mo (custom) | Self-hosted Settlement, custom adapters, dedicated security review, white-label |

### Path to $1.6M ARR (month 18)

| Source | Volume | Monthly | Annual |
|---|---|---|---|
| 100 Pro teams × $199 | — | $20k | $240k |
| Settlement volume × 0.3% | $30M/mo | $90k | $1.08M |
| 5 Enterprise × $5k | — | $25k | $300k |
| **TOTAL** | | **$135k MRR** | **$1.62M ARR** |

> At Web3 infrastructure multiples (10–20x ARR), this is a **$16M–$32M Series A valuation** by month 18.

### Unit economics

| Metric | Target |
|---|---|
| Gross margin | 80%+ (settlement infra is the main cost) |
| CAC | $300–600 (developer-led, low-touch) |
| Payback period | 3–5 months for Pro, < 2 months for Enterprise |
| Net Revenue Retention | >120% (volume-based pricing scales with customer growth) |

---

[← Previous: § 7 · Security](07-security.md) · [Overview](README.md) · [Next: § 9 · DAO Integration →](09-dao-integration.md)
