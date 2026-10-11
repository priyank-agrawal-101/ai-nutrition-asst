# Gusto NutriBite: Phase-wise Implementation Plan

Status: Phase 1 complete and locally verified on 11 October 2026. Phases 2-4 not started; M1 is not yet evaluated or deployed.

Last updated: 11 October 2026.

## 1. Purpose, authority, and current state

Deliver Milestone 1 of **Gusto NutriBite — Your personal AI nutrition companion**. Build the smallest complete stored-chat product, enforce the assignment's safety and response rules, record its failures, and verify it at a public URL.

The [original assignment](problemStatement.txt) and [problem statement](problemStatement.md) are the scope authority. The [product specification](product-spec.md) records required behavior and approved additions. This plan owns delivery order, dependencies, task status, and completion evidence; it does not duplicate public schemas, policy, or test procedures.

The repository was audited on 11 October 2026 at local commit `ac648c8`. It contained documentation and `.gitignore`, with no app, package manifest, migrations, test harness, model evaluation, or deployment configuration. The working tree was clean before the documentation update, and the configured GitHub remote matched this project. A static Markdown link check found no missing local targets; the edge-case catalogue contained 169 unique case IDs, all unexecuted. These are documentation checks, not application verification.

The core specifications agree on structured output, null sources in M1, backend-only model calls, stored-message integrity, safety gates, and recovery. The approved corrections resolve proposed-scope ambiguity, defer manual deletion, align limits and history behavior, correct stale document handoffs, and separate pre-deployment clearance from deployed verification.

The existing [Wise design reference](design-references/wise/DESIGN.md) and [HTML preview](design-references/wise/preview.html) are the starting point for M1 UI implementation, as directed by the project owner. Use their typography, palette, spacing, components, and chat-state study without importing unrelated reference features. They contain simulated interactions, not a working app. Their source was inspected; no fresh browser visual verification is claimed.

## 2. Approved baseline and preparation

### Current scope

- Stored, anonymous English-language chat for India-first everyday adults, with contextual follow-ups, new chat, and same-tab refresh recovery.
- Structured `answer` and `claims`, with every claim source null in M1; an accessible sources panel with no entries and a visible source limitation notice.
- Code and prompt enforcement of the assignment's calorie/weight-target and medical-advice exclusions, professional referral, and adopted `POL-06`–`POL-12` behavior.
- Input, history, output, timeout, retry, and usage bounds; visible errors and durable recovery; desktop, mobile, and keyboard support.
- Fixed-question evaluation, three fresh consistency samples, safety checks, preserved failure counts, GitHub delivery, and public deployment.

The chosen stack is one Next.js/TypeScript app, PostgreSQL, Drizzle, CSS Modules, Zod, npm, Vitest, Playwright, and Railway hosting. Use one application instance initially. OpenAI remains the first provider candidate, not a verified model selection. Start with one compatible provider/model configuration for classification, generation, and review unless evidence requires a reviewed change.

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
| Important during UI implementation | Existing Wise reference and preview need application-specific adaptation and verification. | Use those files directly; record chat layout/accessibility decisions in UX/testing and implemented tokens. No duplicate design-guide creation is required. |
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
| [Existing design reference](design-references/wise/DESIGN.md) and [preview](design-references/wise/preview.html) | Already present; inspect and reuse for the chat | Record application-specific choices in UX/testing and code; verify desktop/mobile, focus, contrast, and source/error states |
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

**Status:** Not started. **Depends on:** Phase 1, existing design references, compatible provider access, and a bounded live-call budget.

**Objective:** Deliver the smallest complete, usable M1 product locally.

**Tasks**

- [ ] Verify the three provider schemas, raw output access, completion/refusal handling, supported settings, cancellation, and usage; pin the working configuration and disable SDK retries.
- [ ] Implement versioned prompts, deterministic safety rules, constant templates, contextual classification, and separate output review.
- [ ] Connect calls to the existing turn lifecycle, validation, usage records, and atomic completion gates.
- [ ] Finish follow-ups, new chat, restored history, pending/unknown/failed states, retry, and input/history-limit feedback.
- [ ] Keep sources empty and the source limitation notice visible; preserve the nullable citation contract and no-op retrieval boundary.
- [ ] Implement keyboard/mobile behavior, safe text rendering, the data notice, and generation shutdown controls.

**Authorities:** [Product](product-spec.md), [UX](ux-flow.md), [prompts](prompt-spec.md), [safety/security](safety-and-security.md), [API](api-contract.md), [Wise design reference](design-references/wise/DESIGN.md), and [preview](design-references/wise/preview.html).

**Deliverables:** Complete local assistant and browser-tested interaction flows.

