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

For browser coverage, start with Chromium desktop in applicable PRs. Before UI release, add Firefox, WebKit, and mobile-sized projects using pinned Playwright revisions. Emulation is not evidence from a physical phone. Use the existing [Wise reference](design-references/wise/DESIGN.md) and [preview](design-references/wise/preview.html); record chat-specific widths and visual acceptance during implementation. No duplicate guide is a prerequisite.

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
| UI, routing, or styling | `check`, build, Chromium flows and accessibility checks; affected HTTP tests if the API use changes | Release browser matrix and comparison with the existing design references. |
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
