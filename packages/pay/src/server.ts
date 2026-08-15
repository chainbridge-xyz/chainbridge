/**
 * The seller side of x402 — verify an `X-PAYMENT` header and (optionally) settle.
 *
 * Generalized from spike/server.ts. Two friction-log open questions are resolved
 * structurally here:
 *
 *   - Replay protection ("in-memory Set works for spike; production needs Redis
 *     or on-chain") → a pluggable `ReplayStore` interface. Default is in-memory;
 *     swap it without touching call sites.
 *   - Settlement model (ADR-004: facilitator default, self-host opt-out) → the
 *     settlement step is an injectable `SettlementStrategy`. `selfHostSettlement`
 *     (Option A) ships now; a facilitator strategy (Option C) plugs in later
 *     behind the same interface.
 *
 * The core (`verifyPayment`, `requirePayment`) is framework-agnostic. A thin
 * Node `http` adapter (`createPaidHandler`) is provided for drop-in use.
 */

import {
  type Account,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { eip3009Domain, splitSignature, verifyAuthorization } from "./eip3009.js";
import type {
  Authorization,
  Network,
  PaymentPayload,
  PaymentReceipt,
  PaymentRequiredResponse,
  PaymentRequirements,
} from "./types.js";

// ───────────────────────── replay protection ─────────────────────────

/**
 * Tracks spent authorization nonces. The default is in-memory and therefore
 * per-process — fine for a single node, NOT safe across a horizontally-scaled
 * fleet. For production, back this with Redis (shared) or rely on the token's
 * own on-chain nonce check (authoritative but only after settlement confirms).
 */
export interface ReplayStore {
  has(nonce: Hex): Promise<boolean> | boolean;
  add(nonce: Hex): Promise<void> | void;
}

export function inMemoryReplayStore(): ReplayStore {
  const seen = new Set<string>();
  return {
    has: (nonce) => seen.has(nonce),
    add: (nonce) => void seen.add(nonce),
  };
}

// ───────────────────────── settlement strategies ─────────────────────────

export interface SettlementResult {
  txHash: Hex;
  blockNumber: bigint;
  gasUsed: bigint;
}

/** Moves the funds on-chain (or off to a facilitator). Injected into the guard. */
export type SettlementStrategy = (
  authorization: Authorization,
  signature: Hex,
) => Promise<SettlementResult>;

const TRANSFER_WITH_AUTHORIZATION_ABI = [
  {
    name: "transferWithAuthorization",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

/**
 * ADR-004 Option A — the seller's own EOA submits `transferWithAuthorization`
 * and waits for confirmation. Simple and self-custodial; the seller pays gas.
 */
export function selfHostSettlement(params: {
  walletClient: WalletClient;
  publicClient: PublicClient;
  account: Account;
  asset: Address;
  confirmationTimeoutMs?: number;
}): SettlementStrategy {
  return async (authorization, signature) => {
    const { v, r, s } = splitSignature(signature);
    const txHash = await params.walletClient.writeContract({
      account: params.account,
      chain: params.walletClient.chain ?? null,
      address: params.asset,
      abi: TRANSFER_WITH_AUTHORIZATION_ABI,
      functionName: "transferWithAuthorization",
      args: [
        authorization.from,
        authorization.to,
        BigInt(authorization.value),
        BigInt(authorization.validAfter),
        BigInt(authorization.validBefore),
        authorization.nonce,
        v,
        r,
        s,
      ],
    });
    const receipt = await params.publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: params.confirmationTimeoutMs ?? 120_000,
    });
    return { txHash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed };
  };
}

// ───────────────────────── verification ─────────────────────────

export interface PaymentTerms {
  payTo: Address;
  asset: Address;
  network: Network;
  /** Required amount in the token's smallest unit, as a string. */
  amount: string;
  /** EIP-712 token domain hints (USDC: { name: "USDC", version: "2" }). */
  tokenDomain: { name: string; version: string };
  chainId: number;
  resource: string;
  description?: string;
  mimeType?: string;
  /** Authorization validity window the client should use. Default 300s. */
  maxTimeoutSeconds?: number;
}

export type VerifyResult =
  | { ok: true; authorization: Authorization; signature: Hex }
  | { ok: false; reason: string };

/** Build the HTTP 402 body advertising these terms. */
export function paymentRequirements(terms: PaymentTerms, error?: string): PaymentRequiredResponse {
  const requirement: PaymentRequirements = {
    scheme: "exact",
    network: terms.network,
    asset: terms.asset,
    payTo: terms.payTo,
    maxAmountRequired: terms.amount,
    resource: terms.resource,
    description: terms.description ?? "",
    mimeType: terms.mimeType ?? "application/json",
    outputSchema: null,
    extra: terms.tokenDomain,
    maxTimeoutSeconds: terms.maxTimeoutSeconds ?? 300,
  };
  return { x402Version: 1, ...(error ? { error } : {}), accepts: [requirement] };
}

/**
 * Verify an `X-PAYMENT` header against the terms. Pure checks only — does not
 * touch the replay store or settle (the guard orchestrates those), so this is
 * safe to call in isolation (e.g. in tests).
 */
export async function verifyPayment(
  headerB64: string,
  terms: PaymentTerms,
): Promise<VerifyResult> {
  let payload: PaymentPayload;
  try {
    const json =
      typeof Buffer !== "undefined"
        ? Buffer.from(headerB64, "base64").toString("utf8")
        : atob(headerB64);
    payload = JSON.parse(json) as PaymentPayload;
  } catch {
    return { ok: false, reason: "X-PAYMENT is not valid base64 JSON" };
  }

  const authorization = payload?.payload?.authorization;
  const signature = payload?.payload?.signature;
  if (!authorization || !signature) {
    return { ok: false, reason: "missing authorization or signature" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Number(authorization.validAfter) > now) return { ok: false, reason: "validAfter not yet reached" };
  if (Number(authorization.validBefore) < now) return { ok: false, reason: "authorization expired" };
  if (authorization.to.toLowerCase() !== terms.payTo.toLowerCase()) {
    return { ok: false, reason: "wrong recipient" };
  }
  if (BigInt(authorization.value) < BigInt(terms.amount)) {
    return { ok: false, reason: "underpaid" };
  }
  if (authorization.from.toLowerCase() === authorization.to.toLowerCase()) {
    return { ok: false, reason: "from and to are the same address" };
  }

  const domain = eip3009Domain({
    name: terms.tokenDomain.name,
    version: terms.tokenDomain.version,
    chainId: terms.chainId,
    verifyingContract: terms.asset,
  });
  const validSig = await verifyAuthorization({ domain, authorization, signature });
  if (!validSig) return { ok: false, reason: "bad signature" };

  return { ok: true, authorization, signature };
}

// ───────────────────────── the guard ─────────────────────────

export type GuardResult =
  | { kind: "require"; status: 402; body: PaymentRequiredResponse }
  | { kind: "reject"; status: 402; body: PaymentRequiredResponse; reason: string }
  | { kind: "ok"; receipt: PaymentReceipt };

export interface RequirePaymentConfig extends PaymentTerms {
  /** How to settle once a payment verifies. Omit to verify only (settle elsewhere). */
  settle?: SettlementStrategy;
  /** Nonce tracking. Defaults to a per-process in-memory store. */
  replayStore?: ReplayStore;
}

export interface PaymentGuard {
  /**
   * Evaluate an incoming request's `X-PAYMENT` header (or its absence).
   * Pass `null`/`undefined` when the header isn't present.
   */
  check(headerB64: string | null | undefined): Promise<GuardResult>;
}

/**
 * Build a reusable payment guard. Framework-agnostic: it consumes the
 * `X-PAYMENT` header value and returns a `GuardResult` describing what the
 * caller's HTTP layer should do.
 */
export function requirePayment(config: RequirePaymentConfig): PaymentGuard {
  const replay = config.replayStore ?? inMemoryReplayStore();

  async function check(headerB64: string | null | undefined): Promise<GuardResult> {
    if (!headerB64) {
      return { kind: "require", status: 402, body: paymentRequirements(config) };
    }

    const verdict = await verifyPayment(headerB64, config);
    if (!verdict.ok) {
      return {
        kind: "reject",
        status: 402,
        reason: verdict.reason,
        body: paymentRequirements(config, `Payment rejected: ${verdict.reason}`),
      };
    }

    if (await replay.has(verdict.authorization.nonce)) {
      const reason = "nonce already used";
      return { kind: "reject", status: 402, reason, body: paymentRequirements(config, `Payment rejected: ${reason}`) };
    }

    const receipt: PaymentReceipt = {
      asset: config.asset,
      payTo: config.payTo,
      amount: verdict.authorization.value,
      network: config.network,
    };

    if (config.settle) {
      try {
        const result = await config.settle(verdict.authorization, verdict.signature);
        receipt.txHash = result.txHash;
        receipt.blockNumber = result.blockNumber.toString();
        receipt.gasUsed = result.gasUsed.toString();
      } catch (cause) {
        const reason = `settlement failed: ${(cause as Error)?.message ?? String(cause)}`;
        return { kind: "reject", status: 402, reason, body: paymentRequirements(config, reason) };
      }
    }

    // Reserve the nonce only after settlement succeeds, so a failed settle can be retried.
    await replay.add(verdict.authorization.nonce);
    return { kind: "ok", receipt };
  }

  return { check };
}
