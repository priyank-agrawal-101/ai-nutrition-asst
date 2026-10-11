# Gusto NutriBite

**Your personal AI nutrition companion**

An AI-powered nutrition assistant in development for India-first everyday adults, with room to expand globally. It answers food, nutrition, cooking, and food-safety questions. The initial milestones cover structured conversational answers, safety enforcement, evaluation, and a later retrieval extension.

**The name:** Gusto represents the joy of eating. NutriBite combines nutrition with a bite of food: understanding what we eat through small, practical insights. Together, the name connects food enjoyment with nutritional awareness. See the [full name and tagline meaning](docs/product-positioning.md#3-name-tagline-and-brand-meaning).

The [problem statement](docs/problemStatement.md) remains the source of truth for product scope. [Product positioning](docs/product-positioning.md) defines the selected brand and its communication; the supplied brand reference does not add features. The technical project folder and repository remain `ai-nutrition-asst`.

## Documentation approach

Write documentation to reduce ambiguity before coding, not to complete a target number of files. Give each topic one authoritative home and link to it. Work on related documents together when their responsibilities are distinct; merge or omit material that would repeat existing decisions. Use this README as the index and decision entry point. Reuse useful parts of this foundation for future projects, including product positioning and brand guidelines, at the detail the project needs.

## Document index

The order below is a reading map, not a mandatory document-production queue. Created files are linked. Planned entries are created only when they resolve a remaining implementation or operating question. A created document does not mean its requirements are built or tested.

| Order | Document | Covers | Status |
| --- | --- | --- | --- |
| 1 | [docs/problemStatement.md](docs/problemStatement.md) | Project brief and milestone goals. | Created |
| 2 | [Product positioning and brand guidelines](docs/product-positioning.md) | Positioning, audience/personas, name and meaning, tagline, brand promise, voice, copy style, and business direction. | Created; strategy draft |
| 3 | [docs/product-spec.md](docs/product-spec.md) | Required behavior, scope, and acceptance checks. | Adopted M1 baseline |
| 4 | [docs/ux-flow.md](docs/ux-flow.md) | User steps, conversation states, and error handling. | Adopted behavior; not built |
| 5 | [docs/architecture.md](docs/architecture.md) | Technology choices, app parts, and how they connect. | Stack and baseline selected; not built |
| 6 | [docs/api-contract.md](docs/api-contract.md) | Endpoints, request/response formats, validation, and errors. | Adopted contract; not implemented |
| 7 | [docs/data-model.md](docs/data-model.md) | Stored data, relationships, and database changes. | Adopted baseline; no database |
| 8 | [docs/safety-and-security.md](docs/safety-and-security.md) | Safety, privacy, access, and abuse prevention. | Adopted baseline; controls unverified |
| 9 | [Wise design reference](docs/design-references/wise/DESIGN.md) + [HTML preview](docs/design-references/wise/preview.html) | Existing visual starting point for chat appearance, components, and responsive presentation. | Present; adapt and verify during UI implementation |
| 10 | [docs/prompt-spec.md](docs/prompt-spec.md) | Instructions, templates, context, and prompt change reasons. | Adopted baseline; not evaluated |
| 11 | [docs/edge-cases.md](docs/edge-cases.md) | Central scenario catalogue, with M1, deferred, and M2 applicability. | Cases not run |
| 12 | [docs/evaluation.md](docs/evaluation.md) | Ten questions, safety selection, scoring, consistency, and comparisons. | Method adopted; evaluation not run |
| 13 | [docs/testing.md](docs/testing.md) | Test layers, isolation, faults, command/CI contract, and evidence. | Baseline; checks not implemented |
| 14 | [docs/code-conventions.md](docs/code-conventions.md) | Code style, imports, schemas, parsing, and dependency discipline. | Implementation baseline |
| 15 | [docs/token-optimization-and-efficiency.md](docs/token-optimization-and-efficiency.md) | Reducing model usage, cost, response time, and repeated work. | Initial guidance |
| 16 | [docs/phase-wise-implementation-plan.md](docs/phase-wise-implementation-plan.md) | Four delivery phases, dependencies, completion criteria, and evidence tracking. | Approved; implementation not started |
| 17 | [AGENTS.md](AGENTS.md) | Short authority map, project boundaries, and planned/verified commands. | Created; implementation guidance |
| 18 | [docs/deployment-and-operations.md](docs/deployment-and-operations.md) | Environments, hosting, settings, health, maintenance, and recovery. | Initial guidance; operating commands and controls unverified |
| 19 | [docs/feature-backlog.md](docs/feature-backlog.md) | Future ideas awaiting explicit scope decisions. | FB-001 manual deletion deferred |
| 20 | [docs/product-roadmap.md](docs/product-roadmap.md) | M1/M2 product direction, milestone outcomes, and unresolved future scope. | Initial roadmap; delivery not started |
| 21 | [Problem-statement comparison](docs/problem-statement-alignment.md) | Simple assignment-to-plan coverage, approved additions, and complexity boundaries. | Documentation audit; no implementation evidence |

[Project documentation: behind the scenes](docs/project-documentation.md) is the short record of our approach, completed steps, and lessons for demos and future projects. It is a progress record, not another specification.

Create `docs/failure-log.md` when evaluations start. It holds actual results using the method in `evaluation.md`; it is also separate from the foundation documents.

## Design documents and previews

Use the existing design files below directly for M1, as confirmed by the owner. A new `design-guide.md`/preview pair is not a prerequisite or a separate documentation task. Record necessary chat-specific choices in UX/testing and implemented tokens; verify the actual UI at desktop/mobile widths, including focus, contrast, reading, and error/source states.

If a distinct Design Guide is explicitly requested later, pair it with an HTML preview and keep both aligned. The existing reference preview already provides an offline viewing option and print styles; it is not an additional launch dependency.

Current design references:

- [Wise design reference](docs/design-references/wise/DESIGN.md): the imported getdesign reference, preserved as source material.
- [Wise visual preview](docs/design-references/wise/preview.html): an interactive, offline companion with colours, type, components, and illustrative Gusto NutriBite adaptations. Open the file in a browser; use **Print / save PDF** for a printable view.

The Wise files are the visual starting point for implementation, not proof of application behavior or accessibility. Adapt them to Gusto NutriBite's chat and preserve the source assets. Pricing, authentication, and other illustrative reference surfaces do not expand product scope.

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

Add local setup instructions here when the app exists. Link to the prompt, response schema, prompt changes, safety enforcement, and chosen stack in their own documents.

## Next build decisions

The [implementation plan](docs/phase-wise-implementation-plan.md) is created and approved; the [assignment comparison](docs/problem-statement-alignment.md) makes scope coverage and additions easy to review. [Agent guidance](AGENTS.md) and the [initial operations baseline](docs/deployment-and-operations.md) are now present. Next begin Phase 1, pinning compatible tooling and establishing an isolated database. No app, runnable npm scripts, tests, evaluation, or deployment exists yet.

| Work boundary | Decision or evidence needed | Authoritative home |
| --- | --- | --- |
| Scaffold and persistence | Stack selected. Pin compatible versions, establish isolated PostgreSQL, and materialize v1 contracts. A fake provider supports independent local development. | [Architecture dependencies](docs/architecture.md#implementation-dependencies), [API contract](docs/api-contract.md#contract-stability), and [conventions](docs/code-conventions.md#2-typescript-tooling-and-source-style). |
| Real model integration | Verify native schema support, raw-output/completion handling, effective settings, and account access with an isolated adapter harness; then evaluate through the ordinary app pipeline. | [Provider adapter](docs/architecture.md#provider-adapter). |
| Adopted safety behavior | Implement/test accepted policies and permitted controls; keep brief exclusions fixed. | [Safety handoff](docs/safety-and-security.md#12-decisions-and-implementation-handoff). |
| Visitor data | Implement expiry/revocation and automatic cleanup; verify notices/provider/backup retention. Manual deletion is deferred, not a blocking contract gap. | [Privacy boundary](docs/api-contract.md#privacy-implementation-boundary). |
| Chat appearance and accessibility | Use existing Wise reference/preview; record and verify product-specific choices during UI implementation. | [Design files](#design-documents-and-previews), [UX](docs/ux-flow.md), and [testing](docs/testing.md). |
| Live operation | Confirm budget, retention, hosting behaviour, and recovery evidence before public traffic. | [Operations guidance](docs/deployment-and-operations.md) and [safety release review](docs/safety-and-security.md#release-review). |

Prerequisites block their affected phase, not every independent task. The linked owners retain exact values and acceptance rules. Existing design files are included in the plan; no duplicate guide is required. Backlog ideas and M2/M3 roadmap entries do not enter M1 without an explicit scope decision.
