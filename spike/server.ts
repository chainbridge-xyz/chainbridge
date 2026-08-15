/**
 * Minimal x402 paid API server for the spike.
 *
 * Flow:
 *   GET /inference
 *     - First request: returns HTTP 402 with payment requirements (USDC on Base Sepolia)
 *     - With X-PAYMENT header: verifies the EIP-3009 signature, SETTLES on-chain by
 *       calling USDC.transferWithAuthorization, then returns the resource + tx hash
 *
 * What's REAL (post-upgrade):
 *   - 402 response shape matches Coinbase's x402 reference
 *   - EIP-712 signature verification via viem's verifyTypedData
 *   - On-chain settlement: server submits transferWithAuthorization with EOA's key
 *
 * What's still simplified (vs production):
 *   - Server uses the SAME private key as the client. In production these are different
 *     wallets; the seller submits to a facilitator, the facilitator settles.
 *   - We block on tx confirmation before responding. Production wants async settlement
 *     (Option C in ADR-004) — return resource fast, settle in background batch.
 *   - In-memory replay protection. Production needs Redis or on-chain.
 *
 * Run:  npm run server
 */

import "dotenv/config";
import http from "node:http";
import {
  createPublicClient,
  createWalletClient,
  http as viemHttp,
  parseUnits,
  verifyTypedData,
  type Address,
  type Hex,
} from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// ───────────────────────── env ─────────────────────────

const PORT = Number(process.env.X402_PORT ?? 4242);
const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC ?? "https://sepolia.base.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY as Hex | undefined;
const X402_RECIPIENT = (process.env.X402_RECIPIENT as Address | undefined);

if (!PRIVATE_KEY) {
  console.error("[FATAL] PRIVATE_KEY missing in .env");
  process.exit(1);
}
if (!X402_RECIPIENT || !X402_RECIPIENT.startsWith("0x") || X402_RECIPIENT.length !== 42) {
  console.error(
    "[FATAL] X402_RECIPIENT missing or invalid in .env. Set to your smart account address.\n" +
      "        Example: X402_RECIPIENT=0x4dc738b04445e4fd056A4421276Bf25753fABA52",
  );
  process.exit(1);
}

const USDC_BASE_SEPOLIA: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const PRICE_USDC = "0.05";

// ───────────────────────── viem clients ─────────────────────────

const basePublic = createPublicClient({ chain: baseSepolia, transport: viemHttp(BASE_SEPOLIA_RPC) });
const serverAccount = privateKeyToAccount(PRIVATE_KEY);
const serverWallet = createWalletClient({
  chain: baseSepolia,
  transport: viemHttp(BASE_SEPOLIA_RPC),
  account: serverAccount,
});

// ───────────────────────── types ─────────────────────────

const USDC_DOMAIN = {
  name: "USDC",
  version: "2",
  chainId: baseSepolia.id,
  verifyingContract: USDC_BASE_SEPOLIA,
} as const;

const TWA_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

// USDC v2 (FiatTokenV2_1) on-chain ABI fragment for transferWithAuthorization.
// Note: v, r, s are passed separately (not packed signature).
const USDC_TWA_ABI = [
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

interface Authorization {
  from: Address;
  to: Address;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hex;
}

// ───────────────────────── replay protection (spike-grade) ─────────────────────────

const usedNonces = new Set<string>();

// ───────────────────────── 402 response ─────────────────────────

function paymentRequirements() {
  return {
    x402Version: 1,
    error: "Payment required",
    accepts: [
      {
        scheme: "exact" as const,
        network: "base-sepolia" as const,
        asset: USDC_BASE_SEPOLIA,
        payTo: X402_RECIPIENT,
        maxAmountRequired: parseUnits(PRICE_USDC, 6).toString(),
        resource: `http://localhost:${PORT}/inference`,
        description: "One inference call from ResearchBot-Spike-001",
        mimeType: "application/json",
        outputSchema: null,
        extra: { name: "USDC", version: "2" },
        maxTimeoutSeconds: 300,
      },
    ],
  };
}

// ───────────────────────── verify ─────────────────────────

type VerifyResult =
  | { ok: true; from: Address; authorization: Authorization; signature: Hex }
  | { ok: false; reason: string };

async function verifyPayment(headerB64: string): Promise<VerifyResult> {
  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(headerB64, "base64").toString("utf8"));
  } catch {
    return { ok: false, reason: "X-PAYMENT not valid base64 JSON" };
  }
  const a: Authorization | undefined = payload?.payload?.authorization;
  const sig: Hex | undefined = payload?.payload?.signature;
  if (!a || !sig) return { ok: false, reason: "missing authorization or signature" };

  if (usedNonces.has(a.nonce)) return { ok: false, reason: "nonce already used" };

  const now = Math.floor(Date.now() / 1000);
  if (Number(a.validAfter) > now) return { ok: false, reason: "validAfter not yet" };
  if (Number(a.validBefore) < now) return { ok: false, reason: "authorization expired" };

  if (a.to.toLowerCase() !== X402_RECIPIENT!.toLowerCase())
    return { ok: false, reason: "wrong recipient" };
  if (BigInt(a.value) < parseUnits(PRICE_USDC, 6)) return { ok: false, reason: "underpaid" };

  const valid = await verifyTypedData({
    address: a.from,
    domain: USDC_DOMAIN,
    types: TWA_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from: a.from,
      to: a.to,
      value: BigInt(a.value),
      validAfter: BigInt(a.validAfter),
      validBefore: BigInt(a.validBefore),
      nonce: a.nonce,
    },
    signature: sig,
  });
  if (!valid) return { ok: false, reason: "bad signature" };

  return { ok: true, from: a.from, authorization: a, signature: sig };
}

