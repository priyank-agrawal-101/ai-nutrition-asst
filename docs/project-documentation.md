# Gusto NutriBite: Project Documentation — Behind the Scenes

Last updated: 11 October 2026.

**Current stage:** Phase 1 is locally built and tested. Phase 2 implements Groq, safety enforcement and the chat UI, with software and live smoke evidence recorded; actual screen-reader review remains pending. Full Phase 3 evaluation and public deployment have not been completed. The [implementation plan](phase-wise-implementation-plan.md) owns phase status.

## Our approach

Understand the problem, define what should happen, map the user experience, then choose the technology and build in phases. Check each phase before moving on.

Treat the milestones as delivery and learning checkpoints for an ongoing product. Define its audience, value, brand promise, and operating expectations before visual design.

Use AI to help write and build. Keep proposed choices visible for review, and use test results to check whether the work meets the requirements.

## Steps taken

| Step | What we did | Why |
| --- | --- | --- |
| 1. Confirm the project | Checked the local folder and GitHub remote. | Keep all work in the right project. |
| 2. Capture the brief | Turned the original text into [problemStatement.md](problemStatement.md). | Keep the goals, limits, and milestones clear. |
| 3. Plan the documents | Listed 17 documents and gave each a separate purpose in the [README](../README.md#document-index). | Work one document at a time without repeating details. |
| 4. Define the product | Drafted [36 requirements and acceptance checks](product-spec.md). Marked proposed choices and open questions. | Explain what to build and how to check it before coding. |
| 5. Plan for efficiency | Added [token and efficiency guidance](token-optimization-and-efficiency.md). | Measure usage, cost, and response time without weakening quality or safety. |
| 6. Simplify the writing | Removed filler and repeated explanations while keeping requirements. | Make the docs useful to both PMs and developers. |
| 7. Map the experience | Drafted [eight UX flows](ux-flow.md), including refusals, errors, and recovery. | Decide what users see when things work and when they fail. |
| 8. Design the architecture | Drafted [architecture.md](architecture.md) with a proposed stack, request recovery, storage, safety gates, limits, deployment, and retrieval extension. | Provide a build design tied to the product and UX requirements. Choices remain proposed; nothing is built or tested. |
| 9. Define the API | Drafted [api-contract.md](api-contract.md) with endpoints, strict content schemas, session access, errors, and replay/retry behavior. | Make the frontend/backend boundary buildable and preserve the citation shape for Milestone 2. The contract is drafted; no API is implemented. |
| 10. Model the data | Drafted [data-model.md](data-model.md) with relationships, fields, constraints, attempt history, usage, deletion boundaries, and migrations. | Define how storage enforces the API's ownership and recovery rules. The model is drafted; no database or migrations have been created. |
| 11. Define safety and security | Drafted [safety-and-security.md](safety-and-security.md) with required refusals, proposed sensitive-request rules, privacy/retention, access controls, abuse limits, and release gates. | Make the enforcement and review expectations concrete. Choices remain proposals; the deletion API/UX amendment is still required before implementation. |
| 12. Define product positioning | Drafted [product-positioning.md](product-positioning.md) for the confirmed India-first audience, with an initial brand proposal, personas, copy guide, launch strategy, business options, and measures. Added it to the foundation index, bringing the current total to 18. | Guide design and ongoing product decisions beyond the milestones. Personas and market assumptions remain hypotheses. |
| 13. Adopt the selected brand and clarify scope | Set the name to Gusto NutriBite and tagline to "Your personal AI nutrition companion". Used the supplied brand text for meaning and tone, kept the problem statement as product/positioning authority, and removed the positioning document's launch dependencies and approval steps. | Apply the chosen identity without adding meal planning, tracking, personalised diets, or other capabilities from the reference. Design can proceed directly. |
| 14. Complete the brand-reference audit | Replaced the remaining generic product titles across authored documents, added the selected identity to UX guidance, and expanded the Gusto, NutriBite, full-name, and tagline meanings. Explicitly listed product positioning and brand guidelines in the README's reusable document set. | Correct incomplete propagation of the brand and retain this document type for future projects. Preserve the original `.txt` brief, requirement IDs, technical identifiers, and product scope. |
| 15. Make the Wise reference visual | Preserved the imported [Wise Markdown](design-references/wise/DESIGN.md) and created an [offline HTML preview](design-references/wise/preview.html) with colour and type controls, components, spacing, and prewritten Gusto chat states. Checked it in Edge at desktop, mobile, and 320px widths; verified form/dialog interactions, contrast calculations, recovery states, reduced motion, and print styles. Documented source inconsistencies and the substitute font. | Make the reference easy to inspect without treating it as the final product design. The README now pairs future Design Guides with HTML previews; this adds no launch dependency. |
| 16. Exclude disposable local files | Added a root [.gitignore](../.gitignore) for local secrets, dependencies, build output, generated test reports, logs, and `.tmp/` / `.preview-work/`. Verified ignore rules while keeping authored HTML previews, source tests, and lockfiles eligible for Git. | Keep local checks and caches out of the repository while retaining reusable project documentation. |
| 17. Specify the model prompts | Drafted [prompt-spec.md](prompt-spec.md) with exact shared/phase instructions, strict verdict contracts, constant refusal and clarification templates, answer/claim rules, full-context assembly, version history, and evaluation/build handoff. Updated the README index and next step. | Make the prompt pipeline buildable without changing the public API, required exclusions, or Milestone 1 null-source rule. Proposed choices remain visible; no app or live model results are claimed. |
| 18. Catalogue corner scenarios | Created [edge-cases.md](edge-cases.md) as the central home for scenario inputs, fixtures, expected outcomes, combined failures, coverage, and open dependencies across the whole documented project. Updated the README index and next document. | Give product review, implementation, testing, and evaluation one scenario reference. Required rules and draft choices remain distinct; no scenario execution or live results are claimed. |
| 19. Define evaluation | Drafted [evaluation.md](evaluation.md) with the ten-question set, three fresh consistency samples, a referenced safety suite, factual/evidence review, rating scales, failure-counting rules, artifact/log templates, and version/milestone comparison. Updated the README index and next step. | Make model evaluation reproducible without hiding unsupported claims, failed attempts, missing reviews, or safety blockers. This is a protocol draft; no provider calls, scores, or failure log have been produced. |
| 20. Make testing and implementation conventions concrete | Created [testing.md](testing.md) for isolation, fault injection, test layers, commands, and CI; created [code-conventions.md](code-conventions.md) for code/type/schema boundaries and implementation discipline. Replaced the architecture's repeated verification handoff with owner links and clarified adapter-probe versus app-evaluation order. | Reduce ambiguity before coding without copying scenarios, schemas, scoring, or release policy. The README now treats extra documents as conditional and identifies the remaining decisions in their existing homes. No code or test execution is claimed. |
| 21. Separate future ideas from product milestones | Created an empty [feature backlog](feature-backlog.md) and an initial [product roadmap](product-roadmap.md) based on the brief's M1/M2 commitments, leaving M3 unassigned. Added both to the README index. | Capture ideas without expanding approved scope, and distinguish milestone direction from detailed execution. No new features, deadlines, or implementation approvals were added. |
| 22. Audit and approve M1 delivery | Created the four-phase [implementation plan](phase-wise-implementation-plan.md), aligned approved scope/defaults and document handoffs, deferred manual deletion as FB-001, and separated pre-deployment clearance from deployed verification. Following the owner's correction, included existing Wise design files directly instead of requiring another guide. Added the requested simple [assignment comparison](problem-statement-alignment.md). | Keep delivery relevant to the original brief, make additions and complexity visible, and preserve safety/integrity. Documentation only: application work, paid calls, tests, deployment, and agent/operations documents remain outstanding. |
| 23. Prepare agent and operating guidance | Created short root [AGENTS.md](../AGENTS.md) and initial [deployment/operations guidance](deployment-and-operations.md) after the plan. Linked them from the index and implementation handoffs. | Give Phase 1 clear project/scope boundaries, isolated environments, maintenance/release procedures, and verification expectations without inventing runnable commands or provisioning resources. Runtime evidence remains pending. |

## What to reuse in future projects

Phase 1 implementation, 11 October 2026: created the single pinned Next.js app and strict v1 schemas, one PostgreSQL migration, anonymous ownership/CSRF, durable turn/attempt/call records, explicit replay/retry, bounded context, quotas, deadline reconciliation and scoped cleanup. Added a clearly labelled scripted local interface and project-owned database/process launchers. Real PostgreSQL tests exercise invalid fixtures, races, uncertain commits, expiry and restart; browser tests exercise saved recovery and inert rendering. See [the plan](phase-wise-implementation-plan.md) and [dated software evidence](testing.md#phase-1-implementation-evidence) for final status and preserved initial failures. No paid model call, evaluation, deployment or GitHub push was performed.

- Separate requirements from suggestions and unanswered questions.
- Describe failure paths as well as successful ones.
- Keep details in one place and link to them.
- Optimise for resolved decisions, not document count; create related documents together only when they have distinct responsibilities.
- Record what was actually built and checked, not just what was planned.
- Pair each Design Guide with a visual HTML preview, and keep temporary browser checks separate from authored previews.

## Next step

The status/rate-limit repair and temporary local diagnostic capture are implemented. The owner-requested `m1-prompts-v2` classification update has software verification and a [recorded live regression](evaluation.md#classifier-v2-regression); consult that record for completed and unrun cases. Complete the remaining policy-extension, factual and accessibility reviews under Phase 3 in the [implementation plan](phase-wise-implementation-plan.md). Preserve stored data and recovery guarantees, and distinguish built, tested, evaluated and deployed work.

## 11 October 2026: Phase 2 implementation

The owner selected Groq instead of OpenAI/Anthropic. The local assistant now has the adopted versioned prompts/templates, deterministic input/output rules, strict classifier/reviewer schemas, Groq GPT-OSS 120B adapter, provider usage/account reservations, additive migration and generation controls. The UI includes draft confirmation, input limits, keyboard/IME behavior, recovery, responsive sources and a truthful Groq data notice.

See [Phase 2 testing evidence](testing.md#phase-2-implementation-evidence) and [the implementation plan](phase-wise-implementation-plan.md). Software tests, model compatibility/smoke, full factual evaluation, assistive-technology review and public deployment are separate evidence categories. Phase 3/4 are not completed by this work.

## Verify stored user messages in VS Code

Status/rate-limit repair, 11 October 2026: corrected recovery success reporting, separated provider quota/capacity failures from safety failures, added durable retry times and upstream cooldown, and added pre-acceptance availability checks. The UI retains drafts and waits for explicit retry. Existing failure records are preserved. Rejected-answer capture remains disabled; the [evaluation diagnostic recommendation](evaluation.md) defines a future synthetic-only capture boundary. Verification is recorded in [testing](testing.md).

Subsequent owner request, 11 October 2026: implemented temporary local diagnostic capture to inspect rejected model responses and input decisions. This supersedes the earlier capture proposal above. The facility is separate from ordinary messages, uses an expiring operator switch and automatic cleanup, and is not a claim that classification quality has been corrected. Exact controls and privacy limits are in [operations](deployment-and-operations.md#temporary-local-diagnostics).

Added 11 October 2026 following the owner's local storage walkthrough. This is a manual inspection procedure; formal persistence test evidence remains in [testing](testing.md#phase-2-implementation-evidence).

PostgreSQL stores its internal files under `.tmp/local/cluster/data`. Tables do not appear as named files in VS Code Explorer. Connect to the running database to read them; do not edit its internal storage files.

### Connect with SQLTools

1. Keep the local app running. If it is stopped, use `npm run dev` from this repository after completing the [local setup](../README.md#run-the-local-assistant).
2. In VS Code, open **Extensions** (`Ctrl+Shift+X`) and install **SQLTools** and **SQLTools PostgreSQL/Cockroach Driver**.
3. Open the **SQLTools** sidebar, select **Add New Connection**, and choose **PostgreSQL**.
4. Enter the following settings. Local ports are allocated per installation, so read the saved value rather than assuming a fixed port.

   | Setting | Value |
   | --- | --- |
   | Connection name | `Gusto Local` |
   | Server / Host | `127.0.0.1` |
   | Port | The `port` value in `.tmp/local/cluster/owner.json` |
   | Database | `nutribite_local` |
   | Username | `nutribite_local_runtime` |
   | Password | The `runtimePassword` value in `.tmp/local/app.json`, without surrounding quotes |
   | SSL | Disabled for this loopback connection |

5. Use the extension's password prompt or secure credential storage; keep the password out of workspace settings, screenshots and Git. Select **Test Connection**, then **Save Connection** and **Connect**.
6. Expand **Gusto Local → nutribite_local → public → Tables**. Some extension versions omit a level. Right-click **messages** and select **Show Table Records**, or open a query connected to **Gusto Local**.

### Check a saved question

Run this read-only query to see the latest user messages with their current request status:

```sql
SELECT m.id AS message_id,
       m.created_at,
       t.conversation_id,
       m.user_text,
       t.status AS turn_status,
       a.failure_code
FROM public.messages AS m
JOIN public.turns AS t ON t.id = m.turn_id
JOIN public.attempts AS a ON a.id = t.current_attempt_id
WHERE m.role = 'user'
ORDER BY m.created_at DESC, m.id
LIMIT 50;
```

1. Find a question already visible in your chat and match it to `user_text` in the results. Reading existing messages makes no Groq call. Sending a new question in Groq mode does use the configured provider budget.
2. Note its `message_id`, refresh the existing chat tab, and run the query again. The same row and ID should remain; refreshing should not create another user message.
3. A `failed` turn can still have a successfully stored user question. An assistant message is stored only after its answer passes validation and safety review and commits successfully. Rejected candidates are not saved as assistant messages.

For a simple view of both user and accepted assistant messages, run:

```sql
SELECT id, turn_id, created_at, role, user_text,
       content ->> 'answer' AS assistant_answer
FROM public.messages
ORDER BY created_at DESC, id
LIMIT 50;
```

| Table | What to inspect |
| --- | --- |
| `messages` | Saved user text and accepted assistant content |
| `turns` | Question order, conversation ID and current status |
| `attempts` | Initial attempt, retries and failure details |
| `provider_calls` | Model phases, validation results and recorded token usage |

These queries inspect the local database directly; the browser API additionally enforces session ownership. Records remain subject to the configured automatic expiry and cleanup. See the [data model](data-model.md) for field meanings and [operations](deployment-and-operations.md#phase-2-groq-local-operation) for local runtime behavior.

## Inspect rejected model responses

1. Keep the upgraded local app running. In the project terminal, run `npm run diagnostics:on` to enable capture for 24 hours, then refresh the existing chat tab. The page shows a local-diagnostics notice. Enabling capture does not call Groq.
2. Use the existing SQLTools connection and refresh its table list. Expand **public → Tables → model_diagnostics**. It is separate from `messages` because rejected text must never appear as a completed answer.
3. After a new rejected response or model-driven input refusal, run the query below. Sending questions uses the normal Groq limits; do not repeatedly retry just to obtain a different classification.

```sql
SELECT d.captured_at, d.expires_at, d.reason,
       m.user_text AS question,
       d.payload #>> '{input_safety,text}' AS input_decision,
       d.payload #>> '{answer,text}' AS received_answer,
       d.payload #>> '{output_safety,text}' AS output_review,
       a.run_manifest #>> '{prompts,version}' AS prompt_version,
       a.run_manifest -> 'prompts' -> 'hashes' AS prompt_hashes,
       a.run_manifest -> 'provider' AS model_settings
FROM public.model_diagnostics AS d
JOIN public.attempts AS a ON a.id = d.attempt_id
JOIN public.messages AS m ON m.turn_id = a.turn_id AND m.role = 'user'
WHERE d.expires_at > clock_timestamp()
ORDER BY d.captured_at DESC
LIMIT 20;
```

4. If `reason` is `INPUT_BOUNDARY`, the classifier selected refusal/clarification before generation: `received_answer` is null. If output review rejected an answer, both the received answer and returned review should be present when capture succeeded. A code-level rejection can have an answer but no model review; a timeout/error can leave a phase absent. Inspect the JSON payload's `complete`, `truncated` and `redacted` flags before interpreting the text. Missing data is not a successful answer or a known-safe result.
5. Successful answers remain only in `messages`. Captures are not backfilled for old attempts, and previously discarded content cannot be recovered. `npm run diagnostics:status` reports the switch and record count without printing content.
6. Finish with `npm run diagnostics:off`. To remove the captured records immediately, also run `npm run diagnostics:purge`. Otherwise they expire within 24 hours or at session expiry; cleanup runs while the app is active and resumes on startup. Keep content in this private local database and out of shared screenshots, logs and Git.

## Check classification after a prompt update

The `m1-prompts-v2` bundle distinguishes general adult nutrient guidance and food preferences from clinical prescriptions. General protein, fibre and food questions should receive useful educational answers. Calorie/weight targets, clinical diets and personal prescriptions still receive the appropriate boundary. An earlier refusal should not block an independent safe question; a follow-up still asking for the prohibited advice remains excluded.

Historical messages and attempts are preserved. After restarting the rebuilt app, submit a new question to test new behavior; a completed policy refusal is not a failed attempt with a Retry action. In the SQL query above, inspect `prompt_version` and `prompt_hashes` to distinguish old and new attempts. A captured `INPUT_BOUNDARY` has no generated answer. A rejected generated response may have both the candidate and reviewer verdict. These are different failures and need different corrections.

See the [controlled regression results](evaluation.md#classifier-v2-regression) for the tested cases and limits. Passing route checks does not establish factual accuracy for every answer.

## Frontend redesign and quieter notices

On 11 October 2026 the owner requested a new design independent of Wise and asked that notifications stop dominating the chat. The frontend now uses a plum/lilac/mint palette, self-hosted Outfit typography and an illustrated food plate. Topic buttons offer starter questions that fill the composer without sending; existing drafts are protected. The welcome artwork gives way to the transcript as soon as a question is submitted. Reduced-motion settings disable decorative movement.

Sources, storage/retention and detailed diagnostic notices moved into **About this chat**. Compact storage/provider and accuracy text remains near the composer. Successful completion no longer leaves a visible banner, while screen-reader announcements and actionable errors remain. The original sources requirement and the owner-approved presentation change are recorded against ANS-05; no source data or safety policy changed.

The original Wise files, saved conversations and quota ledger were preserved. This frontend work used no Groq calls. See [UX](ux-flow.md#visual-direction-and-information-hierarchy) for design/interaction decisions and [testing](testing.md#frontend-redesign-verification) for verification and remaining release checks.

The owner also requested more interactive animation: mouse-driven plate tilt, animated topic changes, tactile starter cards and a brief composer highlight now respond to interaction. Reduced-motion preferences are respected; the scripted browser checks confirm these effects make no automatic submissions. See the follow-up evidence in [testing](testing.md#frontend-redesign-verification).
