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

- **Live dashboard:** [obolark.vercel.app](https://obolark.vercel.app)
- **Arc explorer:** [testnet.arcscan.app](https://testnet.arcscan.app)
- **69 onchain transactions** validated via umbrella smoke ([`SMOKE-REPORT.md`](./SMOKE-REPORT.md))
- **5 monetized endpoints** live, each backed by real Claude via AISA
- **23 wallets:** 22 SCA (Circle dev-controlled) + 1 buyer EOA

## Architecture

```
Buyer-EOA ──HTTP GET /api/research──▶  Radar service (Next.js)
              ◀── 402 Payment Required + PAYMENT-REQUIRED header ──
              ── sign EIP-3009 @ $0.003 ──▶
                        │
                        ▼
                @circle-fin/x402-batching
                (verify + settle via Circle Gateway)
                        │
                        ▼
                Arc testnet batched settlement + real tx hash
                        │
                        ▼
                Radar → AISA → Claude Haiku 4.5 → structured verdict
                        │
                        ▼
                Buyer-EOA ◀── 200 OK + X-PAYMENT-RESPONSE receipt ──
```

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
| Contracts | Hardhat · Solidity 0.8.x · ERC-8004 from `ChaosChain/trustless-agents-erc-ri` (MIT+CC0) |
| Logs | `pino` structured JSON |
| Host | Vercel · Node runtime |
| LLM | Claude Haiku 4.5 / Opus 4.5 via AISA.one (x402-gated) |

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
npx tsx scripts/00-register-entity-secret.ts    # generates + registers Entity Secret
npx tsx scripts/01-create-wallets.ts            # creates 22 SCA wallets on Arc testnet
npx tsx scripts/02-fund-wallets.ts              # distributes faucet USDC to all 22 agents
npx tsx scripts/13-smoke-all.mjs                # umbrella smoke — 10 checks incl. tx count
```

## Hackathon submission artifacts

- **Demo video:** linked in submission form
- **Deployed app:** [obolark.vercel.app](https://obolark.vercel.app)
- **Smoke report:** [`SMOKE-REPORT.md`](./SMOKE-REPORT.md) — 10/10 PASS · 69 onchain tx
- **Architecture + decisions:** in `docs/` + `modules/hackathons/agentic-economy-arc/` (see PA·co monorepo for internal refinement)

## Which Circle products we used

1. **Circle Developer Console** — 22 SCA wallets + Entity Secret registry + Gateway deposit management
2. **Circle Dev-Controlled Wallets SDK** — `@circle-fin/developer-controlled-wallets` for all wallet orchestration
3. **Circle Nanopayments / Gateway** — `@circle-fin/x402-batching` as the verification + settlement facilitator on Arc
4. **USDC on Arc testnet** — real Circle-issued USDC, sub-cent pricing

## License

MIT — see [LICENSE](./LICENSE). Third-party notices in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## Related work

- [`ChaosChain/trustless-agents-erc-ri`](https://github.com/ChaosChain/trustless-agents-erc-ri) — ERC-8004 Solidity reference (CC0) we copy from
- [`vyperlang/vyper-agentic-payments`](https://github.com/vyperlang/vyper-agentic-payments) — hackathon's Vyper-native scaffold (MIT). Obolark is the Node/Solidity counterpart
- [AISA.one](https://aisa.one) — external x402 seller our Radar agent calls for premium data

---

**Filed by PA·co · Penguin Alley · 2026**
