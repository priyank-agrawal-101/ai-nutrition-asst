# Gusto NutriBite: Token Optimization and Efficiency

Status: Initial measurement guidance. Architecture limits are adopted starting defaults; monetary budgets and measured response-time targets remain unset.

Reduce model usage and repeated work without weakening answers, safety, or tests. Tokens are the units a model uses to measure input and output text.

## Development work

Follow the [README writing rules](../README.md#writing-rules).

- Search for relevant sections before reading large files.
- Reuse information already read unless it has changed.
- Record decisions in project docs so future work does not depend on chat history.
- Keep required instructions complete when shortening context.

## Model calls

| Area | Rule | Check |
| --- | --- | --- |
| Input | Send the instructions, current question, and relevant conversation history. Exclude unrelated chats and project documents. | Inspect a request sample with private data removed. |
| Long conversations | Set a history limit and a rule for handling it. Preserve context needed for follow-ups and safety. Measure any summarization approach. | Test long chats and later references to prohibited requests. |
| Prompt | Keep one current prompt. Check wording changes against the fixed question set. | Compare results across prompt versions. |
| Output | Allow enough space for the answer and claims. Reject cut-off output. | Validate complete and truncated responses. |
| Retries | Prevent duplicate calls and limit retries. Track network retries separately from regeneration after invalid output. | Count every attempt and its usage. |
| Code checks | Use code for validation and other fixed checks. Skip generation for code-handled refusals where the safety design permits. | Check behavior and model-call counts. |
| Model choice | Compare format compliance, safety, usefulness, speed, and cost. | Use the same questions and run conditions. |
| Caching | Distinguish reuse of prompt processing from reuse of a complete answer. | Measure actual cache use. Never reuse answers for consistency evaluations. |

## What to measure

- **Tokens:** Provider-reported input, output, and cache usage across all attempts, including failures where available.
- **Response time:** From accepting a request to returning a validated answer or final error.
- **Failures:** Invalid or cut-off output, provider errors, and retry counts.
- **Cost:** Reported cost, or a labeled estimate with a dated pricing reference.
- **Quality:** Results from the methods in `evaluation.md` and `testing.md`.

Keep unavailable values unknown, not zero. Respect provider definitions so overlapping token categories are not counted twice.

Compare the same questions, prompt version, model settings, conversation conditions, and retry policy. Include the number of runs with averages or percentiles. Measure app usage and coding-agent usage separately.

Follow `safety-and-security.md` for logging. Do not log secrets or collect extra personal data to measure efficiency.

## How to improve

1. Measure the current behavior.
2. Identify unnecessary usage or delay.
3. Change one thing where practical.
4. Run affected checks; re-run the fixed question set after prompt changes.
5. Compare usage, time, failures, and quality.
6. Keep useful changes that preserve required behavior. Record unclear results honestly.

Record each decision here with its date, reason, linked change, before/after measurements, quality checks, and outcome. Link to raw results rather than copying them.

Never hide failures, hardcode evaluation answers, or remove needed safety context to report savings.

## Decisions needed

| Decision | Document |
| --- | --- |
| User-facing limits and remaining cost/performance decisions | Product spec and adopted architecture defaults; set actual budgets before paid use |
| History, model compatibility, output/time/retry defaults, and caching | Architecture; preserve full bounded history and explicit-only retries |
| Usage storage and access | Data model; safety and security |
| Monitoring and reporting | Deployment and operations |

See the [document index](../README.md#document-index) for file locations. Store implemented settings in code and link to them here.

## 11 October 2026: Groq account budget

Pin GPT-OSS 120B for classification, generation and review rather than introduce three models without comparative evidence. The [settings](../src/server/llm/settings.ts) use 256 completion tokens for each verdict and 2,000 for the answer, including reasoning, with unchanged 10/25/10-second phases and 45/60-second shared/attempt deadlines. These limits are measured in targeted probes; they are not latency promises or quality evaluation.

The first live-check allocation is at most 20 calls and 40,000 total tokens, inside the owner's 30 RPM / 1,000 RPD / 8,000 TPM / 200,000 TPD account limits. All calls, including failed phases and compatibility probes, use a persistent reservation ledger. The runner paces independent groups; the product fails safely instead of waiting past its deadline. Full-history follow-ups can exhaust the small minute budget. Unknown usage consumes its reserved upper bound until expiry. Cache and reasoning are subsets, never added to total usage. No prompt-cache savings or cost reduction is claimed.

The initial compatibility configuration temporarily reserved 512 verdict tokens plus 512 framing tokens. It completed an initial answer but unnecessarily blocked the first follow-up before review. The three adapter samples reported 71–84 fewer input tokens than the entire serialized-request token count. The adopted setting returns verdicts to the planned 256 tokens and adds 128 framing tokens, retaining strict validation, all policy text, separate review and the account cap. See the preserved failure and rerun in [testing](testing.md#phase-2-implementation-evidence). This is a reservation adjustment, not a prompt-quality or cost-savings claim.

The [v2 classifier regression](evaluation.md#classifier-v2-regression) shortened repeated prompt wording while clarifying the educational boundary. In its four paired classifier-only probes, provider-reported input usage was exactly **564 tokens lower per v2 call** (v1: 1,741–1,790; v2: 1,177–1,226), with identical context and schemas within each pair. Output usage varied. This is observed input-token reduction for those probes, not a measured accuracy improvement, universal total-cost reduction or cache saving. Both versions selected the expected routes in all four pairs. Full-history answers still use three calls and remain subject to the same per-phase reservations and account limits.
