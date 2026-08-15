# Friction Log — Week 1 Validation Spike

> **The friction log is the deliverable.** The code is throwaway. Every rough edge below is a feature requirement (or a non-requirement) for the SDK.
>
> Format for each entry: **what hurt** · **why it hurt** · **what the SDK should do about it** · **priority** (P0 = must-fix in v0.1, P1 = should-fix, P2 = nice-to-have, ❌ = explicitly out of scope).
>
> Entries marked **[CONFIRMED]** were observed during the spike session. Entries marked **[OPEN]** are still TBD.

---

## Setup friction (env, keys, faucets)

- **[CONFIRMED] `npm install` ERESOLVE conflict** — `permissionless@0.2.57` peer-conflicts with the `ox` version that `viem@2.48` ships, even though it's a `peerOptional`. Fixed by adding `.npmrc` with `legacy-peer-deps=true`.
  - **SDK implication:** every customer who installs `@chainbridge/wallet` and pulls `permissionless` transitively will hit this. **Vendor the slim ERC-4337 helpers we need so we don't propagate this.** **Priority: P0.**

- **[CONFIRMED] `permissionless` 0.2.x had a breaking API rename** within a single minor range:
  - `ENTRYPOINT_ADDRESS_V07` → `entryPoint07Address` (moved to `viem/account-abstraction`)
  - `signerToSafeSmartAccount` → `toSafeSmartAccount`
  - Two clients (`createPimlicoBundlerClient` + `createPimlicoPaymasterClient`) → one (`createPimlicoClient`)
  - viem `getBytecode` → `getCode`
  - **SDK implication:** if we depend on `permissionless` directly, our customers re-experience this churn at every minor bump. Same conclusion as above. **Vendor or freeze.** **Priority: P0.**

- [ ] **Getting Sepolia + Base Sepolia RPC keys (Alchemy)** — minutes spent: ___ — what was confusing: ___
- [ ] **Getting Pimlico API key** — minutes spent: ___ — friction: ___
- [ ] **Funding the test wallet from faucets** — Sepolia faucet rate-limit? Base Sepolia faucet usable? Did Circle USDC faucet work?
- [ ] **Generating a fresh test private key** — was the generator command in `.env.example` clear?

---

## Step 1 — ERC-8004 identity (currently simulated)

- **[CONFIRMED] In-memory mock works fine for the signing-flow tests.** No on-chain state; `agentId` is `keccak256(controller, timestamp)` truncated.
  - **SDK implication:** the SDK can ship the *interface* before any registry exists, then swap the backing store later. Decouple `identity.register()` from "where the registry lives." **Priority: P0.**

