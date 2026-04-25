# Obolark Gemini Extras — Tier C STRETCH (Spec)

Date: 2026-04-25
Locked-by: CEO (override of Compass recommendation)
Source: `state/handoffs/obolark-gemini-extras-debate_2026-04-25T0815.md`
Synthesis: `.superpowers/brainstorm/8897-1777104300/content/synthesis.html`

## Scope (5 wins, in order of rubric leverage)

1. **Zod fix** — relax `.max()` caps on iris/helios/atlas/urania/calliope; bump `maxTokens` 480→800 on 5 prose-heavy wardens. Smoke: 8/22 → 22/22 real-model.
2. **ARGOS-VISION** (`gemini-3-flash-preview`, multimodal) — delivery-proof analyzer. Buyer uploads ≤2 images (≤2MB each) via Supabase signed URL, Gemini reads via `fileUri`, returns truthful/staged/inconclusive verdict with 3 forensic observations.
3. **THEMIS-LEDGER** (`gemini-3-pro`, multimodal + Function Calling) — invoice/receipt OCR + on-chain refund. Single FC tool: `issueRefund(txHash: string)`. 5 amarras: dest=receipt.payer EOA, amount=receipt.amount exact, walletId=env literal, idempotent by txHash, Vision-gated (must follow successful image read).
4. **HERMES-EMISSARY** (`gemini-3-flash-preview`, FC) — read-only Circle queries. Tools: `getWalletBalance`, `getTxStatus`, `listRecentTxs`. Returns parchment narrating wallet state in ritual cadence.
5. **MOROS-ARBITER** (`gemini-3-pro`, Deep-Think `thinkingBudget`) — receives 2+ warden artifacts that contradict each other and resolves the conflict in mythic register. Tests Pro reasoning depth.
6. **Gemini-blue VFX** — CSS `--gemini-blue: #4285F4` accent layer on artifact cards when `provider==='gemini'`. NOT applied globally (EO-016 still blocks indigo-as-default).

## Invariants

- All 4 new wardens are x402-gated at sub-cent prices (per hackathon rule ≤ $0.01).
- USE_REAL_PROVIDERS=false → degraded mock path (payment still settles per gemini-oracle convention).
- `issueRefund()` lives in `src/lib/bureau/issue-refund.ts` ONLY. Importing from any other route is a P0 violation (Phantom audit).
- `bureau_refund_log` table is the idempotency source. Composite unique key = `(orig_tx_hash)`.
- Lore-firewall via existing `lore-guard.ts` applies to every warden body (no agent codenames not in ledger excerpt).

## Out of scope

- Tier A items already satisfied by Tier C inheritance.
- HERMES-EMISSARY writes (only reads). Mutations stay in THEMIS.
- Removing legacy `runProvider` (deferred per handoff §7).
- Re-pricing `gemini-oracle` (deferred).
- Vercel↔GitHub auto-deploy (deferred).
- Video deliverable (CEO skip).

## Acceptance gates

- 26/26 smoke real-model PASS (existing 22 + 4 new)
- `issueRefund` cannot be triggered without a successful Vision call in the same request (gate test in Task 5)
- Refund attempt with same `txHash` twice returns the original refund tx, not a new one
- Phantom self-audit: grep finds zero `issueRefund` imports outside `src/lib/bureau/issue-refund.ts` and `src/app/api/bureau/themis-ledger/route.ts`
