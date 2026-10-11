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
| 3 | [docs/product-spec.md](docs/product-spec.md) | Required behavior, scope, and acceptance checks. | Draft |
| 4 | [docs/ux-flow.md](docs/ux-flow.md) | User steps, conversation states, and error handling. | Draft |
| 5 | [docs/architecture.md](docs/architecture.md) | Technology choices, app parts, and how they connect. | Draft |
| 6 | [docs/api-contract.md](docs/api-contract.md) | Endpoints, request/response formats, validation, and errors. | Draft |
| 7 | [docs/data-model.md](docs/data-model.md) | Stored data, relationships, and database changes. | Draft |
| 8 | [docs/safety-and-security.md](docs/safety-and-security.md) | Detailed safety rules, enforcement, privacy, access, and abuse prevention. | Draft |
| 9 | `docs/design-guide.md` + `docs/design-guide-preview.html` | Appearance, components, mobile layouts, and accessibility, with a visual HTML preview. | Guide and preview planned |
| 10 | [docs/prompt-spec.md](docs/prompt-spec.md) | Model instructions, response templates, context assembly, and reasons for prompt changes. | Draft |
| 11 | [docs/edge-cases.md](docs/edge-cases.md) | Central catalogue of corner scenarios across questions, safety, context, APIs, model output, recovery, data, security, UI, operations, and retrieval. | Draft; cases not run |
| 12 | [docs/evaluation.md](docs/evaluation.md) | Ten fixed questions, safety-suite selection, scoring, consistency checks, failure counts, run records, and milestone comparison. | Draft; evaluation not run |
| 13 | [docs/testing.md](docs/testing.md) | Test layers, isolated harness, fault injection, command/CI contract, and software evidence. | Draft; checks not implemented |
| 14 | [docs/code-conventions.md](docs/code-conventions.md) | Implementation style, imports, schema ownership, parsing, typed outcomes, and dependency discipline. | Draft |
| 15 | [docs/token-optimization-and-efficiency.md](docs/token-optimization-and-efficiency.md) | Reducing model usage, cost, response time, and repeated work. | Initial guidance |
| 16 | `docs/phase-wise-implementation-plan.md` | Detailed delivery tracking if the existing architecture/build decisions are insufficient. | Create only if needed |
| 17 | `AGENTS.md` (project root) | Short routing instructions linking authoritative docs and actual commands. | Add when useful during scaffolding |
| 18 | `docs/deployment-and-operations.md` | Hosting, environment settings, health checks, monitoring, and recovery. | Planned |
| 19 | [docs/feature-backlog.md](docs/feature-backlog.md) | Future ideas and optional improvements awaiting explicit scope decisions. | Created; empty backlog |
| 20 | [docs/product-roadmap.md](docs/product-roadmap.md) | M1/M2 product direction, milestone outcomes, and unresolved future scope. | Initial roadmap; delivery not started |

[Project documentation: behind the scenes](docs/project-documentation.md) is the short record of our approach, completed steps, and lessons for demos and future projects. It is a progress record, not another specification.

Create `docs/failure-log.md` when evaluations start. It holds actual results using the method in `evaluation.md`; it is also separate from the foundation documents.

## Design documents and previews

Create a companion **HTML preview** whenever we create a Design Guide, and reuse this approach in future projects. For Gusto NutriBite, the planned pair is `docs/design-guide.md` and `docs/design-guide-preview.html`. The preview should show the guide's colours, typography, spacing, components, interaction states, and desktop/mobile layouts. Keep it aligned with the guide as design decisions change. The Markdown guide records the decisions; the preview makes them easy to inspect visually.

The preview is a companion artifact within the Design Guide entry, not an additional foundation document or launch dependency. Check it in a browser at desktop and mobile widths, and include an offline viewing option and print styles.

Current design references:

- [Wise design reference](docs/design-references/wise/DESIGN.md): the imported getdesign reference, preserved as source material.
- [Wise visual preview](docs/design-references/wise/preview.html): an interactive, offline companion with colours, type, components, and illustrative Gusto NutriBite adaptations. Open the file in a browser; use **Print / save PDF** for a printable view.

The Wise files are inspiration for the future Gusto NutriBite Design Guide. They are separate from the product's final design decisions and do not change its scope.

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

The testing and code-conventions baselines are written. Resolve the remaining decisions in their existing homes, then implement the smallest useful foundation with its tests. Do not create another planning file by default.

| Work boundary | Decision or evidence needed | Authoritative home |
| --- | --- | --- |
| Scaffold and persistence | Settle the proposed stack; pin compatible runtime/package/database versions and materialise the v1 contracts. The test harness can use a fake provider. | [Architecture dependencies](docs/architecture.md#implementation-dependencies), [API contract stability](docs/api-contract.md#contract-stability), and [tooling conventions](docs/code-conventions.md#2-typescript-tooling-and-source-style). |
| Real model integration | Verify native schema support, raw-output/completion handling, effective settings, and account access with an isolated adapter harness; then evaluate through the ordinary app pipeline. | [Provider adapter](docs/architecture.md#provider-adapter). |
| Adopted safety behaviour | Resolve the detailed policy proposals before encoding their expected routing. Keep required brief exclusions fixed. | [Safety decisions](docs/safety-and-security.md#12-decisions-and-next-document). |
| Deletion and real visitor data | Complete the existing deletion API/UX/receipt amendment; do not infer an endpoint from a policy paragraph. | [API privacy gap](docs/api-contract.md#privacy-work-still-required). |
| Chat appearance and accessibility | Specify the remaining visual decisions before accepting the UI. | Design work described below, using the existing UX and brand owners. |
| Live operation | Confirm budget, retention, hosting behaviour, and recovery evidence before public traffic. | [Architecture operations](docs/architecture.md#12-deployment-and-operations) and [safety release review](docs/safety-and-security.md#release-review). |

The detailed contract/design gaps block their affected work, not all independent scaffolding. This table routes decisions; their values and acceptance rules remain in the linked documents.

The Design Guide and its companion HTML preview remain outstanding: `docs/design-guide.md` and `docs/design-guide-preview.html`. Use the [Gusto NutriBite identity and product positioning](docs/product-positioning.md), the problem statement, and existing UX states, with the [Wise reference preview](docs/design-references/wise/preview.html) as visual inspiration. Cover visual design, components, mobile behavior, and accessibility. The positioning document adds no launch dependencies or approval steps.
