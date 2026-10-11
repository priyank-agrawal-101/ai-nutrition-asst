# Gusto NutriBite: Product Roadmap

Track intended product evolution through milestones, using the [problem statement](problemStatement.md#milestones) as the source of scope. This roadmap records direction and major outcomes, not delivery dates or detailed technical tasks.

## How to read this roadmap

- **Approved commitments:** Requirements established by the brief or an explicit owner decision. M1/M2 come from the brief; the [product specification](product-spec.md) and [implementation plan](phase-wise-implementation-plan.md) record the accepted 11 October 2026 baseline. Unadopted future details remain proposed.
- **Proposed milestones:** Possible milestone boundaries or contents awaiting an explicit decision. They do not authorize implementation.
- **Aspirational ideas:** Possibilities captured in the [feature backlog](feature-backlog.md), with no delivery commitment. They do not automatically become roadmap items.

The current implementation focus is M1. The repository is at the documentation stage: no application, executed evaluation, or public deployment is complete. Milestone completion must be supported by evidence, not by changing a status label.

## Initial milestones

| Milestone | Commitment and status | Objective and expected outcome | Planned capabilities | Dependencies and major completion criteria |
| --- | --- | --- | --- | --- |
| **M1 — Assistant and evaluation baseline** | Required by the brief; implementation plan approved, coding not started. | Deliver constrained nutrition chat and a recorded quality/safety/failure baseline. | Stored structured chat, empty sources, server-side calls, prompt/code safety, evaluation, and public deployment under [M1 scope](product-spec.md#scope). | Follow the four [implementation phases](phase-wise-implementation-plan.md#3-implementation-phases), then satisfy [release checks](product-spec.md#completion-and-release) and [evaluation deliverables](evaluation.md#13-completion-review-decisions-and-release-boundaries). No completion evidence exists. |
| **M2 — Retrieval and comparison** | Required future direction in the brief; implementation not started, retrieval details unresolved. | Support claims with retrieved evidence and compare outcomes with the preserved M1 baseline. Improvement must be measured, not assumed. | Add retrieval and citations while preserving the interface, endpoints, response schema, and evaluation questions. See [M2 requirements](product-spec.md#deployment-and-milestone-2). | Depends on the M1 baseline and review of the [retrieval design decisions](architecture.md#13-milestone-2-extension). Completion includes the existing compatibility requirements and a recorded [M1/M2 evaluation comparison](evaluation.md#milestone-1-versus-milestone-2); detailed retrieval acceptance decisions remain open. |
| **M3 — Unassigned** | Proposed placeholder only; no approved scope. | Unassigned pending a product decision. | None assigned. | Objective, capabilities, dependencies, and completion criteria must be decided before approval. No backlog idea is assigned automatically. |

M1 and M2 are product milestones, not implementation phases. Their owning documents record selected stack/policy/design choices and unresolved future retrieval details. Manual deletion is deferred as FB-001, with no assigned milestone. Exclusions and brand aspirations are not future commitments.

## Keeping direction and execution separate

- The backlog captures possibilities; this roadmap captures intended product direction. Adding an item to either document does not authorize implementation.
- The [implementation plan](phase-wise-implementation-plan.md) now defines M1 execution and evidence. This roadmap remains a direction/status record, not a duplicate task list.
- Moving an idea from the backlog into a milestone or implementation plan requires explicit project-owner approval. Record the decision with the backlog entry, link its ID here, and distinguish a proposed destination from an approved commitment.
- When a milestone changes, update its objective, capability boundary, status, and decision/evidence links. Keep detailed tasks and acceptance criteria in their existing specification or execution-plan homes.
