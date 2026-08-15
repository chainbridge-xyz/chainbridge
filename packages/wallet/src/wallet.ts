/**
 * `@chainbridge/wallet` — ERC-4337 smart account provisioning on Base.
 *
 * Public surface. Everything under `internal/erc4337/` is vendored per ADR-006
 * and should not be imported by consumers.
 */

import type { Address, Chain, Hex, PublicClient } from "viem";

import {
  BundlerRejectedError,
  InsufficientFundsError,
  SponsorshipUnavailableError,
  TimeoutError,
  UserOperationRevertedError,
} from "./errors.js";
import { ENTRY_POINT_07, SAFE_141_EP07, getNonceAbi } from "./internal/erc4337/constants.js";
import {
  BundlerRpcError,
  createBundlerClient,
  type BundlerClient,
} from "./internal/erc4337/bundler.js";
import {
  computeSafeAddress,
  encodeSafeCalls,
  getSafeFactoryData,
  type Call,
} from "./internal/erc4337/safe.js";
import {
  getStubSignature,
  signSafeUserOperation,
  type TypedDataSigner,
  type UserOperationV07,
} from "./internal/erc4337/userop.js";

export type { Call };

/** Who pays for gas. Explicit because guessing wrong costs the user real money. */
export type GasPolicy =
  /** Ask the configured paymaster to sponsor. Throws if it declines. */
  | { mode: "sponsored" }
  /** Try the paymaster; silently fall back to the EOA if it declines. */
  | { mode: "sponsored-or-self" }
  /** Never ask a paymaster — the owner EOA pays. */
  | { mode: "self" };

export interface CreateSmartWalletParams {
  /** The EOA that owns the Safe. Also the EIP-3009 signer for `@chainbridge/pay`. */
  owner: TypedDataSigner;
  chain: Chain;
  publicClient: PublicClient;
  /** Bundler RPC URL. Pimlico by default per ADR-003, but any 4337 bundler works. */
  bundlerUrl: string;
  /**
   * Paymaster RPC URL. Defaults to `bundlerUrl` — Pimlico's v2 endpoint serves
   * both on one URL, which is what the spike used.
   */
  paymasterUrl?: string;
  /** Default gas policy for operations that don't override it. */
  gasPolicy?: GasPolicy;
  /** CREATE2 salt. Change it to derive additional accounts from one owner. */
  saltNonce?: bigint;
}

/** What actually happened when an operation ran. */
export interface OperationReceipt {
  userOpHash: Hex;
  transactionHash: Hex;
  blockNumber: bigint;
  gasUsed: bigint;
  /** True if a paymaster paid. False means the owner EOA paid, in ETH. */
  sponsored: boolean;
  /** Wei the operation actually cost, per the bundler. */
  actualGasCost: bigint;
}

export interface ProvisionResult extends Partial<OperationReceipt> {
  address: Address;
  /** True if the account already existed and no UserOp was sent. */
  alreadyDeployed: boolean;
}

export interface SmartWallet {
  /** Counterfactual address. Known immediately — no RPC, no deployment. */
  readonly address: Address;
  readonly owner: Address;
  readonly entryPoint: Address;
  isDeployed(): Promise<boolean>;
  /** Deploy the Safe if it isn't already. Idempotent. */
  provision(opts?: { gasPolicy?: GasPolicy }): Promise<ProvisionResult>;
  /** Execute one or more calls from the smart account. Deploys it if needed. */
  sendCalls(calls: readonly Call[], opts?: { gasPolicy?: GasPolicy }): Promise<OperationReceipt>;
  /** Estimate what an operation would cost, and who would pay. */
  estimate(
    calls: readonly Call[],
    opts?: { gasPolicy?: GasPolicy },
  ): Promise<{ maxCostWei: bigint; sponsored: boolean }>;
  readonly bundler: BundlerClient;
}

/**
 * Create a Safe v1.4.1 smart account handle.
 *
 * Returns synchronously-derivable state: `.address` is available before any
 * network call, because the CREATE2 derivation is pure (see
 * `internal/erc4337/safe.ts`). The spike confirmed this is good UX — you can
 * show a user their address, or fund it, before it exists on-chain.
 */
