# Gusto NutriBite

**Your personal AI nutrition companion**

An experimental project created by **Priyank Agrawal**.

An AI-powered nutrition assistant in development for India-first everyday adults, with room to expand globally. It answers food, nutrition, cooking, and food-safety questions. The initial milestones cover structured conversational answers, safety enforcement, evaluation, and a later retrieval extension.

**The name:** Gusto represents the joy of eating. NutriBite combines nutrition with a bite of food: understanding what we eat through small, practical insights. Together, the name connects food enjoyment with nutritional awareness. See the [full name and tagline meaning](docs/product-positioning.md#3-name-tagline-and-brand-meaning).

The [problem statement](docs/problemStatement.md) remains the source of truth for product scope. [Product positioning](docs/product-positioning.md) defines the selected brand and its communication; the supplied brand reference does not add features. The technical project folder and repository remain `ai-nutrition-asst`.

## Run the local assistant

The public app is at [ai-nutrition-asst.vercel.app](https://ai-nutrition-asst.vercel.app). Railway/Vercel health and session checks pass; the owner confirmed answering, saved history after refresh and both direct assignment scope refusals. The [deployment plan and release record](docs/deployment-and-operations.md#release-record) distinguish these results from the remaining release checks. The same GitHub repository provides both deployment roles. Keep using the local commands below for this project's saved local chats.

The local assistant has PostgreSQL chat persistence, anonymous sessions, recovery, safety gates and Groq-backed structured answers. Configure the ignored `.env` with `PROVIDER_MODE=groq` and `GROQ_API_KEY`. The selected model is **openai/gpt-oss-120b**. Use `PROVIDER_MODE=scripted` for offline tests. The assignment evaluation is recorded with model-assisted review: ten answers, grouped failures, three-sample consistency and 16/16 required refusals. Known model failures remain preserved for M2. Public deployment is live; consequential food-safety release review and the remaining operational verification are still pending.

Use Node **24.14.0** and npm **11.11.0** (see [.node-version](.node-version) and [package.json](package.json)):

```sh
npm ci
npm run build
npm run dev
```

The launcher prints a free loopback URL, provisions PostgreSQL 17 inside this project, applies the reviewed migration, and keeps local data in ignored `.tmp/local/`. Subsequent launches reuse that data and the same origin. Ctrl+C stops only its app and database. Despite the `dev` command name, this launcher serves the production build. After changing application code, stop this project's app, rebuild, then restart with `npm run dev` and refresh the browser. The build command refuses to overwrite files while the local app is reachable, because its old asset references would break CSS and JavaScript. Do not remove `.tmp/local/` to repair a build.

Run `npm run check` and `npm run test:integration` for software verification. The integration harness creates and removes its own marked database; it never falls back to the local application database. Browser setup and evidence are in [testing](docs/testing.md#phase-2-implementation-evidence). Configuration and operating commands are in [operations](docs/deployment-and-operations.md#phase-2-groq-local-operation). Ordinary software tests need no provider key. Stop this project's running app before reinstalling dependencies on Windows; keep `.tmp/local/`.

## Documentation approach

Write documentation to reduce ambiguity before coding, not to complete a target number of files. Give each topic one authoritative home and link to it. Work on related documents together when their responsibilities are distinct; merge or omit material that would repeat existing decisions. Use this README as the index and decision entry point. Reuse useful parts of this foundation for future projects, including product positioning and brand guidelines, at the detail the project needs.

## Document index

The order below is a reading map, not a mandatory document-production queue. Created files are linked. Planned entries are created only when they resolve a remaining implementation or operating question. A created document does not mean its requirements are built or tested.

| Order | Document | Covers | Status |
| --- | --- | --- | --- |
| 1 | [docs/problemStatement.md](docs/problemStatement.md) | Project brief and milestone goals. | Created |
| 2 | [Product positioning and brand guidelines](docs/product-positioning.md) | Positioning, audience/personas, name and meaning, tagline, brand promise, voice, copy style, and business direction. | Created; strategy draft |
| 3 | [docs/product-spec.md](docs/product-spec.md) | Required behavior, scope, and acceptance checks. | Adopted M1 baseline |
| 4 | [docs/ux-flow.md](docs/ux-flow.md) | User steps, conversation states, and error handling. | Phase 2 local interface; manual accessibility review pending |
| 5 | [docs/architecture.md](docs/architecture.md) | Technology choices, app parts, and how they connect. | Phase 2 Groq/safety implementation |
| 6 | [docs/api-contract.md](docs/api-contract.md) | Endpoints, request/response formats, validation, and errors. | v1 implemented with Groq and safe session metadata |
| 7 | [docs/data-model.md](docs/data-model.md) | Stored data, relationships, and database changes. | Initial and additive PostgreSQL migrations verified |
| 8 | [docs/safety-and-security.md](docs/safety-and-security.md) | Safety, privacy, access, and abuse prevention. | Local safety checks passed; release review pending |
| 9 | [Wise design reference](docs/design-references/wise/DESIGN.md) + [HTML preview](docs/design-references/wise/preview.html) | Preserved original reference assets; current design lives in UX and application CSS. | Superseded by owner-authorized frontend redesign |
| 10 | [docs/prompt-spec.md](docs/prompt-spec.md) | Instructions, templates, context, and prompt change reasons. | v2 baseline captured; human review pending |
| 11 | [docs/edge-cases.md](docs/edge-cases.md) | Central scenario catalogue, with M1, deferred, and M2 applicability. | Selected Phase 1/2 variants tested; see coverage map |
| 12 | [docs/evaluation.md](docs/evaluation.md) | Ten questions, safety selection, scoring, consistency, and comparisons. | Baseline and extensions captured; factual/policy findings open |
| 13 | [docs/testing.md](docs/testing.md) | Test layers, isolation, faults, command/CI contract, and evidence. | Runnable checks and Phase 1/2 evidence |
| 14 | [docs/code-conventions.md](docs/code-conventions.md) | Code style, imports, schemas, parsing, and dependency discipline. | Implementation baseline |
| 15 | [docs/token-optimization-and-efficiency.md](docs/token-optimization-and-efficiency.md) | Reducing model usage, cost, response time, and repeated work. | Initial guidance |
| 16 | [docs/phase-wise-implementation-plan.md](docs/phase-wise-implementation-plan.md) | Four delivery phases, dependencies, completion criteria, and evidence tracking. | Phase 3 implemented in part; review/clearance gaps recorded |
| 17 | [AGENTS.md](AGENTS.md) | Short authority map, project boundaries, and planned/verified commands. | Created; implementation guidance |
| 18 | [docs/deployment-and-operations.md](docs/deployment-and-operations.md) | Environments, hosting, settings, health, maintenance, and recovery. | Local setup verified; public operation pending |
| 19 | [docs/feature-backlog.md](docs/feature-backlog.md) | Future ideas awaiting explicit scope decisions. | FB-001 manual deletion deferred |
| 20 | [docs/product-roadmap.md](docs/product-roadmap.md) | M1/M2 product direction, milestone outcomes, and unresolved future scope. | Proposed direction; implementation plan owns progress |
| 21 | [Problem-statement comparison](docs/problem-statement-alignment.md) | Simple assignment-to-plan coverage, approved additions, and complexity boundaries. | Documentation audit; no implementation evidence |

[Project documentation: behind the scenes](docs/project-documentation.md) is the short record of our approach, completed steps, and lessons for demos and future projects. It is a progress record, not another specification.

[The failure log](docs/failure-log.md#assignment-baseline-review-13-october-2026) records the ten-question baseline, grouped failure counts, substantive consistency comparison and required refusal results. It also preserves historical failures, policy extensions and diagnostics separately. The review is model-assisted; independent human validation is not claimed.

## Design documents and previews

On 11 October 2026 the owner requested a new frontend design independent of Wise, with motion, interactive starters and less prominent notices. [UX](docs/ux-flow.md#visual-direction-and-information-hierarchy) owns the new direction; implementation uses self-hosted Outfit, plum/lilac/mint colours and a food illustration. Sources sits quietly beside the conversation, with an empty-state message. On narrow screens it is a compact row below the conversation. The app fits the available screen height, with internal message scrolling and a composer that stays visible; very short or zoomed views retain accessible scrolling. **About this chat** contains answer limitations and detailed privacy/diagnostic information. A new `design-guide.md`/preview pair is not needed. Verify the actual UI at desktop/mobile widths, including focus, contrast, reading and error/source states.

If a distinct Design Guide is explicitly requested later, pair it with an HTML preview and keep both aligned. The existing reference preview already provides an offline viewing option and print styles; it is not an additional launch dependency.

Current design references:

- [Wise design reference](docs/design-references/wise/DESIGN.md): the imported getdesign reference, preserved as source material.
- [Wise visual preview](docs/design-references/wise/preview.html): an interactive, offline companion with colours, type, components, and illustrative Gusto NutriBite adaptations. Open the file in a browser; use **Print / save PDF** for a printable view.

The Wise files are preserved historical references, not the active visual direction or proof of application behavior/accessibility. Pricing, authentication and other illustrative reference surfaces do not expand product scope.

## Files to keep out of Git

The root [.gitignore](.gitignore) excludes dependencies, build output, generated test reports, logs, local environment files, and temporary work in `.tmp/` and `.preview-work/`. Put browser profiles, trial screenshots, and disposable preview exports in `.preview-work/`.

Keep authored documentation and its HTML previews, source tests, database migrations, package lockfiles, and placeholder `.env.example` files in Git. Ignore rules do not remove files already tracked by Git.

## Writing rules

Apply these rules to every project document and instruction:

- Write for both product managers and developers. Use plain words, short sentences, and direct instructions.
- Remove filler, buzzwords, repeated explanations, and sections that do not help someone decide, build, or check something.
- Explain technical terms when needed. Keep technical detail that affects behavior or implementation.
- Give each topic one home, as listed above. Link to its section or requirement ID instead of copying it.
- Testing owns execution methods and check commands; code conventions owns implementation practices; edge cases owns scenario definitions; evaluation owns live model scoring. A handoff should link to the owner, not reproduce its checklist.
- Keep requirements, proposed choices, open questions, and actual results clearly separate.
- Make requirements testable. Shorter text must not remove a condition, safety rule, or acceptance check.
- Keep requirement IDs stable. Mark replacements rather than reusing an old ID.
- Use **Gusto NutriBite** in authored document titles and product-facing references, with **Your personal AI nutrition companion** as the tagline. Use the [brand meaning and copy guide](docs/product-positioning.md) for descriptions. Preserve original source text and technical identifiers such as repository paths, API fields, and cookie names.
- Once prompts, schemas, or configuration exist in code, link to them. Keep their purpose and change reasons in the docs.
- Before finishing a document, check clarity, missing details, repetition, and links. Update this index.
- Update [project-documentation.md](docs/project-documentation.md) after each major step: a new document, key decision, completed build phase, evaluation, or deployment. Record what changed, why, and the result in one short entry. Update its date, current stage, and next step. Skip minor edits; distinguish drafted, built, tested, and deployed work.
- Read the documents needed for the task, plus applicable instructions. Preserve required rules when shortening text.

Keep the original [problemStatement.txt](docs/problemStatement.txt) as the source. Its Markdown version may simplify the wording while preserving the brief.

Local setup is above. Prompt, response schema, safety and stack details remain in their owning documents.

## Next build decisions

The [implementation plan](docs/phase-wise-implementation-plan.md) records the owner's direction to finish M1 according to the assignment: record model failures rather than patch evaluation questions. The [Phase 3 review](docs/evaluations/phase3-review.md) distinguishes 39/39 baseline route/storage checks, 23/29 policy-extension passes and consequential factual review. The next delivery phase is Railway preparation and public verification; no deployment is claimed. Extra policy findings and unperformed human accessibility review remain visible separately.

| Work boundary | Decision or evidence needed | Authoritative home |
| --- | --- | --- |
| Scaffold and persistence | Phase 1 implementation and test evidence are linked from the plan. Continue preserving stored data and recovery guarantees. | [Implementation plan](docs/phase-wise-implementation-plan.md) and [testing](docs/testing.md#phase-1-implementation-evidence). |
| Real model integration | Native schemas, stored API flow and fixed-question evaluation are recorded. Preserve the unchanged M1 evidence for M2. | [Assignment results](docs/failure-log.md#assignment-baseline-review-13-october-2026). |
| Adopted safety behavior | Local controls are implemented and tested. Complete safety evaluation and release review while keeping brief exclusions fixed. | [Safety handoff](docs/safety-and-security.md#12-decisions-and-implementation-handoff). |
| Visitor data | Local expiry/revocation and cleanup are tested. Verify deployed retention and backups before public delivery. Manual deletion remains deferred. | [Privacy boundary](docs/api-contract.md#privacy-implementation-boundary). |
| Chat appearance and accessibility | Responsive, keyboard and all 40 browser-matrix tests passed in the recorded run. Actual screen-reader review remains an additional unperformed check. | [Design files](#design-documents-and-previews), [UX](docs/ux-flow.md), and [testing](docs/testing.md). |
| Live operation | Confirm budget, retention, hosting behaviour, and recovery evidence before public traffic. | [Operations guidance](docs/deployment-and-operations.md) and [safety release review](docs/safety-and-security.md#release-review). |

Prerequisites block their affected phase, not every independent task. The linked owners retain exact values and acceptance rules. Existing design files are included in the plan; no duplicate guide is required. Backlog ideas and M2/M3 roadmap entries do not enter M1 without an explicit scope decision.

## Phase 2: local Groq assistant

Use Node 24/npm 11. Run npm ci, npm run build, then npm run dev. Configure the ignored project .env with PROVIDER_MODE=groq and GROQ_API_KEY; the local launcher preserves existing chats. The selected model is **openai/gpt-oss-120b**, called through Groq only. No OpenAI or Anthropic key is needed.

The app uses separate input classification, structured generation and output review, with code-authored refusals for clear exclusions. Sources remain empty in M1. The account limits are enforced at 30 requests/minute, 1,000/day, 8,000 total tokens/minute and 200,000/day. No automatic model retries occur.

Pause/resume local generation with npm run generation:off / npm run generation:on. See [operations](docs/deployment-and-operations.md#phase-2-groq-local-operation), [testing evidence](docs/testing.md#phase-2-implementation-evidence), and [the plan](docs/phase-wise-implementation-plan.md). Deliberate npm run smoke:groq makes real calls using synthetic data; ordinary tests remain offline from Groq.


## Phase 3 review handoff

[Review disposition and core-question index](docs/evaluations/phase3-review.md) | [Dated reference pack](docs/evaluations/reference-pack-v1.md) | [Software evidence](docs/testing.md#phase-3-release-verification). Use `npm run eval:report` for a new private evidence packet and `npm run test:restore` for the isolated PostgreSQL archive rehearsal. Exact setup stays in the linked owners. Phase 3 is not release-cleared: human review and correction/regression of the recorded model failures remain required.
