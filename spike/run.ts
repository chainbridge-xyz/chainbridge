/**
 * ChainBridge — validation spike
 *
 * Runs ERC-8004 + ERC-4337 + x402 + (sketches of MCP / A2A) end-to-end.
 *
 * The point: feel the integration friction firsthand before designing the SDK.
 * Ugly-but-working > clean-but-speculative. Add to friction.md as you go.
 *
 * What's REAL here:
 *   - viem clients on Sepolia + Base Sepolia
 *   - ERC-4337 smart account provisioning via Pimlico (Base Sepolia)
 *   - EIP-3009 transferWithAuthorization signing (the x402 settlement primitive)
 *   - HTTP request to a real x402 server (run `npm run server` in another terminal)
 *
 * What's SIMULATED (and why):
 *   - ERC-8004 identity + reputation registries — testnet deployment status as of
 *     2026-05 is unclear; we run an in-memory mock with the right SHAPE so we can
 *     measure friction in a future task: "deploy our own minimal Identity Registry
 *     contract on Sepolia, swap mock for real."
 *   - x402 settlement on-chain — we sign the EIP-3009 authorization but do not
 *     actually submit the transfer to USDC. Friction question: who submits, when?
 */

import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatEther,
  formatUnits,
  type Address,
  type Hex,
  encodePacked,
  keccak256,
  parseAbi,
} from "viem";
import { baseSepolia, sepolia } from "viem/chains";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import { createSmartAccountClient } from "permissionless";
import { toSafeSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";

// ──────────────────────────────────────────────────────────────────────────
// 0. ENV + CLIENTS
// ──────────────────────────────────────────────────────────────────────────

const required = ["PRIVATE_KEY", "PIMLICO_API_KEY", "SEPOLIA_RPC", "BASE_SEPOLIA_RPC"] as const;
for (const k of required) {
  if (!process.env[k]) {
    console.error(`[FATAL] Missing env var: ${k}\nCopy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}

const PRIVATE_KEY = process.env.PRIVATE_KEY as Hex;
const PIMLICO_API_KEY = process.env.PIMLICO_API_KEY!;
const SEPOLIA_RPC = process.env.SEPOLIA_RPC!;
const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC!;
const X402_PORT = process.env.X402_PORT ?? "4242";

const owner = privateKeyToAccount(PRIVATE_KEY);

const sepoliaPublic = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });
const basePublic = createPublicClient({ chain: baseSepolia, transport: http(BASE_SEPOLIA_RPC) });
const baseWallet = createWalletClient({ chain: baseSepolia, transport: http(BASE_SEPOLIA_RPC), account: owner });

// USDC on Base Sepolia (Circle official testnet)
const USDC_BASE_SEPOLIA: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

// Pimlico — single client now exposes both bundler and paymaster RPCs
const pimlicoClient = createPimlicoClient({
  transport: http(`https://api.pimlico.io/v2/base-sepolia/rpc?apikey=${PIMLICO_API_KEY}`),
  entryPoint: { address: entryPoint07Address, version: "0.7" },
});

// ──────────────────────────────────────────────────────────────────────────
// STEP 1 — ERC-8004 IDENTITY (simulated registry)
// ──────────────────────────────────────────────────────────────────────────
//
// FRICTION: ERC-8004 testnet deployment status not verified as of 2026-05.
// For the spike we use an in-memory mock with the same SHAPE as the spec.
// Next task in the friction log: "Deploy a minimal Identity Registry on Sepolia."
//
// ERC-8004 Identity Registry shape (per draft):
//   register(agent: AgentInfo) -> agentId
//   resolve(agentId) -> AgentInfo
//   agentInfo: { name, capabilities[], endpoint, controller }

interface AgentInfo {
  agentId: string;
  name: string;
  capabilities: string[];
  endpoint: string;
  controller: Address;
}

const mockIdentityRegistry = new Map<string, AgentInfo>();

async function step1_registerAgent(): Promise<AgentInfo> {
  console.log("\n━━━ STEP 1 · ERC-8004 register agent (SIMULATED) ━━━");
  const agentId = `agent_${keccak256(encodePacked(["address", "uint256"], [owner.address, BigInt(Date.now())])).slice(0, 18)}`;
  const agent: AgentInfo = {
    agentId,
    name: "ResearchBot-Spike-001",
    capabilities: ["web-search", "summarize"],
    endpoint: `http://localhost:${X402_PORT}/inference`,
    controller: owner.address,
  };
  mockIdentityRegistry.set(agentId, agent);
  console.log(`  ✓ Registered: ${agentId}`);
  console.log(`    controller: ${agent.controller}`);
  console.log(`    endpoint:   ${agent.endpoint}`);
  console.log(`    [FRICTION] Real ERC-8004 needs an on-chain Identity Registry. Add to friction.md.`);
  return agent;
}

// ──────────────────────────────────────────────────────────────────────────
// STEP 2 — ERC-4337 SMART WALLET (real, on Base Sepolia)
// ──────────────────────────────────────────────────────────────────────────
//
// We use a Safe smart account via permissionless.js. This is REAL — the wallet
// is deployed on first UserOp. Pimlico's paymaster sponsors gas (free on testnet).
//
// FRICTION TO LOG:
//   - How long did first UserOp take? (typical: 5–15s)
//   - Did the Safe deploy succeed first try? (often: needs a small UserOp first)
//   - How clear are Pimlico errors when something is wrong? (notoriously cryptic)

async function step2_provisionSmartWallet() {
  console.log("\n━━━ STEP 2 · ERC-4337 provision smart account on Base Sepolia (REAL) ━━━");

  const eoaBalance = await basePublic.getBalance({ address: owner.address });
  console.log(`  EOA: ${owner.address}`);
  console.log(`  EOA balance on Base Sepolia: ${formatEther(eoaBalance)} ETH`);
  if (eoaBalance === 0n) {
    console.log(`  [WARN] EOA has 0 ETH on Base Sepolia. Get from: https://www.alchemy.com/faucets/base-sepolia`);
    console.log(`         (Paymaster will sponsor UserOps but EOA still pays nothing — this is just a sanity check.)`);
  }

  const safeAccount = await toSafeSmartAccount({
    client: basePublic,
    owners: [owner],
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    version: "1.4.1",
  });
  console.log(`  Smart account address: ${safeAccount.address}`);

  const smartClient = createSmartAccountClient({
    account: safeAccount,
    chain: baseSepolia,
    bundlerTransport: http(`https://api.pimlico.io/v2/base-sepolia/rpc?apikey=${PIMLICO_API_KEY}`),
    paymaster: pimlicoClient,
    userOperation: {
      estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
    },
  });

  // ── ACTION A — actually deploy the Safe via a no-op UserOp ──
  const codeBefore = await basePublic.getCode({ address: safeAccount.address });
  const wasDeployedBefore = !!codeBefore && codeBefore !== "0x";

  if (wasDeployedBefore) {
    console.log(`  ✓ Smart account already deployed — skipping UserOp`);
  } else {
    console.log(`  Deploying via no-op UserOp (paymaster sponsors gas)...`);
    const sendStart = Date.now();
    const txHash = await smartClient.sendTransaction({
      to: safeAccount.address, // self-call
      value: 0n,
      data: "0x",
    });
    const sendElapsed = ((Date.now() - sendStart) / 1000).toFixed(1);
    console.log(`  ✓ UserOp included after ${sendElapsed}s`);
    console.log(`    tx: ${txHash}`);
    console.log(`    https://sepolia.basescan.org/tx/${txHash}`);
    const receipt = await basePublic.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
    console.log(`    block ${receipt.blockNumber}, gas used ${receipt.gasUsed}`);
  }

  const codeAfter = await basePublic.getCode({ address: safeAccount.address });
  console.log(`  Deployed now? ${!!codeAfter && codeAfter !== "0x" ? "YES (real on-chain)" : "NO — something failed"}`);

  return { safeAccount, smartClient };
}

// ──────────────────────────────────────────────────────────────────────────
// STEP 3 — x402 PAYMENT (real signing, simulated settlement)
// ──────────────────────────────────────────────────────────────────────────
//
// Flow:
//   a. Client GETs /inference. Server returns HTTP 402 with payment requirements.
//   b. Client signs EIP-3009 transferWithAuthorization for that USDC amount.
//   c. Client retries with X-PAYMENT header. Server verifies the signature.
//   d. (PROD) Server submits the authorization to USDC contract for settlement.
//      (SPIKE) Server just verifies the signature and returns the resource.
//
// FRICTION TO LOG:
//   - Settlement timing: when does the server submit to chain? Sync? Async?
//   - What if the auth nonce was already used? (USDC EIP-3009 has replay protection)
//   - How do we batch many small payments? (this is the Settlement layer in our SDK)

interface PaymentRequirements {
  scheme: "exact";
  network: "base-sepolia";
  asset: Address; // token contract
  payTo: Address;
  maxAmountRequired: string; // wei-ish (USDC has 6 decimals)
  resource: string;
  description: string;
  mimeType: string;
  outputSchema: null;
  extra: { name: string; version: string };
  maxTimeoutSeconds: number;
}

const USDC_DOMAIN = (chainId: number) => ({
  name: "USDC",
  version: "2",
  chainId,
  verifyingContract: USDC_BASE_SEPOLIA,
});

async function step3_makePaidRequest(): Promise<{ resource: string; paid: string } | null> {
  console.log("\n━━━ STEP 3 · x402 paid HTTP request (REAL signing) ━━━");
  const url = `http://localhost:${X402_PORT}/inference`;
  console.log(`  GET ${url}`);

  // a. First request — expect 402
  let resp = await fetch(url);
  if (resp.status !== 402) {
    console.log(`  [FRICTION] Expected 402, got ${resp.status}. Is the x402 server running? (\`npm run server\` in another terminal)`);
    return null;
  }
  const requirements = (await resp.json()) as { accepts: PaymentRequirements[] };
  const req = requirements.accepts[0];
  console.log(`  ← 402 Payment Required`);
  console.log(`    asset:  ${req.asset}`);
  console.log(`    payTo:  ${req.payTo}`);
  console.log(`    amount: ${formatUnits(BigInt(req.maxAmountRequired), 6)} USDC`);

  // b. Sign EIP-3009 transferWithAuthorization
  const validAfter = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + req.maxTimeoutSeconds);
  const nonce = generatePrivateKey(); // 32 random bytes

  const signature = await baseWallet.signTypedData({
    account: owner,
    domain: USDC_DOMAIN(baseSepolia.id),
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from: owner.address,
      to: req.payTo,
      value: BigInt(req.maxAmountRequired),
      validAfter,
      validBefore,
      nonce,
    },
  });
  console.log(`  ✓ Signed EIP-3009 authorization`);
  console.log(`    nonce:  ${nonce}`);
  console.log(`    sig:    ${signature.slice(0, 22)}...`);

  // c. Retry with payment header
  const paymentPayload = {
    x402Version: 1,
    scheme: "exact",
    network: "base-sepolia",
    payload: {
      authorization: {
        from: owner.address,
        to: req.payTo,
        value: req.maxAmountRequired,
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
      },
      signature,
    },
  };
  resp = await fetch(url, {
    headers: { "X-PAYMENT": Buffer.from(JSON.stringify(paymentPayload)).toString("base64") },
  });
  if (resp.status !== 200) {
    console.log(`  [FRICTION] Retry failed: ${resp.status} ${await resp.text()}`);
    return null;
  }
  const data = (await resp.json()) as {
    resource: string;
    settlementTxHash?: string;
    gasUsed?: string;
    blockNumber?: string;
  };
  console.log(`  ← 200 OK — resource delivered: "${data.resource.slice(0, 60)}..."`);
  if (data.settlementTxHash) {
    console.log(`  ✓ ON-CHAIN SETTLED`);
    console.log(`    tx:    ${data.settlementTxHash}`);
    console.log(`    block: ${data.blockNumber}, gas used: ${data.gasUsed}`);
    console.log(`    https://sepolia.basescan.org/tx/${data.settlementTxHash}`);
  }

  return { resource: data.resource, paid: req.maxAmountRequired };
}

