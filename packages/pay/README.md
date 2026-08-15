# @chainbridge/pay

> x402 payments for autonomous agents — a tight wrapper over `fetch` + EIP-3009 signing.

This is the first real SDK package, lifted from the Week-1 validation spike that
proved the full x402 path on-chain on Base Sepolia ([spike/](../../spike/),
[friction log](../../spike/friction.md)). The wedge — *pay for an HTTP resource
with one signed USDC authorization* — is validated; this package is the clean,
typed, interoperable version of it.

## Client

```ts
import { createPayClient } from "@chainbridge/pay";
import { createWalletClient, http, parseUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.PRIVATE_KEY); // EOA that holds USDC
const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http() });

const pay = createPayClient({
  account,
  walletClient,
  maxAmount: parseUnits("1", 6), // never auto-pay more than 1 USDC per request
});

const res = await pay.fetch("https://api.example.com/inference");
const data = await res.json();
console.log(res.payment); // { asset, payTo, amount, txHash?, blockNumber?, ... }
```

`pay.fetch` is a drop-in superset of `fetch`: if the server answers `402`, it
reads the payment requirements, signs an EIP-3009 authorization, retries with
the `X-PAYMENT` header, and returns the final `Response` with a settlement
receipt attached as `response.payment`. Any non-402 response passes through
untouched.

> **The signer must be an EOA.** USDC verifies authorizations with `ecrecover`,
> so a smart-contract account can't sign EIP-3009 — a load-bearing constraint
> surfaced by the spike (friction log, Step 3). The EOA holds the token and
> signs; a smart account, if any, is used for other operations.

## Server

```ts
import { requirePayment, selfHostSettlement } from "@chainbridge/pay/server";
import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http() });

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const guard = requirePayment({
  payTo: account.address,
  asset: USDC,
  network: "base-sepolia",
  chainId: baseSepolia.id,
  amount: parseUnits("0.05", 6).toString(),
  tokenDomain: { name: "USDC", version: "2" },
  resource: "https://api.example.com/inference",
  // ADR-004 Option A (self-host). Omit `settle` to verify-only and settle elsewhere.
  settle: selfHostSettlement({ walletClient, publicClient, account, asset: USDC }),
});

// In your HTTP handler:
const result = await guard.check(req.headers["x-payment"]);
if (result.kind !== "ok") {
  res.writeHead(result.status, { "content-type": "application/json" });
  res.end(JSON.stringify(result.body));
  return;
}
// result.receipt has the settlement details — deliver the resource.
```

`requirePayment` is framework-agnostic — it consumes the `X-PAYMENT` header and
returns a `GuardResult` (`require` | `reject` | `ok`) telling your HTTP layer
what to do.

## Design decisions baked in

| Concern | Choice | Source |
|---|---|---|
| Settlement model | injectable `SettlementStrategy`; `selfHostSettlement` (Option A) ships, facilitator (Option C) plugs in later | [ADR-004](../../docs/adr/004-settlement-model.md) |
| Replay protection | pluggable `ReplayStore`; in-memory default, swap for Redis/on-chain at scale | friction log, Step 3 |
| Multi-token | EIP-712 domain read from the wire (`extra.name`/`version` + `asset`), not hard-coded to USDC | friction log, Step 3 |
| Error model | typed `PayError` hierarchy with discriminable `code`s | friction log, "SDK design decisions" |
| Naming | `pay.fetch` (drop-in superset of `fetch`) | friction log, "Naming" |
| Auto-pay safety | `maxAmount` cap on the client | new — bounds blast radius |

## Status

v0.1 — validated wire contract, typechecks and builds clean, round-trip test
passing (`npm test`). Not yet published to npm. `permissionless` is **not** a
dependency here (see [ADR-006](../../docs/adr/006-permissionless-dependency.md));
this package depends only on `viem`.
