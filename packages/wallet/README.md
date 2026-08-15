# @chainbridge/wallet

> ERC-4337 smart account provisioning for autonomous agents — Safe v1.4.1 on
> Base, with **no `permissionless` dependency**.

The second wedge module, alongside [`@chainbridge/pay`](../pay/). Its reason to
exist is [ADR-006](../../docs/adr/006-permissionless-dependency.md): the
Week-1 spike hit two `permissionless` version-drift failures in 24 hours, so
the ERC-4337 slice we need is vendored into
[`src/internal/erc4337/`](src/internal/erc4337/) rather than pulled from a
dependency that ships breaking changes inside minor versions. `viem` is the
only runtime dependency.

## Usage

```ts
import { createSmartWallet } from "@chainbridge/wallet";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const owner = privateKeyToAccount(process.env.PRIVATE_KEY);
const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });

const wallet = createSmartWallet({
  owner,
  chain: baseSepolia,
  publicClient,
  bundlerUrl: `https://api.pimlico.io/v2/base-sepolia/rpc?apikey=${process.env.PIMLICO_API_KEY}`,
});

wallet.address;                 // known immediately — no RPC, no deployment
await wallet.provision();       // deploys the Safe if needed; idempotent
await wallet.sendCalls([{ to, value, data }]);
```

### The address is free

`wallet.address` is a pure CREATE2 derivation — no network call, no await. You
can show it, fund it, or store it before the account exists on-chain. There's a
standalone helper when you don't need a wallet instance at all:

```ts
import { getSmartWalletAddress } from "@chainbridge/wallet";
getSmartWalletAddress({ owner: "0x8E07…6dF0" }); // -> 0x4dc7…BA52
```

`permissionless` performs an RPC `readContract` for `proxyCreationCode()` on
every address derivation. It doesn't have to: the function is `pure` and we
confirmed the returned bytes are byte-identical on Base Sepolia and Sepolia, so
we embed the constant and pin its hash in the test suite.

### Who pays for gas

The spike found that a paymaster covered the UserOp while the settlement leg
still spent real ETH from the EOA — a P0 in the friction log because silently
guessing wrong costs the user money. So the policy is explicit:

| `gasPolicy` | Behaviour |
|---|---|
| `{ mode: "sponsored" }` | Paymaster must sponsor. Throws `SponsorshipUnavailableError` if it declines. |
| `{ mode: "sponsored-or-self" }` (default) | Try the paymaster, fall back to the owner EOA. |
| `{ mode: "self" }` | Never ask a paymaster. The owner EOA pays. |

Every receipt carries `sponsored: boolean`, and `estimate()` tells you the cost
and the payer *before* you commit:

```ts
const { maxCostWei, sponsored } = await wallet.estimate(calls);
```

When nobody is sponsoring, the owner's balance is checked before submission and
`InsufficientFundsError` names the shortfall — rather than letting the bundler
reject it with the cryptic errors the spike complained about.

## Verification

The vendored code's oracle is the chain, not another library. The spike used
`permissionless` to derive a Safe address and then really deployed it on Base
Sepolia; the test suite asserts our independent derivation reproduces it:

```
owner    0x8E0747bA08221d3599472696e74665be21dc6dF0
account  0x4dc738b04445e4fd056A4421276Bf25753fABA52
deploy   0xece8a2055bd25c72941e245d5c38d699fb7f76d07432ccf826e07cb1f0f51e7b
```

`npm test` — 12 tests, fully offline (no RPC, no fork, no API key). Covers
address equivalence and determinism, the pinned proxy-creation-code hash, call
encoding for single and batched calls, and SafeOp signing (deterministic,
chain-bound, and sensitive to paymaster fields).

`scripts/live-e2e.mjs` is the opt-in on-chain check. Last run:

| | |
|---|---|
| UserOp | [`0x085b01aa…`](https://sepolia.basescan.org/tx/0x085b01aa7170a3756deb059b2ebf43563bd7f5eb3d77008b982ac93486016512) |
| Included | 3.2s, block 45506599 |
| Gas | 146,991 |
| Owner EOA cost | **0** — fully sponsored |

## What's vendored, and what isn't

`src/internal/erc4337/` holds ~600 lines transcribed from
`permissionless@0.2.57` and reduced to the single configuration ChainBridge
ships: one EOA owner, threshold 1, Safe v1.4.1, EntryPoint v0.7.

Deliberately **not** vendored — each is a branch we don't use, and every branch
we skip is audit surface we don't pay for:

- ERC-7579 launchpad / modular accounts
- WebAuthn & passkey owners, P256 verifiers
- Multi-owner signature aggregation and partial-signature collection
- Safe versions other than v1.4.1, EntryPoint v0.6
- Custom setup transactions and payment tokens at deploy time

Two things there are genuinely subtle and worth knowing before touching that
directory:

1. **The `setup(...)` initializer is hashed into the CREATE2 salt.** Any change
   to it — a different module, a different fallback handler — moves the account
   address for every existing user.
2. **Sponsor first, then sign.** Paymaster fields are part of the SafeOp
   digest, so signing before sponsorship yields a valid-looking signature that
   fails on-chain. There's a test pinning this.

## Status

v0.1 — builds clean, 12 offline tests passing, verified live on Base Sepolia.
Not yet published to npm.

Still open, per ADR-006's implementation plan and the friction log:

- ☐ Session keys — not wired. Which layer owns them (Safe module? plugin?) is a
  Phase 1 design question.
- ☐ Spending limits.
- ☐ Alchemy AA bundler tested as the ADR-003 fallback (the code is
  bundler-agnostic; only `pimlico_getUserOperationGasPrice` is provider-specific
  and it degrades to chain fee estimation).
- ☐ Replace the spike's `permissionless` imports with this package (ADR-006
  step 2), then drop it from the spike's devDependencies.
- ☐ Base **mainnet** fork tests.
