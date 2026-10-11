# Gusto NutriBite: Project Documentation — Behind the Scenes

Last updated: 11 October 2026.

**Current stage:** Resolving implementation decisions before coding. Testing and code conventions have distinct owners; the empty feature backlog captures future possibilities, and the roadmap records the brief's M1/M2 direction with M3 unassigned. The README routes remaining build decisions instead of treating the document index as a production queue. The foundation specifications remain drafts; no application, test harness, live model evaluation, or deployment is complete. The Design Guide and companion HTML preview remain planned.

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

## What to reuse in future projects

- Separate requirements from suggestions and unanswered questions.
- Describe failure paths as well as successful ones.
- Keep details in one place and link to them.
- Optimise for resolved decisions, not document count; create related documents together only when they have distinct responsibilities.
- Record what was actually built and checked, not just what was planned.
- Pair each Design Guide with a visual HTML preview, and keep temporary browser checks separate from authored previews.

## Next step

Follow the [README build decisions](../README.md#next-build-decisions), resolve each gap in its owning document, and implement the smallest useful scaffold with its test harness once the foundation is settled. Do not create another planning document by default. Keep drafted, implemented, evaluated, and deployed work distinct.
