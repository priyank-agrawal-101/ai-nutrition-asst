import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  evaluationFixtures,
  hash,
  remainingExtensions,
} from "./evaluation-fixtures";
import { loadConfig } from "../src/server/config";
import { Database, rows } from "../src/server/db/connection";
import { GroqProvider } from "../src/server/llm/groq";
import { requestBody, tokens } from "../src/server/llm/request";
import {
  reserveProviderBudget,
  observeProviderBudget,
} from "../src/server/llm/budget";
import { parseRawJson } from "../src/server/validation/json";
import { inputVerdict } from "../src/server/safety/verdicts";
import { inputRule, policyVersion } from "../src/server/safety/rules";
import { templates, templateHash } from "../src/server/safety/templates";
import { promptVersion, promptHashes } from "../src/server/prompts/bundle";
import { groqSettings } from "../src/server/llm/settings";
import {
  envelope,
  sessionSchema,
  conversationSchema,
  operationSchema,
} from "../src/contracts/api";

const config = loadConfig(process.env);
const directory = z.string().parse(process.env.LIVE_ARTIFACT_DIR);
const database = new Database(config.databaseUrl);
const fixture = await evaluationFixtures();
await readFile(resolve(directory, "manifest.json"));
const continuing = process.env.LIVE_CONTINUATION === "true";
const diagnostic = process.env.LIVE_DIAGNOSTIC === "true";
const old = continuing
  ? null
  : z
      .object({ input_safety: z.string() })
      .parse(
        JSON.parse(
          await readFile(resolve(directory, "old-prompts.json"), "utf8"),
        ) as unknown,
      );
let selectedGroups = fixture.groups;
if (continuing) {
  const priorConfig = JSON.parse(
    await readFile(resolve(directory, "previous-configuration.json"), "utf8"),
  ) as Record<string, unknown>;
  for (const [key, value] of Object.entries({
    promptVersion,
    promptHashes,
    policyVersion,
    templateHash,
    groqSettings,
  }))
    if (JSON.stringify(priorConfig[key]) !== JSON.stringify(value))
      throw new Error(
        `Continuation configuration changed: ${key}; run a new full regression`,
      );
  const priorResults = z
    .array(z.record(z.string(), z.unknown()))
    .parse(
      JSON.parse(
        await readFile(resolve(directory, "previous-results.json"), "utf8"),
      ),
    );
  selectedGroups = remainingExtensions(
    fixture,
    priorResults
      .filter((r) => r.type === "app_api")
      .map((r) =>
        z
          .object({
            suite: z.string(),
            id: z.string(),
            index: z.number().int().nonnegative(),
            question: z.string(),
          })
          .parse(r),
      ),
  );
  if (diagnostic)
    selectedGroups = fixture.groups.filter((g) =>
      priorResults.some(
        (r) =>
          r.type === "app_api" &&
          r.suite === g.suite &&
          r.id === g.id &&
          r.verified === false,
      ),
    );
}
await writeFile(
  resolve(directory, "selection.json"),
  JSON.stringify(
    {
      ...fixture,
      groups: selectedGroups,
      probes: continuing ? [] : fixture.probes,
      selection_hash: hash(
        JSON.stringify({
          groups: selectedGroups,
          probes: continuing ? [] : fixture.probes,
        }),
      ),
    },
    null,
    2,
  ),
  { flag: "wx" },
);
await writeFile(
  resolve(directory, "configuration.json"),
  JSON.stringify(
    {
      promptVersion,
      promptHashes,
      policyVersion,
      templateHash,
      groqSettings,
      providerBudget: config.providerBudget,
      old_input_hash: old ? hash(old.input_safety) : null,
      context_version: "v1",
      content_schema: "m1",
      retries: 0,
      source_policy: "null-only",
      review:
        "Route, schema and persistence; independent factual review pending",
      diagnostics_enabled: config.diagnosticsEnabled,
    },
    null,
    2,
  ),
  { flag: "wx" },
);
const results: unknown[] = [];
const save = () =>
  writeFile(
    resolve(directory, "results.json"),
    JSON.stringify(results, null, 2),
  );
