# Gusto NutriBite: Code Conventions

Status: Implemented Phase 1 tooling and source conventions, 11 October 2026; future provider/release work must preserve these boundaries.

Pinned tools are in [package.json](../package.json) and [.node-version](../.node-version). [ESLint](../eslint.config.mjs) checks typed promises, unsafe values, and client-to-server imports. [Prettier](../prettier.config.mjs) formats authored implementation files without reformatting original documents/design assets. The [check runner](../scripts/check.mjs) also verifies the case map and local documentation links. Operator/test TypeScript entry points are bundled with pinned esbuild; this avoids an OS-account lookup failure observed in the Windows sandbox's TypeScript launcher.

Last updated: 11 October 2026.

## 1. Scope and ownership

This document owns **how code is written and organised within the chosen boundaries**: TypeScript/style rules, imports, schema/type ownership, boundary parsing, error representation, dependency composition, and change discipline. Use the [architecture's component boundaries and tree](architecture.md#3-system-boundaries); do not maintain a second project tree here.

Public field names, schemas, status/error meanings, and response limits stay in [api-contract.md](api-contract.md). SQL structure, locks, lifecycle predicates, and migration behaviour stay in [data-model.md](data-model.md). Policy and permitted telemetry stay in [safety-and-security.md](safety-and-security.md). Exact prompts/templates stay in [prompt-spec.md](prompt-spec.md). Test commands, naming, fixtures, and CI belong only in [testing.md](testing.md).

When a change crosses one of those boundaries, update the owning contract and its implementation together. A convenience helper or local type must not silently redefine a public field or safety decision. New rules go in the relevant existing owner; create another document only when there is a distinct unresolved responsibility.

## 2. TypeScript, tooling, and source style

Use TypeScript for application and test code, with `.tsx` only for files containing JSX. Use ECMAScript modules. A small `.mjs` launcher is appropriate when it must run before TypeScript tooling is loaded; do not introduce a second runtime solely for scripts.

During scaffolding, pin one compatible Node LTS patch in `.node-version`, declare the supported runtime and npm version in `package.json`, and use the same selections in CI and deployment. Pin PostgreSQL's major version in infrastructure/test configuration. The host's installed runtime is not automatically the project baseline. Verify package engine/peer requirements before freezing the lockfile; do not use an unqualified `latest` selector in repeatable automation.

Use these compiler and tooling decisions:

| Area | Convention |
| --- | --- |
| TypeScript | `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`; retain framework-required settings and use type-only imports where appropriate. |
| Lint | ESLint flat configuration with TypeScript-aware rules, including unhandled promises, unsafe boundary values, and restricted imports. Avoid a second formatter through ESLint. |
| Formatting | Prettier: two spaces, double quotes, semicolons, trailing commas where supported, UTF-8, LF, and final newline. Configuration becomes authoritative once committed. |
| Editor/Git | `.editorconfig` and `.gitattributes` align authored text line endings without transforming binary files. Do not mass-reformat preserved source/reference material. |
| Names | `camelCase` for internal variables/functions; `PascalCase` for types and React components; `UPPER_SNAKE_CASE` for environment names and genuine shared constants. |
| Files | `kebab-case.ts` / `kebab-case.tsx`; framework-reserved names retain their required spelling. Test suffixes are defined in the testing document. |
| Exports | Prefer named exports; use defaults where the framework requires them. No root barrel re-exporting server and client modules together. |

Keep the API's `snake_case` names in wire objects and database mapping definitions. Internal domain variables may use `camelCase`; map explicitly at that boundary instead of recursively renaming arbitrary JSON. Preserve external source titles and technical identifiers.

Use `unknown` for untrusted values and caught errors, then narrow them. Infer public types from their runtime schemas. Add explicit return types to exported boundary/service functions; inference is sufficient for straightforward internal helpers. Avoid `any`, unchecked casts, and non-null assertions at trust boundaries. An unavoidable SDK typing escape stays inside its adapter with a comment explaining the verified assumption and a focused check.

Prefer small functions named for the domain operation. Do not create generic controllers, base repositories, utility containers, or speculative abstractions to prepare for unspecified features. Extract a shared helper when two real call sites need the same behaviour and ownership is clear. Comments explain a constraint, race, or unusual tradeoff, not each line of code.

## 3. Imports, services, and dependency composition

Enforce the architecture's dependency direction with restricted imports, not convention alone. Mark server entry modules with the framework's server-only guard. Client components may depend on safe contracts/client utilities but never transitively on database, prompts, provider SDKs, or environment loaders. Contract modules must stay independent of server configuration.

Use a single `@/` alias for `src/` and relative imports within a small module. Avoid circular imports and broad `index.ts` exports that hide side effects. Keep module initialization side-effect free: importing a validator must not connect to a database, read a secret, run a migration, or make a network call.

Compose services through explicit factory/function parameters at the server bootstrap boundary. Supply typed ports for the provider, repositories, clock, ID generation, and event sink where those dependencies are needed. The composition root chooses real implementations; the test harness supplies controlled ones under [its isolation rules](testing.md#3-harness-and-environment-isolation). No dependency-injection framework or mutable global service locator is needed.

Route handlers remain small adapters: decode/validate, establish authenticated scope, invoke the use case, map its result, and serialize the public response. They do not each implement a different retry policy or provider parser. Provider adapters translate transport-specific results into the application's typed phase outcomes; they do not decide persistence or return framework response objects.

Do not scatter environment reads through services. One server configuration loader validates effective settings and returns an immutable typed object. Build-time settings, runtime secrets, and public UI limits are distinct exports. Test bootstrap and normal startup use the same validator with explicit environment profiles; missing required settings fail bootstrap/readiness rather than inventing defaults. Numerical values continue to come from their owning configuration/contract, not duplicated literals in UI, prompts, and tests.

## 4. Schemas and parsing boundaries

### One runtime schema source

Implement the public runtime schemas in `src/contracts/` using the architecture's Zod choice; infer TypeScript DTO types from them. Derive provider JSON Schemas from the same relevant definitions, with explicit internal phase schemas and milestone-specific refinements as described in the prompt spec. Do not maintain separately handwritten client interfaces, provider schemas, and server validators that can drift.

Keep pure structure/type validation, milestone/source policy, and semantic safety as separate operations with named results. This makes their failures distinguishable without merging their responsibilities. A successful structure check is not a type-level certificate of factual truth. The API owns what is accepted; [testing's boundary fixtures](testing.md#4-fixtures-clocks-and-controlled-failures) establish that conversion and runtime enforcement agree.

### Raw JSON cannot be validated only after parsing

Implement one bounded JSON boundary reader under server validation. Its job is to preserve the information the [HTTP conventions](api-contract.md#2-http-conventions) require until it has been checked. In particular, `request.json()` / ordinary `JSON.parse()` alone loses duplicate object member names and cannot be the entire validation path.

Use a parser with an object-member visitor or syntax tree. The initial dependency candidate is `jsonc-parser`, wrapped behind this reader and configured for strict JSON: reject all parser errors, comments, and trailing commas. Verify and pin its actual API/version during scaffolding; do not expose JSONC as an accepted protocol. Compare decoded property names within each object, so an escaped spelling of an already used key is also detected. Do not write a duplicate-key regex.

The reader consumes a byte-bounded stream, performs fatal UTF-8 decoding, checks syntax/member uniqueness, constructs the value, checks Unicode scalar validity, and then applies the runtime schema. Byte limits, normalization, and error classification come from the API; keep this implementation path separate from a schema's string-length check. Buffering the whole request before checking size is insufficient.

The provider adapter must retain the raw output representation needed to enforce the same applicable content checks before accepting an SDK-parsed object. If a provider/SDK hides information required by the contract, resolve the adapter limitation rather than claiming checks ran on information that was already discarded. Provider completion signals remain part of its adapter outcome, not an assumption inferred from parseable JSON.

Centralise Unicode code-point counting and scalar validation. JavaScript string `.length` counts UTF-16 units; schema library defaults must be checked against the API's units. Keep question normalization separate from the broader safety-inspection copy. Use explicit boundary mapping functions for database `bigint`/timestamp values; never serialize a `bigint` directly or use unchecked `Number(...)` conversion.

## 5. Outcomes, errors, and asynchronous work

Use discriminated unions for expected service outcomes. A minimal internal pattern is:

```typescript
type Outcome<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

`E` is a closed, domain-specific error type with safe structured fields. Do not duplicate the public HTTP error object throughout the domain or treat every failure as a string. The HTTP boundary maps outcomes to the existing API contract in one place; unknown codes cannot be serialized as new public errors accidentally.

Persistence uncertainty needs an explicit result distinct from both known commit and known rollback. Use a named storage-outcome variant and resolve it through the existing lifecycle service. Never collapse a caught connection error into `false`, a new empty conversation, or permission to retry. The precise transitions and lock/deadline predicates remain in [transaction design](data-model.md#8-transaction-design-and-locking).

Throw for unexpected implementation defects; catch them at a boundary that can safely classify the failure. Catch values start as `unknown`. Preserve an original cause only inside the restricted diagnostic boundary; the public response and telemetry receive mapped, allowlisted fields. Do not throw inside one layer, swallow it in another, and then return an apparently successful default.

Await every operation that affects the request's result. Avoid `forEach(async ...)`, floating promises, fire-and-forget writes, and generic retry decorators. Pass cancellation and remaining-budget information into provider operations; release resources in `finally` without replacing the original error if cleanup also fails. Test synchronization behaviour follows the testing document; production timing and retry limits remain in architecture.

For independent reads that can fail separately, choose explicit aggregation semantics. Use concurrent execution only where it cannot reorder writes or escape the request's transaction/lifecycle rules. A rolled-back database-only transaction retry must be identified as such; it cannot replay external provider work. Database code must use the connection/transaction supplied by its caller rather than quietly opening another connection midway through an atomic operation.

## 6. Persistence and observability implementation

Write repository functions around domain operations with explicit session/resource scope. Do not expose a generic unscoped `findById` to route code and rely on the caller to remember ownership later. Use parameterised queries and named projections; avoid `SELECT *` at API boundaries or broad updates from user objects.

The [data model](data-model.md) is the only home for table definitions, lock order, constraint semantics, and mutation sequence. Keep transaction coordination in the intended service/repository boundary; a helper must declare whether it requires an existing transaction. Final-state checks are executable SQL/constraints, not comments next to application types.

Migration authoring follows [the existing migration rules](data-model.md#proposed-migration-sequence). In code review, inspect generated SQL alongside custom constraints/triggers and ORM declarations; they must describe the same state. Keep migration changes in the same feature change as dependent code. No runtime bootstrap schema push, edited applied migration, or convenience production reset is introduced by convention.

Implement a small typed event sink with a closed event-name set and a per-event field schema. Validate before serialization. The allowlist, access, and retention remain owned by [the logging policy](safety-and-security.md#8-logging-evaluation-evidence-and-operator-access); do not duplicate its field list in this document. Avoid spreading request objects, provider exceptions, configuration objects, or arbitrary error causes into a logger.

Emit state-transition diagnostics from the operation owner so several layers do not each report the same event as a separate failure. Durable attempt/call records and operational log messages serve different purposes; neither should become a second mutable transcript. Usage normalization stays inside the provider/telemetry boundary with its recorded version.

## 7. Client implementation discipline

Keep UI draft text and recovery markers separate from server-returned conversation state. Represent request/recovery states with a discriminated union or explicit reducer, not unrelated booleans whose combinations can contradict each other. The transition meanings and recovery decisions come from [UX](ux-flow.md) and [the API recovery sequence](api-contract.md#9-client-recovery-sequence).

Centralise API calls in the client boundary. Parse responses against the public contract, then dispatch a typed state transition. Do not scatter fetch/error interpretation across button components. Validate IDs/revisions and active-conversation scope in that shared merge path; components render its result rather than each maintaining competing copies.

Effects must have cleanup and stable dependencies. Mounting/restoring a view may start the contract's reads, but must not create a generation mutation as a side effect of rendering. Avoid optimistic insertion of model text; pending UI state is different from a committed assistant message. Do not introduce a query/state-management dependency until the existing flow demonstrates a need.

Use semantic HTML, actual form/button behavior, and CSS Modules. Follow the owner-authorized [visual direction](ux-flow.md#visual-direction-and-information-hierarchy) and shared application tokens; the Wise reference is preserved historical material. Avoid a separate component framework. Testing owns locators/accessibility verification; UX/brand/prompts own wording.

## 8. Dependencies, changes, and handoff

Add a package for a concrete capability the project needs; use the platform or a small owned helper when it is simpler and safer to maintain. Record why a parser, provider SDK, security-sensitive dependency, or large UI package was selected. Review engine/peer compatibility, license, maintenance, and relevant advisories; installing successfully is not compatibility evidence.

Commit `package-lock.json` with manifest changes and use the testing document's installation/check entry points. Keep runtime packages separate from development-only tooling. Do not bypass peer constraints or run a broad automatic major-version “fix” to make checks green. Upgrade related packages deliberately and run the affected test layers.

Make a change reviewable around one behaviour or resolved ambiguity. Include its owning requirement/case references, meaningful validation, and any migration/configuration implication. Do not reformat unrelated files, rewrite source/reference assets, or replace existing local work as part of a feature change.

When code becomes the executable source for schemas, prompts, or settings, link it from the owner document and remove manually maintained duplicate code snippets where they would drift. Keep rationale and change history in the owner. A missing instruction should be resolved there, not copied into another checklist or a large generated agent guide.

Use [the README's next build decisions](../README.md#next-build-decisions) to resolve the remaining cross-document gaps. These conventions and the testing baseline are sufficient to start a controlled scaffold once that foundation is settled; additional documents are not a goal in themselves.

## Phase 2 provider conventions

The Groq adapter uses built-in fetch, a fixed HTTPS endpoint, explicit cancellation, redirect rejection, bounded raw response reads and no SDK/HTTP regeneration retries. Keep phase schemas/runtime pair checks in the same modules. The nullable public citation union remains separate from the provider's M1 null-only schema.

Prompt text is in server-only phase modules; the bundle hashes assembled bytes, and the template catalogue is the single literal source. Provider identifiers, finish codes and usage are validated/allowlisted before persistence. Never log the raw provider response or exception. js-tiktoken 1.0.21 supplies o200k merge counting plus an explicit conservative framing reserve; it never fetches model data at runtime.

Migration 0002 is additive. Do not alter 0001 or reset runtime data. Readiness verifies the ordered checksum manifest. Live smoke runs are separate from scripted CI and retain their own private manifests/outcomes.
