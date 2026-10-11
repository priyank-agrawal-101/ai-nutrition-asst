import "server-only";
import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Config } from "./config";
import { type Db, rows, databaseTime } from "./db/connection";
import { AppError } from "./errors";
type Category = "session" | "conversation" | "read" | "generation";
const rules: Record<
  Category,
  readonly ["session" | "network", number, number][]
> = {
  session: [["network", 3600, 10]],
  conversation: [
    ["session", 86400, 20],
    ["network", 86400, 60],
  ],
  read: [
    ["session", 60, 120],
    ["network", 60, 600],
  ],
  generation: [
    ["session", 60, 5],
    ["network", 60, 20],
    ["session", 86400, 50],
    ["network", 86400, 200],
  ],
};
export async function charge(
  db: Db,
  config: Config,
  category: Category,
  sessionId: string | null,
  network: string,
): Promise<void> {
  const now = await databaseTime(db);
  const buckets = rules[category]
    .flatMap(([kind, seconds, cap]) => {
      const subject = kind === "session" ? sessionId : network;
      if (!subject) return [];
      return [
        {
          key: `${category}/${kind}/${seconds}`,
          digest: createHmac(
            "sha256",
            Buffer.from(config.quotaKey, "base64url"),
          )
            .update(`${kind}:${subject}`)
            .digest(),
          start: new Date(
            Math.floor(now.getTime() / (seconds * 1000)) * seconds * 1000,
          ),
          seconds,
          cap,
        },
      ];
    })
    .sort((a, b) => a.key.localeCompare(b.key));
  for (const b of buckets) {
    const [row] = await rows(
      db,
      sql`insert into quota_buckets(rule_key,subject_digest,key_version,window_start,used_count,expires_at) values(${b.key},${b.digest},${config.quotaKeyVersion},${b.start},1,${new Date(b.start.getTime() + b.seconds * 1000)}) on conflict(rule_key,subject_digest,key_version,window_start) do update set used_count=quota_buckets.used_count+1 where quota_buckets.used_count<${b.cap} returning used_count`,
      z.object({ used_count: z.number() }),
    );
    if (!row)
      throw new AppError(
        "RATE_LIMITED",
        "not_accepted",
        "repeat_request",
        Math.max(
          1,
          Math.ceil(
            (b.start.getTime() + b.seconds * 1000 - now.getTime()) / 1000,
          ),
        ),
      );
  }
}
