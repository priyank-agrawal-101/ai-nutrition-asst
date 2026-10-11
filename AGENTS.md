# Working on Gusto NutriBite

Work only in this repository (`E:\ai-nutrition-asst` locally). Preserve existing local changes and other projects' processes, ports, databases, and files. Check repository status before editing.

## Scope and authority

- Follow the user's active task and the approved [implementation plan](docs/phase-wise-implementation-plan.md). The [problem statement](docs/problemStatement.md) and [product specification](docs/product-spec.md) own product scope; the [assignment comparison](docs/problem-statement-alignment.md) explains additions.
- Implement M1 only: stored anonymous chat, structured answers, null claim sources, safety enforcement, evaluation, and public delivery. M2 retrieval is future work. [Backlog](docs/feature-backlog.md) ideas and proposed [roadmap](docs/product-roadmap.md) items are not implementation approval. Manual deletion is deferred as FB-001.
- Resolve routine details from the owning document and sensible defaults. Ask only about material unresolved decisions; keep independent work moving. Record new ideas in the backlog without silently expanding scope.

## Read the relevant owners

Read the documents relevant to the change; do not copy whole specifications here.

| Work | Authority |
| --- | --- |
| Structure and code | [Architecture](docs/architecture.md), [conventions](docs/code-conventions.md) |
| HTTP and persistence | [API contract](docs/api-contract.md), [data model](docs/data-model.md) |
| Model behavior | [Safety/security](docs/safety-and-security.md), [prompt specification](docs/prompt-spec.md), [efficiency](docs/token-optimization-and-efficiency.md) |
| UI | [UX](docs/ux-flow.md), [positioning](docs/product-positioning.md), existing [Wise reference](docs/design-references/wise/DESIGN.md) and [preview](docs/design-references/wise/preview.html) |
| Verification and operation | [Testing](docs/testing.md), [edge cases](docs/edge-cases.md), [evaluation](docs/evaluation.md), [operations](docs/deployment-and-operations.md) |

## Implementation guardrails

- Use the selected single Next.js/TypeScript app, PostgreSQL/Drizzle, CSS Modules, Zod, npm, Vitest, and Playwright. Pin compatible versions during scaffolding; the host's installed versions are not the baseline. Add modules/dependencies when needed, without speculative frameworks or services.
- Keep provider credentials, prompts, and database access server-only. Validate raw input/output and structured schemas; enforce safety in code and prompts. Never expose an unvalidated or uncommitted candidate.
- Preserve ownership, transactional integrity, explicit retry/replay, bounded full context, and automatic expiry/cleanup. Do not bypass review, constraints, or limits to make a test or demo pass.
- Preserve the original brief, supplied design assets, stable requirement/case IDs, fixed questions, and adverse evaluation evidence. Use the existing design files; do not create a duplicate guide.
- Keep secrets and visitor data out of Git, logs, and test artifacts. Never reset a shared database or replace runtime data to fix a build.

## Verification and handoff

At creation on 11 October 2026, this repository has no app or runnable scripts. The [testing command contract](docs/testing.md#6-command-and-ci-contract) defines target commands: `npm ci`, `npm run check`, `npm run test:integration`, `npm run build`, `npm run test:e2e`, and the release browser matrix. Run applicable checks once implemented; missing suites are not passes. Documentation-only work needs link/ID/consistency checks, not paid calls or an app build.

Use isolated test databases through `TEST_DATABASE_URL`, owned child processes, and a scripted provider. Normal tests/PR CI must not load live provider credentials. Deliberate live evaluation requires its recorded budget and artifact policy; follow required regression rules for prompt/model/safety changes.

Update owning contracts alongside changes and record verified progress in the plan. Report what changed, checks run, results, and unresolved limits. Never mark a phase complete without its required evidence; distinguish documented, built, tested, evaluated, and deployed.