const record = z.record(z.string(), z.unknown());
let cookie = "",
  csrf = "",
  submittedAt = 0;
async function api<T extends z.ZodType>(
  path: string,
  schema: T,
  body?: unknown,
) {
  const r = await fetch(config.origin + "/api/v1/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: config.origin,
      "Content-Type": "application/json",
      Cookie: cookie,
      "X-CSRF-Token": csrf,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(70000),
  });
  const c = r.headers.get("set-cookie");
  if (c) cookie = c.split(";")[0]!;
  const value = envelope(schema).parse((await r.json()) as unknown);
  if ("error" in value) return { ok: false as const, code: value.error.code };
  return {
    ok: true as const,
    data: schema.parse(z.object({ data: z.unknown() }).parse(value).data),
  };
}
async function usage() {
  const [value] = await rows(
    database.db,
    sql`select count(*)::int as calls,coalesce(sum(coalesce(observed_tokens,reserved_tokens)),0)::float8 as charged_tokens,coalesce(sum(coalesce(observed_tokens,reserved_tokens)) filter(where started_at>clock_timestamp()-interval '61 seconds'),0)::float8 as minute_tokens from provider_budget`,
    z.object({
      calls: z.number(),
      charged_tokens: z.number(),
      minute_tokens: z.number(),
    }),
  );
  return value!;
}
async function pace(reservation: number, estimatedCalls: number) {
  for (;;) {
    const u = await usage();
    if (
      u.charged_tokens + reservation > config.providerBudget.maxTokens ||
      u.calls + estimatedCalls > config.providerBudget.maxCalls
    )
      throw new Error("Recorded run budget exhausted before dispatch");
    if (
      u.minute_tokens + reservation <= 8000 &&
      Date.now() - submittedAt >= 13000
    )
      return;
    await sleep(13000);
  }
}
try {
  // Compare the old and new input classifiers only; these are not end-to-end samples.
  for (const probe of continuing ? [] : fixture.probes)
    for (const version of ["v1", "v2"] as const) {
      const context = JSON.stringify({
        version: "v1",
        prior_turns: probe.previous_refusal
          ? [
              {
                question: "How many calories should I eat each day?",
                status: "completed",
                response_kind: "refusal",
                content: templates.calorie_target.content,
              },
            ]
          : [],
        current_question: probe.question,
      });
      const body = requestBody("input_safety", context, null);
      if (version === "v1" && old) body.messages[0]!.content = old.input_safety;
      const reservation =
        tokens(JSON.stringify(body)) +
        128 +
        groqSettings.outputTokens.input_safety;
      await pace(reservation, 1);
      const id = randomUUID();
      await database.transaction("comparison_intent", (tx) =>
        reserveProviderBudget(tx, id, reservation, config.providerBudget),
      );
      submittedAt = Date.now();
      const provider = new GroqProvider(config.groqApiKey!, (url, init) =>
        fetch(url, { ...init, body: JSON.stringify(body) }),
      );
      try {
        const response = await provider.call(
          "input_safety",
          context,
          null,
          AbortSignal.timeout(groqSettings.phaseMs.input_safety),
        );
        await observeProviderBudget(
          database.db,
          id,
          response.inputTokens,
          response.outputTokens,
        );
        const verdict = inputVerdict.safeParse(
          parseRawJson(response.raw, 262144),
        );
        const correct =
          response.complete &&
          verdict.success &&
          verdict.data.reason === probe.expected_reason;
        if (version === "v2" && !correct) process.exitCode = 1;
        results.push({
          type: "classifier_comparison",
          id: probe.id,
          version,
          synthetic_history: probe.previous_refusal,
          expected_reason: probe.expected_reason,
          verdict: verdict.success ? verdict.data : null,
          correct,
          input_tokens: response.inputTokens,
          output_tokens: response.outputTokens,
          finish: response.finishCode,
          reported_model: response.reportedModel,
        });
        console.info(
          `Classifier ${probe.id} ${version}: ${correct ? "expected route" : "MISMATCH"}`,
        );
      } catch {
        if (version === "v2") process.exitCode = 1;
        results.push({
          type: "classifier_comparison",
          id: probe.id,
          version,
          correct: false,
          error: "provider_or_validation_failure",
        });
        console.info(
          `Classifier ${probe.id} ${version}: provider/validation failure`,
        );
      }
      await save();
    }
  for (const [groupIndex, group] of selectedGroups.entries()) {
    // Normal limit is 20 conversations/session; do not bypass it for evaluation.
    if (groupIndex % 15 === 0) {
      cookie = "";
      const session = await api("session", sessionSchema, {});
      if (!session.ok) throw new Error("Evaluation session unavailable");
      csrf = session.data.csrf_token;
    }
    const creation = await api("conversations", conversationSchema, {
      client_conversation_id: randomUUID(),
    });
    if (!creation.ok) throw new Error("Evaluation conversation unavailable");
    const cid = creation.data.id;
    for (const [index, turn] of group.turns.entries()) {
      const codeOnly = inputRule(
        turn.question,
        group.turns.slice(0, index).map((t) => t.question),
      );
      // Pace before submitting, never retry a first result or disable an app limiter.
      // The expectation is not the observed route. Reserve the full pipeline
      // even for an expected refusal so an unexpected allow remains observable.
      await pace(codeOnly ? 0 : 7500, codeOnly ? 0 : 3);
      submittedAt = Date.now();
      const operation = await api(
        `conversations/${cid}/turns`,
        operationSchema,
        { client_submission_id: randomUUID(), question: turn.question },
      );
      const history = await api(`conversations/${cid}`, conversationSchema);
      const attempts = await rows(
        database.db,
        sql`select a.id,a.status,a.failure_code,a.input_route,a.input_reason,a.run_manifest from attempts a join turns t on t.id=a.turn_id where t.conversation_id=${cid} order by a.started_at`,
        record,
      );
      const latest = attempts.at(-1);
      const actualKind = operation.ok
        ? operation.data.turn.assistant_message?.kind
        : null;
      const verified =
        operation.ok &&
        operation.data.turn.status === "completed" &&
        actualKind === turn.expected_kind &&
        latest?.input_reason === turn.expected_reason &&
        history.ok &&
        history.data.turns.some(
          (t) =>
            t.id === operation.data.turn.id &&
            t.status === "completed" &&
            JSON.stringify(t.assistant_message) ===
              JSON.stringify(operation.data.turn.assistant_message),
        );
      if (!verified) process.exitCode = 1;
      results.push({
        type: "app_api",
        channel: diagnostic ? "diagnostic" : "primary",
        suite: group.suite,
        id: group.id,
        index,
        question: turn.question,
        expected_kind: turn.expected_kind,
        expected_reason: turn.expected_reason,
        operation,
        restored: history.ok ? history.data : null,
        attempts,
        verified,
      });
      await save();
      console.info(
        `${group.suite} ${group.id}/${index + 1}: ${verified ? "PASS" : "FAIL"} (${operation.ok ? operation.data.turn.status + "/" + String(actualKind) : operation.code}); ${(await usage()).charged_tokens} tokens`,
      );
    }
  }
} catch (error) {
  results.push({
    type: "run_stopped",
    reason:
      error instanceof Error &&
      error.message === "Recorded run budget exhausted before dispatch"
        ? "budget_exhausted"
        : "runner_or_dependency_failure",
  });
  console.info(
    "Regression stopped; first results retained. See private evidence.",
  );
  process.exitCode = 1;
} finally {
  const calls = await rows(
    database.db,
    sql`select id,attempt_id,phase,status,started_at,ended_at,finish_code,error_code,validation_code,input_tokens::float8,output_tokens::float8,cached_input_tokens::float8,reasoning_tokens::float8,reported_model,duration_ms::float8 from provider_calls order by started_at`,
    record,
  );
  const diagnostics = await rows(
    database.db,
    sql`select attempt_id,captured_at,expires_at,reason,payload from model_diagnostics order by captured_at`,
    record,
  );
  await writeFile(
    resolve(directory, "rejected-diagnostics.json"),
    JSON.stringify(diagnostics, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  const budget = [await usage()];
  results.push({ type: "summary", calls, budget });
  await save();
  console.info(JSON.stringify({ budget }));
  await database.close();
}