- [x] **[RESOLVED] Ship our own minimal registry.** No canonical EF deployment confirmed as of 2026-06; per ADR-005 we wrote [`ChainBridgeIdentityRegistry.sol`](../contracts/src/ChainBridgeIdentityRegistry.sol) (~130 LOC with NatSpec, the logic is ~50). 9 tests passing incl. fuzz. **Deployed to Base Sepolia at [`0xD4aeb0a8846C9F80ecb396aFD6dd532f2a21B3f2`](https://sepolia.basescan.org/address/0xD4aeb0a8846C9F80ecb396aFD6dd532f2a21B3f2)** (938,775 gas, ~$0.00002 at 0.011 gwei). Sepolia deploy still pending — deployer is 9.6× short of the ~0.00097 ETH it needs there.

- **[CONFIRMED] Registry works live on-chain, first try.** `register` cost **253,385 gas** and `resolve` returned the `AgentInfo` unchanged — `string[]` capabilities survive the calldata→storage copy that forced `via_ir`. The predicted `computeAgentId(controller, 0)` matched the id `register` actually assigned.
  - **SDK implication:** `identity.register()` can return the agentId *before* the tx confirms, the same counterfactual trick `wallet.provision()` uses for addresses. Consistent UX across both modules. **Priority: P0.**

- **[CONFIRMED] L1 vs L2 cost gap is ~90×.** Identical bytecode costs ~0.000013 ETH on Base Sepolia and ~0.00097 ETH on Sepolia, purely from gas price (0.011 gwei vs 1.03 gwei). On mainnet the ratio is the whole argument for ADR-001.
  - **SDK implication:** never make L1 registration a required step in any flow. Base is the home chain; L1 presence is opt-in. **Priority: P1.**
- [ ] **[OPEN] Schema friction:** does the spec's `AgentInfo` shape survive contact with real use cases? Capabilities as `string[]` vs structured? Endpoint as URI or DID? *(Contract ships the spike shape verbatim — `string[]` capabilities, `string` endpoint — to revisit after customer interviews.)*
- [x] **[RESOLVED] Identifier format:** `keccak256(abi.encode(controller, nonce))` with a per-controller nonce. Beats the spike's `keccak(controller, timestamp)` (collides within a block) and a global sequential uint256 (leaks supply, blocks multi-agent-per-controller). Locked in the contract.

---

## Step 2 — ERC-4337 smart wallet on Base Sepolia (REAL — fully on-chain)

- **[CONFIRMED] Counterfactual address computed successfully.** `0x4dc738b04445e4fd056A4421276Bf25753fABA52` from owner `0x8E0747bA08221d3599472696e74665be21dc6dF0`. Reproducible — same owner = same counterfactual.
  - **SDK implication:** we can return a usable wallet address before any on-chain action. Good UX. **Priority: P0 (already designed in).**

- **[CONFIRMED] Safe deployed first try via no-op UserOp.** UserOp included **3.6 seconds** after submission. Block 41190991 on Base Sepolia. tx: `0xece8a2055bd25c72941e245d5c38d699fb7f76d07432ccf826e07cb1f0f51e7b`.
  - Gas used: **409,504** (factory deployment + Safe init + no-op call). Paymaster covered all of it — EOA paid zero ETH for this UserOp.
  - **SDK implication:** the "first UserOp deploys the Safe" pattern is reliable enough to ship as the default flow. No pre-deploy step needed in `wallet.provision()`. **Priority: P0 confirmed.**

- **[CONFIRMED] Pimlico paymaster sponsorship worked first try, no setup gotchas.** No special configuration beyond setting the API key.
  - **SDK implication:** we can ship a sane paymaster default and customers don't need to think about it on testnet. Mainnet will require their own sponsor budget — friction we'll surface in Phase 2.

- **[CONFIRMED] 0.0001 ETH on the EOA was enough.** Even though paymaster covered the UserOp gas, the *settlement* tx in step 3 used the EOA directly and consumed real ETH (~0.000008 ETH at current gas prices).
  - **SDK implication:** SDK must distinguish between "paymaster-sponsored" and "EOA-paid" operations and warn ahead of time. **Priority: P0.**

- **[CONFIRMED — vendoring worked, and the estimate was low]** `@chainbridge/wallet` v0.1 reproduces the spike's Safe address with zero `permissionless` runtime dependency. The vendored slice is **542 lines of code** (755 with comments) against ADR-006's "~250–300 lines" estimate — roughly 2×. The overage is all in the bundler JSON-RPC client and the typed error mapping, neither of which ADR-006 counted.
  - **SDK implication:** the estimate was wrong but the decision wasn't. 542 lines is still auditable in one sitting. **No ADR change needed; the line-count figure in ADR-006 should be corrected.**

- **[CONFIRMED] `proxyCreationCode()` is chain-invariant, so address derivation needs no RPC at all.** `permissionless` does a `readContract` against the SafeProxyFactory on *every* address derivation. The function is `pure` and returns byte-identical output on Base Sepolia and Sepolia (keccak `0x1856e0ee…caf5f`, 486 bytes), so we embed the constant.
  - **SDK implication:** `wallet.address` is a synchronous property with no network call and no failure mode — you can derive, display, and fund an agent's address entirely offline. Strictly better UX than the library we replaced. **Priority: P0, shipped.**

- **[CONFIRMED — subtle, would have been a painful bug]** Paymaster fields are hashed into the Safe4337Module EIP-712 digest. **Sponsorship must be requested *before* signing.** Sign first and you get a signature that looks valid locally and fails validation on-chain with no useful error.
  - **SDK implication:** the ordering is now enforced inside `buildUserOperation` and pinned by a test. This is exactly the class of thing the SDK exists to hide. **Priority: P0, shipped.**

- **[CONFIRMED] Repeat UserOps are ~2.8× cheaper than the deploying one.** A no-op self-call on the already-deployed Safe cost **146,991 gas** vs 409,504 for the deploy-and-call. Included in 3.2s, fully sponsored, owner EOA delta exactly 0.
  - tx: `0x085b01aa7170a3756deb059b2ebf43563bd7f5eb3d77008b982ac93486016512` (block 45506599)
  - **SDK implication:** deployment cost is a one-time ~262k-gas premium. Worth surfacing in `estimate()` so customers budgeting a paymaster don't extrapolate the first UserOp across all of them.

- [ ] **[OPEN] Account flavour choice** — Safe v1.4.1 (via permissionless toSafeSmartAccount) worked. Locked by ADR-002. Any reason to swap?
- [ ] **[OPEN] Session keys** — NOT yet wired. Open: which session-key implementation lives at which layer (Safe module? Kernel plugin? Light Account permission?). **Phase 1 task.**

---

## Step 3 — x402 payment (REAL on-chain settlement)

- **[CONFIRMED] HTTP 402 → sign EIP-3009 → retry → 200 with on-chain settlement.** Full round trip in <2 seconds (Action B settled in the very next block after Action A).
  - tx: `0xbf0f72a8cee71e1723c8aad2e320e94118ddddab14902bc35984710734606c1b`
  - block 41190992 (consecutive with the Safe deploy at 41190991)
  - gas: **83,208** for one settlement
  - **SDK implication:** `pay.fetch()` ships as a tight wrapper over `fetch + signTypedData`. **The wedge is technically validated.** Priority: P0 — start writing `@chainbridge/pay`.

- **[CONFIRMED] EIP-3009 typed-data domain is straightforward.** `name: "USDC"`, `version: "2"`, `chainId`, `verifyingContract`. No surprises in production-style implementation.

- **[CONFIRMED] Signature splitting matters for `transferWithAuthorization` calls.** USDC's on-chain function takes `v, r, s` separately, not packed signature. Manual byte-slicing required (or use a viem helper). Worth abstracting in `@chainbridge/pay`.

- **[CONFIRMED] Settlement model decision per ADR-004: Option C (facilitator).** Spike currently runs Option A (synchronous server-side) for simplicity. Production `@chainbridge/pay` will POST signed authorizations to ChainBridge Settlement, which batches them.

- **[CONFIRMED — gas economics for the facilitator model]** At 83,208 gas per settlement and current Base Sepolia gas (<0.1 gwei), one settlement costs ~$0.001 in gas. **Our 0.3% take rate on a $1 payment = $0.003.** Net to ChainBridge after gas: ~$0.002 per settlement. **Batching reduces per-payment gas** — at 10 payments per batch, gas drops to ~$0.0001 each, net margin per payment goes to ~$0.0029. The economics work.

- **[CONFIRMED — major architectural finding]** Smart accounts cannot directly sign EIP-3009 because USDC verifies via ECDSA `ecrecover`. In our spike, the **EOA** holds USDC and signs, not the smart account. This is a real product constraint:
  - **SDK question:** does `@chainbridge/wallet` keep an EOA owner that holds USDC and signs payments, while the smart account is used only for non-payment operations? Or do we route payments through `smartAccount.execute(USDC, transferWithAuthorization, ...)` as a UserOp?
  - **Recommendation:** spike Phase 1 with the EOA-signs pattern (simpler, works today). Investigate UserOp-based settlement as a Phase 2 enhancement.
  - **Priority: P0** — affects every code example we ship.

- **[CONFIRMED — found by writing the examples] Balance lags settlement by well past the receipt.** After `transferWithAuthorization` is mined and the receipt is in hand, a standard RPC still serves `balanceOf` at `latest` from a replica seconds behind. A read straight after payment reported **zero delta for a payment that had definitely happened** — three times in a row. `waitForTransactionReceipt` on our own client did not fix it; only polling did. Reading at the settlement's historical block is exact but needs an archive node (Alchemy's free tier 404s on `eth_call` at a past block).
  - **SDK implication:** the settlement receipt is authoritative the moment we have it; the balance is not. `@chainbridge/pay` should say so loudly in its docs, and we should never build — or let a customer build — a flow that gates on a post-payment balance read. Worth considering a `waitForBalance` helper so nobody rediscovers this. **Priority: P1.**

