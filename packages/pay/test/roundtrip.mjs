/**
 * End-to-end round-trip test for @chainbridge/pay — no chain required.
 *
 * Exercises the real client <-> server contract: the client's 402 -> sign ->
 * retry dance against the server's verify guard. EIP-712 signing and signature
 * verification run locally (no RPC), so this proves the wire format, the EIP-3009
 * domain construction, header encoding, and verification logic all agree.
 *
 * Run after building:  node --test test/roundtrip.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createWalletClient, http, parseUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

import { createPayClient, AmountExceedsMaxError } from "../dist/index.js";
import { requirePayment, paymentRequirements } from "../dist/server.js";

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
// Deterministic throwaway key — test only, holds nothing.
const buyer = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
const seller = privateKeyToAccount(
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
);

const terms = {
  payTo: seller.address,
  asset: USDC,
  network: "base-sepolia",
  chainId: baseSepolia.id,
  amount: parseUnits("0.05", 6).toString(),
  tokenDomain: { name: "USDC", version: "2" },
  resource: "http://test.local/inference",
};

/** A fake server: 402 without payment, runs the guard (verify-only) with payment. */
function makeServer(guard) {
  return async (_input, init) => {
    const header = new Headers(init?.headers).get("X-PAYMENT");
    const result = await guard.check(header);
    if (result.kind !== "ok") {
      return new Response(JSON.stringify(result.body), {
        status: result.status,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ resource: "the answer is 42" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

function makeClient(serverFetch, overrides = {}) {
  const walletClient = createWalletClient({
    account: buyer,
    chain: baseSepolia,
    transport: http("http://localhost:0"), // never called — signing is local
  });
  return createPayClient({ account: buyer, walletClient, fetch: serverFetch, ...overrides });
}

test("402 -> sign -> retry -> 200 with receipt", async () => {
  const guard = requirePayment(terms); // verify-only (no settle strategy)
  const pay = makeClient(makeServer(guard));

  const res = await pay.fetch("http://test.local/inference");
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.resource, "the answer is 42");
  assert.ok(res.payment, "receipt attached");
  assert.equal(res.payment.amount, terms.amount);
  assert.equal(res.payment.payTo.toLowerCase(), seller.address.toLowerCase());
});

test("maxAmount cap blocks an over-priced resource", async () => {
  const guard = requirePayment(terms);
  const pay = makeClient(makeServer(guard), { maxAmount: parseUnits("0.01", 6) });

  await assert.rejects(() => pay.fetch("http://test.local/inference"), AmountExceedsMaxError);
});

test("server rejects a forged signature (nonce reuse / tamper)", async () => {
  const guard = requirePayment(terms);
  // A server fetch that hands the guard a tampered authorization value.
  const tamperingServer = async (_input, init) => {
    const header = new Headers(init?.headers).get("X-PAYMENT");
    if (!header) {
      return new Response(JSON.stringify(paymentRequirements(terms)), {
        status: 402,
        headers: { "content-type": "application/json" },
      });
    }
    const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    decoded.payload.authorization.value = parseUnits("999", 6).toString(); // tamper
    const tampered = Buffer.from(JSON.stringify(decoded)).toString("base64");
    const result = await guard.check(tampered);
    return new Response(JSON.stringify(result.body), {
      status: result.kind === "ok" ? 200 : result.status,
      headers: { "content-type": "application/json" },
    });
  };
  const pay = makeClient(tamperingServer);
  await assert.rejects(() => pay.fetch("http://test.local/inference"), /rejected/i);
});

test("replay: same nonce can't settle twice", async () => {
  const guard = requirePayment(terms);
  // Capture a valid header by intercepting one successful exchange.
  let captured;
  const capturingServer = async (_input, init) => {
    const header = new Headers(init?.headers).get("X-PAYMENT");
    if (!header) {
      return new Response(JSON.stringify(paymentRequirements(terms)), {
        status: 402,
        headers: { "content-type": "application/json" },
      });
    }
    captured = header;
    const result = await guard.check(header);
    return new Response(JSON.stringify(result.kind === "ok" ? { ok: 1 } : result.body), {
      status: result.kind === "ok" ? 200 : result.status,
      headers: { "content-type": "application/json" },
    });
  };
  const pay = makeClient(capturingServer);
  const first = await pay.fetch("http://test.local/inference");
  assert.equal(first.status, 200);

  // Replay the exact same header directly against the guard.
  const replayed = await guard.check(captured);
  assert.equal(replayed.kind, "reject");
  assert.match(replayed.reason, /nonce already used/);
});
