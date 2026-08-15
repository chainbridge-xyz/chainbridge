# Vendored ERC-4337 slice

**DO NOT MODIFY without updating [ADR-006](../../../../../docs/adr/006-permissionless-dependency.md).**

Transcribed from `permissionless@0.2.57` and reduced to the one configuration
ChainBridge ships: a single EOA owner, threshold 1, Safe v1.4.1, EntryPoint
v0.7. `permissionless` is not a runtime dependency of this package.

| File | Contents |
|---|---|
| `constants.ts` | Deployment addresses, the pinned proxy creation code, EIP-712 SafeOp type, ABI fragments |
| `safe.ts` | Setup initializer, factory calldata, counterfactual CREATE2 address, call encoding |
| `userop.ts` | UserOperation shape, SafeOp signing, stub signature, RPC serialisation |
| `bundler.ts` | JSON-RPC client — estimate, send, receipt, gas price, sponsorship |

## Two things that will bite you

**The initializer is hashed into the CREATE2 salt.** `getSafeInitializer`
produces the `setup(...)` calldata, and `keccak(initializer)` is the salt. Change
the enabled module, the fallback handler, the owner ordering, or the threshold
and every previously-derived account address moves. Existing users' funds do not
follow. Treat that function as append-only.

**Sponsor before you sign.** `paymasterAndData` is one of the fields inside the
SafeOp EIP-712 digest. Signing a UserOp and *then* attaching paymaster data
yields a signature that looks valid locally and fails at validation on-chain.
`wallet.ts` orders this correctly; `test/safe-address.test.mjs` pins that the
two digests differ.

## Changing anything here

The test suite's oracle is the chain, not another library: the Week-1 spike
derived an address with `permissionless` and really deployed it on Base Sepolia
(`0x4dc738b04445e4fd056A4421276Bf25753fABA52` from owner
`0x8E0747bA08221d3599472696e74665be21dc6dF0`). If a change breaks that
assertion, the change is wrong — not the test.

After any edit, run both:

```bash
npm test                  # offline equivalence, no network needed
node scripts/live-e2e.mjs # real UserOp through a real bundler
```
