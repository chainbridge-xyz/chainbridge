/**
 * The client side of x402 — `createPayClient().fetch()`.
 *
 * This is the headline SDK surface the friction log calls for: "`pay.fetch()`
 * ships as a tight wrapper over `fetch + signTypedData`". One call does the full
 * dance the spike did by hand:
 *
 *   1. fetch the resource
 *   2. on 402, read the payment requirements
 *   3. sign an EIP-3009 authorization (EOA — see eip3009.ts)
 *   4. retry with the `X-PAYMENT` header
 *   5. return the Response, with a settlement receipt attached as `.payment`
 *
 * Naming: `pay.fetch` (not `pay.send`) — picked here per the friction-log
 * "Naming" open question, because it is a drop-in superset of `fetch`.
 */

import type { Account, Address, Hex, WalletClient } from "viem";
import {
  AmountExceedsMaxError,
  MalformedPaymentRequiredError,
  NoAcceptableRequirementError,
  PaymentRejectedError,
} from "./errors.js";
import { eip3009Domain, signAuthorization } from "./eip3009.js";
import type {
  Authorization,
  PaidResponse,
  PaymentPayload,
  PaymentReceipt,
  PaymentRequiredResponse,
  PaymentRequirements,
} from "./types.js";

export interface PayClientConfig {
  /**
   * The EOA that holds the token and signs authorizations. Must be an EOA —
   * smart-contract accounts cannot produce EIP-3009 signatures (see eip3009.ts).
   */
  account: Account;
  /** A viem wallet client used to sign. Its `chain.id` is used as the EIP-712 chainId. */
  walletClient: WalletClient;
  /**
   * Hard cap on what a single `fetch` will auto-pay, in the token's smallest
   * unit. Strongly recommended: it bounds blast radius if a server advertises a
   * bogus price. Omit to allow any amount (not recommended for production).
   */
  maxAmount?: bigint;
  /**
   * Choose which advertised requirement to pay when a server offers several.
   * Defaults to the first `exact`-scheme requirement.
   */
  selectRequirement?: (accepts: PaymentRequirements[]) => PaymentRequirements | undefined;
  /** Override the global fetch (e.g. for testing). */
  fetch?: typeof fetch;
}

export interface PayClient {
  /** Drop-in `fetch` that transparently satisfies an x402 402 challenge. */
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<PaidResponse>;
}

function defaultSelect(accepts: PaymentRequirements[]): PaymentRequirements | undefined {
  return accepts.find((r) => r.scheme === "exact");
}

/** 32 random bytes as hex — the EIP-3009 nonce. Isomorphic (Node 18+ / browser). */
function randomNonce(): Hex {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex as Hex;
}

function toBase64(json: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(json, "utf8").toString("base64");
  // Browser path: JSON here is ASCII (addresses/hex/numbers), so btoa is safe.
  return btoa(json);
}

export function createPayClient(config: PayClientConfig): PayClient {
  const doFetch = config.fetch ?? globalThis.fetch;
  const select = config.selectRequirement ?? defaultSelect;
  const chainId = config.walletClient.chain?.id;
  if (chainId === undefined) {
    throw new Error("walletClient must be bound to a chain (walletClient.chain is undefined)");
  }

  async function payFetch(
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<PaidResponse> {
    const first = await doFetch(input, init);
    if (first.status !== 402) return first;

    const requirement = await selectRequirement(first, select);
    assertWithinCap(requirement, config.maxAmount);

    const { authorization, signature } = await sign(requirement);
    const header = buildPaymentHeader(requirement, authorization, signature);

    const retried = (await doFetch(input, withPaymentHeader(init, header))) as PaidResponse;
    if (retried.status === 402) {
      throw new PaymentRejectedError(retried.status, await safeReadError(retried));
    }
    retried.payment = await readReceipt(retried, requirement, authorization);
    return retried;
  }

  async function sign(requirement: PaymentRequirements) {
    const now = Math.floor(Date.now() / 1000);
    const authorization: Authorization = {
      from: config.account.address,
      to: requirement.payTo,
      value: requirement.maxAmountRequired,
      validAfter: "0",
      validBefore: String(now + requirement.maxTimeoutSeconds),
      nonce: randomNonce(),
    };
    const domain = eip3009Domain({
      name: requirement.extra.name,
      version: requirement.extra.version,
      chainId: chainId!,
      verifyingContract: requirement.asset,
    });
    const signature = await signAuthorization({
      walletClient: config.walletClient,
      account: config.account,
      domain,
      authorization,
    });
    return { authorization, signature };
  }

  return { fetch: payFetch };
}

async function selectRequirement(
  res: Response,
  select: (accepts: PaymentRequirements[]) => PaymentRequirements | undefined,
): Promise<PaymentRequirements> {
  let body: PaymentRequiredResponse;
  try {
    body = (await res.clone().json()) as PaymentRequiredResponse;
  } catch (cause) {
    throw new MalformedPaymentRequiredError("402 response body was not valid JSON", { cause });
  }
  if (!Array.isArray(body.accepts) || body.accepts.length === 0) {
    throw new MalformedPaymentRequiredError("402 response had no `accepts` requirements");
  }
  const requirement = select(body.accepts);
  if (!requirement) {
    throw new NoAcceptableRequirementError(
      `No acceptable requirement among: ${body.accepts.map((r) => `${r.scheme}/${r.network}`).join(", ")}`,
    );
  }
  return requirement;
}

function assertWithinCap(requirement: PaymentRequirements, maxAmount?: bigint): void {
  if (maxAmount === undefined) return;
  const required = BigInt(requirement.maxAmountRequired);
  if (required > maxAmount) throw new AmountExceedsMaxError(required, maxAmount);
}

function buildPaymentHeader(
  requirement: PaymentRequirements,
  authorization: Authorization,
  signature: Hex,
): string {
  const payload: PaymentPayload = {
    x402Version: 1,
    scheme: requirement.scheme,
    network: requirement.network,
    payload: { authorization, signature },
  };
  return toBase64(JSON.stringify(payload));
}

function withPaymentHeader(init: RequestInit | undefined, header: string): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set("X-PAYMENT", header);
  return { ...init, headers };
}

async function readReceipt(
  res: Response,
  requirement: PaymentRequirements,
  authorization: Authorization,
): Promise<PaymentReceipt> {
  const receipt: PaymentReceipt = {
    asset: requirement.asset,
    payTo: requirement.payTo,
    amount: authorization.value,
    network: requirement.network,
  };
  try {
    const body = (await res.clone().json()) as {
      settlementTxHash?: Hex;
      blockNumber?: string;
      gasUsed?: string;
    };
    if (body.settlementTxHash) receipt.txHash = body.settlementTxHash;
    if (body.blockNumber) receipt.blockNumber = body.blockNumber;
    if (body.gasUsed) receipt.gasUsed = body.gasUsed;
  } catch {
    // Non-JSON or empty body is fine — the resource itself may be the payload.
  }
  return receipt;
}

async function safeReadError(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.clone().json()) as { error?: string };
    return body.error;
  } catch {
    return undefined;
  }
}

// Re-export so `payTo`/`asset` callers don't need a separate viem import.
export type { Address, Hex };
