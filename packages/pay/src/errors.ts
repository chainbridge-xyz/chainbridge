/**
 * Typed error hierarchy for `@chainbridge/pay`.
 *
 * Resolves the friction-log open question "typed errors vs `throw new Error`"
 * (spike/friction.md → "SDK design decisions"). Every failure mode the spike
 * hit by hand gets a discriminable error here, so callers can `instanceof` /
 * `switch (err.code)` instead of string-matching messages.
 */

export type PayErrorCode =
  | "PAYMENT_REQUIRED_MALFORMED"
  | "NO_ACCEPTABLE_REQUIREMENT"
  | "AMOUNT_EXCEEDS_MAX"
  | "PAYMENT_REJECTED"
  | "SETTLEMENT_FAILED"
  | "VERIFICATION_FAILED";

/** Base class — every error this package throws extends it. */
export class PayError extends Error {
  readonly code: PayErrorCode;
  override readonly cause?: unknown;

  constructor(code: PayErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    if (options && "cause" in options) this.cause = options.cause;
    // Restore prototype chain across the `extends Error` transpile boundary.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** The server returned 402 but the body wasn't a parseable x402 response. */
export class MalformedPaymentRequiredError extends PayError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("PAYMENT_REQUIRED_MALFORMED", message, options);
  }
}

/** None of the server's advertised requirements match what this client can pay. */
export class NoAcceptableRequirementError extends PayError {
  constructor(message: string) {
    super("NO_ACCEPTABLE_REQUIREMENT", message);
  }
}

/**
 * The required amount is above the client's configured `maxAmount` guard. We
 * never auto-pay above the cap — an agent with a signing key should not be one
 * malformed 402 away from draining its balance.
 */
export class AmountExceedsMaxError extends PayError {
  readonly required: bigint;
  readonly max: bigint;
  constructor(required: bigint, max: bigint) {
    super(
      "AMOUNT_EXCEEDS_MAX",
      `Required payment ${required} exceeds configured maxAmount ${max}`,
    );
    this.required = required;
    this.max = max;
  }
}

/** The server rejected the payment on the retried request (still 402). */
export class PaymentRejectedError extends PayError {
  readonly status: number;
  readonly reason?: string;
  constructor(status: number, reason?: string) {
    super("PAYMENT_REJECTED", `Server rejected payment (${status})${reason ? `: ${reason}` : ""}`);
    this.status = status;
    if (reason !== undefined) this.reason = reason;
  }
}

/** On-chain settlement (`transferWithAuthorization`) reverted or never confirmed. */
export class SettlementFailedError extends PayError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("SETTLEMENT_FAILED", message, options);
  }
}

/** Server-side: an `X-PAYMENT` header failed verification. Carries the reason. */
export class VerificationFailedError extends PayError {
  readonly reason: string;
  constructor(reason: string) {
    super("VERIFICATION_FAILED", `Payment verification failed: ${reason}`);
    this.reason = reason;
  }
}
