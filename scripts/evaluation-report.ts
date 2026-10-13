import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  capturedSample,
  summarizeSamples,
  type CapturedSample,
} from "./evaluation-summary";

function privatePath(value: string) {
  const root = resolve(".tmp");
  const path = resolve(value);
  const rel = relative(root, path);
  if (!rel || rel.startsWith("..") || isAbsolute(rel))
    throw new Error("Use an artifact directory inside project .tmp");
  return path;
}
const dirs = z
  .array(z.string())
  .min(1)
  .parse(JSON.parse(process.env.EVAL_RUN_DIRS ?? "null"))
  .map(privatePath);
const destination = privatePath(z.string().parse(process.env.EVAL_REPORT_DIR));
const samples: CapturedSample[] = [];
const provenance = [];
let configuration: string | undefined;
for (const directory of dirs) {
  const manifest = z
    .object({
      run: z.string(),
      channel: z.enum(["primary", "diagnostic"]).default("primary"),
    })
    .parse(
      JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8")),
    );
  const raw = await readFile(resolve(directory, "results.json"), "utf8");
  const config = z
    .record(z.string(), z.unknown())
    .parse(
      JSON.parse(
        await readFile(resolve(directory, "configuration.json"), "utf8"),
      ),
    );
  const identity = JSON.stringify([
    config.promptVersion,
    config.promptHashes,
    config.policyVersion,
    config.templateHash,
    config.groqSettings,
    config.content_schema,
    config.context_version,
  ]);
  if (configuration && configuration !== identity)
    throw new Error(
      "Different configurations need separate comparison reports",
    );
  configuration = identity;
  for (const item of z
    .array(z.record(z.string(), z.unknown()))
    .parse(JSON.parse(raw)))
    if (item.type === "app_api")
      samples.push({
        ...capturedSample.parse({
          ...item,
          channel: item.channel ?? manifest.channel,
        }),
        run: manifest.run,
      });
  provenance.push({
    run: manifest.run,
    channel: manifest.channel,
    results_sha256: createHash("sha256").update(raw).digest("hex"),
  });
}
const summary = summarizeSamples(samples);
const draft = {
  created_at: new Date().toISOString(),
  reviewer: "Project owner; not yet signed",
  method:
    "Model-assisted preparation, not human factual review. Split/deduplicate compound propositions across answer and claims; add omitted facts and attributions. Do not count claim candidates as reviewed facts.",
  provenance,
  summary,
  samples: samples.map((s) => ({
    ...s,
    review: {
      state: "pending",
      reviewer: null,
      date: null,
      facts: [],
      attributions: [],
      findings: [],
      ratings: null,
      claim_candidates: s.operation.ok
        ? s.operation.data.turn.assistant_message?.content.claims.map(
            (c, index) => ({
              index,
              text: c.text,
              runtime_support: "unsupported",
              external_review: "not_reviewed",
            }),
          )
        : [],
      answer_fact_coverage: "not_reviewed",
    },
  })),
};
await mkdir(destination, { recursive: true });
await writeFile(
  resolve(destination, "review-draft.json"),
  JSON.stringify(draft, null, 2),
  { flag: "wx", mode: 0o600 },
);
const lines = [
  "# Phase 3 captured evidence for human review",
  "",
  "This packet contains synthetic inputs only. Original outcomes are unchanged. Human factual review, proposition counts, attributions and ratings remain pending. Review both prose and claims, using docs/evaluation.md and the dated reference pack. Add a new review revision; do not edit original results.",
  "",
  "## Coverage",
  "",
  "```json",
  JSON.stringify(summary, null, 2),
  "```",
  "",
];
for (const s of samples) {
  lines.push(
    `## ${s.channel}: ${s.suite}/${s.id}/${s.index + 1}`,
    "",
    `Run: ${s.run}`,
    "",
    s.question,
    "",
    `Expected: ${s.expected_kind}/${s.expected_reason}. Route/storage check: ${s.verified ? "pass" : "FAIL"}.`,
    "",
  );
  if (s.operation.ok) {
    const m = s.operation.data.turn.assistant_message;
    lines.push(
      m?.content.answer ?? "No completed answer.",
      "",
      ...(m?.content.claims.map(
        (c, i) => `- Claim ${i + 1}: ${c.text} [source: null]`,
      ) ?? []),
      "",
    );
  } else lines.push(`Terminal error: ${s.operation.code}`, "");
  lines.push(
    "Human review: pending. Fact/attribution ledger and ratings: see review-draft.json.",
    "",
  );
}
await writeFile(resolve(destination, "review-packet.md"), lines.join("\n"), {
  flag: "wx",
  mode: 0o600,
});
console.info(JSON.stringify(summary));
