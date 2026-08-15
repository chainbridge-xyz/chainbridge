/**
 * Typed error hierarchy for `@chainbridge/wallet`.
 *
 * Same shape as `@chainbridge/pay`'s `PayError` — one discriminable `code` per
 * failure mode the spike hit by hand, so callers `switch (err.code)` instead of
 * string-matching bundler messages. The spike's note that Pimlico errors are
 * "notoriously cryptic" (friction log, Step 2) is the whole reason this exists:
 * we catch the raw JSON-RPC error and re-throw it with a name that says what
 * the SDK was trying to do.
 */

export type WalletErrorCode =
  | "NOT_DEPLOYED"
  | "SPONSORSHIP_UNAVAILABLE"
  | "INSUFFICIENT_FUNDS"
  | "USER_OPERATION_REVERTED"
  | "BUNDLER_REJECTED"
  | "TIMEOUT";

export class WalletError extends Error {
  readonly code: WalletErrorCode;
  override readonly cause?: unknown;

  constructor(code: WalletErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    if (options && "cause" in options) this.cause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** An operation needed a deployed account but the Safe is still counterfactual. */
export class NotDeployedError extends WalletError {
  readonly address: string;
  constructor(address: string) {
    super(
      "NOT_DEPLOYED",
      `Smart account ${address} is not deployed yet — call provision() first`,
    );
    this.address = address;
  }
}

/**
 * Sponsorship was requested but the paymaster declined or is unreachable.
 *
 * Worth its own code because the fallback is a *funding* problem, not a code
 * problem: without a sponsor the owner EOA pays, and on mainnet that requires a
 * budget the customer has to set up (friction log, Step 2).
 */
export class SponsorshipUnavailableError extends WalletError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("SPONSORSHIP_UNAVAILABLE", message, options);
  }
}

/**
 * An EOA-paid operation can't cover its own gas.
 *
 * The spike found that 0.0001 ETH was enough for a sponsored UserOp but that
 * the *settlement* leg still spent real ETH from the EOA. Distinguishing the
 * two is a P0 in the friction log, and this error is where that surfaces.
 */
export class InsufficientFundsError extends WalletError {
  readonly address: string;
  readonly required: bigint;
  readonly balance: bigint;
  constructor(address: string, required: bigint, balance: bigint) {
    super(
      "INSUFFICIENT_FUNDS",
      `${address} needs ~${required} wei to pay for this operation but holds ${balance} wei. ` +
        `This operation is NOT paymaster-sponsored.`,
    );
    this.address = address;
    this.required = required;
    this.balance = balance;
  }
}

/** The UserOp was included on-chain but its execution reverted. */
export class UserOperationRevertedError extends WalletError {
  readonly userOpHash: string;
  readonly transactionHash: string;
  constructor(userOpHash: string, transactionHash: string) {
    super(
      "USER_OPERATION_REVERTED",
      `UserOperation ${userOpHash} was included in ${transactionHash} but reverted`,
    );
    this.userOpHash = userOpHash;
    this.transactionHash = transactionHash;
  }
}

/** The bundler refused the UserOp — the raw JSON-RPC error is the `cause`. */
export class BundlerRejectedError extends WalletError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("BUNDLER_REJECTED", message, options);
  }
}

/** The UserOp was accepted but never included within the timeout. */
export class TimeoutError extends WalletError {
  readonly userOpHash: string;
  constructor(userOpHash: string, timeoutMs: number) {
    super("TIMEOUT", `UserOperation ${userOpHash} not included within ${timeoutMs}ms`);
    this.userOpHash = userOpHash;
  }
}
