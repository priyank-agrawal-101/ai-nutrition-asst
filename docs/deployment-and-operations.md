# Gusto NutriBite: Deployment and Operations

Status: Phase 1 local operation implemented, 11 October 2026. Public hosting, real-provider configuration, and release operations remain unverified.

This document owns environment setup, release procedures, maintenance, and recovery. Follow the [implementation plan](phase-wise-implementation-plan.md); [architecture](architecture.md#12-deployment-and-operations), [safety/security](safety-and-security.md), and [data model](data-model.md) remain authoritative for behavior and constraints. Add exact commands and evidence here as implementation makes them real.

## 1. Environments and configuration

Start with one Railway Node application and PostgreSQL, in the same region where practical, with private database connectivity and a public HTTPS app origin. No separate staging service, queue, Redis, or monitoring platform is required for M1. Keep unreleased deployment checks inaccessible to visitors until release clearance.

| Environment | Boundary |
| --- | --- |
| Local development | Project-owned database and process; scripted provider first. Deliberate real-provider work uses separate credentials and a recorded budget. |
| Tests / PR CI | Disposable PostgreSQL and synthetic data; `TEST_DATABASE_URL` only, never fallback to a development/production connection. Follow [harness isolation](testing.md#3-harness-and-environment-isolation). No live provider/deployment secrets. |
| Controlled evaluation | Ordinary app pipeline with the verified provider, explicit spend limit, reviewer, and restricted synthetic artifacts. Separate from visitor traffic and normal CI. |
| Production | Dedicated database, restricted runtime identity, real provider only, and server-held secrets. A production build used by the isolated test harness is not a production deployment. |

During Phase 1, pin compatible Node LTS/npm/package/PostgreSQL versions and define the typed configuration loader and placeholder-only `.env.example`. Record exact variable names there and link the implemented loader here; only `TEST_DATABASE_URL` is already specified by the testing contract. Do not publish real values.

Required configuration covers database connections, allowed origin/trusted proxy, independent security keys and versions, provider endpoint/model/settings, generation enablement, and effective limits. Keep migration credentials separate from the runtime role. Use host secret settings in production and ignored local environment files; never browser-exposed prefixes. Missing or invalid required configuration must fail startup/readiness. Build and routine health checks make no model calls or migrations.

Before real calls, verify account access, structured-output compatibility, completion handling, and provider data settings. Before public access, name the operator/privacy contact, approve hosting/provider spend and alert thresholds, and verify actual retention, timeouts, connection limits, and graceful shutdown. These gate their dependent phases, not local work with a scripted provider.

## 2. Commands and release procedure

**Target checks, not runnable today:** `npm ci`, `npm run check`, `npm run test:integration`, `npm run build`, `npm run test:e2e`, and `npm run test:browser-matrix`. Their definitions and applicability stay in [testing](testing.md#6-command-and-ci-contract). Add actual start, migrate, maintenance, backup/restore, and deployment commands after they exist and have been verified; do not invent executable placeholders.

1. Identify the commit, schema, prompt/policy versions, model/settings, and environment. Confirm Phase 3 software/evaluation evidence and [pre-deployment release gates](safety-and-security.md#release-review). Ordinary CI must not publish an unchecked change automatically.
2. Inspect migration SQL and compatibility with the running app. Before a risky change, create a backup and prove restoration into a separate database. Initial setup tests an empty schema; do not claim a nonexistent prior-version upgrade.
3. Produce the reproducible build. Run reviewed migrations once as a controlled release step with the migration identity, then start the compatible app. Do not use schema push, per-replica startup migrations, or edit applied migrations.
4. Verify configuration, HTTPS/cookies, exact Origin/CSRF behavior, security headers, private DB access, and proxy timeouts. Test both health paths below and the maintenance controls.
5. Run a deliberate, budgeted provider smoke test and an external-browser stored exchange, required refusal, refresh/recovery, and empty sources-panel check. Health polling alone does not verify the provider or chat.
6. Record the public URL, deployed commit/configuration, date, evidence links, operator, and disposition here; update README and the plan. Only then mark M1 deployed and verified.

| Health path | Expected behavior |
| --- | --- |
| `/api/v1/health/live` | Process response only; no database/model call. |
| `/api/v1/health/ready` | Required configuration, database, and schema compatible: 200; otherwise safe 503. No paid call or secret details. |

For a release rollback, stop new generation, identify the last verified compatible app/schema pair, and redeploy it only if compatibility holds. Otherwise use a reviewed forward repair or controlled restore. Recheck health, persistence, and affected flows. Never reset the database or erase conversations as a deployment shortcut.

## 3. Maintenance, retention, and cost

Initial implementation default: one process-owned maintenance loop at startup and every five minutes, with bounded batches and no overlapping passes. Reuse the same reviewed routine for operator recovery. Reconcile expired attempts/slots and clean expired/revoked sessions and quota rows using database time and the [scoped transaction rules](data-model.md#10-retention-cleanup-and-recovery). No public maintenance endpoint or job service is needed. Verify continuous process availability and restart behavior on the chosen hosting plan; change scheduling if it cannot meet the policy.

The [retention schedule](safety-and-security.md#retention-schedule) owns durations: immediate access cutoff at expiry/revocation, payload purge within 24 hours, quota cleanup within one hour of window end, seven-day logs/backups, and thirty-day operator audit. Verify hosting/provider retention separately; backups may retain copies for up to eight days after access cutoff. New chat is not deletion; manual deletion remains deferred.

Record maintenance success time, counts, duration, oldest pending cutoff, and safe error codes. Configure operator alerts for stale/failed maintenance, impending retention breaches, storage/readiness failures, repeated safety/schema rejection, and spend thresholds. Record actual alert settings and delivery verification before public use. Log only [allowlisted metadata](safety-and-security.md#8-logging-evaluation-evidence-and-operator-access), including in hosting logs; never transcripts, credentials, or raw provider exceptions.

Use the existing quotas plus verified provider spending controls where available. Local token estimates are not a guaranteed spending cap. When cost, safety, or provider health requires shutdown, disable new attempts and new provider dispatches while preserving safe authorized history/status and cleanup. Already dispatched remote work may still cost money. Never skip a required review to finish an in-flight turn; reconcile interrupted work without automatic regeneration.

## 4. Recovery and incidents

- **Restart/outage:** preserve PostgreSQL state; drain bounded in-flight work where possible. Startup/status reconciliation resolves deadlines. Verify saved history and duplicate protection using synthetic tests.
- **Backup restore:** keep public access disabled, restore into a separate project-owned database, and check schema/constraints and synthetic ownership/history. If later revocations cannot be reconstructed, invalidate all restored sessions and purge retained visitor payload before reopening. Record recovery point and history loss; do not build a deletion-ledger service or silently revive revoked access.
- **Safety, privacy, or secret incident:** contain the affected capability, preserve safe evidence, assess impact, revoke/rotate affected access, apply a general fix, and pass relevant regression before reopening. Do not export visitor transcripts into issues or logs. Record operator, time, reason, action, and outcome under the audit policy.

## 5. Evidence still to add

All items below are pending; documentation creation clears no software or release gate.

- [x] Phase 1: pinned versions, environment names/loader, isolated DB/roles, start/migration/maintenance implementation, and passing restart/cleanup tests. See [evidence](testing.md#phase-1-implementation-evidence).
- [ ] Phases 2–3: verified provider configuration/privacy, live-run budget/reviewer/artifact location, regression evidence, and shutdown behavior.
- [ ] Before public access: Railway settings, operator/contact, spend/alerts, tested backup/restore commands, recovery point, and retention enforcement.
- [ ] Phase 4: deployed identity/URL, external verification, and release/rollback record. Use concise dated entries here; link detailed test/evaluation evidence instead of copying it.

## Phase 1 local operation

The [local launcher](../scripts/local.mjs) is `npm run dev`, after `npm ci` and `npm run build`. It creates only project-owned resources under `.tmp/local`, selects unused loopback ports, saves the origin/security configuration for restart, and uses PostgreSQL **17.9** packaged native binaries. This is a dedicated PostgreSQL cluster, not SQLite or a database from another project. The same PostgreSQL major is pinned in [CI](../.github/workflows/ci.yml). Local runtime data and credentials are ignored by Git; preserve the directory between launches.

Use Node 24.14.0 and npm 11.11.0. During this Windows implementation, a project-local runtime was installed in `.tmp/runtime/` because the host has Node 26. With that existing runtime, PowerShell can select it for one terminal:

```powershell
$env:PATH = (Join-Path (Get-Location) '.tmp/runtime/node_modules/node/bin') + ';' + $env:PATH
& .tmp/runtime/node_modules/node/bin/node.exe .tmp/runtime/node_modules/npm/bin/npm-cli.js run dev
```

On a fresh machine, install/select the pinned LTS runtime normally; `.tmp/runtime` is not committed. The npm commands themselves work in PowerShell, Git Bash, and Linux. The launcher serves the production build and reports the chosen URL. It refuses occupied stored ports rather than stopping another listener. Ctrl+C stops its child application and then its cluster, preserving local data. It opens no visible helper windows.

For separately provisioned dedicated PostgreSQL, [`.env.example`](../.env.example) names the inputs validated by [config.ts](../src/server/config.ts). Supply them in the process environment, or with Node's `--env-file` option; operator scripts do not implicitly load `.env`. `npm run db:migrate` requires `MIGRATION_DATABASE_URL`; it never falls back to `DATABASE_URL`. `npm run maintenance` uses the runtime configuration and the same reviewed purge/reconciliation routine. It has no HTTP endpoint. The local launcher generates its own ignored configuration, so it needs no manual secret entry.

Maintenance starts with the Node server and repeats every five minutes without overlapping passes, with 100-session/100-conversation batches. Status reads reconcile relevant expired attempts independently. Safe events include counts, duration and oldest cutoff; production alert delivery and seven-day platform-log/backup enforcement remain unverified. The generation flag is read at bootstrap; changing it requires restarting the app with the new configuration. History/replay/cleanup remain available when new generation is disabled.

Phase 1 rejects `APP_ENV=production` and non-loopback origins. The network quota subject groups loopback traffic and ignores forwarded addresses. Before opening public service, implement/verify trusted-proxy address extraction, HTTPS cookies, CSP, real provider/policy configuration, spend controls, operator contact, backup restore and retention. No Railway resource or paid provider was provisioned by Phase 1.
