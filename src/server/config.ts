import "server-only";
import { z } from "zod";
import { LIMITS } from "@/contracts/api";
const key = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/)
  .refine((s) => Buffer.from(s, "base64url").toString("base64url") === s);
const envSchema = z.object({
  APP_ENV: z.enum(["local", "test", "production"]),
  APP_ORIGIN: z.url(),
  PROVIDER_MODE: z.literal("scripted"),
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
    throw new Error("Phase 1 only permits isolated local/test scripted mode");
  const keys = z
    .record(z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/), key)
    .parse(JSON.parse(e.CSRF_KEYS) as unknown);
  if (!keys[e.CSRF_ACTIVE_KEY] || Object.values(keys).includes(e.QUOTA_KEY))
    throw new Error("Security keys must be present and independent");
  return Object.freeze({
    environment: e.APP_ENV,
    origin: e.APP_ORIGIN,
    databaseUrl: e.DATABASE_URL,
    csrfKeys: Object.freeze(keys),
    csrfActiveKey: e.CSRF_ACTIVE_KEY,
    quotaKey: e.QUOTA_KEY,
    quotaKeyVersion: e.QUOTA_KEY_VERSION,
    generationEnabled: e.GENERATION_ENABLED === "true",
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
