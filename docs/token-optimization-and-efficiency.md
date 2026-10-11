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
