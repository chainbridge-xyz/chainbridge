/**
 * @chainbridge/wallet — ERC-4337 smart account provisioning for autonomous
 * agents on Base.
 *
 * Safe v1.4.1 accounts (ADR-002) over a configurable bundler (ADR-003), with
 * the ERC-4337 plumbing vendored rather than pulled from `permissionless`
 * (ADR-006). `viem` is the only runtime dependency.
 */

export {
  createSmartWallet,
  getSmartWalletAddress,
  type Call,
  type CreateSmartWalletParams,
  type GasPolicy,
  type OperationReceipt,
  type ProvisionResult,
  type SmartWallet,
} from "./wallet.js";

export {
  WalletError,
  NotDeployedError,
  SponsorshipUnavailableError,
  InsufficientFundsError,
  UserOperationRevertedError,
  BundlerRejectedError,
  TimeoutError,
  type WalletErrorCode,
} from "./errors.js";

export { ENTRY_POINT_07, SAFE_141_EP07 } from "./internal/erc4337/constants.js";
export type { UserOperationV07 } from "./internal/erc4337/userop.js";
export type { BundlerClient, UserOperationReceipt } from "./internal/erc4337/bundler.js";
