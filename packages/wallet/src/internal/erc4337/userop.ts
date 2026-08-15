/**
 * ─────────────────────────────────────────────────────────────────────────────
 * VENDORED — DO NOT MODIFY without updating ADR-006.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * UserOperation construction and Safe4337Module signing for EntryPoint v0.7.
 *
 * Equivalent to `permissionless@0.2.57`'s `accounts/safe/signUserOperation.js`
 * for the single-EOA-owner case. Multi-owner aggregation, WebAuthn dynamic
 * (contract) signatures, and partial-signature collection are intentionally
 * not vendored — see ADR-006.
 */

import { concatHex, pad, toHex, type Address, type Hex } from "viem";

import { ENTRY_POINT_07, EIP712_SAFE_OPERATION_TYPE_V07, SAFE_141_EP07 } from "./constants.js";

/** Anything that can sign EIP-712 typed data — a viem `LocalAccount` fits. */
export interface TypedDataSigner {
  address: Address;
  signTypedData: (args: {
    domain: { chainId: number; verifyingContract: Address };
    types: typeof EIP712_SAFE_OPERATION_TYPE_V07;
    primaryType: "SafeOp";
    message: Record<string, unknown>;
  }) => Promise<Hex>;
}

/** An EntryPoint v0.7 UserOperation in its unpacked (RPC) form. */
export interface UserOperationV07 {
  sender: Address;
  nonce: bigint;
  factory?: Address | undefined;
  factoryData?: Hex | undefined;
  callData: Hex;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymaster?: Address | undefined;
  paymasterVerificationGasLimit?: bigint | undefined;
  paymasterPostOpGasLimit?: bigint | undefined;
  paymasterData?: Hex | undefined;
  signature: Hex;
}

/**
 * A syntactically valid 65-byte ECDSA signature that will never verify.
 *
 * Bundlers need a signature present to estimate gas, but estimation happens
 * before the real one exists. Byte-identical to permissionless's stub so
 * estimates match what the spike measured.
 */
export const DUMMY_ECDSA_SIGNATURE: Hex =
  "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c";

/** Stub signature for gas estimation, with the `validAfter`/`validUntil` prefix. */
export function getStubSignature(): Hex {
  return encodeSafeSignature({ validAfter: 0, validUntil: 0, signature: DUMMY_ECDSA_SIGNATURE });
}

/**
 * Safe4337Module expects `uint48 validAfter | uint48 validUntil | bytes sigs`.
 * The time bounds live in the signature blob, not in the UserOp itself.
 */
function encodeSafeSignature(params: {
  validAfter: number;
  validUntil: number;
  signature: Hex;
}): Hex {
  return concatHex([
    pad(toHex(params.validAfter), { size: 6 }),
    pad(toHex(params.validUntil), { size: 6 }),
    params.signature,
  ]);
}

/** `initCode` as the module hashes it: factory address ++ factory calldata. */
function toInitCode(op: UserOperationV07): Hex {
  return op.factory && op.factoryData ? concatHex([op.factory, op.factoryData]) : "0x";
}

/**
 * `paymasterAndData` as the module hashes it. The two gas limits are 16-byte
 * big-endian fields between the address and the paymaster's own data — get the
 * padding wrong and the signature silently fails on-chain rather than at
 * signing time, which is exactly the class of error the spike found cryptic.
 */
export function toPaymasterAndData(op: UserOperationV07): Hex {
  if (!op.paymaster) return "0x";
  return concatHex([
    op.paymaster,
    pad(toHex(op.paymasterVerificationGasLimit ?? 0n), { size: 16 }),
    pad(toHex(op.paymasterPostOpGasLimit ?? 0n), { size: 16 }),
    op.paymasterData ?? "0x",
  ]);
}

/**
 * Sign a UserOperation as a Safe4337Module `SafeOp`.
 *
 * Note the domain has **no** `name`/`version` — only `chainId` and
 * `verifyingContract` (the 4337 module). That is the module's actual domain;
 * adding the usual name/version fields produces a different digest and an
 * invalid signature.
 */
export async function signSafeUserOperation(params: {
  owner: TypedDataSigner;
  chainId: number;
  userOperation: UserOperationV07;
  validAfter?: number;
  validUntil?: number;
  entryPoint?: Address;
  module4337?: Address;
}): Promise<Hex> {
  const validAfter = params.validAfter ?? 0;
  const validUntil = params.validUntil ?? 0;
  const op = params.userOperation;

  const signature = await params.owner.signTypedData({
    domain: {
      chainId: params.chainId,
      verifyingContract: params.module4337 ?? SAFE_141_EP07.module4337,
    },
    types: EIP712_SAFE_OPERATION_TYPE_V07,
    primaryType: "SafeOp",
    message: {
      safe: op.sender,
      nonce: op.nonce,
      initCode: toInitCode(op),
      callData: op.callData,
      verificationGasLimit: op.verificationGasLimit,
      callGasLimit: op.callGasLimit,
      preVerificationGas: op.preVerificationGas,
      maxPriorityFeePerGas: op.maxPriorityFeePerGas,
      maxFeePerGas: op.maxFeePerGas,
      paymasterAndData: toPaymasterAndData(op),
      validAfter,
      validUntil,
      entryPoint: params.entryPoint ?? ENTRY_POINT_07,
    },
  });

  return encodeSafeSignature({ validAfter, validUntil, signature });
}

/** Serialise a UserOp to the hex-string JSON shape bundlers expect. */
export function toRpcUserOperation(op: UserOperationV07): Record<string, string> {
  const rpc: Record<string, string> = {
    sender: op.sender,
    nonce: toHex(op.nonce),
    callData: op.callData,
    callGasLimit: toHex(op.callGasLimit),
    verificationGasLimit: toHex(op.verificationGasLimit),
    preVerificationGas: toHex(op.preVerificationGas),
    maxFeePerGas: toHex(op.maxFeePerGas),
    maxPriorityFeePerGas: toHex(op.maxPriorityFeePerGas),
    signature: op.signature,
  };
  if (op.factory) rpc["factory"] = op.factory;
  if (op.factoryData) rpc["factoryData"] = op.factoryData;
  if (op.paymaster) {
    rpc["paymaster"] = op.paymaster;
    rpc["paymasterVerificationGasLimit"] = toHex(op.paymasterVerificationGasLimit ?? 0n);
    rpc["paymasterPostOpGasLimit"] = toHex(op.paymasterPostOpGasLimit ?? 0n);
    rpc["paymasterData"] = op.paymasterData ?? "0x";
  }
  return rpc;
}
