# ADR-005: Identity registry — deploy our own minimal contract

- **Status:** Accepted
- **Date:** 2026-05-07
- **Decider:** @0xChintan (solo founder)

## Context

ERC-8004 defines an Identity Registry interface for autonomous agents (register, resolve, update agent metadata). Three options:

| Option | Cost | Risk |
|---|---|---|
| **Wait for canonical EF deployment** | $0 | Unbounded timeline. Standard is still draft-track. Could be 6 months or 18. |
| **Use an existing third-party deployment** | $0 | None known on Sepolia or Base Sepolia as of 2026-05. Even if one exists, no guarantee of long-term operation. |
| **Deploy our own minimal contract** | ~half a day of Solidity work + $30 in deployment gas | Low. ~50 lines of Solidity. We control upgrade timing. |

The blocker for Phase 1 is not the contract — it's the SDK interface. Once `identity.register()` returns a stable shape, swapping the backing store later is one adapter file.

## Decision

**Three-stage rollout:**

1. **Now (week 2 spike):** in-memory mock with the right `AgentInfo` shape. Lets the rest of the SDK proceed.
2. **End of Phase 1 (~month 3):** deploy `ChainBridgeIdentityRegistry.sol` (~50 lines: `mapping(bytes32 => AgentInfo)` + `register / resolve / update / events`) on Base Sepolia + Sepolia. Same code, two networks. Open-source it.
3. **If/when EF ships canonical ERC-8004 registry:** ship a proxy adapter so existing ChainBridge `agentId`s continue resolving. Encourage but don't force migration.

Justification:
- We can't gate Phase 1 on something we don't control. Waiting is the worst option.
- ~50 lines of Solidity is half-day work. Deploy cost is rounding error.
- Being the *de facto* registry that other ChainBridge users adopt is brand-equity for free — first-mover advantage on the standard itself.
- The on-chain footprint is tiny; no real lock-in cost if a canonical version supersedes ours later.

## Consequences

### Positive
- Phase 1 is unblocked. SDK shape stays stable across the registry transition.
- ChainBridge becomes the "default" agent identity provider in our ecosystem — every customer agent registered with us is a network effect.
- Open-sourcing the contract earns reputation in the EF working group.

### Negative
- We own a piece of on-chain infrastructure now. Bug = our problem. Audit needed before any meaningful adoption.
- If the canonical registry ships with a different shape, we have to maintain a translation adapter long-term.
- Deploying anything on-chain creates a maintenance commitment, even for ~50 lines.

### Neutral
- The contract is intentionally minimal. **No reputation, no validation logic, no permissions** — those are separate concerns (Module D, ADR-TBD).
- Upgradability: deploy behind a transparent proxy with a 7-day timelock. Enough flexibility, enough security.

## Implementation sketch

```solidity
// Pseudo — to be written for Phase 1
contract ChainBridgeIdentityRegistry {
    struct AgentInfo {
        address controller;
        string name;
        string[] capabilities;
        string endpoint;
        uint256 registeredAt;
    }

    mapping(bytes32 => AgentInfo) public agents;
    event AgentRegistered(bytes32 indexed agentId, address indexed controller);
    event AgentUpdated(bytes32 indexed agentId);

    function register(string calldata name, string[] calldata capabilities, string calldata endpoint) external returns (bytes32);
    function resolve(bytes32 agentId) external view returns (AgentInfo memory);
    function update(bytes32 agentId, ...) external; // controller-only
}
```

## References

- ERC-8004 draft: (link TBD — verify current status)
- friction.md: spike Step 1
- ADR-006: `permissionless` (vendoring philosophy applies to contracts too — own what we ship)