**Acceptance / definition of done:** A permitted question completes through the real provider, validation, safety review, and committed storage. Direct required exclusions return the correct boundary/referral. Failed classification/review stops safely. All phases use only the complete bounded active conversation, with the current question once. Refresh/retry/source states, mobile behavior, and keyboard interaction work. No unvalidated/uncommitted candidate is shown. Adapter probes and smoke results are recorded separately from full evaluation.

**Verification:** Phase 1 checks, `npm run test:e2e`, targeted adapter/safety checks, and controlled live smoke calls. Record and verify supported chat widths using the existing design references; include manual keyboard/screen-reader review.

**Risks:** Provider incompatibility, latency, truncation, and false refusals. Correct the implementation/configuration generally; do not weaken validation, skip review, or hardcode evaluation answers.

### Phase 3 — Evaluation and release clearance

**Status:** Not started. **Depends on:** Phase 2, frozen evaluation configuration, live-run budget, reviewer, and controlled artifact storage.

**Objective:** Establish the assignment's evidence baseline and clear required software, safety, privacy, and operating checks.

**Tasks**

- [ ] Implement a small runner through the ordinary app API; freeze exact `Q01`–`Q10` wording.
- [ ] Run the 39-turn baseline: ten core questions, three additional fresh `Q01` samples, and 26 safety/control turns. Run adopted policy extensions separately with recorded quota allocation and pacing.
- [ ] Assemble dated authoritative references for human factual review, especially high-consequence food-safety claims. Keep them outside runtime M1 inputs.
- [ ] Create `docs/failure-log.md` when actual runs begin; preserve responses, failures, versions, usage, grouped counts, and review findings.
- [ ] Fix release blockers generally and rerun required regression under a new recorded version; never overwrite adverse observations.
- [ ] Complete browser/accessibility, security, cleanup, restart, and isolated restoration checks.
- [ ] Finalize operating limits, notices, provider/hosting data settings, and deployment instructions.

**Authorities:** [Evaluation](evaluation.md), [testing](testing.md), [edge cases](edge-cases.md), [safety release review](safety-and-security.md#release-review), [efficiency](token-optimization-and-efficiency.md), and operations guidance.

**Deliverables:** Reviewed baseline artifacts, grouped failure counts, three-answer comparison, software evidence, and a pre-deployment disposition.

**Acceptance / definition of done:** Ten core outcomes and reviews are preserved; missing answers are addressed rather than hidden. Three fresh comparable answers have a completed factual/numerical comparison. Required safety cases produce expected safe responses; errors are not refusal passes. Required security/persistence/cleanup checks pass. Potentially harmful factual findings are resolved before public operation. Low-risk unsupported/inconsistent claims remain visible; no perfect-accuracy target is invented. Every evaluated prompt change has required regression evidence.

**Verification:** `npm run check`, `npm run test:integration`, `npm run build`, `npm run test:e2e`, `npm run test:browser-matrix`, plus the actual evaluation entry point documented when implemented.

**Risks:** Review workload, quota exhaustion, incomplete samples, and misleading aggregate scores. Use scripts and reviewed files, not a dashboard. The 169-case catalogue is not a requirement for 169 paid model evaluations.

### Phase 4 — Deploy, verify, and close M1

**Status:** Not started. **Depends on:** Phase 3 pre-deployment clearance, approved hosting/provider spend, verified configuration/retention, and operator responsibility.

**Objective:** Deliver the assignment at a verified public URL.

**Tasks**

- [ ] Deploy the app and PostgreSQL to Railway with controlled migrations and server-only secrets.
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
| 2 — Complete local assistant | Not started | None |
| 3 — Evaluation and release clearance | Not started | None |
| 4 — Deploy and verify | Not started | None |

Do not mark a phase done without its required verification. Preserve failed evaluations and distinguish blocked, partial, built, evaluated, and deployed work. Update the [progress record](project-documentation.md) after major steps, not every small edit.

- [Product specification](product-spec.md): approved behavior and acceptance requirements.
- [Feature backlog](feature-backlog.md): ideas and optional improvements; defects in approved requirements stay in delivery work.
- [Product roadmap](product-roadmap.md): milestone direction and commitment status.
- This plan: current execution order and completion evidence.

Record new ideas in the backlog. Promote them only after explicit scope approval, then update the owning requirements and relevant roadmap/plan entries without duplicating their purposes. Record changed decisions with date, reason, affected phase, and required re-verification.

M2 remains required future direction from the assignment. M1 preserves the citation contract and evaluation baseline, but implements no retrieval. M2 needs its own retrieval decisions and execution update after the M1 baseline. M3 remains unapproved; neither backlog priority nor roadmap placement alone authorizes implementation.
