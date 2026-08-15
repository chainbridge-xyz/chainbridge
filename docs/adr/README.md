# Architecture Decision Records

Each ADR captures one load-bearing technical decision: the context, the call we made, and the consequences we accept. Short by design.

When you change a decision, **don't edit the original ADR** — write a new one that supersedes it, and mark the old one `Superseded by ADR-NNN`. History matters.

## Status legend

| Status | Meaning |
|---|---|
| `Proposed` | Drafted, not yet accepted |
| `Accepted` | Active. This is what we do today. |
| `Deprecated` | Don't follow this anymore, but no replacement |
| `Superseded` | Replaced by a newer ADR (link in the file) |

## Index

| # | Title | Status | Date |
|---|---|---|---|
| [001](001-l2-choice.md) | L2 of choice — Base | Accepted | 2026-05-07 |
| [002](002-smart-account-flavour.md) | Smart account flavour — Safe v1.4.1 | Accepted | 2026-05-07 |
| [003](003-bundler-paymaster.md) | Bundler & paymaster — Pimlico primary, Alchemy AA fallback | Accepted | 2026-05-07 |
| [004](004-settlement-model.md) | x402 settlement model — facilitator default, self-host opt-out | Accepted | 2026-05-07 |
| [005](005-identity-registry.md) | Identity registry — deploy our own minimal contract | Accepted | 2026-05-07 |
| [006](006-permissionless-dependency.md) | `permissionless` dependency — vendor, don't depend | Accepted | 2026-05-07 |

## Format

We use a slim version of [MADR](https://adr.github.io/madr/) — Status, Context, Decision, Consequences, References. No process bureaucracy.
