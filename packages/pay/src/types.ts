/**
 * x402 wire types.
 *
 * These mirror Coinbase's x402 reference shapes 1:1 so a `@chainbridge/pay`
 * client talks to any compliant x402 server and vice-versa. They are also the
 * exact shapes the Week-1 validation spike proved end-to-end on Base Sepolia
 * (see spike/run.ts, spike/server.ts).
 */

import type { Address, Hex } from "viem";

/** Payment scheme. v0.1 supports `exact` only (a fixed amount per resource). */
export type Scheme = "exact";

/**
 * x402 network identifier. String-typed (not chain id) because that's what the
 * wire protocol carries. Map to a viem chain at the edges.
 */
export type Network = "base-sepolia" | "base" | (string & {});

/**
 * One acceptable way to pay for a resource, as advertised by the server in its
 * HTTP 402 response. A server may advertise several (e.g. different tokens).
 */
export interface PaymentRequirements {
  scheme: Scheme;
  network: Network;
  /** ERC-20 token contract the payment must be denominated in. */
  asset: Address;
  /** Recipient of the funds. */
  payTo: Address;
  /** Required amount in the token's smallest unit (USDC: 6 decimals), as a string. */
  maxAmountRequired: string;
  /** The resource URL this requirement is for. */
  resource: string;
  description: string;
  mimeType: string;
  outputSchema: unknown | null;
  /**
   * EIP-712 domain hints for the token. For EIP-3009 tokens this is the
   * `name`/`version` of the token's domain separator (USDC: name "USDC",
   * version "2"). Carrying it on the wire is what lets the client stay
   * token-agnostic instead of hard-coding USDC.
   */
  extra: { name: string; version: string };
  /** How long (seconds) a signed authorization stays valid. */
  maxTimeoutSeconds: number;
}

/** Body of an HTTP 402 response. */
export interface PaymentRequiredResponse {
  x402Version: 1;
  error?: string;
  accepts: PaymentRequirements[];
}

/**
 * An EIP-3009 `transferWithAuthorization` authorization. All numeric fields are
 * strings on the wire to survive JSON without precision loss; `nonce` is 32
 * random bytes as hex.
 */
export interface Authorization {
  from: Address;
  to: Address;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hex;
}

/** Decoded contents of the `X-PAYMENT` header (it travels base64-encoded). */
export interface PaymentPayload {
  x402Version: 1;
  scheme: Scheme;
  network: Network;
  payload: {
    authorization: Authorization;
    signature: Hex;
  };
}

/**
 * Settlement receipt returned by the server on a successful paid request, and
 * attached to the `Response` by the client as `response.payment`.
 */
export interface PaymentReceipt {
  /** Token contract the payment settled in. */
  asset: Address;
  /** Recipient. */
  payTo: Address;
  /** Amount paid, in the token's smallest unit, as a string. */
  amount: string;
  network: Network;
  /** On-chain settlement tx, if the server settled synchronously. */
  txHash?: Hex;
  blockNumber?: string;
  gasUsed?: string;
}

/** A `Response` with the ChainBridge settlement receipt attached. */
export interface PaidResponse extends Response {
  payment?: PaymentReceipt;
}
