# Cost Estimate: bizzie_chat LangGraph Agent

**Date:** 2026-03-30
**Feature:** `bizzie_chat`
**Graph location:** `src/features/bizzie_chat/agent/`

---

## 1. Model Inventory

| Config key | Default model ID | Role |
|---|---|---|
| `model_flash_lite` | `gemini-3.1-flash-lite-preview` | Cheapest — classifier + follow-ups |
| `model_flash` | `gemini-3-flash-preview` | Mid-tier — ambassador, tavily, fmp (deep reasoning) |
| `model_pro` | `gemini-3.1-pro-preview` | Premium — configured but **not wired to any node** |

**Node-to-model mapping:**

| Node | Model |
|---|---|
| `guardian_classifier` | Flash-Lite |
| `fmp_agent` Shot 1 (plan) | Flash-Lite (standard) / Flash (deep reasoning) |
| `fmp_agent` Shot 2 (synthesize) | Flash-Lite (standard) / Flash (deep reasoning) |
| `ambassador_llm_node` | Flash |
| `tavily_fallback_agent` | Flash |
| `follow_up_generator` | Flash-Lite |
| `response_sanitizer`, `response_assembler` | No LLM call (pure Python) |
| `ambassador_fmp_call`, `*_circuit_breaker_check`, `exit_agent`, `price_redirect_agent`, `doc_summary_node`, `error_response_node` | No LLM call |

---

## 2. Model Pricing (Vertex AI, March 2026)

| Model | Input $/1M tokens | Output $/1M tokens |
|---|---|---|
| `gemini-3.1-flash-lite-preview` | $0.25 | $1.50 |
| `gemini-3-flash-preview` | $0.50 | $3.00 |
| `gemini-3.1-pro-preview` | $2.00 | $12.00 |

> Verify against [Vertex AI Pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing) — preview model pricing may change at GA.

---

## 3. Graph Paths

```
START
  └── guardian_classifier (Flash-Lite)
        ├── exit_agent ──────────────────────────────── END   [Path A]
        ├── price_redirect_agent ────────────────────── END   [Path B]
        ├── doc_summary_node ────────────────────────── END   [Path C]
        ├── error_response_node ─────────────────────── END   [Path D]
        │
        ├── ambassador_circuit_breaker_check (no LLM)
        │     ├── ambassador_fmp_call → ambassador_llm_node (Flash)
        │     │      └── [parallel] sanitizer + follow_up (Flash-Lite)
        │     │              └── assembler ──────────── END   [Path E]
        │     └── ambassador_llm_node (Flash, no FMP data)
        │            └── [parallel] sanitizer + follow_up (Flash-Lite)
        │                    └── assembler ──────────── END   [Path F]
        │
        └── stock_query_circuit_breaker_check (no LLM)
              ├── fmp_agent (2-shot: plan + synthesize)
              │     ├── [success] [parallel] sanitizer + follow_up
              │     │        └── assembler ──────────── END   [Path G / G-Deep]
              │     └── [fmp_error] tavily_fallback_agent (Flash)
              │              └── [parallel] sanitizer + follow_up
              │                       └── assembler ── END   [Path H]
              └── tavily_fallback_agent (Flash, CB open)
                       └── [parallel] sanitizer + follow_up
                                └── assembler ────────── END  [Path I]
```

---

## 4. Per-Node Token Estimates

### guardian_classifier (all paths)
Model: Flash-Lite | Cap: `max_tokens_guardian = 150`

| Component | Tokens |
|---|---|
| System prompt (classification instruction) | ~75 |
| GUARDIAN_CLASSIFIER_TOOL schema (8 properties) | ~350 |
| User message (company name + ticker + query) | ~80 |
| **Total input** | **~505** |
| Output (forced tool call JSON, capped at 150) | ~150 |

### ambassador_llm_node — Path E (with FMP data)
Model: Flash | Cap: `max_tokens_ambassador = 1200`

| Component | Tokens |
|---|---|
| CONCISE_DIRECTIVE + instruction block | ~30 |
| FMP JSON summary (truncated to 2000 chars) | ~500 |
| `_experience_instruction()` output | ~25 |
| User query + optional history (2 turns) | ~250 |
| **Total input** | **~955** |
| Output (capped at 1200) | ~700 |

### ambassador_llm_node — Path F (no FMP data)
Model: Flash | Cap: `max_tokens_ambassador = 1200`

