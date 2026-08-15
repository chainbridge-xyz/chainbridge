/**
 * ─────────────────────────────────────────────────────────────────────────────
 * VENDORED — DO NOT MODIFY without updating ADR-006.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Safe v1.4.1 account construction: the setup initializer, the factory
 * calldata, and the counterfactual CREATE2 address.
 *
 * Behaviourally equivalent to `permissionless@0.2.57`'s `toSafeSmartAccount`
 * for the single-EOA-owner, non-ERC-7579, no-webauthn configuration — the only
 * shape ChainBridge ships (ADR-002). `test/safe-address.test.mjs` pins the
 * equivalence against the address the Week-1 spike actually deployed on Base
 * Sepolia.
 *
 * Deliberately dropped from the upstream implementation: ERC-7579 launchpad,
 * WebAuthn/passkey owners, P256 verifiers, `setupTransactions`, custom
 * payment tokens. Each is a branch we don't use, and every branch we don't
 * vendor is audit surface we don't pay for.
 */

import {
  encodeFunctionData,
  encodePacked,
  getContractAddress,
  hexToBigInt,
  keccak256,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";

import {
  SAFE_141_EP07,
  SAFE_PROXY_CREATION_CODE,
  createProxyWithNonceAbi,
  enableModulesAbi,
  executeUserOpWithErrorStringAbi,
  multiSendAbi,
  setupAbi,
} from "./constants.js";

/** A single call inside a Safe MultiSend batch. `operation` 0 = CALL, 1 = DELEGATECALL. */
interface InternalTransaction {
  to: Address;
  value: bigint;
  data: Hex;
  operation: 0 | 1;
}

/** A call the caller wants the smart account to make. */
export interface Call {
  to: Address;
  value?: bigint | undefined;
  data?: Hex | undefined;
}

/**
 * MultiSend packs each call as
 * `uint8 operation | address to | uint256 value | uint256 dataLength | bytes data`
 * with no padding — hence `encodePacked` rather than standard ABI encoding.
 */
function encodeInternalTransaction(tx: InternalTransaction): string {
  return encodePacked(
    ["uint8", "address", "uint256", "uint256", "bytes"],
    [tx.operation, tx.to, tx.value, BigInt(tx.data.slice(2).length / 2), tx.data],
  ).slice(2);
}

export function encodeMultiSend(txs: readonly InternalTransaction[]): Hex {
  const packed = `0x${txs.map(encodeInternalTransaction).join("")}` as Hex;
  return encodeFunctionData({ abi: multiSendAbi, functionName: "multiSend", args: [packed] });
}

/**
 * The `setup(...)` calldata run against the Safe singleton at proxy creation.
 *
 * It does two things at once: registers the owners/threshold, and
 * DELEGATECALLs SafeModuleSetup to enable the 4337 module — the module is also
 * installed as the fallback handler, which is what lets the EntryPoint call
 * into the account at all.
 *
 * This byte string is hashed into the CREATE2 salt, so *any* change here moves
 * the account address for every existing user.
 */
export function getSafeInitializer(params: {
  owners: readonly Address[];
  threshold: bigint;
}): Hex {
  const enableModules = encodeFunctionData({
    abi: enableModulesAbi,
    functionName: "enableModules",
    args: [[SAFE_141_EP07.module4337]],
  });

  const setupBatch = encodeMultiSend([
    { to: SAFE_141_EP07.moduleSetup, data: enableModules, value: 0n, operation: 1 },
  ]);

  return encodeFunctionData({
    abi: setupAbi,
    functionName: "setup",
    args: [
      params.owners as Address[],
      params.threshold,
      SAFE_141_EP07.multiSend,
      setupBatch,
      SAFE_141_EP07.module4337, // fallback handler
      zeroAddress, // paymentToken
      0n, // payment
      zeroAddress, // paymentReceiver
    ],
  });
}

/**
 * `factoryData` for the UserOp that deploys the account — a call to
 * `SafeProxyFactory.createProxyWithNonce`.
 */
export function getSafeFactoryData(params: {
  owners: readonly Address[];
  threshold: bigint;
  saltNonce: bigint;
}): Hex {
  return encodeFunctionData({
    abi: createProxyWithNonceAbi,
    functionName: "createProxyWithNonce",
    args: [SAFE_141_EP07.singleton, getSafeInitializer(params), params.saltNonce],
  });
}

/**
 * The counterfactual account address — pure, no RPC.
 *
 * CREATE2 over the proxy creation code with the singleton address appended as
 * a constructor argument, salted by `keccak(keccak(initializer), saltNonce)`.
 */
export function computeSafeAddress(params: {
  owners: readonly Address[];
  threshold: bigint;
  saltNonce: bigint;
}): Address {
  const initializer = getSafeInitializer(params);

  const deploymentCode = encodePacked(
    ["bytes", "uint256"],
    [SAFE_PROXY_CREATION_CODE, hexToBigInt(SAFE_141_EP07.singleton)],
  );

  const salt = keccak256(
    encodePacked(
      ["bytes32", "uint256"],
      [keccak256(encodePacked(["bytes"], [initializer])), params.saltNonce],
    ),
  );

  return getContractAddress({
    from: SAFE_141_EP07.proxyFactory,
    salt,
    bytecode: deploymentCode,
    opcode: "CREATE2",
  });
}

/**
 * Encode calls as the account's UserOp `callData`.
 *
 * One call goes through directly; several are batched via MultiSendCallOnly
 * under DELEGATECALL. We use the `…WithErrorString` variant so a reverting
 * inner call surfaces its revert reason instead of an opaque failure — the
 * spike's notes on cryptic bundler errors (friction log, Step 2) are the
 * reason this is the default rather than plain `executeUserOp`.
 */
export function encodeSafeCalls(calls: readonly Call[]): Hex {
  if (calls.length === 0) throw new Error("encodeSafeCalls: no calls to encode");

  let to: Address;
  let value: bigint;
  let data: Hex;
  let operation: 0 | 1 = 0;

  if (calls.length > 1) {
    to = SAFE_141_EP07.multiSendCallOnly;
    value = 0n;
    data = encodeMultiSend(
      calls.map((c) => ({ to: c.to, value: c.value ?? 0n, data: c.data ?? "0x", operation: 0 as const })),
    );
    operation = 1;
  } else {
    const call = calls[0]!;
    to = call.to;
    value = call.value ?? 0n;
    data = call.data ?? "0x";
  }

  return encodeFunctionData({
    abi: executeUserOpWithErrorStringAbi,
    functionName: "executeUserOpWithErrorString",
    args: [to, value, data, operation],
  });
}
