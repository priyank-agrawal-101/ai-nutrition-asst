# Gusto NutriBite: Product Specification

Status: Approved M1 implementation baseline, 11 October 2026. No implementation or test completion is claimed.

Source: [problemStatement.md](problemStatement.md).

Product identity: **Gusto NutriBite — Your personal AI nutrition companion**. The [name and tagline meaning](product-positioning.md#3-name-tagline-and-brand-meaning) connects the enjoyment of food with understandable nutrition insights; it does not change the requirements below.

This document defines what Milestone 1 must do and how to check it. Milestones are delivery checkpoints within an ongoing product; [product positioning](product-positioning.md) owns the audience strategy, selected Gusto NutriBite identity, and commercial hypotheses. The problem statement remains the source of truth for the actual product; brand reference material does not expand these requirements. Use the [document index](../README.md#document-index) for design, technical details, and test procedures.

Requirement labels:

- **Brief:** Required by the source.
- **Derived:** Needed to make a source requirement work.
- **Approved addition:** A previously proposed choice accepted for M1 on 11 October 2026.
- **Proposed:** An added choice that still needs review.

The approved [implementation plan](phase-wise-implementation-plan.md) records the delivery sequence. The owner accepted the draft chat/usability behavior, English scope, safety policies `POL-06`–`POL-12`, and the proposed single-app stack. The plan adopts existing configuration/retention values as initial defaults, subject to technical verification. Manual session-wide deletion is outside the assignment and deferred as [FB-001](feature-backlog.md#backlog); automatic expiry, revocation, and cleanup remain in M1.

## Users

Confirmed audience direction: India-first everyday adults, with room to expand globally. English at launch and an initial focus on adults making household food choices are adopted from [product positioning](product-positioning.md#6-audience-and-india-first-principles). Its personas remain hypotheses, not completed research.

| User | Needs |
| --- | --- |
| Person asking a question | A readable answer about food or nutrition, or a clear refusal with an appropriate referral. |
| Evaluator | Repeatable questions and records of answer failures. |
| Maintainer | Prompt history and a response format that can support retrieval later. |

Evaluator and maintainer describe project work; they do not require app accounts or an admin screen.

## Scope

Milestone 1 is a text chatbot using the model's own knowledge. It stores conversations, returns structured answers, applies safety checks, and records evaluation failures.

Milestone 2 adds retrieval: finding source material to support answers. Citations must fit the existing interface and response format.

**M1 exclusions:** registration, cross-device history, nutrition profiles, calorie tracking, meal plans, image recognition, voice, wearable integrations, payments, an evaluator dashboard, and manual session-wide deletion.

Excluded features are not future commitments. Safety limits apply in both milestones. References to "this week" in the brief mean Milestone 1; no delivery date is set.

## Conversation

| ID | Origin | Requirement | Acceptance check |
| --- | --- | --- | --- |
| CHAT-01 | Brief | Provide a text input and message list showing who sent each message. | A user submits a permitted question and reads the matching answer. |
| CHAT-02 | Derived | Use the active conversation to understand follow-ups. | A follow-up uses the previous topic; it never uses another conversation's messages. |
| CHAT-03 | Brief | Store messages in conversation order. | Saved exchanges can be retrieved in order and survive a server restart. |
| CHAT-04 | Approved addition | Allow a new conversation and restore the active one after a page refresh. | A new chat starts without old context. Refreshing restores saved messages within the supported browser session. |
| CHAT-05 | Derived | Show waiting, success, and failure states. | The user can tell each state apart. Repeated submission during a pending request does not create duplicate accepted turns. |
| CHAT-06 | Approved addition | Reject empty or oversized input before calling the model. | Invalid input gets a clear explanation without a model call. Input at the chosen size limit is accepted. |
| CHAT-07 | Derived | Handle timeouts, provider errors, invalid output, and storage failures. | Waiting ends, the question remains visible, and an error explains that the answer did not complete. Failed output is not shown as a successful answer. |

[UX flows](ux-flow.md) define retry, new chat, and expired-session behavior. Initial defaults are 2,000 Unicode code points per normalized question, a 16 KiB body, seven-day absolute session access, and at most 20 accepted turns or 8,000 conversation tokens. The [API](api-contract.md#question-normalization) owns counting/normalization; [architecture](architecture.md#initial-configuration-defaults) owns execution limits. Reject a new question that cannot fit the full history before generation, preserve the chat, and offer New chat. Do not silently summarize or discard earlier turns. Same-tab refresh recovery does not promise unsent-draft or cross-device recovery.

## Answers and sources

A **claim** is a factual statement in an answer, such as a quantity, food-handling instruction, or recommendation attributed to an authority.

A **schema** defines the required fields, types, and allowed values in a response. Passing schema checks does not prove an answer is true.

| ID | Origin | Requirement | Acceptance check |
| --- | --- | --- | --- |
| ANS-01 | Brief | Use structured model output: answer text and a list of claims, each with text and a source. | Every accepted answer matches the schema. Prose-only output is rejected, not rebuilt into a valid-looking response. |
| ANS-02 | Brief | Keep every claim source `null` in Milestone 1. | A non-null source fails validation. It is not silently replaced with `null`. |
| ANS-03 | Brief | Reject responses that fail validation. | Malformed, incomplete, cut-off, or invalid output is never displayed or saved as a successful answer. |
| ANS-04 | Derived | Include the answer's factual statements in its claims list. | The prompt requests this, and evaluation checks for missing or conflicting claims. |
| ANS-05 | Brief | Show a sources panel beside the conversation in the main layout. | It contains no source entries in Milestone 1. An empty-state message is allowed; placeholder citations are not. |
| ANS-06 | Approved addition | Explain that answers lack retrieved sources and may be wrong. | Users can find a clear, accessible notice in the chat experience. |
| ANS-07 | Derived | Keep answers relevant and concise; state uncertainty when needed. | Evaluation checks unsupported certainty and answers too vague to help. `prompt-spec.md` sets answer length and style. |

**Owner-directed assignment alignment, 13 October 2026:** Sources is a subtle, always-visible panel beside the conversation on desktop and directly below it on narrow screens. This restores ANS-05 and supersedes the 11 October placement inside **About this chat**. ANS-06 remains a small visible limitation notice; sources stay null and no retrieval capability is added. [UX](ux-flow.md#visual-direction-and-information-hierarchy) owns the placement and styling.

`api-contract.md` defines field names, types, and allowed empty lists. A refusal or clarification with no factual statements may have no claims; do not invent claims to fill the list.

A source named in answer text is not verified evidence. Record invented attributions in the failure log; do not turn them into source entries or verification badges.

## Safety

| ID | Origin | Requirement | Acceptance check |
| --- | --- | --- | --- |
| SAFE-01 | Brief | Decline calorie targets, weight targets, and advice about what someone should weigh. | Direct, rephrased, indirect, and later-turn requests receive a refusal without the requested target. |
| SAFE-02 | Brief | Decline medical advice, including what someone with a specific condition should eat. | Condition-specific tests receive no treatment recommendation or condition-specific diet. |
| SAFE-03 | Brief | Refer people asking for excluded advice to a qualified professional. | The refusal states the limit and referral without adding the prohibited advice. |
| SAFE-04 | Brief | Enforce safety limits in code as well as the prompt. | Code checks are present and tested on direct and contextual requests. Prompt instructions alone do not pass. |
| SAFE-05 | Derived | Answer permitted educational questions. | Evaluation records unnecessary refusals and vague answers, including on general nutrient requirements. |

The adopted [safety and security policy](safety-and-security.md) defines ambiguous, mixed, unrelated, urgent, sensitive, and harmful-food handling under `POL-06`–`POL-12`. The [edge-case catalogue](edge-cases.md) lists examples; [evaluation](evaluation.md) and [testing](testing.md) define how to verify them.

Record every observed safety failure. Passing a finite test set does not guarantee safety for all requests; release checks below still apply.

## Backend and usability

| ID | Origin | Requirement | Acceptance check |
| --- | --- | --- | --- |
| SYS-01 | Brief | Make model calls from the backend. | The browser uses the app backend and receives no provider credentials. It does not call the model provider directly. |
| SYS-02 | Derived | Separate visitors' conversations. | Changing a conversation ID does not let a visitor read or add to someone else's chat. |
| SYS-03 | Approved addition | Support desktop, mobile, and keyboard use. | Input, messages, errors, and sources work at the widths recorded during UI implementation, using the existing design references, with labels and visible focus. |
| SYS-04 | Derived | Limit request duration, context size, output size, and retries. | Configured limits are enforced. Each request ends with a valid answer or visible error within the service timeout. |
| SYS-05 | Approved addition | Measure efficiency changes. | Claimed savings have usage or response-time measurements and passing quality/safety checks under comparable conditions. Follow [the efficiency guide](token-optimization-and-efficiency.md). No optimization project or benchmark dashboard is required. |

Do not require medical records or a nutrition profile. Users may still share personal information. Enforce the [retention schedule](safety-and-security.md#retention-schedule): deny access at expiry/revocation and purge app-held payload within 24 hours. Verify logging, access, provider/backup retention, and notice details before public operation. Manual deletion is deferred; do not display or promise that control.

## Prompts and evaluation

| ID | Origin | Requirement | Acceptance check |
| --- | --- | --- | --- |
| PROMPT-01 | Brief | Define the role, answer style, answer length, and excluded topics in the system prompt. | The current prompt is documented. Once implemented, the document links to the prompt in code. |
| PROMPT-02 | Brief | Record prompt changes and re-run the fixed questions after every change. | Each evaluated version has a reason for the change and regression results: checks that previous behavior still works. |
| EVAL-01 | Brief | Run 10 fixed questions across nutrient requirements, food safety/storage, cooking, and questions without clear answers. | All four categories are covered. Every question has an ID, exact wording, and a recorded response. |
| EVAL-02 | Brief | Ask the same question three times. | Keep three fresh responses and compare facts and numbers under the conditions in `evaluation.md`. |
| EVAL-03 | Brief | Record unsupported facts, changing numbers, unfindable sources, missed refusals, and unhelpful hedging. | Observations link to responses; failures are grouped and counted. Mark reviewed responses even when no failure is found. |
| EVAL-04 | Brief | Test the required safety requests. | Record results for calorie-target and condition-specific questions asked directly, rephrased, indirectly, and after unrelated messages. |
| EVAL-05 | Brief | Keep failures; do not hardcode answers for evaluation questions. | Tests use normal app behavior, and unfavorable results remain recorded. |
| EVAL-06 | Derived | Keep enough run details for later comparison. | Record questions, conversation conditions, prompt version, model/settings, time, responses, and observations. Mark missing details as unknown. |

Manual review and a project failure log are sufficient; automatic fact-checking and a dashboard are not required. Software errors may be logged automatically.

`evaluation.md` defines questions, scoring, run conditions, and counting. `testing.md` defines software checks. `failure-log.md` stores actual results.

General prompt, software, and safety fixes are allowed. Preserve earlier results and re-run the required checks after changes.

## Deployment and Milestone 2

| ID | Origin | Requirement | Acceptance check |
| --- | --- | --- | --- |
| REL-01 | Brief | Keep the code on GitHub and deploy to a public URL. | Identify the deployed version and complete a real chat exchange through the deployed backend from an external browser. |
| REL-02 | Brief | Cover the required project details in the README. | Links open the current prompt, response schema, prompt-change reasons, safety enforcement, and chosen stack. |
| NEXT-01 | Brief | Keep the interface, endpoints, and response schema unchanged when adding retrieval. | Before finalizing the API contract, confirm sources can hold citation data later without changing the response shape. Milestone 1 still enforces `ANS-02`. |
| NEXT-02 | Brief | Reuse the same 10 questions for Milestone 2. | Keep question IDs, wording, original responses, run conditions, and observations for comparison. |

Railway alone is selected for the app and PostgreSQL. The brief's deployment tools allow this choice; Vercel is not an additional M1 requirement. Actual account capacity, cost, and hosting behavior still need verification.

`api-contract.md` must define a source field that accepts citation data or `null`. Milestone 1 requires `null`; it must not restrict all future versions to `null`.

## Completion and release

Milestone 1 is ready for review when:

1. The approved baseline is implemented, phase-specific prerequisites are resolved, and accepted requirements have passing evidence.
2. The public app completes the stored-conversation and structured-answer flow.
3. Required software and safety checks pass.
4. The 10-question run and three-response comparison have recorded results and failure counts.
5. README links work, and the response contract and results are ready for Milestone 2.

Unsupported or inconsistent claims may remain: recording them is part of this milestone. They must not be hidden.

Pre-deployment clearance covers local software/safety/evaluation evidence and operating readiness. Deployment and external-browser verification follow that clearance; only then can the public-app conditions and M1 completion be confirmed. Do not require a public verification result before deploying the candidate.

Broken response validation, exposed credentials, access to another visitor's chat, or unresolved failures of required safety checks block public release. Unsafe factual answers also require review under the safety policy.

## Remaining implementation prerequisites

| Prerequisite | Owning document | Needed before |
| --- | --- | --- |
| Pin compatible runtime/packages/PostgreSQL and provision isolated databases | Architecture, code conventions, testing | Database integration; independent scaffolding can proceed |
| Materialize the adopted public/runtime schemas and prove their invariants | API contract and data model | API completion |
| Verify exact model/endpoint, access, native schema support, settings, privacy, and a bounded call budget | Architecture and safety/security | Real model integration |
| Adapt and verify chat visual details and supported widths | Existing [design reference](design-references/wise/DESIGN.md), [preview](design-references/wise/preview.html), UX, and testing | During UI implementation; no new guide prerequisite |
| Freeze executable questions, assign reviewer/artifact handling, assemble references, and fund the run | Evaluation | Recorded live evaluation |
| Verify hosting limits, retention, notices, operator/contact, budget/alerts, and recovery | Safety/security and deployment/operations | Public operation |

No numerical performance target or monetary budget is set. Initial limits are configuration defaults, not measured service promises. Follow the [implementation plan](phase-wise-implementation-plan.md) and [README writing rules](../README.md#writing-rules) when decisions change.
