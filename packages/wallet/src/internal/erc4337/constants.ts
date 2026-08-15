/**
 * ─────────────────────────────────────────────────────────────────────────────
 * VENDORED — DO NOT MODIFY without updating ADR-006.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Canonical deployment addresses for Safe v1.4.1 + ERC-4337 EntryPoint v0.7,
 * transcribed from `permissionless@0.2.57`
 * (`accounts/safe/toSafeSmartAccount.js` → SAFE_VERSION_TO_ADDRESSES_MAP).
 *
 * These are the addresses the Week-1 spike actually deployed against on Base
 * Sepolia, so they are load-bearing: changing one changes every counterfactual
 * address the SDK has ever handed out. See ADR-002 (Safe v1.4.1) and ADR-006
 * (vendor, don't depend).
 */

import type { Address, Hex } from "viem";

/** ERC-4337 EntryPoint v0.7 — same address on every chain. */
export const ENTRY_POINT_07: Address = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

/** Safe v1.4.1 / EntryPoint v0.7 deployment set. */
export const SAFE_141_EP07 = {
  moduleSetup: "0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47",
  module4337: "0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226",
  proxyFactory: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
  singleton: "0x41675C099F32341bf84BFc5382aF534df5C7461a",
  multiSend: "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526",
  multiSendCallOnly: "0x9641d764fc13c8B624c04430C7356C1C7C8102e2",
} as const satisfies Record<string, Address>;

/**
 * `SafeProxyFactory.proxyCreationCode()` for the v1.4.1 factory above.
 *
 * `permissionless` fetches this with an RPC `readContract` on every address
 * derivation. It doesn't need to: the factory function is `pure` and the
 * factory is deployed at the same address with the same bytecode on every
 * chain. We verified the returned bytes are byte-identical on Base Sepolia and
 * Sepolia (keccak `0x1856e0ee…caf5f`, 486 bytes), so we embed the constant and
 * derive addresses fully offline — no RPC, no network failure mode, usable in
 * a test with no fork.
 *
 * `test/safe-address.test.mjs` pins the hash. If a chain ever disagrees, that
 * assertion is the thing that should fail.
 */
export const SAFE_PROXY_CREATION_CODE: Hex = ("0x" +
    "608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052" +
    "602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffff" +
    "ffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffff" +
    "ff1614156100ca576040517f08c379a000000000000000000000000000000000000000000000" +
    "00000000000081526004018080602001828103825260228152602001806101c4602291396040" +
    "0191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffff" +
    "ffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055" +
    "505060ab806101196000396000f3fe608060405273ffffffffffffffffffffffffffffffffff" +
    "ffffff600054167fa619486e0000000000000000000000000000000000000000000000000000" +
    "000060003514156050578060005260206000f35b3660008037600080366000845af43d600080" +
    "3e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41" +
    "e58e888a9865554c535f2c77126a82cb4c0f917f31441364736f6c63430007060033496e7661" +
    "6c69642073696e676c65746f6e20616464726573732070726f7669646564") as Hex;

/** keccak256 of {@link SAFE_PROXY_CREATION_CODE}. Pinned by the test suite. */
export const SAFE_PROXY_CREATION_CODE_HASH: Hex =
  "0x1856e0ee08399d74e0ea0b03adca210aeade6f748969ac023cdcb4dd62dcaf5f";

/** EIP-712 type for a Safe4337Module operation under EntryPoint v0.7. */
export const EIP712_SAFE_OPERATION_TYPE_V07 = {
  SafeOp: [
    { type: "address", name: "safe" },
    { type: "uint256", name: "nonce" },
    { type: "bytes", name: "initCode" },
    { type: "bytes", name: "callData" },
    { type: "uint128", name: "verificationGasLimit" },
    { type: "uint128", name: "callGasLimit" },
    { type: "uint256", name: "preVerificationGas" },
    { type: "uint128", name: "maxPriorityFeePerGas" },
    { type: "uint128", name: "maxFeePerGas" },
    { type: "bytes", name: "paymasterAndData" },
    { type: "uint48", name: "validAfter" },
    { type: "uint48", name: "validUntil" },
    { type: "address", name: "entryPoint" },
  ],
} as const;

// ── Minimal ABI fragments (only what we call) ───────────────────────────────

export const enableModulesAbi = [
  {
    type: "function",
    name: "enableModules",
    inputs: [{ type: "address[]", name: "modules" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export const multiSendAbi = [
  {
    type: "function",
    name: "multiSend",
    inputs: [{ type: "bytes", name: "transactions" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export const setupAbi = [
  {
    type: "function",
    name: "setup",
    inputs: [
      { type: "address[]", name: "_owners" },
      { type: "uint256", name: "_threshold" },
      { type: "address", name: "to" },
      { type: "bytes", name: "data" },
      { type: "address", name: "fallbackHandler" },
      { type: "address", name: "paymentToken" },
      { type: "uint256", name: "payment" },
      { type: "address", name: "paymentReceiver" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export const createProxyWithNonceAbi = [
  {
    type: "function",
    name: "createProxyWithNonce",
    inputs: [
      { type: "address", name: "_singleton" },
      { type: "bytes", name: "initializer" },
      { type: "uint256", name: "saltNonce" },
    ],
    outputs: [{ type: "address", name: "proxy" }],
    stateMutability: "nonpayable",
  },
] as const;

export const executeUserOpWithErrorStringAbi = [
  {
    type: "function",
    name: "executeUserOpWithErrorString",
    inputs: [
      { type: "address", name: "to" },
      { type: "uint256", name: "value" },
      { type: "bytes", name: "data" },
      { type: "uint8", name: "operation" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export const getNonceAbi = [
  {
    type: "function",
    name: "getNonce",
    inputs: [
      { type: "address", name: "sender" },
      { type: "uint192", name: "key" },
    ],
    outputs: [{ type: "uint256", name: "nonce" }],
    stateMutability: "view",
  },
] as const;
