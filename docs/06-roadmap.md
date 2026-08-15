[← Back to overview](README.md)

---

**§ 6 · 12-Month Roadmap**

# 06 — 12 months, 5 phases.

### ▍ Phase 0 · Weeks 1–2 — Validation Sprint

*No SDK code. Goal: feel the pain.*

- Interview 15 agent builders (Olas, Virtuals, Fetch.ai, MCP server devs, x402 early users)
- Build a 200-line e2e spike: register → wallet → x402 payment → reputation attest
- Pick wedge module (default bet: wallet + payments)

**Deliverable:** validation report + spike repo

---

### ▍ Phase 1 · Months 1–3 — The Wedge (Wallet + Payments)

*Ship `@chainbridge/agent-sdk@0.1`*

- ERC-4337 smart account provisioning on Base
- x402 client + server with batched settlement
- Spending limits, session keys, paymaster integration
- 5 example apps + 100% test coverage on Base mainnet fork
- Documentation site, landing page, npm publish

**Goal:** 50 GitHub stars · 5 production teams · $0 revenue

---

### ▍ Phase 2 · Months 4–6 — Identity & Reputation

*Pro tier launch · take-rate economics activated*

- Modules A (identity) and D (reputation) shipped
- ERC-8004 Identity + Reputation Registry integration
- Reputation-gated payment filtering
- **Pro tier:** $199/mo + 0.3% take rate on Settlement volume
- Ethereum Foundation ESP grant application

**Goal:** $3k MRR · 200 GitHub stars · 1 grant

---

### ▍ Phase 3 · Months 7–9 — Bridge & Orchestration

*MCP + A2A · Audit clean*

- Module E (MCP + A2A bridge)
- Multi-agent escrow primitives (A pays B contingent on C's validation)
- Streaming payments (x402 + Superfluid-style flows)
- Anomaly detection + circuit breakers in production
- Trail of Bits or OpenZeppelin audit of core SDK + Settlement

**Goal:** $10k MRR · audit clean · first enterprise pilot ($2k/mo)

---

### ▍ Phase 4 · Months 10–12 — DAO Layer & Decentralization

*Network effects activate*

- Agent DAO templates (governance + treasury for agent collectives)
- Validator pool DAO (stake into ERC-8004 Validation Registry as a group)
- Reputation-weighted governance contracts
- Begin progressive decentralization of Settlement parameters

**Goal:** $25k MRR · 3 enterprise contracts · $50M+ cumulative volume

---

[← Previous: § 5 · Architecture](05-architecture.md) · [Overview](README.md) · [Next: § 7 · Security →](07-security.md)