export function createSmartWallet(params: CreateSmartWalletParams): SmartWallet {
  const saltNonce = params.saltNonce ?? 0n;
  const owners = [params.owner.address] as const;
  const threshold = 1n;
  const defaultPolicy: GasPolicy = params.gasPolicy ?? { mode: "sponsored-or-self" };

  const address = computeSafeAddress({ owners, threshold, saltNonce });

  const bundler = createBundlerClient({ url: params.bundlerUrl, entryPoint: ENTRY_POINT_07 });
  const paymaster = params.paymasterUrl
    ? createBundlerClient({ url: params.paymasterUrl, entryPoint: ENTRY_POINT_07 })
    : bundler;

  const isDeployed = async (): Promise<boolean> => {
    const code = await params.publicClient.getCode({ address });
    return !!code && code !== "0x";
  };

  const getNonce = async (): Promise<bigint> =>
    params.publicClient.readContract({
      address: ENTRY_POINT_07,
      abi: getNonceAbi,
      functionName: "getNonce",
      args: [address, 0n],
    });

  const getFees = async () => {
    const fromBundler = await bundler.getUserOperationGasPrice();
    if (fromBundler) return fromBundler;
    // Non-Pimlico bundler: fall back to the chain's own fee estimation.
    const fees = await params.publicClient.estimateFeesPerGas();
    return {
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    };
  };

  /**
   * Build a fully-populated, signed UserOperation.
   *
   * Order matters: sponsor first, then estimate, then sign. The paymaster's
   * fields are hashed into the signature, so signing before sponsorship
   * produces a valid-looking signature that fails on-chain.
   */
  const buildUserOperation = async (
    calls: readonly Call[],
    policy: GasPolicy,
    deployed: boolean,
  ): Promise<{ op: UserOperationV07; sponsored: boolean }> => {
    const [nonce, fees] = await Promise.all([getNonce(), getFees()]);

    let op: UserOperationV07 = {
      sender: address,
      nonce,
      callData: encodeSafeCalls(calls),
      callGasLimit: 0n,
      verificationGasLimit: 0n,
      preVerificationGas: 0n,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      signature: getStubSignature(),
    };

    if (!deployed) {
      op.factory = SAFE_141_EP07.proxyFactory;
      op.factoryData = getSafeFactoryData({ owners, threshold, saltNonce });
    }

    let sponsored = false;
    if (policy.mode !== "self") {
      try {
        const s = await paymaster.sponsorUserOperation(op);
        op = {
          ...op,
          paymaster: s.paymaster,
          paymasterData: s.paymasterData,
          paymasterVerificationGasLimit: s.paymasterVerificationGasLimit ?? 0n,
          paymasterPostOpGasLimit: s.paymasterPostOpGasLimit ?? 0n,
          callGasLimit: s.callGasLimit ?? 0n,
          verificationGasLimit: s.verificationGasLimit ?? 0n,
          preVerificationGas: s.preVerificationGas ?? 0n,
        };
        sponsored = true;
      } catch (err) {
        if (policy.mode === "sponsored") {
          throw new SponsorshipUnavailableError(
            "Paymaster declined to sponsor this operation. Use gasPolicy 'sponsored-or-self' " +
              "to fall back to the owner EOA, or fund a paymaster budget.",
            { cause: err },
          );
        }
        // 'sponsored-or-self' — carry on unsponsored.
      }
    }

    // Estimate anything the paymaster didn't already fill in.
    if (op.callGasLimit === 0n || op.verificationGasLimit === 0n || op.preVerificationGas === 0n) {
      const est = await bundler.estimateUserOperationGas(op);
      op.callGasLimit ||= est.callGasLimit;
      op.verificationGasLimit ||= est.verificationGasLimit;
      op.preVerificationGas ||= est.preVerificationGas;
    }

    op.signature = await signSafeUserOperation({
      owner: params.owner,
      chainId: params.chain.id,
      userOperation: op,
    });

    return { op, sponsored };
  };

  const maxCost = (op: UserOperationV07): bigint =>
    (op.callGasLimit +
      op.verificationGasLimit +
      op.preVerificationGas +
      (op.paymasterVerificationGasLimit ?? 0n) +
      (op.paymasterPostOpGasLimit ?? 0n)) *
    op.maxFeePerGas;

  const submit = async (
    calls: readonly Call[],
    policy: GasPolicy,
    deployed: boolean,
  ): Promise<OperationReceipt> => {
    const { op, sponsored } = await buildUserOperation(calls, policy, deployed);

    // If nobody is sponsoring, the owner EOA pays. Check it can, and say so
    // before spending rather than after a cryptic bundler rejection.
    if (!sponsored) {
      const balance = await params.publicClient.getBalance({ address: params.owner.address });
      const required = maxCost(op);
      if (balance < required) {
        throw new InsufficientFundsError(params.owner.address, required, balance);
      }
    }

    let userOpHash: Hex;
    try {
      userOpHash = await bundler.sendUserOperation(op);
    } catch (err) {
      throw new BundlerRejectedError(
        err instanceof BundlerRpcError ? err.message : "Bundler rejected the UserOperation",
        { cause: err },
      );
    }

    let receipt;
    try {
      receipt = await bundler.waitForUserOperationReceipt(userOpHash);
    } catch (err) {
      throw new TimeoutError(userOpHash, 120_000);
    }

    if (!receipt.success) {
      throw new UserOperationRevertedError(userOpHash, receipt.receipt.transactionHash);
    }

    return {
      userOpHash,
      transactionHash: receipt.receipt.transactionHash,
      blockNumber: receipt.receipt.blockNumber,
      gasUsed: receipt.actualGasUsed,
      actualGasCost: receipt.actualGasCost,
      sponsored,
    };
  };

  return {
    address,
    owner: params.owner.address,
    entryPoint: ENTRY_POINT_07,
    bundler,
    isDeployed,

    async provision(opts) {
      if (await isDeployed()) {
        return { address, alreadyDeployed: true };
      }
      // A self-call with empty calldata: the cheapest UserOp that still forces
      // the factory to run. The spike confirmed this deploys the Safe first try
      // (409,504 gas, fully sponsored) — no separate pre-deploy step needed.
      const receipt = await submit(
        [{ to: address, value: 0n, data: "0x" }],
        opts?.gasPolicy ?? defaultPolicy,
        false,
      );
      return { address, alreadyDeployed: false, ...receipt };
    },

    async sendCalls(calls, opts) {
      return submit(calls, opts?.gasPolicy ?? defaultPolicy, await isDeployed());
    },

    async estimate(calls, opts) {
      const { op, sponsored } = await buildUserOperation(
        calls,
        opts?.gasPolicy ?? defaultPolicy,
        await isDeployed(),
      );
      return { maxCostWei: maxCost(op), sponsored };
    },
  };
}

/**
 * The account address for an owner, with no network access and no wallet
 * instance. Useful for showing or funding an address before provisioning.
 */
export function getSmartWalletAddress(params: {
  owner: Address;
  saltNonce?: bigint;
}): Address {
  return computeSafeAddress({
    owners: [params.owner],
    threshold: 1n,
    saltNonce: params.saltNonce ?? 0n,
  });
}
