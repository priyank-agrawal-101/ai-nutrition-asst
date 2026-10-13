# Gusto NutriBite: Software Testing

Status: Runnable Phase 1 checks and isolated PostgreSQL/browser harness implemented, 11 October 2026. See the dated evidence below; remaining M1 variants are not implied to pass.

Last updated: 11 October 2026.

## 1. What this document decides

This document owns **how software behaviour is tested**: test layers, isolation, controlled dependencies, race/failure injection, commands, CI selection, and evidence. [Code conventions](code-conventions.md) owns implementation style and module discipline. The [architecture](architecture.md#2-selected-stack-and-scope) owns the stack.

Use [edge-cases.md](edge-cases.md) for scenario wording and expected outcomes, the [API contract](api-contract.md) for wire assertions, and the [data model](data-model.md#enforcement-matrix) for database invariants. Do not copy those catalogues into tests documentation or maintain another expected-error table here. Tests reference their source case IDs; executable fixtures materialise the inputs needed to run them.

Live model judgement, questions, scores, run counts, and factual review belong in [evaluation.md](evaluation.md). Software tests can prove that a classifier verdict was handled correctly; mocked verdicts cannot prove that a real model recognises the request. Release policy remains in [safety and security](safety-and-security.md#release-review).

## 2. Test layers and execution ownership

Use the existing Vitest/Playwright proposal with these concrete boundaries. Start without a separate DOM simulator or component-test framework; use browser tests for actual chat interaction.

| Layer | Executes | Real dependencies | Controlled dependencies |
| --- | --- | --- | --- |
| Unit | Vitest in Node | Actual pure parsers, validators, decision mapping, reducers, and context builders | Clock, ID source, provider port, and small repository doubles only where the test does not assert SQL behaviour. |
| Database/service integration | Vitest in Node | Disposable PostgreSQL, applied production migrations, actual repositories, constraints, transactions, and turn services | Scripted provider and explicitly instrumented transport/connection failures. |
| HTTP integration | Vitest client against a harness-owned app server | Framework handlers, request-byte parsing, session/CSRF flow, error mapping, and PostgreSQL | Provider boundary only; use a low-level client when bytes/headers must be invalid. |
| Browser | Playwright against a production build launched by the harness | Browser, real UI/API, persistence, and recovery flow | Scripted provider and narrow network faults for the scenario being exercised. |
| Deployed verification | A deliberate synthetic browser/API check of the identified deployment | Actual HTTPS origin, access controls, database, and configured provider | No substituted provider when claiming live chat works. Follow the existing release/evaluation procedures. |

Assign each assertion to the lowest layer that can establish it. A unit check for an error mapper does not replace an HTTP check that the route invokes it; a browser does not need to repeat every invalid-schema permutation. Cover the cross-layer connection once, then keep detailed combinations at the cheaper layer.

## 3. Harness and environment isolation

### Database lifecycle

Local integration runs provision a disposable PostgreSQL container through a Node launcher; CI uses a dedicated PostgreSQL service. Pin the same PostgreSQL major version as the chosen deployment baseline. If local container support is unavailable, accept only an explicitly provisioned test cluster; never silently use SQLite or the development database.

Phase 1 local choice: [scripts/test.mjs](../scripts/test.mjs) explicitly provisions a dedicated PostgreSQL 17 native cluster under this project's ignored `.tmp/` because Docker was unavailable on PATH. CI supplies its dedicated PostgreSQL 17 service through `TEST_DATABASE_URL`. Both paths create a random database, record matching filesystem/database ownership markers, apply the production migration, create a restricted runtime role, and verify ownership before dropping only those resources. Test clusters stop at completion; leftover cluster directories contain no retained test database and are not application data.

The launcher creates a randomly named database such as `nutribite_test_<run-id>`, applies the real migration chain, and records ownership of that resource. Keep migration and runtime database roles distinct so runtime permission checks are meaningful. Test-only marker metadata belongs in a harness-owned schema, not an application migration.

Use `TEST_DATABASE_URL` for the test bootstrap connection; do not fall back to an inherited application connection string. Before cleanup, require both a matching generated database name and the run marker/ownership record. The bootstrap role must be confined to the disposable cluster. A prefix match alone is insufficient permission to erase a database.

Run integration files serially initially. Within a concurrency case, open separate physical database connections and exercise the competing operations deliberately. Give each case fresh synthetic identities. Let writes commit: wrapping the whole suite in one outer rollback transaction would hide deferred-constraint and uncertain-commit behaviour. Drop only the run-owned database when the suite finishes; keep a failed test's sanitised evidence first. Never clean up another project's process, port, volume, or data.

### Server and network lifecycle

The launcher allocates free loopback ports, starts its own child server, waits for readiness with a bounded deadline, and stops only that child. Record its PID, build identity, database run ID, and base URL. Disable Playwright's reuse of an existing server; an unrelated app already listening must not be mistaken for the test target.

The ordinary test commands must not load live provider credentials. Scripted mode is chosen only by the test server's composition/configuration, never by a request header, query, cookie, or public endpoint. Production bootstrap must reject that mode. A browser test may run the production build in an explicitly isolated test environment; it is not a deployed-provider verification.

Deny unexpected outbound calls after required dependencies/browsers are installed. Permit only the harness app, disposable database, and a local provider-protocol stub if the adapter test needs one. Unit tests making an unexpected network call fail. HTTP handlers, validators, ownership checks, and storage still execute normally under the fake provider.

The launcher passes environment values through child-process APIs. Do not depend on Bash-only inline environment assignments or PowerShell-specific script syntax; the same npm entry points must work from Windows shells and Linux CI.

## 4. Fixtures, clocks, and controlled failures

### Scripted provider

Implement one test double at the provider port, with a queue of outcomes per phase. It records dispatch/cancellation and exposes test-process promises for “call started” and “release result”. The queue can produce complete data, malformed raw bytes, typed provider errors, an unavailable verdict, or a result held until a race is ready. An unexpected phase, extra call, or unused required script entry fails the test.

Keep gate decisions real. For example, the provider double returns a classifier verdict; the application still validates its pairing and decides the next phase. A double must not insert messages, bypass output review, or return a prepared public success envelope. Test provider-specific decoding through its actual adapter and a local HTTP stub, separately from provider-neutral service tests.

Do not choose responses by matching production question strings. Bind scripts to the test instance/phase, use scenario inputs from the catalogue, and keep the double outside runtime business logic. Runtime prompts/templates remain in their [specified code homes](prompt-spec.md#proposed-implementation-locations).

### Time and races

Use injected clocks and fake timers for pure timeout/polling logic, restoring them after each test. They do not advance PostgreSQL time. Database deadline tests use controlled valid timestamp fixtures and real database clock observations. Include a boundary test that crosses the deadline after a transaction has begun, so using transaction-start time would be detected.

Coordinate races with explicit barriers: wait until both operations reach the intended connection/lock/provider boundary, release the chosen side, and observe both outcomes. Do not use arbitrary sleeps to hope a race occurred. Any bounded wait must fail with a diagnostic showing the last reached phase.

Test restart behaviour by stopping the harness-owned process and starting a fresh process against the same test database. Do not replace this with resetting an in-memory mock. For purge/revocation races, setup must satisfy real row and deferred constraints; do not disable triggers to fabricate a convenient state.

### Failure injection boundaries

| Failure being exercised | Injection method | What remains real |
| --- | --- | --- |
| Invalid request or provider JSON | Send a raw byte fixture, preserving duplicate names, encoding, or truncation | Actual decoding and structural validation; never pre-parse it with a permissive test helper. |
| Competing writes / lock contention | Two dedicated SQL connections and a lock/barrier controlled by the harness | Transactions, unique/deferred constraints, lock order, and final reads. |
| Known rollback | Throw/fail before commit through the narrow database connection boundary | The actual transaction rolls back; inspect surviving records from another connection. |
| Lost commit acknowledgement | Execute a real commit, then inject a lost/failed acknowledgement at the connection adapter before the caller observes success | Real durable state and subsequent reconciliation; do not model this as an ordinary pre-commit exception. |
| Lost HTTP response | A test transport/proxy drops the response after the app commits | Status endpoints and durable receipts; the provider result must not be generated again for recovery. |
| Provider result after cancellation/expiry | Release the blocked scripted call after cancellation or the competing terminal operation | Completion predicate, database state, and usage-record handling. |

Those test seams must be constructor/bootstrap dependencies, not production fault-injection endpoints. If a fault cannot be reproduced accurately by the current harness, record it as untested and improve the seam; do not mark an approximate unit mock as the integration proof.

### Fixture maintenance

Store compact fixtures under `tests/fixtures/` and harness code under `tests/support/`; these are planned paths. Name unit/integration files `*.test.ts` and browser files `*.spec.ts`. Include catalogue case/variant IDs in test titles and fixture metadata. Use `EC-REQ-07`-style IDs to link back to the source, not to trigger app behaviour.

Use fixture builders for valid defaults and explicit mutations for one invalid condition. Independently assert the expected boundary/error; do not derive the expected result by calling the same function under test. Generate size/encoding boundary fixtures from configuration and record the effective values. Seed any fuzz/random generator and retain the failing seed.

Maintain a small executable coverage manifest mapping each case variant to its test or live-evaluation owner and applicability. It stores IDs and locations only, not a second copy of scenario prose. Unimplemented/adoption-dependent/Milestone 2 cases carry an explicit reason and stage; a wildcard family reference alone is not proof every variant ran.

## 5. Where existing scenarios execute

This table routes work; the [catalogue coverage map](edge-cases.md#coverage-map) retains the requirements and expected results.

| Catalogue area | Primary executable location | Additional boundary evidence |
| --- | --- | --- |
| `EC-INPUT-*`, structural `EC-MODEL-*` | Unit parsing/validation; raw-byte HTTP/adapter integration | Verify actual handlers/adapters use the boundary parser. |
| Decision/template and phase-order cases | Unit and service integration with scripted phase results | Actual language recognition and factual quality use [the live evaluation selection](evaluation.md#4-safety-suite-and-catalogue-selection). |
| `EC-CTX-*` | Unit context construction and database/service integration | Live later-turn references remain in evaluation; browser verifies active-chat wiring. |
| `EC-REQ-*`, `EC-DATA-01`–`EC-DATA-05` | Real database/service and HTTP integration | A focused browser recovery flow checks the UI consumes the stored outcome. |
| `EC-SEC-*` | HTTP/database integration and built-browser checks | Security-header and deployed-origin behaviour also needs the actual HTTPS environment. |
| `EC-DATA-06`–`EC-DATA-11` | Isolated maintenance/migration/restore integration | Run M1 expiry/revocation/cleanup/restore cases. `EC-DATA-08` and `EC-DATA-09` are deferred with FB-001, not missing M1 coverage. |
| `EC-UI-*` | Browser | Manual keyboard/screen-reader and design review supplement automated checks. |
| `EC-OPS-*` | Service/adapter integration, process restart, and release verification | Measurement and model-comparison results remain in evaluation, not unit-test reports. |
| `EC-RAG-*` | Milestone 2 adapter/evidence integration when implemented | Milestone 1 still tests citation-union compatibility and its own source-policy boundary. |

For migrations, test empty initialization and, once a released schema exists, a populated upgrade from that version. Read the [data model's migration rules](data-model.md#proposed-migration-sequence) as the assertion source. The first version cannot claim to have tested a nonexistent previous release. Use the runtime role to test ordinary permissions, and a separate migration role for schema work.

For browser coverage, start with Chromium desktop in applicable PRs. Before UI release, add Firefox, WebKit, and mobile-sized projects using pinned Playwright revisions. Emulation is not evidence from a physical phone. Use the owner-authorized [UX visual direction](ux-flow.md#visual-direction-and-information-hierarchy); record chat-specific widths and visual acceptance during implementation. No duplicate guide is a prerequisite.

Use accessible roles/labels for locators; add a test ID only when no stable semantic locator fits. Assert visible outcomes and public/durable state, not component internals or CSS class names. A focused automated accessibility scan may use `@axe-core/playwright`; it does not replace manual focus order, keyboard, composition-input, zoom, and screen-reader checks. Import/source/output policy scans remain separate from accessibility checks.

## 6. Command and CI contract

All npm entries below are implemented for Phase 1 and exit nonzero on failing assertions, missing required dependencies, or unexpectedly empty suites. Versions are pinned as described in [code conventions](code-conventions.md#2-typescript-tooling-and-source-style). `check` additionally validates the coverage map and local Markdown targets. `test:e2e` requires a production build and installed Chromium; the release matrix also requires Firefox and WebKit.

Install browsers with `PLAYWRIGHT_BROWSERS_PATH` set to this project's `.cache/playwright`, then run `npx playwright install chromium`. On PowerShell: `$env:PLAYWRIGHT_BROWSERS_PATH = (Join-Path (Get-Location) '.cache/playwright')`. On Git Bash: `export PLAYWRIGHT_BROWSERS_PATH="$PWD/.cache/playwright"`. CI installs Linux dependencies with `npx playwright install --with-deps chromium`.

| Entry point | Responsibility |
| --- | --- |
| `npm run check:format` | Check formatting without editing files. |
| `npm run check:lint` | ESLint, type-aware rules, and import-boundary checks. |
| `npm run check:types` | TypeScript type checking without emitting application output. |
| `npm run test:unit` | Vitest unit project, one run; optional watch mode is a separate developer command. |
| `npm run test:integration` | Node harness provisions/verifies the test database and runs service/HTTP integration projects. |
| `npm run build` | Produce the deployment-mode build using safe build-time configuration; no model call or migration. |
| `npm run test:e2e` | Start/stop the built test app and execute the Chromium browser project. Fail with a clear message if the build is absent. |
| `npm run test:browser-matrix` | Run the release browser projects and mobile layouts once their supported configuration exists. |
| `npm run check` | Aggregate format, lint, types, and unit checks, stopping on failure. It does not imply database/browser/live checks passed. |

`npm ci` restores the committed lockfile in CI. The workflow runs `check`, integration, build, and browser jobs according to the change matrix below; a successful build alone is insufficient. Integration and browser jobs use separate disposable databases. Use a Node orchestrator for dependent setup/build/server tasks; avoid shell-specific command chains in package scripts.

| Change | Required software work | Additional evidence owner |
| --- | --- | --- |
| Documentation only | Links, referenced IDs, examples/tables, and consistency with the owning document | No paid calls or forced app build for a text-only change. |
| Pure helper with no shared contract effect | `check` and its affected integration boundary, if any | Run broader suites when imports or behaviour propagate. |
| Public schema, parsing, provider adapter, prompt assembly, policy/template, context, turn/session/config code | `check`, relevant integration suite, build, and browser smoke for changed visible flows | Prompt/model changes also trigger [evaluation regression](evaluation.md#2-what-an-evaluation-run-contains). |
| Database/migration/maintenance | `check`, database integration including applicable upgrade/restore cases, build and affected HTTP/browser flows | Retention/security acceptance remains with its policy owner. |
| UI, routing, or styling | `check`, build, Chromium flows and accessibility checks; affected HTTP tests if the API use changes | Release browser matrix and comparison with the current UX visual direction. |
| Dependency, runtime, framework, or CI changes | All applicable software jobs | Adapter compatibility and/or live evaluation when behaviour may change. |

Run CI on Linux with the pinned runtime and PostgreSQL version. Before marking local setup ready, run the npm entry points from Windows as well; Linux CI cannot establish Windows launcher compatibility. Branch-required checks should reference stable job names and fail when expected tests are missing. Before code exists, label unimplemented checks as pending, never as green empty test runs.

Keep ordinary PR CI free of live provider secrets and paid calls, including trusted PRs. Run deliberate live evaluations separately under their budget/privacy protocol. Restrict dependency installation and CI permissions to what the job needs; no production database, deploy secret, or destructive maintenance identity belongs in a normal test job.

## 7. Results, flakiness, and completion

Test results identify commit/dirty state, command, test/case variant, effective configuration, fixture seed if used, and pass/fail/skipped/blocked status. Retain HTTP/SQL-state assertions and phase-call evidence needed to diagnose the failure. Browser traces/screenshots may be saved for failing synthetic runs under the existing ignored report paths; never capture real visitor sessions. Use short-lived CI artifacts, with reviewed release evidence retained through the release record rather than depending on temporary CI links.

Default automatic test retries to zero. A diagnostic rerun must preserve the first failure and its seed/trace; “passed after retry” is not the same as a stable passing check. Fix the race, isolation, or timing cause. A temporarily quarantined test needs a linked defect and explicit coverage gap; quarantining a required safety/ownership/persistence check cannot silently remove a release blocker.

Collect coverage when useful for finding untested branches, not as a target percentage to optimise. Required branch/case evidence matters more than tests that restate constants, assert private function calls, or snapshot entire large responses. Prefer a targeted new test for a real behavioural risk; reversible copy/formatting changes do not need invented unit tests.

The test harness is ready when its commands execute real assertions, clean up only owned resources, detect a deliberately failing fixture, and produce case-linked evidence. A feature's software checks are complete when all applicable mapped variants ran with their stated real dependencies and no required failure/gap is hidden. The broader release decision is made under [the existing release review](safety-and-security.md#release-review) with [evaluation evidence](evaluation.md#13-completion-review-decisions-and-release-boundaries).

Keep harness links here as code appears and new scenarios in the catalogue. The [implementation plan](phase-wise-implementation-plan.md) tracks delivery; the short [assignment comparison](problem-statement-alignment.md) checks scope without duplicating this testing specification.

## Phase 1 implementation evidence

Date: **11 October 2026**. Identity: version `0.1.0`, uncommitted Phase 1 working tree based on `main` at `e8099e6`; migration SHA-256 `cf599134d156ad2b47322bf133dce0c3aa133d1d7011634c8ed9101c9e795165` is recorded in the [manifest](../src/server/db/migration-manifest.json). Tests use Node **24.14.0**, npm **11.11.0**, PostgreSQL **17.9**, and scripted provider `fixture-v1`. These are software tests, not model evaluation.

| Check | Evidence / disposition |
| --- | --- |
| Clean installation | `npm ci` passed after lockfile stabilization; dependency audit reported zero vulnerabilities. |
| Format, lint, types, unit | Passed `npm run check`: **19 unit tests** plus format/lint/types, raw duplicate keys, Unicode, CSRF, configuration separation, strict output, context and revision merging. |
| PostgreSQL and HTTP | Passed `npm run test:integration`: **20 tests**, including real commits/rollback, acknowledgement-loss seams, replay/retry, capacity/quotas, ownership, invalid fixtures, expiry/revocation/purge, and restart. Final run database `nutribite_test_66daf3f4904a4c25b0d5fa92176d9b65` was removed after ownership verification; no test skipped. |
| Production build | Passed `npm run build`: compiled Next.js app/API; no migration/model call at build. |
| Browser smoke | Passed `npm run test:e2e`: **2 Chromium desktop tests**, dropped-response recovery/refresh with one submission, new chat, empty sources, keyboard submission, and inert HTML-like text. Final test database `nutribite_test_7117d8f5bc22434d8f45a8b0a9982eb6` was cleaned. |
| Coverage and documents | [Coverage map](../tests/coverage-map.json) retains 169 IDs and identifies pending/deferred work. [Local links](../scripts/docs-check.mjs) and case references are checked. |

Local launcher smoke also passed: production-built app at its allocated loopback origin, `/api/v1/health/live` and `/api/v1/health/ready` both HTTP 200, startup maintenance recorded zero pending payload. Both app/database listeners were confirmed stopped afterward; the empty local database/configuration remain available for the owner. No other project was used for verification.

The restart test kills its own handler process after a call-intent barrier, starts a new process against the same database, observes the saved running turn, and waits for its real 60-second database deadline before reconciliation. It does not reset data. A separate finalization test crosses a one-second fixture deadline after `BEGIN`, detecting stale transaction-start time. Invalid fixture transactions must fail their assertions and leave no partial exchange.

The harness passes an explicit environment allowlist and never loads live-provider credentials or development `.env`. Scripted mode has no outbound model client. Unit `fetch` calls fail; browser requests are restricted to the harness origin. Fixtures are bound to constructor-supplied phase queues, never to question text or public request flags. Raw test diagnostics/artifacts contain only synthetic fixtures. All cleanup verifies ownership.

Earlier failures retained here: the first 13-case database run had 11 failures from a polymorphic trigger reading a nonexistent row field; table-specific branches corrected it without disabling constraints. The restart launcher hit Windows sandbox `os.userInfo()` failure; its child is now bundled with esbuild and runs as ordinary Node JavaScript. One browser assertion used exact text matching on an article containing its speaker label; inspection confirmed saved history, and the assertion now targets article content. No failing test was skipped. Three initial development-tool advisories were resolved with reviewed package updates. Browser installation required network escalation after the sandbox denied the CDN.

Desktop screenshot inspection confirmed readable spacing, stored-message text and the empty sources panel. Phase 2/3 still owns complete UI, screen-reader review, Firefox/WebKit/mobile release coverage, real-provider compatibility and safety evaluation, restore rehearsal, trusted-proxy behavior and deployed retention. The map links selected assertions, not a claim that every variant of all 169 cases passed. CI is configured but no GitHub Actions execution or public deployment is claimed.

## Phase 2 implementation evidence

Date: **11 October 2026**. Base: `main` at `e79fdea`; changes are local and uncommitted. Runtime remains Node 24.14.0 / npm 11.11.0 / PostgreSQL 17.9. The original migration is unchanged; additive 0002 SHA-256 is `489e8432d321979c62b092ce917aa256a119d916a798140a0ef2b382b0367b61`. [The manifest](../src/server/db/migration-manifest.json) owns migration identity.

| Check | Verified evidence |
| --- | --- |
| Installation | Clean `npm ci` passed with 202 audited packages and zero reported vulnerabilities. The initial locked-file failure and its recovery are retained in [P2-003](failure-log.md). |
| Production build | Final `npm run build` passed after the response cancellation fix: Next.js compilation, type checking and route generation completed. Build configuration suppresses live credentials; no provider call or migration runs during build. |
| Credential containment | Exact-key scan of 185 authored/unignored and generated server/browser files found zero occurrences. The configured `.env` remains ignored. |
| Format/lint/types/unit | `npm run check` passed: **58 unit tests**, format/lint/types, all 169 case IDs mapped, local Markdown targets checked. New tests cover strict verdict pairs, high-confidence rules and benign controls, claim-only violations, prompt trust boundaries, native schema requests, usage, refusal/incomplete/error handling, bounded response reads and cancellation. |
| PostgreSQL and lifecycle | `npm run test:integration` passed: **38 tests**, including true process restart/deadline, input templates with zero/one calls, invalid classification/review, hidden output, explicit retry/context, generation shutdown and rolling request/token reservations. Final isolated database `nutribite_test_fbd1abd493fc4089883986ad70ff79fa` was cleaned. |
| Browser | `npm run test:e2e` passed: **10 Chromium tests**. Covers dropped-response recovery, inert text, IME/Shift+Enter/Enter, draft modal and failed creation, an explicitly mocked UI failure/retry state, scroll preservation/bottom tracking, and refusal/source/input-limit states at 320, 390, 768 and 1280px. Actual provider-failure persistence is tested separately in integration. Final browser database `nutribite_test_851a09e64cea4d45b80fcf2bc110d3af` was cleaned. |
| Visual inspection | Mobile and desktop screenshots were inspected: content wraps, focus is visible, refusal text is readable and Sources remains reachable. Existing Wise assets were preserved. This is not actual screen-reader listening or an on-device keyboard test. |
| Live Groq adapter | All three strict native schemas passed against `openai/gpt-oss-120b` with complete `stop` responses, pinned temperature/reasoning settings, no returned reasoning requested and usage recorded. Final verdict allowance is 256, answer allowance 2,000; serialized input plus 128 framing tokens stayed above observed input in the probes. Refusal/error/truncation/cancellation branches have mocked software coverage, not induced paid failures. |
| Stored live API | Corrected run `d4cd6fd161d140d39bbf3b783c5dfb8d` passed five ordinary built-Next.js API turns and subsequent history reads: permitted answer, follow-up, calorie/weight/supplement refusals. All generated content passed schema, code safety, separate review and committed storage. First-run follow-up failure remains in [the failure log](failure-log.md). |
| Live budget | Two dispatched runs used **17 calls / 37,778 total tokens**, inside 20 / 40,000. Calls are paced and use the same durable account ledger as the app. The second run was capped at the remaining 12 calls / 22,273 tokens. No additional paid tests were dispatched. |
| Existing local data | Additive upgrade preserved existing record counts (one session, four empty conversations, no turns/messages); both migrations were recorded. No synthetic chat was inserted into the persistent local database for this upgrade check. |
| Local operation | Restarted this project's app with Groq enabled at its preserved loopback origin, `http://127.0.0.1:51261`. Both health endpoints returned HTTP 200; startup maintenance reported zero purged sessions and zero reconciled attempts. The app remains running for the owner. |

The private live manifests identify the base commit, dirty state, prompt/template hashes, model/settings, budget and artifact policy before dispatch. They retain accepted synthetic responses, failures, phase usage and duration, with unknown usage left unknown. They are **adapter/smoke evidence**, not a factual evaluation or a public release. No fixture substitutes for a live result.

The remaining Phase 2 sign-off gap is an actual keyboard-plus-screen-reader review (`EC-UI-09`); available automation checked keyboard behavior and ARIA structure but did not listen through assistive technology. Phase 3 owns the full fixed set, three fresh consistency samples, authoritative factual review, wider browser/security/restore checks and release clearance. Production configuration remains rejected; no deployment or CI execution is claimed.

## Status and rate-limit repair evidence

Date: **11 October 2026**, same local uncommitted Phase 2 tree. The repair adds migration 0003 without changing earlier migration bytes or rewriting historical failures. Tests use the scripted provider; **zero live Groq calls** were made for this repair. Initial check failures and the owner's original observation remain in [P2-004](failure-log.md#p2-004-status-and-quota-handling-11-october-2026).

- Unit verification: 61 tests cover the existing behavior plus rolling-window retry calculations, minute/day/request limits, impossible request capacity and bounded numeric/date/fallback Retry-After parsing. Format/lint/types and case-map/link checks are required alongside these results.
- Integration: **45 tests passed** through `npm run test:integration`, including a true process restart, no turn/attempt on known pre-acceptance quota, all three rate-limited model phases, retained retry time/replay, early retry without another attempt, shared upstream cooldown, mid-pipeline contention with no candidate exposed, and actual handler HTTP 429/Retry-After. Isolated database `nutribite_test_71c29b8a05b14bf7a922149f29412fec` was cleaned.
- Build: `npm run build` passed after final source changes, with safe configuration and no provider calls.
- Local upgrade: applying migration 0003 preserved counts of 2 sessions, 7 conversations, 2 turns, 3 attempts and 2 messages. All three migrations were recorded. Only this project's local app/database was stopped for the upgrade.

- Browser: **9 Chromium tests passed** through `npm run test:e2e`, including pre-acceptance quota, unchanged operation ID on explicit resend, retained draft, disabled Send/Retry during cooldown, failed status without a success announcement, cooldown after refresh, and all four viewport widths in one visitor session. Isolated database `nutribite_test_959c26f9abd248919d33cf101e650e24` was cleaned. The earlier 10/12 run hit the real session-creation quota; its evidence and the test organization correction are recorded in P2-004.
- Final checks: `npm run check` passed format/lint/types and 61 unit tests; the updated coverage map retains all 169 catalogue IDs. Markdown links and diff whitespace checks passed.
- Local restart: Groq mode resumed at the preserved `http://127.0.0.1:51261`; both live and ready endpoints returned HTTP 200. Startup maintenance purged zero sessions and reconciled zero attempts. The local app remains running; no new live model request was sent for this check.

The model/prompt/policy text and safety stages are unchanged; no new factual evaluation or screen-reader sign-off is claimed. This confirms rate-limit reporting/recovery using controlled fixtures, not that a future live request is guaranteed to pass review or fit the current account budget.

## Local diagnostic capture evidence

Date: **11 October 2026**; local uncommitted Phase 2 tree. Migration 0004 creates a separate diagnostic table and preserves earlier migration bytes and message history. No prompt/model/classifier change or live Groq call was made for this implementation. [P2-005](failure-log.md#p2-005-input-classification-and-diagnostic-capture-11-october-2026) preserves the underlying unresolved classification observation.

- `npm run check`: **63 unit tests**, format/lint/types and the case/link checks. New units cover bounded text, credential redaction, NUL replacement and test-mode capture exclusion.
- `npm run test:integration`: **51 tests passed**. Six new synthetic cases verify rejected candidate/reviewer storage with no public/context leakage, input refusal with no invented answer, malformed response capture, absence of copies for successful answers and ordinary test mode, expiry/revocation cleanup isolation, and capture-storage failure without changing the terminal outcome or making another provider call. Database `nutribite_test_ab59d0f30d46438f9c3ebc5d7412ae78` was cleaned.
- `npm run build`: passed with safe build configuration; no model call or migration at build time.
- Local additive upgrade: preserved 2 sessions, 7 conversations, 5 turns, 6 attempts and 8 messages. All four migrations were recorded. Restarted the same local Groq app at `http://127.0.0.1:51261`; both health endpoints returned HTTP 200.

- `npm run test:e2e`: **9 Chromium tests passed**, including the safe diagnostic-notice flag (mocked for UI verification), ordinary notice absence, existing recovery/quota behavior and four viewport widths. Isolated database `nutribite_test_f47a55d9744840dcb1e9e8056d1e6827` was cleaned.
- Operator checks: `diagnostics:status` initially confirmed capture off and zero records; `diagnostics:off` and `diagnostics:on` ran successfully, and the final status confirmed a 24-hour enablement window with zero captures. No live request was made to populate the local table. Reloading the chat reads the enabled flag. Capture remains enabled for the owner's next diagnostic questions.
- Final containment/document checks: exact-key scan of 200 authored/unignored and generated application files found no Groq-key occurrence; local Markdown links, catalogue mappings and diff whitespace checks passed. Startup maintenance reported zero purged sessions and zero reconciled attempts.

These tests establish the diagnostic mechanism using fixtures, not live classification accuracy or public-release clearance. The local app remains running with the existing database and origin. Classification prompts and model settings remain unchanged pending the controlled regression investigation.

## Classifier v2 verification

Date: **11 October 2026**. The owner-authorized prompt change clarifies educational nutrient guidance, food preferences and context handling across all three phases. The model, deterministic rejection rules, strict schemas, constant templates and review/commit requirements are retained. See [the change record](prompt-spec.md#12-versions-and-change-record) and [live regression](evaluation.md#classifier-v2-regression).

- `npm run check`: **69 unit tests**, format/lint/types, 170 catalogue mappings and local link checks passed. New coverage checks that education variants reach contextual classification and that the document-derived runner keeps all 39 baseline turns and 29 adopted extensions. These units do not claim to test live model semantics.
- `npm run test:integration`: **51 passed** in isolated database `nutribite_test_f92b16fb07ec4eaa9926ba156530b080`, subsequently cleaned. The first run passed 50/51: a manifest assertion still expected literal v1. It now checks the active prompt version **and hashes**, rather than dropping the assertion. No runtime gate was changed to pass it.
- `npm run build`: passed with the final v2 prompt bytes and no live credentials/calls used by the build.
- `npm run test:e2e`: **9 Chromium tests passed** in isolated database `nutribite_test_c2be74571b38487d92e2736fb2909c90`, subsequently cleaned. Existing status, retry/cooldown, stored-history, diagnostic notice and responsive behavior remain covered.

The deliberate live run is separate from these scripted checks. Factual reference review, screen-reader listening and the full release browser matrix remain outstanding; no public-release clearance is implied.

Live result: **39/39 baseline turns** and **5/29 policy extensions** matched their expected routes and stored results; **24 extensions remain unrun** because the recorded test budget could not reserve the next turn. Four paired classifier probes passed under both prompt versions. Actual usage: **87 calls / 128,366 tokens**. See [the complete scope and limitations](evaluation.md#classifier-v2-regression), including the distinction between routing and factual verification.

Local handoff: the same Groq app resumed at `http://127.0.0.1:51261`, both live/ready endpoints returned 200, and startup purged/reconciled zero sessions/attempts. Diagnostic capture remains enabled within its existing expiry window. Prior smoke and new evaluation usage were included in the local quota ledger; existing user messages were preserved. No model call was made to verify startup.

## Countdown removal and interactive allowance

At the owner's request, the separate raw-seconds countdown banner was removed. Existing quota notices, disabled Send/Retry, editable drafts and explicit-only submission remain. The regression runner now reserves 50,000 daily tokens for interactive chat before accepting a test allocation. This does not reset previously consumed usage or change the model, prompts, policy, persistence or account limits.

`npm run build` and `npm run check` passed, including 69 unit tests, format/lint/types and 170 catalogue mappings. All **9 Chromium tests passed** in isolated scripted database `nutribite_test_3c773e00422847c49a05549617605f3b`. The existing quota test now also simulates the reported 66,998-second cooldown: no countdown banner, retained editable draft, disabled submission throughout the wait, and re-enabled explicit submission at expiry with no automatic calls. No live Groq calls were made. See [P2-007](failure-log.md#p2-007-daily-quota-and-countdown-presentation-11-october-2026) for the cause and limitation.

## Frontend redesign verification

On 11 October 2026 the owner authorized the new visual direction and lower notice prominence described in [UX](ux-flow.md#visual-direction-and-information-hierarchy). Scope is frontend presentation and local starter interactions; provider prompts, classification, safety, persistence and rate-limit enforcement were not changed.

- `npm run build`: passed using the credential-isolated build command.
- `npm run check`: passed formatting, lint, types, **69 unit tests**, all 170 catalogue mappings and documentation links.
- `npm run test:e2e`: **10 Chromium tests passed** in isolated scripted database `nutribite_test_8663841b15db4fad8d3e96f9befa6c68`, then cleaned. Coverage includes recovery after refresh/dropped responses, inert user text, IME/keyboard input, explicit retries, the 66,998-second quota case without a countdown, scroll anchoring, draft protection, sources/refusal states and responsive widths.
- The new interaction case verifies topic selection, filling/focusing a starter without sending, protecting an existing draft, opening/closing About this chat, native modal background inertness, Escape focus restoration and reduced motion. The diagnostic flag check verifies the compact indicator and expanded details. Completion and duplicate failure summaries remain available to screen readers without visible banners.
- Screenshot inspection covered empty chat at 320/390/768/1280px, completed chat, refusal/oversized input and the information panel. It prompted a larger 12px notice footer, a darker input placeholder and hiding the plate below 360px to avoid crowding the headline. Body/notice text on white has contrast 5.82:1; primary text 13.59:1; active topic text on mint 6.55:1. These measurements are not a full accessibility audit.
- The initial new test failed because it assumed Tab must stay on the single dialog button; native dialogs also allow focus into browser chrome. The assertion now directly verifies that the inert background cannot receive focus and that Escape restores focus. No application safeguard was weakened.

No Groq calls or tokens were used. Only synthetic browser artifacts are in ignored `test-results/`. The font is self-hosted with its OFL license; browser tests reject unexpected external requests. Original Wise assets and local user data are preserved. Actual screen-reader listening, physical-device testing, Firefox/WebKit and the broader public-release matrix remain pending.

Final narrow-screen verification: after hiding the decorative plate below 360px, the final build and all **10 Chromium tests passed again** in owned database `nutribite_test_3e83c5221ec242d9bb6ea65c2151899b`, which was cleaned. The 320px screenshot was re-inspected with an unobstructed headline. Format and diff-whitespace checks passed, and all 647 local Markdown link targets resolve. The app resumed at `http://127.0.0.1:51261`; live/ready and the self-hosted font returned HTTP 200. Startup reported zero purged sessions and zero reconciled attempts. A containment scan found zero configured-key occurrences in 202 source/build artifacts.

Interactive animation follow-up, 11 October 2026: the plate now tilts with mouse movement and resets on exit; changing topics reveals the new question group; starter cards lift/press and choosing one briefly highlights the composer. Reduced motion disables tracking/transforms and the selection pulse. The existing browser case verifies pointer/reset values, composer animation, reduced-motion selection and zero automatic submissions. Build and `check` passed (69 unit tests); all 10 Chromium tests passed in isolated database `nutribite_test_5311b5fcd36f40f89c658372c17fbd83`, subsequently cleaned. Local live/ready checks returned 200 after restart. No Groq calls were made; release accessibility/browser limitations above remain.

## Structured response visibility verification

On 13 October 2026 the PRD contract was audited after the UI showed only answer prose. The Groq request still specifies strict native JSON Schema; raw JSON parsing and `m1AnswerSchema` validation reject invalid content before review/commit. The complete answer/claims object is stored and returned. A scoped read-only check of the cited saved protein reply found three claims with null sources, without exporting its text. Only the frontend's presentation was missing the claims.

The inline Claims disclosure now displays existing claim text and `Source: null`, or an explicit empty-array message. It never reconstructs claims from prose. The browser fixture exercises two claims, keyboard expansion, literal HTML-looking text, source values, empty claims and a 390px screenshot. The mocked read verifies presentation only; separate real-database tests establish persistence and invalid-candidate rejection.

- `npm run build` and `npm run check`: passed, including 69 unit tests, formatting/lint/types and 170 catalogue mappings.
- `npm run test:integration`: 51 passed in `nutribite_test_434e0458ae7a41a4964802c3e59f18e0`; owned database cleaned. Includes malformed-output/non-null-source rejection and committed history/retry checks.
- `npm run test:e2e`: 10 Chromium tests passed in `nutribite_test_3f350fe215fa4ab1ad01cb303c965c1f`; owned database cleaned. The synthetic claims screenshot was visually inspected for readable wrapping and accessible expansion.
- The same local app resumed at `http://127.0.0.1:51261`; live/ready returned 200. Startup reported no purged sessions or reconciled attempts. No model calls, prompt/schema changes, transcript rewrites or quota changes were needed. Broader release/accessibility gaps remain as previously recorded.

## Saved-chat recovery verification

On 13 October 2026 the owner reported that loading finished with an empty chat. An isolated same-tab refresh probe worked, but inspection found that startup created an empty conversation whenever its tab-storage reference was absent. The owner's actual storage state was not inspected. Session responses now expose the latest owned non-empty conversation as recovery metadata; valid tab references still take precedence, including an explicit empty New chat. An empty chat offers **Resume last saved chat** when a saved conversation is available and the composer has no draft.

- `npm run build`: passed. No database migration or provider call was required.
- `npm run test:integration`: **52 passed**, including recovery ownership, skipping empty conversations and excluding expired/revoked sessions. Owned database `nutribite_test_ecec35350df945838d76026c12bbd414` was cleaned.
- `npm run test:e2e`: **10 Chromium tests passed**. The existing recovery case now checks missing tab references, a new tab with blocked storage, preserving explicit New chat after refresh, and explicit resume. It verifies no additional question submission and no unintended conversation creation. Owned database `nutribite_test_eafa253df07c409fbfc389eff2905b38` was cleaned.
- Unit, formatting, lint and type checks passed with **69 unit tests**. The initial aggregate check identified the expected stale case-location manifest after adding integration coverage; the manifest was regenerated with all 170 catalogue IDs retained.
- Final `npm run check` passed, including the regenerated manifest and 654 local Markdown links. The rebuilt local app is running at the same `http://127.0.0.1:51261` origin; live and ready endpoints returned HTTP 200. Startup reported zero purged sessions and zero reconciled attempts.

Recovery reads committed data only and respects the existing anonymous cookie and expiry. It cannot restore another browser/session's conversations. No Groq calls, quota resets or transcript rewrites were made; broader release/accessibility limitations remain open.

## Adjacent Sources panel verification

Date: **13 October 2026**. The owner restored the assignment's ANS-05 layout. Sources now appears in the main layout: a quiet right-hand column on desktop and a compact section below the conversation under 1100px. About this chat retains answer limitations, privacy and diagnostics.

- Build and the aggregate check passed, including 69 unit tests, formatting, lint, types, coverage mapping and local documentation links.
- Chromium verification: all 10 tests passed using the scripted provider and isolated database `nutribite_test_fab70af67b07408d81222a188fd8ec57`, which was cleaned afterward.
- Desktop and mobile screenshots at 320, 390, 768 and 1280px were reviewed for readable empty-state text, spacing and overflow. The responsive browser case checks panel position; existing recovery/error cases check visibility without opening a modal.
- The first browser run passed 9/10. Its reduced-motion check saw the earlier normal-motion composer pulse still running. The test now waits for that pulse to finish before checking a new reduced-motion selection; the application animation and safeguards are unchanged.

The work changes presentation only. No live model calls, database migration, prompt/schema change or public deployment was performed. Screen-reader listening and the broader release browser matrix remain pending.

Sources follow-up, 13 October 2026: the isolated browser pass did not establish that the existing local server used the new build. [P2-008](failure-log.md#p2-008-running-server-and-rebuilt-assets-13-october-2026) records failed asset requests, a scoped restart, preserved data counts and successful checks of the actual served assets. The new build preflight was exercised against the running local app and exited nonzero before compilation. Browser-provider access was unavailable during recovery, so no new live-browser visual verification is claimed.

## Viewport-fitting layout verification

Date: **13 October 2026**. Owner-approved screen-fitting layout, followed by mobile card-slider and gentle-motion refinements. The browser suite uses the scripted provider and isolated PostgreSQL; no live model call was made.

- Production build passed. The final Chromium suite passed **10/10** in owned database `nutribite_test_91acac4e90a5460eadd3e9d12c648192`, subsequently cleaned.
- No horizontal/page vertical overflow was asserted at 320x640, 390x844, 768x900, 1280x720, 1366x768, 1440x900 and 1920x1080. Header, composer and Sources remain within the frame; the empty welcome fits without internal vertical scrolling. Refusal/oversized-input, loading and selected failure/expanded-claim states are also covered.
- Drafts grow from two to four lines, then scroll internally. Existing IME, explicit-only submission, recovery and reading-position checks pass. Mobile slider buttons, keyboard navigation, native horizontal scrolling and topic reset work without submitting a question.
- Short-window checks at 640x360 (layout equivalent of 1280x720 at 200% browser zoom) and 390x360 exercise the accessible scroll fallback and focused composer. Dialog scrolling and focus return pass. These are automated viewport simulations, not physical keyboard or native browser-zoom evidence.
- The decorative background cannot intercept pointer input. Reduced-motion checks disable its animation and the plate motion; existing checks also cover the selection pulse. Actual waiting alone shows processing dots.
- Initial browser iterations passed 9/10: the 320x640 empty view still overflowed. Mobile cards replaced the crowded stack at the owner's request. An isolated geometry probe then found four surplus pixels from message padding; removing that padding resolved the final welcome overflow. No requirement or overflow assertion was relaxed.

The project app was stopped before rebuilding and restarted afterward at its preserved origin. The served page, both CSS assets, all seven referenced JavaScript assets and both health endpoints returned 200. The existing 22 messages and 31 conversations were preserved. Physical-device keyboard/touch checks, native browser zoom, screen-reader listening and the broader release browser matrix remain unverified; M1 release status is unchanged.