| Component | Tokens |
|---|---|
| CONCISE_DIRECTIVE + instruction block (no JSON) | ~200 |
| User query + optional history | ~250 |
| **Total input** | **~475** |
| Output | ~600 |

### fmp_agent Shot 1: Plan
Model: Flash-Lite (standard) or Flash (deep reasoning)

The tool schema summary (up to 60 tools × ~32 tokens each) dominates input cost.

| Component | Standard | Deep reasoning |
|---|---|---|
| System prompt + company context | ~150 | ~170 |
| Tool schema summary (60 tools) | ~1,950 | ~1,950 |
| History + user query | ~250 | ~300 |
| **Total input** | **~2,350** | **~2,420** |
| Output (JSON tool call plan) | ~120 | ~180 |

### fmp_agent Shot 2: Synthesize
Model: Flash-Lite (standard) or Flash (deep reasoning)

FMP tool results are the dominant input. A mixed average of 3 tools at ~650 tokens each.

| Component | Standard (3 tools) | Deep reasoning (5 tools) |
|---|---|---|
| Synthesize prompt + instructions | ~120 | ~160 |
| FMP tool result blocks | ~2,000 | ~5,000 |
| User question | ~100 | ~150 |
| **Total input** | **~2,220** | **~5,310** |
| Output (no explicit cap, natural stop ~800-1500) | ~800 | ~1,500 |

### tavily_fallback_agent (2-cycle ReAct loop)
Model: Flash

Cycle 2 input dominated by Tavily results (~5 results × ~600 tokens each).

| Component | Cycle 1 | Cycle 2 |
|---|---|---|
| System prompt + history + query | ~430 | ~60 (carried forward) |
| Tavily results (5 results) | — | ~3,000 |
| **Input subtotal** | ~430 | ~3,060 |
| Output | ~60 | ~600 |
| **Total across 2 cycles** | **~3,490 in, ~660 out** | |

### follow_up_generator (all E–I paths)
Model: Flash-Lite | Cap: `max_tokens_follow_up = 200`

| Component | Tokens |
|---|---|
| System message + user prompt | ~140 |
| Output (3 JSON question strings) | ~100 |

---

## 5. Per-Path Cost

Rates: Flash-Lite in=$0.25/1M, out=$1.50/1M | Flash in=$0.50/1M, out=$3.00/1M

### Path A — Exit (off-topic)
`guardian → exit_agent → END`

| Node | Model | In tokens | Out tokens | Cost |
|---|---|---|---|---|
| guardian_classifier | Flash-Lite | 505 | 150 | $0.000351 |
| exit_agent | — | 0 | 0 | $0 |
| **Total** | | **505** | **150** | **$0.000351** |

### Path B — Price redirect
`guardian → price_redirect_agent → END`

| Node | Model | In tokens | Out tokens | Cost |
|---|---|---|---|---|
| guardian_classifier | Flash-Lite | 505 | 150 | $0.000351 |
| price_redirect_agent | — | 0 | 0 | $0 |
| **Total** | | **505** | **150** | **$0.000351** |

### Path C — Doc summary stub
`guardian → doc_summary_node → END`

| Node | Model | In tokens | Out tokens | Cost |
|---|---|---|---|---|
| guardian_classifier | Flash-Lite | 505 | 150 | $0.000351 |
| doc_summary_node | — | 0 | 0 | $0 |
| **Total** | | **505** | **150** | **$0.000351** |

### Path D — Error response
`guardian → error_response_node → END`

| Node | Model | In tokens | Out tokens | Cost |
|---|---|---|---|---|
| guardian_classifier | Flash-Lite | 505 | 150 | $0.000351 |
| error_response_node | — | 0 | 0 | $0 |
| **Total** | | **505** | **150** | **$0.000351** |

### Path E — Ambassador with FMP data
`guardian → ambassador_cb → ambassador_fmp_call → ambassador_llm → follow_up → END`

| Node | Model | In tokens | Out tokens | Cost |
|---|---|---|---|---|
| guardian_classifier | Flash-Lite | 505 | 150 | $0.000351 |
| ambassador_circuit_breaker_check | — | 0 | 0 | $0 |
| ambassador_fmp_call | — | 0 | 0 | $0 |
| ambassador_llm_node | Flash | 955 | 700 | $0.002578 |
| follow_up_generator | Flash-Lite | 140 | 100 | $0.000185 |
| **Total** | | **1,600** | **950** | **$0.003114** |

