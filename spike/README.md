# ChainBridge — Validation Spike

Goal: wire ERC-8004 + ERC-4337 + x402 end-to-end in throwaway code, log every rough edge in [friction.md](friction.md), and use that log to design the real SDK.

> **The friction log is the deliverable. The code is throwaway.**

## What's real vs simulated

| Step | What we run | What it actually does |
|---|---|---|
| 1 — Identity | In-memory mock | Same `AgentInfo` shape as ERC-8004 spec. Real registry deployment is a follow-up task. |
| 2 — Smart wallet | **Real** ERC-4337 on Base Sepolia | Provisions a Safe smart account via permissionless.js + Pimlico. Counterfactual until first UserOp. |
| 3 — x402 payment | **Real** EIP-3009 signing | Real HTTP 402 dance, real signature verification on the server. **Settlement on-chain is NOT done** — see friction.md. |
| 4 — Reputation | In-memory mock | Real wallet signature on the message, but the attestation just sits in memory. |

This is on purpose. The ERC-4337 + x402 path is where most of the real friction lives; ERC-8004 is largely off-chain registry work that's easier to do once you've felt the rest.

## Setup (10 minutes)

### 1. Install
```bash
cd spike
npm install
```

### 2. Get keys
- **Alchemy** (free): https://www.alchemy.com — create an app for **Sepolia** and another for **Base Sepolia**
- **Pimlico** (free tier): https://dashboard.pimlico.io — copy your API key

### 3. Generate a fresh test wallet
```bash
npx tsx -e "import {privateKeyToAccount, generatePrivateKey} from 'viem/accounts'; const k=generatePrivateKey(); console.log('PRIVATE_KEY=', k); console.log('ADDRESS=', privateKeyToAccount(k).address);"
```
**Use a fresh key. Never use a wallet that holds real funds.**

### 4. Fund the wallet on testnets
- Sepolia ETH faucet: https://www.alchemy.com/faucets/ethereum-sepolia
- Base Sepolia ETH faucet: https://www.alchemy.com/faucets/base-sepolia
- Base Sepolia USDC faucet: https://faucet.circle.com (select Base Sepolia)

### 5. Configure
```bash
cp .env.example .env
# Edit .env with your RPC URLs, private key, Pimlico key
```

## Run

Two terminals:

```bash
# Terminal 1
npm run server
# → x402 server listening on http://localhost:4242
```

```bash
# Terminal 2
npm run spike
# → runs all 4 steps end-to-end, prints friction notes inline
```

## After the run

Open [friction.md](friction.md). Fill in every checkbox with what you actually noticed. That file becomes the spec for the real SDK.

## Files

| File | What it does |
|---|---|
| [run.ts](run.ts) | The spike runner — all 4 steps in one file |
| [server.ts](server.ts) | Minimal x402 server (returns 402, verifies EIP-3009, returns resource) |
| [friction.md](friction.md) | The actual deliverable. Fill it in. |
| [.env.example](.env.example) | Copy to `.env`, fill in keys |

## What this spike is NOT

- A library
- Production-ready
- A reference implementation
- Beautiful

It is **fast, honest, and friction-surfacing**. That's all it has to be.
