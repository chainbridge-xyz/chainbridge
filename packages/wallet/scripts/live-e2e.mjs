/**
 * Live end-to-end check for @chainbridge/wallet against Base Sepolia.
 *
 * Not part of `npm test` — it needs funds, an API key, and a network. Run it
 * by hand when the vendored ERC-4337 slice changes:
 *
 *   set -a && . ../../spike/.env && set +a && node scripts/live-e2e.mjs
 *
 * Proves the whole vendored path: address derivation, paymaster sponsorship,
 * SafeOp signing, bundler submission, inclusion.
 */

import { createPublicClient, http, formatEther } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

import { createSmartWallet } from "../dist/index.js";

const { PRIVATE_KEY, BASE_SEPOLIA_RPC, PIMLICO_API_KEY } = process.env;
for (const [k, v] of Object.entries({ PRIVATE_KEY, BASE_SEPOLIA_RPC, PIMLICO_API_KEY })) {
  if (!v) { console.error(`Missing env var: ${k}`); process.exit(1); }
}

const owner = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: baseSepolia, transport: http(BASE_SEPOLIA_RPC) });
const bundlerUrl = `https://api.pimlico.io/v2/base-sepolia/rpc?apikey=${PIMLICO_API_KEY}`;

const wallet = createSmartWallet({ owner, chain: baseSepolia, publicClient, bundlerUrl });

console.log("owner:        ", owner.address);
console.log("smart account:", wallet.address, "(derived offline)");

const SPIKE_ACCOUNT = "0x4dc738b04445e4fd056A4421276Bf25753fABA52";
console.log("matches spike:", wallet.address.toLowerCase() === SPIKE_ACCOUNT.toLowerCase() ? "YES" : "NO");

const deployed = await wallet.isDeployed();
console.log("deployed:     ", deployed);

const balBefore = await publicClient.getBalance({ address: owner.address });
console.log("owner ETH:    ", formatEther(balBefore));

console.log("\nprovision()...");
const p = await wallet.provision();
console.log("  ", p.alreadyDeployed ? "already deployed — no UserOp sent" : `deployed in ${p.transactionHash}`);

console.log("\nestimate() for a no-op self-call...");
const est = await wallet.estimate([{ to: wallet.address, value: 0n, data: "0x" }]);
console.log("   maxCostWei:", est.maxCostWei.toString());
console.log("   sponsored: ", est.sponsored);

console.log("\nsendCalls() — real UserOp through the vendored path...");
const t0 = Date.now();
const receipt = await wallet.sendCalls([{ to: wallet.address, value: 0n, data: "0x" }]);
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`   included after ${elapsed}s`);
console.log("   userOpHash:   ", receipt.userOpHash);
console.log("   tx:           ", receipt.transactionHash);
console.log("   block:        ", receipt.blockNumber.toString());
console.log("   gasUsed:      ", receipt.gasUsed.toString());
console.log("   actualGasCost:", receipt.actualGasCost.toString());
console.log("   sponsored:    ", receipt.sponsored);
console.log("   https://sepolia.basescan.org/tx/" + receipt.transactionHash);

const balAfter = await publicClient.getBalance({ address: owner.address });
console.log("\nowner ETH after:", formatEther(balAfter));
console.log("owner ETH delta:", formatEther(balAfter - balBefore), receipt.sponsored ? "(should be 0 — paymaster paid)" : "(EOA paid)");
