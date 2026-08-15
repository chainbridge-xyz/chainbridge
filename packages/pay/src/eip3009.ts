/**
 * EIP-3009 `transferWithAuthorization` primitives — the signing core of x402.
 *
 * Generalized from the spike, where the EIP-712 domain was hard-coded to USDC.
 * Here `name`/`version` come from the server's advertised `extra` field and the
 * verifying contract is the advertised `asset`, so the same code signs for any
 * EIP-3009 token, not just USDC (friction-log: "Multi-token support").
 */

import {
  verifyTypedData,
  type Account,
  type Address,
  type Hex,
  type TypedDataDomain,
  type WalletClient,
} from "viem";
import type { Authorization } from "./types.js";

/** EIP-712 type definition for `transferWithAuthorization`. */
export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

/** Build the EIP-712 domain for an EIP-3009 token from x402 wire data. */
export function eip3009Domain(params: {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
}): TypedDataDomain {
  return {
    name: params.name,
    version: params.version,
    chainId: params.chainId,
    verifyingContract: params.verifyingContract,
  };
}

/** Coerce the wire (string) authorization into the bigint shape EIP-712 wants. */
function toMessage(auth: Authorization) {
  return {
    from: auth.from,
    to: auth.to,
    value: BigInt(auth.value),
    validAfter: BigInt(auth.validAfter),
    validBefore: BigInt(auth.validBefore),
    nonce: auth.nonce,
  } as const;
}

/**
 * Sign an authorization with an EOA account.
 *
 * NOTE (load-bearing constraint, friction-log Step 3): the signer MUST be an
 * EOA. USDC verifies authorizations with `ecrecover`, so a smart-contract
 * account cannot produce a valid EIP-3009 signature. The account that holds the
 * token and signs here is the EOA, even when the rest of the agent runs through
 * a smart account.
 */
export async function signAuthorization(params: {
  walletClient: WalletClient;
  account: Account;
  domain: TypedDataDomain;
  authorization: Authorization;
}): Promise<Hex> {
  return params.walletClient.signTypedData({
    account: params.account,
    domain: params.domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message: toMessage(params.authorization),
  });
}

/** Verify an authorization signature against the claimed `from` address. */
export async function verifyAuthorization(params: {
  domain: TypedDataDomain;
  authorization: Authorization;
  signature: Hex;
}): Promise<boolean> {
  return verifyTypedData({
    address: params.authorization.from,
    domain: params.domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message: toMessage(params.authorization),
    signature: params.signature,
  });
}

/**
 * Split a 65-byte ECDSA signature into the `(v, r, s)` triple that USDC's
 * on-chain `transferWithAuthorization` takes as separate arguments.
 *
 * Layout: r (32 bytes) | s (32 bytes) | v (1 byte). The spike did this inline
 * and the friction log flagged it as "worth abstracting" — so here it is.
 */
export function splitSignature(signature: Hex): { v: number; r: Hex; s: Hex } {
  const hex = signature.slice(2);
  if (hex.length !== 130) {
    throw new Error(`Expected a 65-byte signature, got ${hex.length / 2} bytes`);
  }
  const r = `0x${hex.slice(0, 64)}` as Hex;
  const s = `0x${hex.slice(64, 128)}` as Hex;
  const v = parseInt(hex.slice(128, 130), 16);
  return { v, r, s };
}