### Path F — Ambassador without FMP data (circuit breaker open)
`guardian → ambassador_cb → ambassador_llm (no FMP) → follow_up → END`

| Node | Model | In tokens | Out tokens | Cost |
|---|---|---|---|---|
| guardian_classifier | Flash-Lite | 505 | 150 | $0.000351 |
| ambassador_llm_node | Flash | 475 | 600 | $0.002038 |
| follow_up_generator | Flash-Lite | 140 | 100 | $0.000185 |
| **Total** | | **1,120** | **850** | **$0.002574** |

### Path G — FMP stock query, standard (most common path)
`guardian → stock_cb → fmp_agent [Flash-Lite, 2-shot, ~3 tools] → follow_up → END`

| Node | Model | In tokens | Out tokens | Cost |
|---|---|---|---|---|
| guardian_classifier | Flash-Lite | 505 | 150 | $0.000351 |
| stock_query_circuit_breaker_check | — | 0 | 0 | $0 |
| fmp_agent Shot 1 (plan) | Flash-Lite | 2,350 | 120 | $0.000768 |
| fmp_agent Shot 2 (synthesize) | Flash-Lite | 2,220 | 800 | $0.001755 |
| follow_up_generator | Flash-Lite | 140 | 100 | $0.000185 |
| **Total** | | **5,215** | **1,170** | **$0.003059** |

### Path G-Deep — FMP stock query, deep reasoning
`guardian → stock_cb → fmp_agent [Flash, 2-shot, 4-5 tools] → follow_up → END`

| Node | Model | In tokens | Out tokens | Cost |
|---|---|---|---|---|
| guardian_classifier | Flash-Lite | 505 | 150 | $0.000351 |
| fmp_agent Shot 1 (plan) | Flash | 2,420 | 180 | $0.001750 |
| fmp_agent Shot 2 (synthesize) | Flash | 5,310 | 1,500 | $0.007155 |
| follow_up_generator | Flash-Lite | 140 | 100 | $0.000185 |
| **Total** | | **8,375** | **1,930** | **$0.009441** |

### Path H — FMP failure → Tavily fallback
`guardian → stock_cb → fmp_agent [fails, Shot 1 only] → tavily [Flash, 2 cycles] → follow_up → END`

| Node | Model | In tokens | Out tokens | Cost |
|---|---|---|---|---|
| guardian_classifier | Flash-Lite | 505 | 150 | $0.000351 |
| fmp_agent Shot 1 (aborted) | Flash-Lite | 2,350 | 120 | $0.000768 |
| tavily_fallback_agent (2 cycles) | Flash | 3,490 | 660 | $0.003725 |
| follow_up_generator | Flash-Lite | 140 | 100 | $0.000185 |
| **Total** | | **6,485** | **1,030** | **$0.005029** |

### Path I — Circuit breaker open → Tavily direct
`guardian → stock_cb (fmp_available=False) → tavily [Flash, 2 cycles] → follow_up → END`

| Node | Model | In tokens | Out tokens | Cost |
|---|---|---|---|---|
| guardian_classifier | Flash-Lite | 505 | 150 | $0.000351 |
| tavily_fallback_agent (2 cycles) | Flash | 3,490 | 660 | $0.003725 |
| follow_up_generator | Flash-Lite | 140 | 100 | $0.000185 |
| **Total** | | **4,135** | **910** | **$0.004261** |

### Worst case — Path G-Deep + Big Hammer fallback (tail case, ~1% of requests)
When Shot 2 returns empty content, a 3rd LLM call is issued as a fallback.

| Node | Model | In tokens | Out tokens | Cost |
|---|---|---|---|---|
| All of Path G-Deep | Flash + Flash-Lite | 8,375 | 1,930 | $0.009441 |
| fmp_agent Shot 3 (Big Hammer) | Flash | 5,500 | 1,500 | $0.007250 |
| **Total** | | **13,875** | **3,430** | **$0.016691** |

---

## 6. Summary Table — All Paths

| Path | Description | LLM calls | Total tokens | **Cost per request** |
|---|---|---|---|---|
| A | Exit (off-topic) | 1 | 655 | **$0.000351** |
| B | Price redirect | 1 | 655 | **$0.000351** |
| C | Doc summary stub | 1 | 655 | **$0.000351** |
| D | Error response | 1 | 655 | **$0.000351** |
| F | Ambassador, no FMP | 2 | 1,970 | **$0.002574** |
| E | Ambassador + FMP data | 2 | 2,550 | **$0.003114** |
| G | FMP stock query, standard | 3 | 6,385 | **$0.003059** |
| I | Tavily direct (CB open) | 2 | 5,045 | **$0.004261** |
| H | FMP fail → Tavily | 3 | 7,515 | **$0.005029** |
| G-Deep | FMP stock query, deep reasoning | 3 | 10,305 | **$0.009441** |
| G-Deep + Big Hammer | Worst-case tail | 4 | 17,305 | **$0.016691** |

