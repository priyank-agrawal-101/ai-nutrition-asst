# Gusto NutriBite: Phase-wise Implementation Plan

Status: Local implementation, assignment-sized evaluation records and production preparation are recorded. Phase 4 deployment is in progress: Railway readiness is verified and Vercel serves the homepage, but the frontend API returns 403. A proxy host compatibility change passes local build, 78 unit tests and 55 integration tests; its deployment and hosted session/chat verification remain pending. See [verification](testing.md#vercel-proxy-host-compatibility-verification). Human review and consequential factual dispositions remain explicit in their owners. M1 public delivery is not complete.

Last updated: 13 October 2026.

## 1. Purpose, authority, and current state

Deliver Milestone 1 of **Gusto NutriBite — Your personal AI nutrition companion**. Build the smallest complete stored-chat product, enforce the assignment's safety and response rules, record its failures, and verify it at a public URL.

The [original assignment](problemStatement.txt) and [problem statement](problemStatement.md) are the scope authority. The [product specification](product-spec.md) records required behavior and approved additions. This plan owns delivery order, dependencies, task status, and completion evidence; it does not duplicate public schemas, policy, or test procedures.

The repository was audited on 11 October 2026 at local commit `ac648c8`. It contained documentation and `.gitignore`, with no app, package manifest, migrations, test harness, model evaluation, or deployment configuration. The working tree was clean before the documentation update, and the configured GitHub remote matched this project. A static Markdown link check found no missing local targets; the edge-case catalogue contained 169 unique case IDs, all unexecuted. These are documentation checks, not application verification.

The core specifications agree on structured output, null sources in M1, backend-only model calls, stored-message integrity, safety gates, and recovery. The approved corrections resolve proposed-scope ambiguity, defer manual deletion, align limits and history behavior, correct stale document handoffs, and separate pre-deployment clearance from deployed verification.

The existing [Wise design reference](design-references/wise/DESIGN.md) and [HTML preview](design-references/wise/preview.html) were the original M1 starting point. On 11 October 2026 the owner authorized a complete frontend redesign independent of Wise, with motion, interactive elements and less prominent notices. [UX](ux-flow.md#visual-direction-and-information-hierarchy) now owns presentation. Preserve the original assets and the M1 scope; Sources remains beside the conversation on desktop and below it on narrow screens, following the owner's 13 October correction of ANS-05.

## 2. Approved baseline and preparation

### Current scope

- Stored, anonymous English-language chat for India-first everyday adults, with contextual follow-ups, new chat, and same-tab refresh recovery.
- Structured `answer` and `claims`, with every claim source null in M1; an accessible sources panel with no entries and a visible source limitation notice.
- Code and prompt enforcement of the assignment's calorie/weight-target and medical-advice exclusions, professional referral, and adopted `POL-06`–`POL-12` behavior.
- Input, history, output, timeout, retry, and usage bounds; visible errors and durable recovery; desktop, mobile, and keyboard support.
- Fixed-question evaluation, three fresh consistency samples, safety checks, preserved failure counts, GitHub delivery, and public deployment.

The chosen stack is one Next.js/TypeScript codebase, PostgreSQL, Drizzle, CSS Modules, Zod, npm, Vitest and Playwright. Owner update, 13 October: use Vercel for the frontend and Railway for the backend/database, keeping one long-running backend instance initially. The owner selected Groq on 11 October 2026; Phase 2 pins openai/gpt-oss-120b after live strict-schema probes. Start with one compatible provider/model configuration for classification, generation, and review unless evidence requires a reviewed change.

Manual session-wide deletion is deferred as [FB-001](feature-backlog.md#backlog); no deletion endpoint, confirmation UI, deletion receipt, or separate deletion ledger is required in M1. Automatic expiry, security revocation, scoped cleanup, and truthful privacy information remain required. New chat does not delete history.

Accounts, profiles, nutrition tracking, meal plans, image/voice input, payments, dashboards, and runtime retrieval are outside M1. No vector database, Redis, queue, microservices, generic repository framework, or dependency-injection framework is needed. Use ordinary modules and a minimal retrieval boundary that performs no retrieval. Preserve required database constraints and safety checks; complexity alone does not make an approved requirement optional.

### Initial defaults and outstanding prerequisites

Use the [architecture configuration](architecture.md#initial-configuration-defaults), [API limits](api-contract.md#session-settings), and [retention schedule](safety-and-security.md#retention-schedule) as their authoritative homes:

- Seven-day absolute session access; purge app-held payload within 24 hours after expiry or revocation. Seven-day operational logs and rolling backups, subject to verified platform enforcement; disclose provider/backup retention separately.
- Questions: 2,000 Unicode code points; bodies: 16 KiB. Full conversation context: at most 20 accepted turns and 8,000 conversation tokens. Preserve history and require a new chat when a new question cannot fit.
- Three total attempts per turn, explicit retries only; existing phase/output/deadline/quota defaults. Verify model and hosting compatibility before live use. These are ceilings, not measured latency guarantees.
- No unvalidated streaming, automatic regeneration, full-answer caching, or history summarization. Record unknown provider usage as unknown.
- For disaster restore, invalidate restored sessions and purge their retained payload before reopening when post-backup revocations cannot be reconstructed. Do not build a separate deletion-ledger service for M1.

| Classification and work boundary | Remaining prerequisite | Resolution |
| --- | --- | --- |
| Blocker before database integration | No project DB configuration; Docker and `psql` were not found on PATH during audit, which does not prove they are uninstalled. | Pin compatible runtime/package/PostgreSQL versions and provision an isolated container or explicitly dedicated test cluster. Never reuse another project's database. |
| Blocker before real provider integration | Exact model/endpoint, account access, native schemas, completion handling, settings, and privacy are unverified. | Run the isolated adapter compatibility check, then evaluate through the ordinary app pipeline. Fake-provider work can proceed independently. |
| Important during UI implementation | Owner-authorized visual redesign needs chat-state and responsive verification. | Record chat layout/accessibility decisions in UX/testing and implemented tokens. Preserve Wise source assets; no duplicate design guide is required. |
| Blocker before paid evaluation | Run budget, reviewer, and controlled artifact destination are unresolved. | Record these before dispatch, with quota allocation and pacing in the manifest. |
| Blocker before public operation | Hosting settings, spend/alerts, operator/contact, retention enforcement, and recovery evidence are unverified. | Complete and verify the operations baseline before opening the service. |

These prerequisites block their affected work, not every independent task. No delivery date, accuracy target, service-level objective, or monetary amount is invented here.

### Documentation order

1. Audit documentation, approve corrections, and create this plan. **Complete as documentation work; no implementation completion is implied.**
2. Create short root [AGENTS.md](../AGENTS.md) and initial [deployment/operations guidance](deployment-and-operations.md) after this plan and before phase-wise implementation. **Created on 11 October 2026; runtime commands and operating controls remain unimplemented/unverified.**
3. Use the existing `docs/design-references/wise/DESIGN.md` and `preview.html` for Phase 2 UI work. Settle remaining chat-specific layout/accessibility details during implementation; do not add a separate guide/preview prerequisite.
4. Add actual code links, commands, provider evidence, and operating procedures to their existing owners during implementation.

| Supporting document | Before its dependent work | Alongside implementation |
| --- | --- | --- |
| [Existing design reference](design-references/wise/DESIGN.md) and [preview](design-references/wise/preview.html) | Preserved historical assets; new direction authorized in UX | Record application-specific choices in UX/testing and code; verify desktop/mobile, focus, contrast, and source/error states |
| [Evaluation](evaluation.md) | Existing method and fixed set are the baseline; freeze executable wording and adopted selections before live runs | Runner, dated reference pack, human reviews, and actual results |
| [Testing](testing.md) | Use existing command/isolation contract and corrected scope applicability | Harness, fixtures, coverage mapping, CI, and evidence |
| [Code conventions](code-conventions.md) | Selected stack and schema/module boundaries | Pinned tooling and implementation links |
| Root [AGENTS.md](../AGENTS.md) | Present: short authority map, project-only boundary, scope discipline, and verification expectations | Mark scripts planned until they exist; then link verified commands |
| [Deployment and operations](deployment-and-operations.md) | Present: environment isolation, configuration ownership, maintenance approach, and release gates | Actual hosting settings, commands, budgets, notices, and recovery evidence |

Keep the short [assignment comparison](problem-statement-alignment.md) as the requested scope audit; do not expand it into another specification. Preserve the original brief, reference assets, fixed questions, stable IDs, and historical evidence.

## 3. Implementation phases

### Phase 1 — Durable local chat foundation

**Status:** Done — implemented and locally verified on 11 October 2026, using the scripted provider only.

**Objective:** Establish a working local application boundary with persistent conversations and reliable recovery, using a scripted provider.

**Prerequisites:** Approved baseline and agent/operations guidance are present. Node 24.14.0, npm 11.11.0, application/test dependencies, and PostgreSQL 17.9 are pinned. A dedicated native PostgreSQL cluster is provisioned within this project because Docker was unavailable on PATH. No other project's database or process is used.

**Tasks**

- [x] Scaffold the single app, typed configuration, lockfile, and documented check commands.
- [x] Materialize strict public schemas and bounded request parsing, including raw JSON/Unicode checks.
- [x] Implement anonymous sessions, Origin/CSRF protection, and ownership on every protected path.
- [x] Implement conversation creation/history and turn, attempt, message, and provider-call records in one initial migration.
- [x] Add transactional acceptance/completion, durable replay, explicit retry, deadline reconciliation, quotas, and capacity limits.
- [x] Implement full-context construction, limits, and revision-based recovery.
- [x] Add expiry/revocation cleanup, safe telemetry, and liveness/readiness endpoints.
- [x] Build the isolated PostgreSQL/test harness and a minimal local interface. Scripted mode is bootstrap-only; production configuration is rejected.

**Authorities:** [Architecture](architecture.md), [API](api-contract.md), [data model](data-model.md), [safety/security](safety-and-security.md), [testing](testing.md), and [conventions](code-conventions.md).

**Deliverables:** Runnable local foundation, migrations, API, scripted provider, and meaningful unit/integration checks.

**Acceptance / definition of done:** History survives restart and stays isolated between sessions. Replays/retries produce one accepted question and at most one completed assistant message. Lost responses and uncertain commits resolve through durable status without automatic generation. Invalid output and failed writes never appear as success. Expired/revoked access is denied and cleanup leaves another session untouched. Tests execute real assertions, detect invalid fixtures, and clean up only owned resources.

**Verification:** `npm ci`, `npm run check`, `npm run test:integration`, `npm run build`; case-linked evidence for ownership, request parsing, concurrency, commit uncertainty, restart, and cleanup.

**Risks:** DB availability, transaction races, and boundary parsing. Live provider access is not required; scripted results are not AI evaluation evidence.

**Implementation evidence, 11 October 2026:** [Runtime contracts](../src/contracts/api.ts), [turn lifecycle](../src/server/turn-service.ts), [initial SQL](../migrations/0001_foundation.sql), [isolated harness](../scripts/test.mjs), and [minimal chat](../src/app/page.tsx). [Testing](testing.md#phase-1-implementation-evidence) records commands, case-linked assertions, initial failures/fixes, and limits. [Operations](deployment-and-operations.md#phase-1-local-operation) owns setup. The [169-case map](../tests/coverage-map.json) identifies selected assertions without implying complete M1 coverage. Real model/policy evaluation, full UI review, restore rehearsal, CI execution and public delivery are not Phase 1 results.

**Final verification:** `npm ci`, `npm run check` (19 unit tests plus format/lint/types), `npm run test:integration` (20 real PostgreSQL/HTTP/process tests), `npm run build`, and `npm run test:e2e` (2 Chromium tests) passed on Windows with the pinned runtime. Local launcher startup and both health endpoints passed; its application/database listeners were stopped after verification. Changes remain local and uncommitted. The evidence identifies the initial failing runs and corrections; no evaluation result was manufactured or overwritten.

### Phase 2 — Complete local assistant with real model and UI

**Status:** In progress — implementation and automated/local live verification complete; actual screen-reader review remains pending. **Dependencies met:** Phase 1, existing design references, Groq access and the owner-approved bounded smoke allocation.

**Objective:** Deliver the smallest complete, usable M1 product locally.

**Tasks**

- [x] Verify the three provider schemas, raw output access, completion/refusal handling, supported settings, cancellation, and usage; pin the working configuration and disable SDK retries.
- [x] Implement versioned prompts, deterministic safety rules, constant templates, contextual classification, and separate output review.
- [x] Connect calls to the existing turn lifecycle, validation, usage records, and atomic completion gates.
- [x] Finish follow-ups, new chat, restored history, pending/unknown/failed states, retry, and input/history-limit feedback.
- [x] Keep sources empty and the source limitation notice visible; preserve the nullable citation contract and no-op retrieval boundary.
- [x] Implement keyboard/mobile behavior, safe text rendering, the data notice, and generation shutdown controls.

**Authorities:** [Product](product-spec.md), [UX](ux-flow.md), [prompts](prompt-spec.md), [safety/security](safety-and-security.md), and [API](api-contract.md). Original Wise assets remain preserved.

**Deliverables:** Complete local assistant and browser-tested interaction flows.

**Acceptance / definition of done:** A permitted question completes through the real provider, validation, safety review, and committed storage. Direct required exclusions return the correct boundary/referral. Failed classification/review stops safely. All phases use only the complete bounded active conversation, with the current question once. Refresh/retry/source states, mobile behavior, and keyboard interaction work. No unvalidated/uncommitted candidate is shown. Adapter probes and smoke results are recorded separately from full evaluation.

**Verification:** Phase 1 checks, `npm run test:e2e`, targeted adapter/safety checks, and controlled live smoke calls. Record and verify supported chat widths using the current UX visual direction; include manual keyboard/screen-reader review. Presentation-only changes need no live model calls.

**Risks:** Provider incompatibility, latency, truncation, and false refusals. Correct the implementation/configuration generally; do not weaken validation, skip review, or hardcode evaluation answers.

**Implementation evidence, 11 October 2026:** [Groq adapter](../src/server/llm/groq.ts), [versioned bundle](../src/server/prompts/bundle.ts), [safety rules](../src/server/safety/rules.ts), [constant templates](../src/server/safety/templates.ts), [account budget](../src/server/llm/budget.ts), [additive migration](../migrations/0002_provider_budget.sql), and [local UI](../src/app/page.tsx). The user's key stays in ignored .env. The original migration/design assets/fixed questions are unchanged. [Testing](testing.md#phase-2-implementation-evidence) separates software, failed initial smoke, corrected smoke and remaining human review. [Operations](deployment-and-operations.md#phase-2-groq-local-operation) owns setup, shutdown and limits.

**Additional sign-off:** Actual keyboard-plus-screen-reader listening review (EC-UI-09) could not be performed through the available tooling. Keyboard behavior, ARIA structure and responsive screenshots have automated/visual evidence; they do not establish a listening review. This adopted additional check remains open, separately from explicit assignment requirements. The later Phase 3 entry records completed capture and browser-matrix evidence; independent human factual review remains distinct.

**Frontend redesign, 11 October 2026:** Owner-authorized independent visual direction, interactive question starters, reduced-motion support and a compact **About this chat** information panel are implemented. Sources remain empty and accessible; routine completion banners are screen-reader-only. Build, 69 unit tests and 10 Chromium browser tests passed; [redesign evidence](testing.md#frontend-redesign-verification) records screenshot review and final narrow-screen verification. Saved data, provider quotas and model behavior are unchanged; no Groq calls were made. This does not close the human accessibility or broader release gates above.

### Phase 3 — Evaluation and release clearance

**Status:** Assignment evaluation recorded, 13 October. Ten-question findings/counts, the three-answer substance comparison and passing required scope tests are documented. Public-release disposition remains open for consequential food-safety findings and hosting preparation; additional human accessibility review is unperformed. **Depends on:** Phase 2, frozen evaluation configuration, live-run budget, reviewer, and controlled artifact storage.

**Owner-directed scope clarification, 13 October:** record failures rather than patching around the assignment questions. The [assignment review](failure-log.md#assignment-baseline-review-13-october-2026) supersedes earlier recommendations to fix all six extension findings or finish a comprehensive fact/rating audit before proceeding with independent delivery preparation. Keep failures, immutable samples and fixed questions for M2. Do not change runtime policy, bypass validation, describe unperformed human checks as passes, or equate factual perfection with M1 completion.

**Objective:** Establish the assignment's evidence baseline and clear required software, safety, privacy, and operating checks.

**Tasks**

- [x] Implement a small runner through the ordinary app API; freeze exact `Q01`–`Q10` wording.
- [x] Capture the 39-turn baseline and all 29 adopted policy-extension turns separately with recorded quota allocation/pacing. Capture is complete; six extension cases lack passing conformance evidence. Original failures remain preserved.
- [x] Assemble an initial dated reference pack and document consequential food-safety findings and evidence gaps. Keep references outside runtime M1 inputs; no complete external factual validation is claimed.
- [x] Create `docs/failure-log.md` when actual runs begin; preserve responses, failures, versions, usage, grouped counts, and review findings.
- [x] Record per-question F01-F05 findings, the three-response substance/numeric comparison and required refusal results from saved baseline evidence, with model-assisted authorship explicit.
- [ ] Record the release disposition of consequential food-safety findings. Correct a genuine blocker generally if required by that disposition, with regression after any behavior change; do not automatically patch ordinary model failures.
- [ ] Complete browser/accessibility, security, cleanup, restart, and isolated restoration checks.
- [ ] Finalize operating limits, notices, provider/hosting data settings, and deployment instructions.

**Authorities:** [Evaluation](evaluation.md), [testing](testing.md), [edge cases](edge-cases.md), [safety release review](safety-and-security.md#release-review), [efficiency](token-optimization-and-efficiency.md), and operations guidance.

**Deliverables:** Reviewed baseline artifacts, grouped failure counts, three-answer comparison, software evidence, and a pre-deployment disposition.

**Acceptance / definition of done:** Ten core outcomes and assignment-category reviews/counts are preserved; missing answers are recorded rather than hidden. Three fresh comparable answers have a substance/numerical comparison. Required exclusion tests produce refusals with referrals; errors are not refusal passes. Required security/persistence/cleanup checks pass. Potentially harmful factual findings have a release disposition before public operation. Unsupported/inconsistent claims remain visible for M2; no perfect-accuracy target or requirement to fix every policy-extension observation is invented. Every evaluated prompt change has required regression evidence. Additional human accessibility and rubric checks are reported separately from explicit assignment requirements.

**Verification:** `npm run check`, `npm run test:integration`, `npm run build`, `npm run test:e2e`, `npm run test:browser-matrix`, plus the actual evaluation entry point documented when implemented.

**Risks:** Review workload, quota exhaustion, incomplete samples, and misleading aggregate scores. Use scripts and reviewed files, not a dashboard. The 169-case catalogue is not a requirement for 169 paid model evaluations.

**Implementation evidence, 13 October 2026:** [Review disposition](evaluations/phase3-review.md), [initial dated reference pack](evaluations/reference-pack-v1.md), [report generator](../scripts/evaluation-report.ts), [continuation runner](../scripts/live-regression.ts), [archive restoration test](../tests/recovery/restore.test.ts), [additive restore correction](../migrations/0005_restore_validation.sql), and [software verification](testing.md#phase-3-release-verification). The owner authorized 120 calls/120,000 additional tokens and agreed to human factual/accessibility review; actual usage was 36 calls/46,981 tokens across primary and diagnostic runs. All six adverse primary outcomes remain unchanged. The initial reference pack and assisted consistency comparison are ready for review, but do not satisfy the full human fact/attribution ledger. Public configuration remains disabled; no Phase 4 work is claimed.

### Phase 4 — Deploy, verify, and close M1

**Status:** In progress: local production preparation; owner will deploy. **Depends on for public release:** Phase 3 release disposition, approved hosting/provider spend, verified platform configuration/retention and operator responsibility. Independent deployment preparation proceeds without altering M1 model findings.

**Final execution plan, 13 October 2026:** [Deploy with Railway and Vercel](deployment-and-operations.md#deploy-with-railway-and-vercel) owns the ordered steps, exit checks, variable relationships, CI/container prerequisite, live smoke boundary, shutdown/rollback procedure and release record. Complete that record during deployment; do not duplicate platform instructions here. This planning update authorizes no cloud action and changes no model behavior.

**Objective:** Deliver the assignment at a verified public URL.

**Tasks**

- [x] Prepare explicit frontend/backend roles, secure cookies, authenticated same-origin forwarding, canonical network quotas, production startup, database provisioning and GitHub-linked deployment files.
- [x] Finalize the owner-led deployment plan and distinguish local evidence from pending container/platform verification.
- [ ] Deploy the backend/PostgreSQL to Railway and frontend to Vercel using the same reviewed repository commit, controlled migrations and server-only secrets.
- [ ] Verify HTTPS, cookies, Origin/CSRF, security headers, readiness, and actual proxy timeouts.
- [ ] Verify cleanup scheduling, safe logs, budget alerts, generation shutdown, backup retention, and recovery procedures.
- [ ] Complete an external-browser real chat, required refusal, refresh/recovery, and empty-sources check.
- [ ] Record the deployed commit and prompt/schema/policy/model configuration.
- [ ] Update README setup, public URL, required specification/evidence links, and M1 status.

**Authorities:** Operations guidance, [product completion requirements](product-spec.md#completion-and-release), [safety release review](safety-and-security.md#release-review), and [README requirements](problemStatement.md#readme-requirements).

**Deliverables:** Public app, identified release, operating instructions, and preserved M1 evidence.

**Acceptance / definition of done:** The deployed app completes a real stored exchange through its configured provider; required refusal and refresh recovery work externally. No credentials, invalid candidates, or cross-session data are exposed. Operating controls match published claims. Code is on GitHub, README links resolve, and M1 evidence is retained for M2. Mark M1 complete only after deployed verification.

**Verification:** Actual `/api/v1/health/live` and `/api/v1/health/ready`, deployed browser checks, and the operations procedures. A green hosting dashboard alone is insufficient.

**Risks:** Hosting timeout differences, production-only access settings, provider availability, and retention limits. Failed verification leaves M1 incomplete; do not erase runtime data to repair a release.

All npm commands above are the [documented target scripts](testing.md#6-command-and-ci-contract). None exists or has passed at plan creation. Define them during implementation; missing suites/dependencies must not produce a false green result.

## 4. Progress, changes, and milestone boundaries

Use checkboxes and short evidence notes in this plan. Task statuses are **Not started**, **In progress**, **Blocked**, and **Done**. A blocked note names the actual prerequisite and affected work. A completed note links requirement/case IDs, commit or build identity, command/run evidence, result, and any remaining limitation. Do not duplicate the full test catalogue here.

| Phase | Status | Completion evidence |
| --- | --- | --- |
| 1 — Durable local chat foundation | Done: locally built and tested | [Phase 1 evidence](testing.md#phase-1-implementation-evidence): 19 unit, 20 integration, 2 Chromium; clean install/build and launcher health passed |
| 2 — Complete local assistant | In progress: implemented; manual accessibility review pending | [Phase 2 evidence](testing.md#phase-2-implementation-evidence): Groq adapter/safety/UI, 58 unit, 38 integration, 10 Chromium tests; live probes and stored follow-up; screen-reader sign-off still required |
| 3 — Evaluation and release clearance | Assignment records completed by model-assisted review; release disposition pending | [Ten-question counts, consistency and required refusals](failure-log.md#assignment-baseline-review-13-october-2026); consequential factual findings and public readiness remain explicit |
| 4 — Deploy and verify | In progress: production preparation, not deployed | [Railway/Vercel setup](deployment-and-operations.md#deploy-with-railway-and-vercel); final local checks recorded in testing |

The subsequent [status and rate-limit repair](testing.md#status-and-rate-limit-repair-evidence) passed 61 unit, 45 integration and 9 Chromium tests (including all four viewport widths). It adds specific failure messages, durable cooldown and pre-acceptance quota checks. Original adverse observations remain in the failure log; this repair does not resolve the separate output-review diagnostic question or complete screen-reader sign-off.

The owner-requested [temporary local diagnostic capture](testing.md#local-diagnostic-capture-evidence) subsequently passed 63 unit, 51 integration and 9 Chromium tests, additive upgrade and local startup. Capture is available for investigating new refusals/rejections, with expiring enablement and a separate private table. This adds evidence collection, not a classifier correction or Phase 3 live evaluation; the generalisation investigation and manual accessibility review remain outstanding.

The subsequent owner-requested [classifier v2 correction](testing.md#classifier-v2-verification) aligns input, answer and review prompts on educational nutrient amounts, ordinary food preferences and independent questions after refusals. It retains the model, required exclusions, code checks and all safety/commit stages. Scripted verification passed 69 unit, 51 integration and 9 Chromium tests; the separate [live regression](evaluation.md#classifier-v2-regression) records model behavior and any budget-limited coverage. Historical adverse evidence remains preserved. Manual accessibility and factual release review are not complete.

That live run completed the **39-turn baseline with all expected routes and stored results**, plus **5/29 adopted policy extensions**. The remaining **24 extensions** were not run because the next reservation would exceed the recorded test allocation. Usage was 87 calls / 128,366 tokens. This leaves the full-regression/release task open; neither stable sample numbers nor successful routing substitutes for authoritative factual review. The original local app resumed with generation enabled, diagnostic capture within its existing expiry window, and both health endpoints returning 200.

Do not mark a phase done without its required verification. Preserve failed evaluations and distinguish blocked, partial, built, evaluated, and deployed work. Update the [progress record](project-documentation.md) after major steps, not every small edit.

- [Product specification](product-spec.md): approved behavior and acceptance requirements.
- [Feature backlog](feature-backlog.md): ideas and optional improvements; defects in approved requirements stay in delivery work.
- [Product roadmap](product-roadmap.md): milestone direction and commitment status.
- This plan: current execution order and completion evidence.

Record new ideas in the backlog. Promote them only after explicit scope approval, then update the owning requirements and relevant roadmap/plan entries without duplicating their purposes. Record changed decisions with date, reason, affected phase, and required re-verification.

M2 remains required future direction from the assignment. M1 preserves the citation contract and evaluation baseline, but implements no retrieval. M2 needs its own retrieval decisions and execution update after the M1 baseline. M3 remains unapproved; neither backlog priority nor roadmap placement alone authorizes implementation.

**Interactive animation follow-up, 11 October 2026:** pointer-responsive plate tilt, topic reveals, starter press/hover feedback and a composer selection pulse are implemented within the approved frontend scope. Build/check (69 unit tests) and all 10 Chromium flows passed, including reduced-motion and explicit-only submission checks. [Testing](testing.md#frontend-redesign-verification) owns evidence; no model calls were used.

**Structured response visibility, 13 October 2026:** audited the unchanged strict JSON answer/claims/null-source contract and added an inline Claims disclosure to the frontend. Existing stored claims are shown without regeneration. Build/check (69 unit), 51 integration and 10 Chromium tests passed; [verification](testing.md#structured-response-visibility-verification) distinguishes the UI fixture from real persistence/rejection evidence. No model calls or changes to evaluation configuration were made.

**Saved-chat recovery, 13 October 2026:** startup now falls back to the current session's latest non-empty saved conversation when tab storage has no usable reference. Explicit New chat remains empty across refresh; an empty chat can resume its last saved conversation through a dedicated action. Build, 69 unit, 52 integration and 10 Chromium tests passed. [Verification](testing.md#saved-chat-recovery-verification) covers ownership, expiry, missing/blocked storage and no automatic submissions. No migration or live model call was needed; phase completion and release gaps above remain unchanged.

**Sources placement restored, 13 October 2026:** the owner requested assignment-compliant placement with subtle styling. ANS-05/UX-05 now place the empty panel beside the conversation on desktop and below it on narrow screens. [Verification](testing.md#adjacent-sources-panel-verification) records build, software/browser checks and screenshot review; this presentation change does not close the outstanding phase or release gates.

**Viewport, mobile cards and motion, 13 October 2026:** implemented the owner-approved available-height app frame, bounded auto-growing composer, internal message scrolling and accessible short-window fallback. Follow-up requests add a mobile suggestion-card slider and restrained background/illustration/interaction motion, with reduced-motion support. [Verification](testing.md#viewport-fitting-layout-verification) records the 10-test Chromium pass, target sizes, live asset recovery and physical-device limitations. Original release gates remain open.
