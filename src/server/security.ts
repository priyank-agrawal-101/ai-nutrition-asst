import "server-only";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Config } from "./config";
import { type Database, type Db, rows, dateValue } from "./db/connection";
import { AppError } from "./errors";
import { charge } from "./quotas";
export const digest = (value: string): Buffer =>
  createHash("sha256").update(value).digest();
const sessionRow = z.object({
  id: z.string().uuid(),
  csrf_nonce: z.instanceof(Buffer),
  csrf_key_version: z.string(),
  expires_at: dateValue,
});
export type Session = z.infer<typeof sessionRow>;
export function csrf(session: Session, config: Config): string {
  const key = config.csrfKeys[session.csrf_key_version];
  if (!key) throw new AppError("SESSION_UNAVAILABLE");
  return createHmac("sha256", Buffer.from(key, "base64url"))
    .update(
      `ai-nutrition-asst:csrf:v1\n${session.id}\n${session.csrf_nonce.toString("base64url")}`,
    )
    .digest("base64url");
}
export function verifyCsrf(
  value: string | null,
  session: Session,
  config: Config,
): void {
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value))
    throw new AppError("REQUEST_FORBIDDEN", "not_accepted", "refresh_session");
  const decoded = Buffer.from(value, "base64url");
  if (
    decoded.toString("base64url") !== value ||
    decoded.length !== 32 ||
    !timingSafeEqual(decoded, Buffer.from(csrf(session, config), "base64url"))
  )
    throw new AppError("REQUEST_FORBIDDEN", "not_accepted", "refresh_session");
}
export function cookieToken(request: Request, config: Config): string | null {
  const pairs = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((p) => p.trim().split("="));
  const tokens = pairs.filter((p) => p[0] === config.cookieName);
  const value = tokens[0]?.[1];
  return tokens.length === 1 &&
    value &&
    /^[A-Za-z0-9_-]{43}$/.test(value) &&
    Buffer.from(value, "base64url").toString("base64url") === value
    ? value
    : null;
}
export async function getSession(
  db: Db,
  token: string | null,
): Promise<Session | null> {
  if (!token) return null;
  const [s] = await rows(
    db,
    sql`select id, csrf_nonce, csrf_key_version, expires_at from sessions where token_digest=${digest(token)} and revoked_at is null and expires_at>clock_timestamp()`,
    sessionRow,
  );
  return s ?? null;
}
export async function lockSession(
  db: Db,
  sessionId: string,
  live = true,
): Promise<void> {
  const [s] = await rows(
    db,
    sql`select id from sessions where id=${sessionId} ${live ? sql`and revoked_at is null and expires_at>clock_timestamp()` : sql``} for share`,
    z.object({ id: z.string() }),
  );
  if (!s) throw new AppError("SESSION_UNAVAILABLE");
}
export async function establish(
  database: Database,
  config: Config,
  token: string | null,
  network: string,
): Promise<{ session: Session; token: string | null }> {
  const existing = await getSession(database.db, token);
  if (existing) return { session: existing, token: null };
  const newToken = randomBytes(32).toString("base64url");
  return database.transaction("session", async (db) => {
    await charge(db, config, "session", null, network);
    const [session] = await rows(
      db,
      sql`insert into sessions(id,token_digest,csrf_nonce,csrf_key_version,expires_at) values(${randomUUID()},${digest(newToken)},${randomBytes(32)},${config.csrfActiveKey},clock_timestamp()+interval '7 days') returning id,csrf_nonce,csrf_key_version,expires_at`,
      sessionRow,
    );
    if (!session) throw new Error("Session insert missing");
    return { session, token: newToken };
  });
}
