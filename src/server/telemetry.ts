import "server-only";
import { z } from "zod";
const eventSchema = z.discriminatedUnion("event", [
  z.strictObject({
    event: z.literal("frontend_proxy_failed"),
    request_id: z.string().uuid(),
    stage: z.enum([
      "configuration",
      "host",
      "path",
      "method",
      "origin",
      "client_address",
      "body",
      "upstream",
    ]),
  }),
  z.strictObject({
    event: z.literal("request"),
    request_id: z.string().uuid(),
    status: z.number().int(),
    duration_ms: z.number().nonnegative(),
  }),
  z.strictObject({
    event: z.literal("maintenance"),
    purged_sessions: z.number().int().nonnegative(),
    reconciled_attempts: z.number().int().nonnegative(),
    duration_ms: z.number().nonnegative(),
    oldest_cutoff: z.string().nullable(),
  }),
  z.strictObject({
    event: z.literal("maintenance_failed"),
    code: z.literal("STORAGE_UNAVAILABLE"),
  }),
]);
export type Event = z.infer<typeof eventSchema>;
export type EventSink = (event: Event) => void;
export const emit: EventSink = (event) => {
  console.info(JSON.stringify(eventSchema.parse(event)));
};