**Optimal path:** A / B / C / D — $0.000351 (guardian-only exits with static responses)

**Most expensive normal path:** G-Deep — $0.009441 (Flash for both fmp_agent shots, large tool schemas + FMP payloads)

**Absolute worst case:** G-Deep + Big Hammer — $0.016691 (tail path, fires only on empty-response safety blocks)

---

## 7. Operational Cost Projections

Assumed traffic mix:

| Path | Mix |
|---|---|
| G (standard stock query) | 50% |
| G-Deep (deep reasoning) | 15% |
| E (ambassador + FMP) | 15% |
| A/B/C/D (exits, price redirect, doc summary) | 10% |
| I (Tavily direct, CB open) | 7% |
| H (FMP fail → Tavily) | 3% |

**Blended average cost per request: ~$0.0044**

| Active users | Requests/day (3/user) | Monthly requests | Monthly cost |
|---|---|---|---|
| 100 | 300 | 9,000 | ~$40 |
| 500 | 1,500 | 45,000 | ~$198 |
| 1,000 | 3,000 | 90,000 | ~$396 |
| 5,000 | 15,000 | 450,000 | ~$1,980 |

---

## 8. Cost Controls Already in Place

| Control | Location | Effect |
|---|---|---|
| `max_tokens_guardian = 150` | `config.py` → `guardian_classifier` | Caps Flash-Lite output on busiest node |
| `max_tokens_ambassador = 1200` | `config.py` → `ambassador_llm_node` | Caps Flash output on advice responses |
| `max_tokens_follow_up = 200` | `config.py` → `follow_up_generator` | Tightest cap, cheapest model |
| Tool schema truncated to 120 chars/tool | `fmp.py` | Reduces tool description token cost |
| FMP tool list capped at 60 | `fmp.py` | Prevents unbounded schema injection |
| `required_data_categories` filtering | `fmp.py` | Narrows tool list before Shot 1 |
| Circuit breaker (3 failures / 120s) | `circuit_breaker.py` | Avoids repeated FMP failures wasting tokens |
| Static exits for off-topic / price-only | `guardian.py` | Cheapest resolution for ~10-15% of traffic |
| Rate limit 20 requests/user/day | upstream GCF layer | Bounds per-user monthly spend |

---

## 9. Optimization Recommendations

1. **Tool schema is the largest single cost driver.** Shot 1 of `fmp_agent` sends ~2,350 tokens mostly for the tool schema. If `required_data_categories` filtering is reliably populated, the tool list can reduce from ~60 to 5-15 tools, saving ~1,500-1,800 input tokens per standard stock query.

2. **`fmp_agent` has no `max_tokens` cap on its LLM constructor.** Both shots are uncapped at the API layer. Adding `max_output_tokens=1500` to the Shot 2 Flash call prevents unexpected cost spikes on verbose responses.

3. **`model_pro` is configured but unused.** If any node is later wired to `gemini-3.1-pro-preview`, per-request cost on that path increases by 4-8x. Document this explicitly before use.

4. **Tavily paths cost roughly the same as deep-reasoning FMP.** Keeping FMP reliability high (and the circuit breaker threshold appropriately tuned) avoids unnecessary Tavily spend.

5. **Conversation history grows per turn.** Each turn in `conversation_history` adds ~100 tokens to ambassador and fmp_agent nodes. Cap history at 5-10 turns to bound per-request growth.

---

## 10. Notes and Assumptions

- Token estimates use 1 token ≈ 4 English characters. Gemini's tokenizer may differ by ±15%.
- FMP tool result payloads vary by endpoint (`historical-price-eod-full` returns years of OHLCV; `profile-symbol` returns ~800 bytes). Estimates use a mixed average of 3 tools at ~650 tokens each.
- The Big Hammer fallback (Shot 3) is treated as a ~1% tail case and excluded from the blended average.
- `model_pro` pricing is listed for completeness; no current node uses it.
- Pricing sourced from Vertex AI Pricing page and OpenRouter as of March 2026.