- **[CONFIRMED] The two packages compose without friction, and the seller side is genuinely four lines.** First time `@chainbridge/wallet` and `@chainbridge/pay` were used together ([chainbridge-examples](https://github.com/chainbridge-xyz/chainbridge-examples)). Full paid request in **1.3s**, settlement 83,240 gas. No API changes were needed to make them work together.
  - **SDK implication:** the module boundary between `wallet` and `pay` survived contact with a real integration — one of the open "SDK design decisions" below. The EOA/smart-account split is explainable in two sentences and needs no glue code.

- [ ] **[OPEN] Underpayment / overpayment handling** — what does the server do if `value` exceeds required? (Refund? Keep? Reject?)
- [ ] **[OPEN] Multi-token support** — spike is USDC-only. ETH? Other stables? Same EIP-3009 flow?
- [ ] **[OPEN] Expiry windows** — `validBefore` of 5 minutes — too short for slow LLM responses? Too long for security?
- [ ] **[OPEN] Replay protection at scale** — in-memory `Set<nonce>` works for spike; production needs Redis or on-chain. Which?

---

## Step 4 — Reputation attestation (currently simulated)

- **[CONFIRMED] Real wallet signature on a JSON blob works.** Attestation stored in-memory array.
  - **SDK implication:** the *signing* side is trivial. The *storage* and *aggregation* sides are where all the real design lives. Treat reputation as Phase 2 work — don't over-design in v0.1. **Priority: P1.**

- [ ] **[OPEN] Where does the attestation live?** EAS (Ethereum Attestation Service)? Custom contract? IPFS pointer + on-chain hash?
- [ ] **[OPEN] Sybil resistance** — spike has none. Minimum viable defence? (Stake? Reputation-of-attester gating? Both?)
- [ ] **[OPEN] Aggregation** — how do we compute a score from N attestations? Simple mean? Bayesian average? Time-decayed?
- [ ] **[OPEN] Privacy** — public by default, or selectively disclosed?

---

## Spike-level observations

- **[CONFIRMED] Full on-chain round-trip in 5.6 seconds.** Safe deployed (3.6s) + USDC settled in next block (~2s). **Way faster than my 20–40s estimate.** Base Sepolia is fast.
  - **SDK implication:** the latency budget for `pay.fetch()` is dominated by bundler-then-confirmation, not by SDK overhead. We don't need clever async tricks for v0.1. **Priority: keep it simple.**

- **[CONFIRMED] Total gas footprint per ChainBridge transaction:**
  - Safe deployment (one-time): 409,504 gas — paid by paymaster, free for the user
  - x402 settlement (per payment): 83,208 gas — paid by EOA / facilitator
  - **Margin math holds** for our 0.3% take rate model. See ADR-004.

- **[CONFIRMED] Two days, two version-drift incidents** (npm peer conflict + permissionless API rename). This is a pattern, not a one-off. **Vendoring is the correct architectural call** — see ADR-006.

- **[CONFIRMED] On-chain artefacts of this run:**
  - Smart account deploy: https://sepolia.basescan.org/tx/0xece8a2055bd25c72941e245d5c38d699fb7f76d07432ccf826e07cb1f0f51e7b
  - x402 settlement: https://sepolia.basescan.org/tx/0xbf0f72a8cee71e1723c8aad2e320e94118ddddab14902bc35984710734606c1b
  - These are the first real on-chain proof points for ChainBridge.

---

## SDK design decisions surfaced by the spike

- [ ] **Module boundaries** — `identity / wallet / pay / reputation / bridge` still feels right after writing the spike? Or did one bleed into another?
- [ ] **Naming** — `agent.id` vs `agent.agentId`. `pay.fetch` vs `pay.send`. Pick now.
- [ ] **Error model** — typed errors vs `throw new Error`? What did you wish the spike threw differently?
- [ ] **Async patterns** — too many awaits in a row? Should the SDK expose composed flows like `agent.payAndAttest()`?
- [ ] **Configuration** — chain config object passed once at SDK init, vs per-call overrides?

---

## Things the spike did NOT cover (intentional out-of-scope for week 1)

- MCP server bridge (Module E)
- A2A agent card emission (Module E)
- ERC-6551 token-bound accounts (alt agent identity)
- Streaming payments (Superfluid-style)
- Multi-agent escrow
- Validator network for high-value jobs
- Anomaly detection / circuit breakers
- The Settlement contract that takes 0.3% (sketch only — needs design)
- Real ERC-4337 deployment (counterfactual only)
- Real x402 settlement (signature only)

---

## Customer interview pull-quotes (week 2)

> Tag the most-mentioned pains here as you run the 15 interviews. The pattern matters more than any single quote.

- (interview 1, name, company, top pain)
- (interview 2, ...)

---

## Decisions to lock by end of week 1

> **All six locked 2026-05-07.** Each decision is ratified in an ADR — see [docs/adr/](../docs/adr/). The friction observed above fed directly into these calls.

- [x] **L2 of choice:** **Base / Base Sepolia.** → [ADR-001](../docs/adr/001-l2-choice.md)
- [x] **Smart account flavour:** **Safe v1.4.1, via vendored helpers (NOT a `permissionless` runtime dep).** → [ADR-002](../docs/adr/002-smart-account-flavour.md) + [ADR-006](../docs/adr/006-permissionless-dependency.md)
- [x] **Bundler/paymaster:** **Pimlico primary, Alchemy AA fallback, bundler URL configurable.** → [ADR-003](../docs/adr/003-bundler-paymaster.md)
- [x] **Settlement model:** **Option C (ChainBridge Settlement facilitator) default; Option A (synchronous self-host) opt-out for enterprise. Option B rejected.** → [ADR-004](../docs/adr/004-settlement-model.md)
- [x] **Identity registry:** **Deploy our own minimal contract — 3-stage rollout (mock now → `ChainBridgeIdentityRegistry.sol` end of Phase 1 → proxy adapter if EF ships canonical).** → [ADR-005](../docs/adr/005-identity-registry.md)
- [x] **`permissionless` dependency:** **Vendor the slim ERC-4337 slice (~250–300 LOC), drop as runtime dep. Stays in spike devDeps only.** → [ADR-006](../docs/adr/006-permissionless-dependency.md)
