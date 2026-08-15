/**
 * @chainbridge/pay — x402 payments for autonomous agents.
 *
 * Client entry. The seller-side helpers live in `@chainbridge/pay/server`.
 */

export { createPayClient } from "./client.js";
export type { PayClient, PayClientConfig } from "./client.js";

export {
  eip3009Domain,
  signAuthorization,
  verifyAuthorization,
  splitSignature,
  TRANSFER_WITH_AUTHORIZATION_TYPES,
} from "./eip3009.js";

export {
  PayError,
  MalformedPaymentRequiredError,
  NoAcceptableRequirementError,
  AmountExceedsMaxError,
  PaymentRejectedError,
  SettlementFailedError,
  VerificationFailedError,
} from "./errors.js";
export type { PayErrorCode } from "./errors.js";

export type {
  Scheme,
  Network,
  PaymentRequirements,
  PaymentRequiredResponse,
  Authorization,
  PaymentPayload,
  PaymentReceipt,
  PaidResponse,
} from "./types.js";