// ──────────────────────────────────────────────────────────────────────────
// STEP 4 — ERC-8004 REPUTATION ATTESTATION (simulated)
// ──────────────────────────────────────────────────────────────────────────

interface Attestation {
  about: string; // agentId
  by: string; // agentId
  rating: number;
  context: { jobId: string; paid: string };
  signature: Hex;
  timestamp: number;
}

const mockReputationLedger: Attestation[] = [];

async function step4_attestReputation(aboutAgent: AgentInfo, jobReceipt: { paid: string }) {
  console.log("\n━━━ STEP 4 · ERC-8004 reputation attestation (SIMULATED) ━━━");
  const message = {
    about: aboutAgent.agentId,
    rating: 5,
    context: { jobId: `job_${Date.now()}`, paid: jobReceipt.paid },
  };
  const sig = await baseWallet.signMessage({
    account: owner,
    message: JSON.stringify(message),
  });
  const att: Attestation = {
    about: aboutAgent.agentId,
    by: `self_${owner.address.slice(0, 10)}`,
    rating: 5,
    context: message.context,
    signature: sig,
    timestamp: Date.now(),
  };
  mockReputationLedger.push(att);
  console.log(`  ✓ Attestation logged`);
  console.log(`    about:  ${att.about}`);
  console.log(`    rating: ${att.rating}/5`);
  console.log(`    sig:    ${att.signature.slice(0, 22)}...`);
  console.log(`    [FRICTION] Real reputation needs an on-chain registry + sybil resistance. Add to friction.md.`);
}

// ──────────────────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  ChainBridge validation spike                                ║");
  console.log("║  Wires ERC-8004 + ERC-4337 + x402 end-to-end.                ║");
  console.log("║  Add observations to friction.md as you watch this run.      ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  const t0 = Date.now();

  const agent = await step1_registerAgent();
  const { safeAccount } = await step2_provisionSmartWallet();
  const payment = await step3_makePaidRequest();
  if (payment) {
    await step4_attestReputation(agent, { paid: payment.paid });
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Spike complete in ${elapsed}s.`);
  console.log(`Smart account: ${safeAccount.address} (counterfactual on Base Sepolia)`);
  console.log("");
  console.log("Now open friction.md and write down EVERY rough edge you noticed.");
  console.log("That file is the actual deliverable of week 1.");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main().catch((err) => {
  console.error("\n[SPIKE FAILED]", err);
  console.error("\nThat error is data. Add it to friction.md verbatim.");
  process.exit(1);
});
