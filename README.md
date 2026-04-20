# Obolark

> Every inter-agent call pays its passage.

[![Live](https://img.shields.io/badge/live-obolark.vercel.app-A63323)](https://obolark.vercel.app) [![Chain](https://img.shields.io/badge/Arc_testnet-5042002-3E5E47)](https://testnet.arcscan.app) [![License](https://img.shields.io/badge/license-MIT-1A140C)](./LICENSE)

**Obolark** is an **agent-to-agent micropayment economy** on the [Arc blockchain](https://www.arc.network), built for the **[Agentic Economy on Arc](https://lablab.ai/event/agentic-economy-arc)** hackathon (Apr 20–26, 2026 · sponsored by Circle + Arc).

Twenty-two [Penguin Alley](https://penguinalley.com) agents hire each other in sub-cent USDC for real knowledge work. Payments settle on Arc testnet in under a second via [Circle Nanopayments](https://www.circle.com/nanopayments) and the [x402](https://x402.org) protocol. Every endpoint returns a structured verdict from **Claude Haiku 4.5 / Opus 4.5** (via [AISA.one](https://aisa.one)). Reputation persists on-chain via [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004).

**Track:** 2 — Agent-to-Agent Payment Loop.

---

## Why this exists — the margin math

A `$0.003` research query is **economically impossible** on Ethereum L1 — traditional gas at ~$0.50/tx produces a **−16,567% margin**. On Arc with Circle Nanopayments batched settlement, the same query clears at **99.3% margin**.

This class of product cannot exist without this stack.

| Stack | Per-tx cost | Margin at $0.003/call |
|---|---|---|
| Ethereum L1 | ~$0.50 gas | **−16,567%** (impossible) |
| Arc + Circle Nanopayments (x402 batched) | ~$0.00003 effective | **+99.3%** (unlocked) |

## Status — live

- **Live dashboard:** [obolark.vercel.app](https://obolark.vercel.app) — tabbed Bureau Ledger with interactive `[ CROSS ]` button in every Tollkeeper row (judges can fire real Arc testnet tx from the browser)
- **Arc explorer:** [testnet.arcscan.app](https://testnet.arcscan.app)
- **72+ onchain transactions** (growing as judges interact) — see [`SMOKE-REPORT.md`](./SMOKE-REPORT.md)
- **5 monetized endpoints** live, each backed by real Claude via AISA (no mocks)
- **23 wallets:** 22 SCA (Circle dev-controlled) + 1 buyer EOA
- **ERC-8004 ReputationRegistry** deployed on Arc testnet at [`0x466b78ec4d8191f3d08a05b314cee24b961926b7`](https://testnet.arcscan.app/address/0x466b78ec4d8191f3d08a05b314cee24b961926b7) — every settled crossing auto-credits `giveFeedback`

## Architecture

```
Buyer-EOA ──HTTP GET /api/research──▶  Radar service (Next.js)
              ◀── 402 Payment Required + PAYMENT-REQUIRED header ──
              ── sign EIP-712 via Circle MPC @ $0.003 ──▶
                        │
                        ▼
                @circle-fin/x402-batching client
                (EIP-3009 transferWithAuthorization payload)
                        │
                        ▼
              ┌──────────┴──────────┐
              │                     │
        Gateway /verify          Direct-transfer fallback
        (currently blocked       (same EIP-3009 primitive,
         by Circle bug — see     Circle MPC signs, Arc
         CIRCLE_FEEDBACK §2.1)   settles in <1s)
                                      │
                                      ▼
                        Arc testnet batched settlement + real tx hash
                                      │
                                      ▼
                        ERC-8004 ReputationRegistry.giveFeedback(seller, +1)
                                      │
                                      ▼
                        Radar → AISA → Claude Haiku 4.5 → structured verdict
                                      │
                                      ▼
                        Buyer-EOA ◀── 200 OK + X-PAYMENT-RESPONSE receipt ──
```

**Honest note on Circle Gateway `/verify`:** we ship the complete x402 buyer-side scaffold (EIP-712 signing via Circle MPC, Gateway deposit, 402 challenge, PAYMENT-SIGNATURE header transport, BatchFacilitator plumbing). Circle's facilitator currently rejects our signed authorization with `authorization_validity_too_short` across every window we tested (60s / 300s / 1800s / 345600s). Settlement proceeds via the same EIP-3009 primitive x402 rides on top of — direct `transferWithAuthorization` from BUYER-EOA to seller SCA, Circle-MPC-signed, Arc-settled. Full reproducer + root-cause analysis lives in [`CIRCLE_FEEDBACK.md §2.1`](../penguin-alley-paco-v2/modules/hackathons/agentic-economy-arc/CIRCLE_FEEDBACK.md) (submitted for the $500 Circle Product Feedback incentive).

## Monetized endpoints

| Route | Seller | Price | Supervision fee | Description |
|---|---|---|---|---|
| `/api/research` | Radar | $0.003 | $0.0005 | Single research query (web search + synthesis) |
| `/api/design-review` | Pixel | $0.005 | $0.0005 | Design critique of a URL or image asset |
| `/api/qa` | Sentinel | $0.008 | $0.0005 | QA pass on a given route or PR diff |
| `/api/security-scan` | Phantom | $0.008 | $0.0005 | Security scan of code or a URL |
| `/api/audit` | Argus | $0.004 | $0.0005 | Audit report against PA·co quality gates |

Every request with no payment header returns `402 Payment Required` + base64 `PAYMENT-REQUIRED` challenge. Every paid request returns a real `X-PAYMENT-RESPONSE` with a settled Arc tx hash.

## Stack

| Layer | Tool |
|---|---|
| App | Next.js 16 · React 19 · TypeScript · Tailwind 4 |
| Payments | `@circle-fin/x402-batching` + `@circle-fin/developer-controlled-wallets` |
| Chain | `viem` · Arc testnet (chainId 5042002) · USDC `0x3600…0000` |
| Contracts | Solidity 0.8.34 compiled via `solc` npm package (no Hardhat/Foundry) · minimal ERC-8004 ReputationRegistry hand-written from the EIP-8004 spec (MIT, attribution in SPDX header) |
| Logs | structured JSON |
| Host | Vercel · Node runtime |
| LLM | Claude Haiku 4.5 / Opus 4.7 via AISA.one |

## Getting started

```bash
git clone https://github.com/PenguinAlleyApps/obolark.git
cd obolark
cp .env.local.example .env.local   # fill in CIRCLE_API_KEY + AISA_API_KEY
npm install
npm run dev                         # http://localhost:3000
```

First-run setup (idempotent):

```bash
node scripts/00-register-entity-secret.mjs     # generates + registers Entity Secret
node scripts/01-create-wallets.mjs             # creates 22 SCA wallets on Arc testnet
node scripts/02-fund-wallets.mjs               # distributes faucet USDC to all 22 agents
node scripts/15-deploy-reputation.mjs          # deploys ERC-8004 ReputationRegistry
node scripts/16-seed-reputation.mjs            # seeds 5 initial feedback entries
SMOKE_APP_URL=http://localhost:3000 node scripts/13-smoke-all.mjs   # umbrella smoke — 12 checks
```

## Hackathon submission artifacts

- **Demo video:** linked in submission form
- **Deployed app:** [obolark.vercel.app](https://obolark.vercel.app)
- **Smoke report:** [`SMOKE-REPORT.md`](./SMOKE-REPORT.md) — 10 PASS · 1 WARN · 1 FAIL against prod · 72+ onchain tx · reputation contract seeded · interactive `/api/cross` live. The 1 FAIL is Circle's `authorization_validity_too_short` on `/verify` (documented, filed for $500 Feedback incentive)
- **Architecture + decisions:** in `docs/` + `modules/hackathons/agentic-economy-arc/` (see PA·co monorepo for internal refinement)

## Which Circle products we used

1. **Circle Developer Console** — 22 SCA wallets + Entity Secret registry + Gateway deposit management
2. **Circle Dev-Controlled Wallets SDK** — `@circle-fin/developer-controlled-wallets` for all wallet orchestration
3. **Circle Nanopayments / Gateway** — `@circle-fin/x402-batching` as the verification + settlement facilitator on Arc
4. **USDC on Arc testnet** — real Circle-issued USDC, sub-cent pricing

## License

MIT — see [LICENSE](./LICENSE). Third-party notices in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## Related work

- [`EIP-8004 draft`](https://eips.ethereum.org/EIPS/eip-8004) — reputation/identity standard for autonomous agents. We hand-wrote a minimal `ReputationRegistry.sol` from the spec (MIT-licensed, SPDX-tagged) after the `ChaosChain/trustless-agents-erc-ref-impl` repo 404'd at deploy time.
- [`vyperlang/vyper-agentic-payments`](https://github.com/vyperlang/vyper-agentic-payments) — hackathon's Vyper-native scaffold (MIT). Obolark is the Node/Solidity counterpart
- [AISA.one](https://aisa.one) — external x402 seller our Radar agent calls for premium data

---

**Filed by PA·co · Penguin Alley · 2026**
