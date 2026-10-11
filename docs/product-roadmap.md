# Gusto NutriBite: Product Roadmap

Track intended product evolution through milestones, using the [problem statement](problemStatement.md#milestones) as the source of scope. This roadmap records direction and major outcomes, not delivery dates or detailed technical tasks.

## How to read this roadmap

- **Approved commitments:** Requirements already established by the brief or an explicit project-owner decision. M1 and M2 below come from the brief; this document grants no new approval. Proposed details in the specifications remain proposed.
- **Proposed milestones:** Possible milestone boundaries or contents awaiting an explicit decision. They do not authorize implementation.
- **Aspirational ideas:** Possibilities captured in the [feature backlog](feature-backlog.md), with no delivery commitment. They do not automatically become roadmap items.

The current implementation focus is M1. The repository is at the documentation stage: no application, executed evaluation, or public deployment is complete. Milestone completion must be supported by evidence, not by changing a status label.

## Initial milestones

| Milestone | Commitment and status | Objective and expected outcome | Planned capabilities | Dependencies and major completion criteria |
| --- | --- | --- | --- | --- |
| **M1 — Assistant and evaluation baseline** | Required by the brief; specifications drafted, implementation not started. | Deliver the constrained nutrition assistant and establish a recorded baseline of answer quality, safety, and failures. | Stored chat with structured answers from model knowledge, an empty sources panel, server-side model calls, prompt and code safety checks, evaluation, and public deployment. See [M1 scope](product-spec.md#scope) and [answers and sources](product-spec.md#answers-and-sources). | Resolve the affected [build decisions](../README.md#next-build-decisions), including model access and live operation. Complete the existing [product release checks](product-spec.md#completion-and-release) and [evaluation deliverables](evaluation.md#13-completion-review-decisions-and-release-boundaries). No completion evidence exists yet. |
| **M2 — Retrieval and comparison** | Required future direction in the brief; implementation not started, retrieval details unresolved. | Support claims with retrieved evidence and compare outcomes with the preserved M1 baseline. Improvement must be measured, not assumed. | Add retrieval and citations while preserving the interface, endpoints, response schema, and evaluation questions. See [M2 requirements](product-spec.md#deployment-and-milestone-2). | Depends on the M1 baseline and review of the [retrieval design decisions](architecture.md#13-milestone-2-extension). Completion includes the existing compatibility requirements and a recorded [M1/M2 evaluation comparison](evaluation.md#milestone-1-versus-milestone-2); detailed retrieval acceptance decisions remain open. |
| **M3 — Unassigned** | Proposed placeholder only; no approved scope. | Unassigned pending a product decision. | None assigned. | Objective, capabilities, dependencies, and completion criteria must be decided before approval. No backlog idea is assigned automatically. |

M1 and M2 are product milestones, not implementation phases. Detailed stack, policy, design, and retrieval proposals are resolved in their owning documents; this table does not approve them. Existing exclusions and brand aspirations are not future feature commitments.

## Keeping direction and execution separate

- The backlog captures possibilities; this roadmap captures intended product direction. Adding an item to either document does not authorize implementation.
- This roadmap is not a substitute for `docs/phase-wise-implementation-plan.md`. That plan, when created, determines the detailed execution sequence for the currently approved scope. It does not yet exist; the [README build decisions](../README.md#next-build-decisions) link the current dependencies.
- Moving an idea from the backlog into a milestone or implementation plan requires explicit project-owner approval. Record the decision with the backlog entry, link its ID here, and distinguish a proposed destination from an approved commitment.
- When a milestone changes, update its objective, capability boundary, status, and decision/evidence links. Keep detailed tasks and acceptance criteria in their existing specification or execution-plan homes.
