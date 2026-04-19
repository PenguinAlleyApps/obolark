# Obolark

> Every inter-agent call pays its passage.

**Obolark** is an agent-to-agent micropayment economy on the [Arc blockchain](https://www.arc.network), built for the **Agentic Economy on Arc** hackathon (Apr 20–26, 2026 · lablab.ai · Circle + Arc).

Twenty-two [Penguin Alley](https://penguinalley.com) agents hire each other in sub-cent USDC for real knowledge work. Payments settle on Arc testnet in under a second via [Circle Nanopayments](https://www.circle.com/nanopayments) and the [x402](https://x402.org) protocol. Reputation persists on-chain via [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004).

**Track:** 2 — Agent-to-Agent Payment Loop.

## Why this exists

A `$0.003` research query is economically impossible on Ethereum L1 — traditional gas at ~$0.50/tx produces a **−16,567% margin**. On Arc with Circle Nanopayments batched settlement, the same query clears at **99.3% margin**. This class of product cannot exist without this stack.

## Status

**Day 0 / 7** — scaffolding in progress. See [`docs/`](./docs) (coming).

## Architecture

- **22 Circle dev-controlled SCA wallets** — one per PA·co agent
- **5 monetized endpoints** — `/research` `/design-review` `/qa` `/security-scan` `/audit` at $0.002–$0.008
- **`@circle-fin/x402-batching`** — primary facilitator on Arc testnet
- **ERC-8004 Identity + Reputation** — deployed to Arc, persists beyond the demo
- **Next.js 16 dashboard** — live 22-node agent graph + tx feed + balance snapshots

## Stack

| Layer | Tool |
|---|---|
| App | Next.js 16 · React 19 · TypeScript · Tailwind 4 |
| Payments | `@circle-fin/x402-batching` + `@circle-fin/developer-controlled-wallets` |
| Chain | viem · Arc testnet (chainId 5042002) |
| Contracts | Hardhat · Solidity 0.8.x · ERC-8004 from `ChaosChain/trustless-agents-erc-ri` (MIT+CC0) |
| Logs | pino (structured JSON) |
| Host | Vercel · Node runtime |

## Getting started

```bash
cp .env.local.example .env.local   # fill in CIRCLE_API_KEY + AISA_API_KEY
npm install
npm run dev                         # http://localhost:3000
```

First-run setup (once):
```bash
npx tsx scripts/00-register-entity-secret.ts    # generates + registers Entity Secret
npx tsx scripts/01-create-wallets.ts            # creates 22 SCA wallets on Arc testnet
npx tsx scripts/02-fund-wallets.ts              # distributes faucet USDC to all 22 agents
```

## License

MIT — see [LICENSE](./LICENSE). Third-party notices in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## Related work

- [`ChaosChain/trustless-agents-erc-ri`](https://github.com/ChaosChain/trustless-agents-erc-ri) — ERC-8004 Solidity reference (CC0) we copy from
- [`vyperlang/vyper-agentic-payments`](https://github.com/vyperlang/vyper-agentic-payments) — hackathon's Vyper-native scaffold (MIT). Obolark is the Node/Solidity counterpart
- [`vyperlang/erc-8004-vyper`](https://github.com/vyperlang/erc-8004-vyper) — Vyper ERC-8004 RI (AGPL-3.0 — **not** adopted, referenced for due diligence)
- [AISA.one](https://aisa.one) — external x402 seller our Radar agent calls for premium data
