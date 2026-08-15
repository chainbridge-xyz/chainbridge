/**
 * ─────────────────────────────────────────────────────────────────────────────
 * VENDORED — DO NOT MODIFY without updating ADR-006.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Minimal ERC-4337 bundler + paymaster JSON-RPC client.
 *
 * `permissionless` ships a viem-transport-backed client per provider; we need
 * four methods and a POST, so this is plain `fetch`. Keeping it provider-shaped
 * rather than Pimlico-shaped is what ADR-003 requires: Pimlico is the default,
 * Alchemy is the fallback, and the bundler URL is configurable. Only
 * `getUserOperationGasPrice` is Pimlico-specific, and it degrades gracefully.
 */

import type { Address, Hex } from "viem";

import { ENTRY_POINT_07 } from "./constants.js";
import { toRpcUserOperation, type UserOperationV07 } from "./userop.js";

/** A JSON-RPC error returned by the bundler, with its code preserved. */
export class BundlerRpcError extends Error {
  readonly code: number;
  readonly method: string;
  readonly data?: unknown;

  constructor(method: string, code: number, message: string, data?: unknown) {
    super(`${method} failed (${code}): ${message}`);
    this.name = "BundlerRpcError";
    this.code = code;
    this.method = method;
    if (data !== undefined) this.data = data;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface GasPrices {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export interface UserOperationReceipt {
  userOpHash: Hex;
  success: boolean;
  actualGasUsed: bigint;
  actualGasCost: bigint;
  receipt: { transactionHash: Hex; blockNumber: bigint; gasUsed: bigint };
}

export interface BundlerClient {
  request: <T>(method: string, params: unknown[]) => Promise<T>;
  estimateUserOperationGas: (op: UserOperationV07) => Promise<{
    callGasLimit: bigint;
    verificationGasLimit: bigint;
    preVerificationGas: bigint;
    paymasterVerificationGasLimit?: bigint;
    paymasterPostOpGasLimit?: bigint;
  }>;
  sendUserOperation: (op: UserOperationV07) => Promise<Hex>;
  getUserOperationReceipt: (hash: Hex) => Promise<UserOperationReceipt | null>;
  waitForUserOperationReceipt: (
    hash: Hex,
    opts?: { timeoutMs?: number; pollMs?: number },
  ) => Promise<UserOperationReceipt>;
  /** Pimlico's `pimlico_getUserOperationGasPrice`. Returns null if unsupported. */
  getUserOperationGasPrice: () => Promise<GasPrices | null>;
  /** Pimlico/ERC-7677 `pm_sponsorUserOperation`. */
  sponsorUserOperation: (op: UserOperationV07) => Promise<SponsorResult>;
}

export interface SponsorResult {
  paymaster: Address;
  paymasterData: Hex;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
  callGasLimit?: bigint;
  verificationGasLimit?: bigint;
  preVerificationGas?: bigint;
}

const big = (v: unknown): bigint | undefined =>
  typeof v === "string" || typeof v === "number" ? BigInt(v) : undefined;

export function createBundlerClient(params: {
  url: string;
  entryPoint?: Address;
  fetchFn?: typeof fetch;
}): BundlerClient {
  const entryPoint = params.entryPoint ?? ENTRY_POINT_07;
  const doFetch = params.fetchFn ?? fetch;
  let id = 0;

  const request = async <T>(method: string, rpcParams: unknown[]): Promise<T> => {
    const res = await doFetch(params.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params: rpcParams }),
    });
    if (!res.ok) {
      throw new BundlerRpcError(method, res.status, `HTTP ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as { result?: T; error?: { code: number; message: string; data?: unknown } };
    if (body.error) {
      throw new BundlerRpcError(method, body.error.code, body.error.message, body.error.data);
    }
    return body.result as T;
  };

  const getUserOperationReceipt = async (hash: Hex): Promise<UserOperationReceipt | null> => {
    const r = await request<null | {
      userOpHash: Hex;
      success: boolean | string;
      actualGasUsed: string;
      actualGasCost: string;
      receipt: { transactionHash: Hex; blockNumber: string; gasUsed: string };
    }>("eth_getUserOperationReceipt", [hash]);
    if (!r) return null;
    return {
      userOpHash: r.userOpHash,
      // Some bundlers return the boolean as a string.
      success: r.success === true || r.success === "true" || r.success === "0x1",
      actualGasUsed: BigInt(r.actualGasUsed),
      actualGasCost: BigInt(r.actualGasCost),
      receipt: {
        transactionHash: r.receipt.transactionHash,
        blockNumber: BigInt(r.receipt.blockNumber),
        gasUsed: BigInt(r.receipt.gasUsed),
      },
    };
  };

  return {
    request,

    async estimateUserOperationGas(op) {
      const r = await request<Record<string, string>>("eth_estimateUserOperationGas", [
        toRpcUserOperation(op),
        entryPoint,
      ]);
      const out: {
        callGasLimit: bigint;
        verificationGasLimit: bigint;
        preVerificationGas: bigint;
        paymasterVerificationGasLimit?: bigint;
        paymasterPostOpGasLimit?: bigint;
      } = {
        callGasLimit: BigInt(r["callGasLimit"]!),
        verificationGasLimit: BigInt(r["verificationGasLimit"]!),
        preVerificationGas: BigInt(r["preVerificationGas"]!),
      };
      const pvgl = big(r["paymasterVerificationGasLimit"]);
      const ppogl = big(r["paymasterPostOpGasLimit"]);
      if (pvgl !== undefined) out.paymasterVerificationGasLimit = pvgl;
      if (ppogl !== undefined) out.paymasterPostOpGasLimit = ppogl;
      return out;
    },

    sendUserOperation(op) {
      return request<Hex>("eth_sendUserOperation", [toRpcUserOperation(op), entryPoint]);
    },

    getUserOperationReceipt,

    async waitForUserOperationReceipt(hash, opts) {
      const timeoutMs = opts?.timeoutMs ?? 120_000;
      const pollMs = opts?.pollMs ?? 1_000;
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const receipt = await getUserOperationReceipt(hash);
        if (receipt) return receipt;
        if (Date.now() >= deadline) {
          throw new BundlerRpcError(
            "eth_getUserOperationReceipt",
            -1,
            `UserOperation ${hash} not included within ${timeoutMs}ms`,
          );
        }
        await new Promise((r) => setTimeout(r, pollMs));
      }
    },

    async getUserOperationGasPrice() {
      try {
        const r = await request<{ fast: { maxFeePerGas: string; maxPriorityFeePerGas: string } }>(
          "pimlico_getUserOperationGasPrice",
          [],
        );
        return {
          maxFeePerGas: BigInt(r.fast.maxFeePerGas),
          maxPriorityFeePerGas: BigInt(r.fast.maxPriorityFeePerGas),
        };
      } catch (err) {
        // Non-Pimlico bundlers don't implement this. Caller falls back to the
        // chain's own fee data rather than failing the whole operation.
        if (err instanceof BundlerRpcError) return null;
        throw err;
      }
    },

    async sponsorUserOperation(op) {
      const r = await request<Record<string, string>>("pm_sponsorUserOperation", [
        toRpcUserOperation(op),
        entryPoint,
      ]);
      const out: SponsorResult = {
        paymaster: (r["paymaster"] ?? r["paymasterAndData"]) as Address,
        paymasterData: (r["paymasterData"] ?? "0x") as Hex,
      };
      for (const k of [
        "paymasterVerificationGasLimit",
        "paymasterPostOpGasLimit",
        "callGasLimit",
        "verificationGasLimit",
        "preVerificationGas",
      ] as const) {
        const v = big(r[k]);
        if (v !== undefined) out[k] = v;
      }
      return out;
    },
  };
}
