/**
 * Equivalence tests for the vendored ERC-4337 slice (ADR-006, implementation
 * plan step 2).
 *
 * The oracle is not another library — it's the chain. The Week-1 spike used
 * `permissionless@0.2.57` to derive a Safe address and then actually deployed
 * it on Base Sepolia. If our vendored derivation reproduces that address, it is
 * equivalent to permissionless in the only way that matters.
 *
 *   owner    0x8E0747bA08221d3599472696e74665be21dc6dF0
 *   account  0x4dc738b04445e4fd056A4421276Bf25753fABA52
 *   deploy   0xece8a2055bd25c72941e245d5c38d699fb7f76d07432ccf826e07cb1f0f51e7b
 *
 * All of this runs offline — no RPC, no fork, no API key.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { keccak256, decodeFunctionData, size, slice } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { createSmartWallet, getSmartWalletAddress, ENTRY_POINT_07, SAFE_141_EP07 } from "../dist/index.js";
import {
  SAFE_PROXY_CREATION_CODE,
  SAFE_PROXY_CREATION_CODE_HASH,
  executeUserOpWithErrorStringAbi,
} from "../dist/internal/erc4337/constants.js";
import {
  computeSafeAddress,
  encodeSafeCalls,
  getSafeFactoryData,
} from "../dist/internal/erc4337/safe.js";
import { getStubSignature, signSafeUserOperation } from "../dist/internal/erc4337/userop.js";

// ── The spike's on-chain ground truth ───────────────────────────────────────
const SPIKE_OWNER = "0x8E0747bA08221d3599472696e74665be21dc6dF0";
const SPIKE_ACCOUNT = "0x4dc738b04445e4fd056A4421276Bf25753fABA52";

test("derives the exact Safe address the spike deployed on Base Sepolia", () => {
  const derived = computeSafeAddress({ owners: [SPIKE_OWNER], threshold: 1n, saltNonce: 0n });
  assert.equal(derived.toLowerCase(), SPIKE_ACCOUNT.toLowerCase());
});

test("getSmartWalletAddress agrees, with no client and no network", () => {
  assert.equal(
    getSmartWalletAddress({ owner: SPIKE_OWNER }).toLowerCase(),
    SPIKE_ACCOUNT.toLowerCase(),
  );
});

test("wallet.address is available before any RPC call", () => {
  const owner = privateKeyToAccount(`0x${"11".repeat(32)}`);
  const wallet = createSmartWallet({
    owner,
    chain: { id: 84532 },
    // Deliberately unusable: touching the network here must fail the test.
    publicClient: new Proxy({}, { get: () => () => { throw new Error("network touched"); } }),
    bundlerUrl: "http://invalid.invalid",
  });
  assert.match(wallet.address, /^0x[0-9a-fA-F]{40}$/);
  assert.equal(wallet.owner, owner.address);
  assert.equal(wallet.entryPoint, ENTRY_POINT_07);
});

test("proxy creation code constant matches its pinned hash", () => {
  // If a chain ever returns different bytes from proxyCreationCode(), this is
  // the assertion that should catch it before an address silently moves.
  assert.equal(keccak256(SAFE_PROXY_CREATION_CODE), SAFE_PROXY_CREATION_CODE_HASH);
  assert.equal(size(SAFE_PROXY_CREATION_CODE), 486);
});

test("address is deterministic per owner and varies with saltNonce", () => {
  const a = computeSafeAddress({ owners: [SPIKE_OWNER], threshold: 1n, saltNonce: 0n });
  const again = computeSafeAddress({ owners: [SPIKE_OWNER], threshold: 1n, saltNonce: 0n });
  const salted = computeSafeAddress({ owners: [SPIKE_OWNER], threshold: 1n, saltNonce: 1n });
  const other = computeSafeAddress({
    owners: ["0x0000000000000000000000000000000000000001"],
    threshold: 1n,
    saltNonce: 0n,
  });

  assert.equal(a, again, "same inputs must give the same address");
  assert.notEqual(a, salted, "saltNonce must produce a distinct account");
  assert.notEqual(a, other, "a different owner must produce a distinct account");
});

test("factoryData targets createProxyWithNonce on the v1.4.1 factory", () => {
  const data = getSafeFactoryData({ owners: [SPIKE_OWNER], threshold: 1n, saltNonce: 0n });
  // createProxyWithNonce(address,bytes,uint256)
  assert.equal(slice(data, 0, 4), "0x1688f0b9");
  assert.equal(SAFE_141_EP07.proxyFactory, "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67");
});

test("a single call encodes as a direct executeUserOpWithErrorString", () => {
  const target = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  const encoded = encodeSafeCalls([{ to: target, value: 7n, data: "0xdeadbeef" }]);
  const { args } = decodeFunctionData({ abi: executeUserOpWithErrorStringAbi, data: encoded });
  assert.equal(args[0].toLowerCase(), target.toLowerCase());
  assert.equal(args[1], 7n);
  assert.equal(args[2], "0xdeadbeef");
  assert.equal(args[3], 0, "single call must be CALL, not DELEGATECALL");
});

test("multiple calls batch through MultiSendCallOnly under DELEGATECALL", () => {
  const encoded = encodeSafeCalls([
    { to: "0x0000000000000000000000000000000000000001", data: "0x11" },
    { to: "0x0000000000000000000000000000000000000002", data: "0x22" },
  ]);
  const { args } = decodeFunctionData({ abi: executeUserOpWithErrorStringAbi, data: encoded });
  assert.equal(args[0].toLowerCase(), SAFE_141_EP07.multiSendCallOnly.toLowerCase());
  assert.equal(args[3], 1, "batches must DELEGATECALL into MultiSend");
});

test("encodeSafeCalls rejects an empty batch instead of encoding a no-op", () => {
  assert.throws(() => encodeSafeCalls([]), /no calls to encode/);
});

test("stub signature is the 12-byte time prefix plus a 65-byte ECDSA signature", () => {
  const stub = getStubSignature();
  assert.equal(size(stub), 77);
  // validAfter (6 bytes) and validUntil (6 bytes) both zero.
  assert.equal(slice(stub, 0, 12), "0x000000000000000000000000");
});

test("SafeOp signing is deterministic and carries the time-bound prefix", async () => {
  const owner = privateKeyToAccount(`0x${"22".repeat(32)}`);
  const userOperation = {
    sender: SPIKE_ACCOUNT,
    nonce: 0n,
    callData: encodeSafeCalls([{ to: SPIKE_ACCOUNT, value: 0n, data: "0x" }]),
    callGasLimit: 100000n,
    verificationGasLimit: 200000n,
    preVerificationGas: 50000n,
    maxFeePerGas: 1000000n,
    maxPriorityFeePerGas: 1000000n,
    signature: "0x",
  };

  const a = await signSafeUserOperation({ owner, chainId: 84532, userOperation });
  const b = await signSafeUserOperation({ owner, chainId: 84532, userOperation });
  assert.equal(a, b, "same op on the same chain must sign identically");

  assert.equal(size(a), 77);
  assert.equal(slice(a, 0, 12), "0x000000000000000000000000");

  // Chain id is inside the EIP-712 domain, so a replay on another chain must
  // not produce the same signature.
  const onSepolia = await signSafeUserOperation({ owner, chainId: 11155111, userOperation });
  assert.notEqual(a, onSepolia, "signature must be chain-bound");
});

test("paymaster fields change the signed digest", async () => {
  const owner = privateKeyToAccount(`0x${"33".repeat(32)}`);
  const base = {
    sender: SPIKE_ACCOUNT,
    nonce: 0n,
    callData: "0x",
    callGasLimit: 1n,
    verificationGasLimit: 1n,
    preVerificationGas: 1n,
    maxFeePerGas: 1n,
    maxPriorityFeePerGas: 1n,
    signature: "0x",
  };

  const unsponsored = await signSafeUserOperation({ owner, chainId: 84532, userOperation: base });
  const sponsored = await signSafeUserOperation({
    owner,
    chainId: 84532,
    userOperation: {
      ...base,
      paymaster: "0x0000000000000000000000000000000000000009",
      paymasterVerificationGasLimit: 1000n,
      paymasterPostOpGasLimit: 1000n,
      paymasterData: "0x",
    },
  });

  // This is the ordering bug the wallet guards against: sponsor first, then
  // sign. If these were equal, signing before sponsorship would look fine and
  // fail on-chain.
  assert.notEqual(unsponsored, sponsored);
});