// ───────────────────────── settle on-chain ─────────────────────────

async function settle(
  authorization: Authorization,
  signature: Hex,
): Promise<{ txHash: Hex; gasUsed: bigint; blockNumber: bigint }> {
  // Split 65-byte signature into v, r, s as USDC's transferWithAuthorization expects.
  // sig layout: r (32 bytes) | s (32 bytes) | v (1 byte)
  const r = `0x${signature.slice(2, 66)}` as Hex;
  const s = `0x${signature.slice(66, 130)}` as Hex;
  const v = parseInt(signature.slice(130, 132), 16);

  const txHash = await serverWallet.writeContract({
    address: USDC_BASE_SEPOLIA,
    abi: USDC_TWA_ABI,
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

  const receipt = await basePublic.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
  return { txHash, gasUsed: receipt.gasUsed, blockNumber: receipt.blockNumber };
}

// ───────────────────────── handler ─────────────────────────

const server = http.createServer(async (req, res) => {
  if (req.url !== "/inference" || req.method !== "GET") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  const xPayment = req.headers["x-payment"];

  // Step a — no payment? respond 402 with requirements.
  if (!xPayment || typeof xPayment !== "string") {
    res.writeHead(402, { "content-type": "application/json" });
    res.end(JSON.stringify(paymentRequirements()));
    return;
  }

  // Step b — verify the signature.
  const verdict = await verifyPayment(xPayment);
  if (!verdict.ok) {
    res.writeHead(402, { "content-type": "application/json" });
    res.end(JSON.stringify({ ...paymentRequirements(), error: `Payment rejected: ${verdict.reason}` }));
    return;
  }

  // Step c — actually settle on-chain.
  let settlementTxHash: Hex | null = null;
  let settlementError: string | null = null;
  let gasUsed: string | null = null;
  let blockNumber: string | null = null;

  try {
    console.log(`[settle] submitting transferWithAuthorization for ${verdict.from} → ${verdict.authorization.to}`);
    const t0 = Date.now();
    const result = await settle(verdict.authorization, verdict.signature);
    settlementTxHash = result.txHash;
    gasUsed = result.gasUsed.toString();
    blockNumber = result.blockNumber.toString();
    console.log(`[settle] confirmed in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${settlementTxHash} (gas ${gasUsed}, block ${blockNumber})`);
    usedNonces.add(verdict.authorization.nonce);
  } catch (e: any) {
    settlementError = e?.shortMessage || e?.message || String(e);
    console.error(`[settle] FAILED: ${settlementError}`);
  }

  if (settlementError) {
    res.writeHead(402, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ...paymentRequirements(),
        error: `Settlement failed: ${settlementError}`,
      }),
    );
    return;
  }

  // Step d — return the resource + settlement receipt.
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      resource:
        "Summary of the most recent ERC-8004 working group meeting: registries finalised, validator stake parameters open, expected mainnet candidate by Q3 2026.",
      paidBy: verdict.from,
      settlementTxHash,
      gasUsed,
      blockNumber,
    }),
  );
});

server.listen(PORT, () => {
  console.log(`x402 spike server listening on http://localhost:${PORT}`);
  console.log(`Server account (settles on-chain):  ${serverAccount.address}`);
  console.log(`Recipient (USDC payTo):              ${X402_RECIPIENT}`);
  console.log(`Price:                                ${PRICE_USDC} USDC per /inference call`);
  console.log(`\nIn another terminal:  npm run spike\n`);
});
