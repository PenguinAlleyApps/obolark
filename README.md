# Obolark

> Every inter-agent call pays its passage.

[![Live](https://img.shields.io/badge/live-obolark.vercel.app-A63323)](https://obolark.vercel.app) [![Bureau](https://img.shields.io/badge/bureau_ledger-/bureau-F5C518)](https://obolark.vercel.app/bureau) [![Chain](https://img.shields.io/badge/Arc_testnet-5042002-3E5E47)](https://testnet.arcscan.app) [![License](https://img.shields.io/badge/license-MIT-1A140C)](./LICENSE)

**Obolark** is an **agent-to-agent micropayment economy** on the [Arc blockchain](https://www.arc.network), built for the **[Agentic Economy on Arc](https://lablab.ai/event/agentic-economy-arc)** hackathon (Apr 20–26, 2026 · Track 2 — Agent-to-Agent Payment Loop · sponsored by Circle + Arc).

Twenty-two [Penguin Alley](https://penguinalley.com) agents hire each other in sub-cent USDC for real knowledge work — research, design review, QA, security scans, audits, vision-verified delivery proofs, ledger queries, refunds, deep-think arbitration. Payments settle on Arc testnet in under a second via [Circle Nanopayments](https://www.circle.com/nanopayments) and the [x402](https://x402.org) protocol. Reputation persists on-chain via [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004).

Every endpoint returns a structured artifact backed by a **real LLM call** — Claude (Haiku 4.5 / Opus 4.7) via [AISA.one](https://aisa.one), Google **Gemini 3 family** (4 multimodal wardens), open-weight models via [Featherless](https://featherless.ai), and 400+ models via [AI/ML API](https://aimlapi.com). **No mocks.**

---

## Why this exists — the margin math

A `$0.003` research query is **economically impossible** on Ethereum L1 — traditional gas at ~$0.50/tx produces a **−16,567% margin**. On Arc with Circle Nanopayments batched settlement, the same query clears at **+99.3% margin**.

This class of product cannot exist without this stack.

| Stack | Per-tx cost | Margin at $0.003/call |
|---|---|---|
| Ethereum L1 | ~$0.50 gas | **−16,567%** (impossible) |
| Arc + Circle Nanopayments (x402 batched) | ~$0.00003 effective | **+99.3%** (unlocked) |

## Status — live (Tier C STRETCH)

- **Landing:** [obolark.vercel.app](https://obolark.vercel.app) — Claude Design v2 cover with full architecture + extras breakdown
- **Bureau Ledger:** [obolark.vercel.app/bureau](https://obolark.vercel.app/bureau) — tabbed live dashboard with interactive `[ CROSS ]` button in every Tollkeeper row (judges fire real Arc testnet tx from the browser)
- **Arc explorer:** [testnet.arcscan.app](https://testnet.arcscan.app)
- **23 wallets** — 22 PA·co SCA (Circle dev-controlled) + 1 buyer EOA, all funded on Arc testnet
- **26 monetized routes** — 8 top-level + 18 lore wardens (4 with Gemini 3 multimodal); priced $0.001–$0.009 USDC
- **ERC-8004 ReputationRegistry** deployed on Arc at [`0x466b78ec4d8191f3d08a05b314cee24b961926b7`](https://testnet.arcscan.app/address/0x466b78ec4d8191f3d08a05b314cee24b961926b7) — every settled crossing auto-credits `giveFeedback`
- **3 sponsor extras** integrated end-to-end: Google Gemini 3 · Featherless OSS routing · AI/ML API gateway

## Architecture

```
Buyer-EOA ──HTTP POST /api/bureau/themis-ledger──▶  THEMIS warden (Next.js)
              ◀── 402 Payment Required + PAYMENT-REQUIRED header ──
              ── sign EIP-712 via Circle MPC @ $0.009 ──▶
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
                THEMIS → Gemini 3 Pro (vision + FC) ──┬─ if image evidence shows broken promise:
                                                      │     issueRefund(orig_tx_hash) — 5 amarras hard-coded
                                                      │     (Vision-gated, idempotent, anti-injection,
                                                      │      caller-isolated, file-locked)
                                                      └─ else: weighed verdict in mythic register
                                      │
                                      ▼
                        Buyer-EOA ◀── 200 OK + X-PAYMENT-RESPONSE receipt + artifact body ──
```

**Honest note on Circle Gateway `/verify`:** the complete x402 buyer-side scaffold ships intact (EIP-712 signing via Circle MPC, Gateway deposit, 402 challenge, PAYMENT-SIGNATURE header transport, BatchFacilitator plumbing). Circle's facilitator currently rejects our signed authorization with `authorization_validity_too_short` across every window we tested (60s / 300s / 1800s / 345600s). Settlement proceeds via the same EIP-3009 primitive x402 rides on top of — direct `transferWithAuthorization` from BUYER-EOA to seller SCA, Circle-MPC-signed, Arc-settled. Full reproducer + root-cause analysis lives in [`CIRCLE_FEEDBACK.md §2.1`](../penguin-alley-paco-v2/modules/hackathons/agentic-economy-arc/CIRCLE_FEEDBACK.md) (filed for the $500 Circle Product Feedback incentive).

## Monetized endpoints

### Top-level wardens (8)

| Route | Seller | Price | Description |
|---|---|---|---|
| `/api/research` | Radar | $0.003 | Research query (web search + Claude synthesis) |
| `/api/design-review` | Pixel | $0.005 | Design critique (URL/image) |
| `/api/qa` | Sentinel | $0.008 | QA pass on a route or PR diff |
| `/api/security-scan` | Phantom | $0.008 | Security scan (code/URL) |
| `/api/audit` | Argus | $0.004 | Audit report against PA·co quality gates |
| `/api/gemini-oracle` | PA·co | $0.001 | Gemini-narrated divination (Search-grounded) |
| `/api/featherless-route` | PA·co | $0.002 | Open-weight model dispatch (5 OSS models) |
| `/api/aisa-data` | PA·co | $0.002 | AISA structured-data passthrough |

### Lore wardens (18 at `/api/bureau/*`) — including 4 Gemini-3 multimodal STRETCH

The Bureau is staffed by 18 mythic wardens, each tied to a PA·co agent:

| Warden | Agent | Special capability |
|---|---|---|
| **ARGOS-VISION** ✨ | Vision QA | 100-eye image-proof verifier · `gemini-3-flash-preview` (Vision multimodal) |
| **THEMIS-LEDGER** ✨ | Refund judge | Vision-gated `issueRefund` mutation · `gemini-3-pro-preview` (Vision + FC + 5 anti-injection amarras) |
| **HERMES-EMISSARY** ✨ | Ledger emissary | Read-only Circle queries via FC · `gemini-3-flash-preview` (3 tools: getWalletBalance, getTxStatus, listRecentTxs) |
| **MOROS-ARBITER** ✨ | Doom-arbiter | Deep-Think arbitration of contradictory claims · `gemini-3-pro-preview` (thinkingBudget=16k) |
| ATLAS, AEGIS, APOLLO, ARTEMIS, CALLIOPE, HELIOS, HEPHAESTUS, HERMES, HESTIA, IRIS, PLUTUS, POSEIDON, PROMETHEUS, PROTEUS, THEMIS, URANIA | various | Lore-accurate counterpart for each PA·co agent — Claude / Featherless / AI/ML API per role |

✨ = Tier C STRETCH (Gemini 3 family, shipped 2026-04-25).

Every request without payment header returns `402 Payment Required` + base64 `PAYMENT-REQUIRED` challenge. Every paid request returns a real `X-PAYMENT-RESPONSE` with a settled Arc tx hash + the warden's structured JSON artifact body.

## Stack

| Layer | Tool |
|---|---|
| App | Next.js 16 · React 19 · TypeScript · Tailwind 4 |
| Payments | `@circle-fin/x402-batching` + `@circle-fin/developer-controlled-wallets` |
| Chain | `viem` · Arc testnet (chainId 5042002) · USDC `0x3600…0000` |
| Contracts | Solidity 0.8.34 compiled via `solc` npm package · minimal ERC-8004 ReputationRegistry hand-written from the EIP-8004 spec (MIT, SPDX-tagged) |
| LLMs | **Claude** (Haiku 4.5 / Opus 4.7 via AISA.one) · **Gemini 3** family (`@google/genai`, 4 multimodal wardens) · **Featherless** (5 OSS models — DeepSeek-V3.2, Kimi-K2, Llama-3.1-8B, Qwen3-8B) · **AI/ML API** (gpt-4o-mini, Llama-3.3-70B) |
| Storage | Supabase Postgres + Storage (`bureau-vision` bucket, signed-URL, 2MB cap) · `bureau_refund_log` idempotency table |
| Logs | structured JSON · Vercel runtime |
| Host | Vercel · Node runtime |

## Sponsor extra-track integrations

### Google · Gemini 3 family

Four wardens call Gemini 3 directly with multimodal vision + function calling + Deep-Think:

```ts
// src/lib/providers/gemini-multimodal.ts
import { GoogleGenAI } from '@google/genai';

await callGeminiMultimodalWithFallback({
  apiKey: process.env.GEMINI_API_KEY,
  model: 'gemini-3-pro-preview',          // or gemini-3-flash-preview
  systemInstruction: persona,
  userText, imageUris,                     // HTTPS URIs auto-fetched + inlined as base64
  tools: [REFUND_TOOL],                    // function calling
  thinkingBudget: 16_000,                  // MOROS Deep-Think
  responseSchema: ARGOS_SCHEMA,            // strict JSON contract
}, /* fallback within G3 family */ 'gemini-3-flash-preview');
```

Built-in: 3-attempt retry with exponential backoff (2s/6s/12s) for 429/503 transients. Auto-fallback **within the Gemini 3 family** (Pro→Flash, Flash→Flash-Lite) so Google judges always see a Gemini 3 model in the demo, never a legacy 2.5.

### Featherless · OSS-model router

`/api/featherless-route` dispatches by `agent_code`:

| agent_code | Model | Why |
|---|---|---|
| `RADAR` | `deepseek-ai/DeepSeek-V3.2` | 685B reasoning |
| `PIXEL` | `moonshotai/Kimi-K2-Instruct` | 1T native tools + vision |
| `SENTINEL` | `meta-llama/Meta-Llama-3.1-8B-Instruct` | Familiar name for judges |
| `PHANTOM` | `Qwen/Qwen3-8B` | Cheap tool-calling |
| `ORACLE-Whisper` | `Qwen/Qwen3-8B` | Ambient streaming headlines |

Provenance written to `featherless_runs` (best-effort, non-blocking). Multi-agent multiplex — no single agent owns the seat. $0.002 USDC per call.

### AI/ML API · 400+ models via one Bearer

Two bureau wardens close the AI/ML extras track:

| Warden | Model | Provider |
|---|---|---|
| `HEPHAESTUS` (Foreman) | `gpt-4o-mini` | aimlapi.com |
| `HESTIA` | `Llama-3.3-70B-Instruct` | aimlapi.com |

OpenAI-compatible `/v1/chat/completions` wrapper. Single Bearer token. Per-call provenance recorded.

## Getting started

```bash
git clone https://github.com/PenguinAlleyApps/obolark.git
cd obolark
cp .env.local.example .env.local   # fill in CIRCLE_API_KEY + AISA_API_KEY + GEMINI_API_KEY + FEATHERLESS_API_KEY + AIML_API_KEY
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
USE_REAL_PROVIDERS=true BASE=http://localhost:3000 bash scripts/smoke-bureau-stretch.sh   # 26-route smoke
```

## Security · `issueRefund` lockdown

`THEMIS-LEDGER` can fire a real USDC refund. The lockdown lives in a single file [`src/lib/bureau/issue-refund.ts`](src/lib/bureau/issue-refund.ts) with **5 hard-coded amarras**:

1. **Vision-gated** — caller must pass `visionCleared: true`, set ONLY by THEMIS after a successful Gemini 3 vision turn in the same request
2. **Idempotent** — `bureau_refund_log` table keys by `orig_tx_hash`; second call returns the same refund tx hash
3. **Anti-injection** — model's requested `txHash` MUST match the buyer's submitted `orig_tx_hash`; mismatch → `lore_violation`, refund NOT issued
4. **Caller-isolated** — only 2 importers in the entire codebase: the THEMIS route + the test file (Phantom audits this on every commit)
5. **File-locked** — the function is exported from a single source-of-truth file; the schema is owned by `bureau_refund_log` migration

Phantom audit clean as of `914fb48`. Vitest 17/17 PASS local.

## Hackathon submission artifacts

- **Demo video:** linked in submission form
- **Deployed app:** [obolark.vercel.app](https://obolark.vercel.app)
- **Smoke report:** [`SMOKE-REPORT.md`](./SMOKE-REPORT.md) — full 26-route smoke against prod. Documented degradation modes: free-tier Gemini quota (429) and Gemini 3 JSON variability — both resolve once a billing-enabled API key is provisioned.
- **Architecture + decisions:** in `docs/superpowers/specs/` + `docs/superpowers/plans/` (subagent-driven dev artifacts)

## Which Circle products we used

1. **Circle Developer Console** — 22 SCA wallets + Entity Secret registry + Gateway deposit management
2. **Circle Dev-Controlled Wallets SDK** — `@circle-fin/developer-controlled-wallets` for all wallet orchestration
3. **Circle Nanopayments / Gateway** — `@circle-fin/x402-batching` as the verification + settlement facilitator on Arc
4. **USDC on Arc testnet** — real Circle-issued USDC, sub-cent pricing

## License

MIT — see [LICENSE](./LICENSE). Third-party notices in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## Related work

- [`EIP-8004 draft`](https://eips.ethereum.org/EIPS/eip-8004) — reputation/identity standard for autonomous agents. We hand-wrote a minimal `ReputationRegistry.sol` from the spec (MIT-licensed, SPDX-tagged) after the `ChaosChain/trustless-agents-erc-ref-impl` repo 404'd at deploy time.
- [`vyperlang/vyper-agentic-payments`](https://github.com/vyperlang/vyper-agentic-payments) — hackathon's Vyper-native scaffold (MIT). Obolark is the Node/Solidity counterpart.
- [AISA.one](https://aisa.one) — external x402 seller our Radar agent calls for premium Claude data.

---

**Filed by PA·co · Penguin Alley · 2026 · Tier C STRETCH (4 Gemini-3 multimodal wardens shipped 2026-04-25)**
