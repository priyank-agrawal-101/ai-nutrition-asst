import "server-only";
import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LIMITS } from "@/contracts/api";
const key = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/)
  .refine((s) => Buffer.from(s, "base64url").toString("base64url") === s);
const envSchema = z.object({
  APP_ENV: z.enum(["local", "test", "production"]),
  APP_ORIGIN: z.url(),
  PROVIDER_MODE: z.enum(["scripted", "groq"]),
  GROQ_API_KEY: z.string().optional(),
  GROQ_DAILY_CALL_LIMIT: z.coerce.number().int().min(1).max(1000).default(1000),
  GROQ_DAILY_TOKEN_LIMIT: z.coerce
    .number()
    .int()
    .min(1)
    .max(200000)
    .default(200000),
  DATABASE_URL: z.string().startsWith("postgresql://"),
  CSRF_KEYS: z.string(),
  CSRF_ACTIVE_KEY: z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/),
  QUOTA_KEY: key,
  QUOTA_KEY_VERSION: z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/),
  GENERATION_ENABLED: z.enum(["true", "false"]),
  BUILD_ID: z.string().min(1).max(100),
});
export function loadConfig(env: Readonly<Record<string, string | undefined>>) {
  const e = envSchema.parse(env);
  const origin = new URL(e.APP_ORIGIN);
  if (
    origin.origin !== e.APP_ORIGIN ||
    e.APP_ENV === "production" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname)
  )
    throw new Error(
      "Only isolated local/test operation is enabled until release clearance",
    );
  if (
    e.PROVIDER_MODE === "groq" &&
    (e.APP_ENV !== "local" || !e.GROQ_API_KEY?.trim())
  )
    throw new Error(
      "Groq requires a local API key; normal tests must use scripted mode",
    );
  const keys = z
    .record(z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/), key)
    .parse(JSON.parse(e.CSRF_KEYS) as unknown);
  if (!keys[e.CSRF_ACTIVE_KEY] || Object.values(keys).includes(e.QUOTA_KEY))
    throw new Error("Security keys must be present and independent");
  return Object.freeze({
    environment: e.APP_ENV,
    providerMode: e.PROVIDER_MODE,
    groqApiKey: e.PROVIDER_MODE === "groq" ? e.GROQ_API_KEY : undefined,
    providerBudget: {
      maxCalls: e.GROQ_DAILY_CALL_LIMIT,
      maxTokens: e.GROQ_DAILY_TOKEN_LIMIT,
    },
    origin: e.APP_ORIGIN,
    databaseUrl: e.DATABASE_URL,
    csrfKeys: Object.freeze(keys),
    csrfActiveKey: e.CSRF_ACTIVE_KEY,
    quotaKey: e.QUOTA_KEY,
    quotaKeyVersion: e.QUOTA_KEY_VERSION,
    get diagnosticsEnabled() {
      if (e.APP_ENV !== "local") return false;
      try {
        const marker = z
          .object({
            project: z.literal("ai-nutrition-asst"),
            expires_at: z.iso.datetime(),
          })
          .parse(
            JSON.parse(
              readFileSync(
                resolve(".tmp/local/diagnostics.enabled.json"),
                "utf8",
              ),
            ) as unknown,
          );
        const remaining = Date.parse(marker.expires_at) - Date.now();
        return remaining > 0 && remaining <= 86400000;
      } catch {
        return false;
      }
    },
    get generationEnabled() {
      return (
        e.GENERATION_ENABLED === "true" &&
        (e.APP_ENV !== "local" ||
          !existsSync(resolve(".tmp/local/generation.disabled")))
      );
    },
    buildId: e.BUILD_ID,
    limits: Object.freeze({
      ...LIMITS,
      attempt_timeout_seconds: Number(LIMITS.attempt_timeout_seconds),
    }),
    contextMaxTokens: Number(8000),
    sessionSeconds: 604800,
    cookieName: "nutribite_local_session",
  });
}
export type Config = ReturnType<typeof loadConfig>;
