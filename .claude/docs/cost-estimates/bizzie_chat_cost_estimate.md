# bizzie_chat — Token Usage & Cost Estimate

## Overview

Estimates are per user request at realistic usage. Two Gemini models are used:
- **gemini-3.1-pro-preview** — guardian, fmp_agent, tavily_fallback_agent, ambassador_llm_node
- **gemini-3.1-flash-lite-preview** — follow_up_generator only

---

## Node-by-Node Token Breakdown

### guardian_classifier
| | Tokens |
|---|---|
| System prompt (classification instruction) | ~200 |
| User query | ~100 |
| Tool call output (structured JSON) | ~80 |
| **Total** | **~380 tokens** |

Model: gemini-3.1-pro-preview

---

### fmp_agent (stock query path — typical 2 tool cycles)
| | Tokens |
|---|---|
| System prompt + company context | ~400 |
| User query + conversation history | ~300 |
| Tool call 1 input + output | ~500 |
| Tool call 2 input + output | ~500 |
| Final response generation | ~300 |
| **Total** | **~2,000 tokens** |

Model: gemini-3.1-pro-preview
Note: worst case (5 tool cycles) approaches ~5,000 tokens.

---

### ambassador_llm_node (profile/comparison path)
| | Tokens |
|---|---|
| System prompt + FMP profile data | ~600 |
| User query + conversation history | ~300 |
| Response (ambassador mode) | ~400 |
| **Total** | **~1,300 tokens** |

Model: gemini-3.1-pro-preview

---

### tavily_fallback_agent (fallback path)
| | Tokens |
|---|---|
| System prompt | ~300 |
| Query + Tavily search results (~5 results) | ~2,000 |
| Response | ~400 |
| **Total** | **~2,700 tokens** |

Model: gemini-3.1-pro-preview

---

### follow_up_generator (all paths)
| | Tokens |
|---|---|
| System prompt | ~100 |
| Query summary | ~150 |
| Follow-up JSON output (3 questions) | ~150 |
| **Total** | **~400 tokens** |

Model: gemini-3.1-flash-lite-preview (significantly cheaper)

---

## Cost Per Request (Typical Path)

### Path A: FMP stock query (most common)
`guardian → stock_query_cb → fmp_agent → response_sanitizer + follow_up_generator → assembler`

| Node | Model | Input | Output | Cost |
|---|---|---|---|---|
| guardian | Pro | 380 | 80 | ~$0.001 |
| fmp_agent | Pro | 1,700 | 300 | ~$0.004 |
| follow_up_generator | Flash-Lite | 250 | 150 | ~$0.0001 |
| **Total** | | | | **~$0.005** |

### Path B: Ambassador / profile query
`guardian → ambassador_cb → ambassador_fmp_call → ambassador_llm → follow_up_generator → assembler`

| Node | Model | Input | Output | Cost |
|---|---|---|---|---|
| guardian | Pro | 380 | 80 | ~$0.001 |
| ambassador_llm | Pro | 900 | 400 | ~$0.003 |
| follow_up_generator | Flash-Lite | 250 | 150 | ~$0.0001 |
| **Total** | | | | **~$0.004** |

### Path C: Tavily fallback
`guardian → stock_query_cb → tavily → follow_up_generator → assembler`

| Node | Model | Input | Output | Cost |
|---|---|---|---|---|
| guardian | Pro | 380 | 80 | ~$0.001 |
| tavily | Pro | 2,300 | 400 | ~$0.006 |
| follow_up_generator | Flash-Lite | 250 | 150 | ~$0.0001 |
| **Total** | | | | **~$0.007** |

### Path D: Exit (non-stock / investment advice)
`guardian → exit_agent`

| Node | Model | Tokens | Cost |
|---|---|---|---|
| guardian | Pro | ~460 total | **~$0.001** |

---

## Monthly Cost Projection

| Users | Requests/Day (avg) | Monthly Requests | Avg Cost/Request | **Monthly Total** |
|---|---|---|---|---|
| 100 | 3 | 9,000 | $0.005 | **$45** |
| 500 | 3 | 45,000 | $0.005 | **$225** |
| 1,000 | 3 | 90,000 | $0.005 | **$450** |

*These estimates use Vertex AI pricing for Gemini 3.1 preview models. Actual pricing depends on GA pricing announced by Google.*

---

## Cost Controls in Place

1. **Rate limiting** — 20 requests/user/day cap prevents abuse
2. **guardian early exit** — off-topic / investment advice queries cost only ~$0.001
3. **max_tokens_response: 800** — caps output length for Pro model response nodes
4. **fmp_agent_max_tool_cycles: 5** — prevents runaway tool chains
5. **max_tokens_follow_up: 200** — Flash-Lite node is tightly bounded
6. **max_tokens_guardian: 150** — classifier output is minimal structured JSON
