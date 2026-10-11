export const configEnv = (): NodeJS.ProcessEnv => ({
  NODE_ENV: "test",
  APP_ENV: "test",
  APP_ORIGIN: "http://127.0.0.1:3000",
  PROVIDER_MODE: "scripted",
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ?? "postgresql://unused@127.0.0.1/test",
  CSRF_KEYS: JSON.stringify({ v1: Buffer.alloc(32, 1).toString("base64url") }),
  CSRF_ACTIVE_KEY: "v1",
  QUOTA_KEY: Buffer.alloc(32, 2).toString("base64url"),
  QUOTA_KEY_VERSION: "v1",
  GENERATION_ENABLED: "true",
  BUILD_ID: "test-uncommitted",
});
